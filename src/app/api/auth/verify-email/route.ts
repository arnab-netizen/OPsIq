import { recordProductEvent } from "@/services/analytics/product-events.service";
import type { NextRequest } from "next/server";
import { db, withStatementTimeout } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requirePgRateLimit, RateLimitError, VERIFY_REDEEM_RATE_LIMIT } from "@/infra/rate-limit";
import { ValidationError, BadRequestError } from "@/infra/errors";
import { z } from "zod/v4";
import { PENDING_SIGNUP_HOLD_MS } from "@/services/beta/platform-settings.service";
import { BetaCapExceededError, reserveCapacityForLateVerification } from "@/services/auth/beta-cap";
import {
  hashToken,
  invalidateUnusedPasswordResetTokens,
  invalidateUnusedVerificationTokens,
  issueSetupToken,
  isAwaitingEmailOwnership,
  lockUserRow,
} from "@/services/auth/email-ownership.service";
import { PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE } from "@/lib/beta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const VERIFY_TRANSACTION_TIMEOUT_MS = 5000;

/**
 * One message for every way redemption can fail — token not found, already
 * used, or expired all collapse to this single response, exactly mirroring
 * reset-password's INVALID_TOKEN_TEXT rationale: distinct messages per case
 * would let a caller distinguish "already used" (proving a once-valid token
 * existed) from "never existed," which is the enumeration this pattern closes.
 */
const INVALID_TOKEN_TEXT = "This verification link is invalid or has expired. Please request a new one.";

export const POST = async (request: NextRequest) => {
  try {
    const { token } = await parseRequestBody(request, verifyEmailSchema);

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    await requirePgRateLimit(`verify-email-redeem:${ip}`, VERIFY_REDEEM_RATE_LIMIT);

    const tokenHash = hashToken(token);

    const verificationToken = await db.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!verificationToken || verificationToken.usedAt || verificationToken.expiresAt < new Date()) {
      throw new BadRequestError(INVALID_TOKEN_TEXT);
    }

    // Redeeming the token, marking the account verified, discarding any
    // pre-ownership credential and issuing the one-time password-setup token
    // must commit atomically — a failure partway through must never leave a
    // token marked used with the account still unverified (permanently
    // locking the user out), nor a verified account whose provisional
    // password survived.
    //
    // DELIBERATELY NO SESSION: proving the mailbox does not authenticate
    // anyone. Whoever holds the link gets a one-time setup token and chooses
    // the password themselves; the session is created by that step. Any
    // password stored before ownership was proven (accounts created under the
    // old signup flow, which accepted a password up front) is set to NULL in
    // the same transaction, so a pre-registering third party's password can
    // never authenticate once the real owner verifies.
    const { user, setupToken, next, wasUnverified } = await withStatementTimeout(
      db,
      VERIFY_TRANSACTION_TIMEOUT_MS,
      async (tx: Prisma.TransactionClient) => {
        // Serialise with every other credential-affecting transition for this
        // user (a second link, a setup redemption, a re-signup rotation).
        await lockUserRow(tx, verificationToken.userId);

        // Re-check inside the transaction: two concurrent redemptions of the
        // same raw token must not both succeed. updateMany scoped to
        // usedAt: null (and still-unexpired) makes the second racer's write
        // match zero rows instead of silently overwriting the first's claim.
        const claimedAt = new Date();
        const claim = await tx.emailVerificationToken.updateMany({
          where: { id: verificationToken.id, usedAt: null, expiresAt: { gt: claimedAt } },
          data: { usedAt: claimedAt },
        });
        if (claim.count === 0) {
          throw new BadRequestError(INVALID_TOKEN_TEXT);
        }

        // An external beta signup whose pending hold lapsed no longer holds a capacity slot: verifying must take one,
        // under the shared advisory lock, so a late verifier can never push the beta over its limit. Accounts that
        // verify inside the hold already own their slot, and accounts outside the beta cohort are unaffected.
        const pendingWorkspace = await tx.workspace.findFirst({
          where: {
            createdBy: verificationToken.userId,
            signupSource: { in: [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE] },
          },
          select: { createdAt: true },
        });
        if (pendingWorkspace && Date.now() - pendingWorkspace.createdAt.getTime() > PENDING_SIGNUP_HOLD_MS) {
          await reserveCapacityForLateVerification(tx);
        }

        const current = await tx.user.findUniqueOrThrow({ where: { id: verificationToken.userId } });
        // "Unverified at redemption time" = a signup account that has not yet proven its mailbox. Only for such an
        // account can the stored password pre-date ownership, so only then is it discarded.
        const wasUnverified = isAwaitingEmailOwnership(current);

        let user = current;
        if (wasUnverified) {
          user = await tx.user.update({
            where: { id: current.id },
            data: { emailVerifiedAt: claimedAt, hashedPassword: null },
          });
          // Nothing credential-bearing may survive from before ownership was proven.
          await tx.session.updateMany({ where: { userId: current.id, revokedAt: null }, data: { revokedAt: claimedAt } });
          await invalidateUnusedPasswordResetTokens(tx, current.id, claimedAt);
        } else if (!current.emailVerifiedAt) {
          // An account that never required verification: record the proof, leave its credential alone.
          user = await tx.user.update({ where: { id: current.id }, data: { emailVerifiedAt: claimedAt } });
        }
        // Whatever other verification links were still in flight are now moot.
        await invalidateUnusedVerificationTokens(tx, current.id, claimedAt, verificationToken.id);

        // Already verified AND already holding a password: nothing to set up.
        if (!wasUnverified && user.hashedPassword) {
          return { user, setupToken: null, next: "login" as const, wasUnverified };
        }
        const setupToken = await issueSetupToken(tx, user.id, ip !== "unknown" ? ip : null);
        return { user, setupToken, next: "set-password" as const, wasUnverified };
      },
      "verify-email-redemption"
    );

    try {
      const membership = await db.workspaceMembership.findFirst({
        where: { userId: user.id, isActive: true },
        orderBy: { addedAt: "asc" },
        select: { workspaceId: true },
      });
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.EMAIL_VERIFIED,
        actorId: user.id,
        workspaceId: membership?.workspaceId,
        entityType: "user",
        entityId: user.id,
        payload: { next, discardedPreOwnershipCredential: wasUnverified },
        visibility: "internal",
      });
      await recordProductEvent({ name: "email_verified", workspaceId: membership?.workspaceId, actorId: user.id });
    } catch (auditError) {
      console.error("[VERIFY_EMAIL_AUDIT_FAILURE]", auditError instanceof Error ? auditError.constructor.name : "UnknownError");
    }

    // The setup token is a bearer credential: it is returned only in this POST response body (never in a URL the
    // server generated, a log line or an audit payload) and must not be cached.
    return Response.json(
      next === "set-password" ? { success: true, next, setupToken } : { success: true, next },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: "A verification token is required." }, { status: 400 });
    }
    if (error instanceof BadRequestError) {
      return Response.json({ error: INVALID_TOKEN_TEXT }, { status: 400 });
    }
    if (error instanceof BetaCapExceededError) {
      // The transaction rolled back: the token is NOT consumed and the account is untouched, so this link works later.
      return Response.json(
        { error: "The beta is full right now. Your account is saved — please open this link again in a day or two." },
        { status: 409 },
      );
    }
    console.error("[VERIFY_EMAIL_FAILED]", error instanceof Error ? error.constructor.name : "UnknownError");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
};
