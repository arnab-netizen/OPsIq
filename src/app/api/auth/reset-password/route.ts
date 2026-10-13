import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { db, withStatementTimeout } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requirePgRateLimit, RateLimitError, PASSWORD_RESET_RATE_LIMIT, VERIFY_REDEEM_RATE_LIMIT } from "@/infra/rate-limit";
import { ValidationError, BadRequestError } from "@/infra/errors";
import { z } from "zod/v4";
import * as bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getSessionCookieName, getSessionDurationMs } from "@/services/auth";
import { CURRENT_POLICY_VERSIONS } from "@/lib/beta";
import { recordProductEvent } from "@/services/analytics/product-events.service";
import { trustedClientAddress } from "@/lib/client-address";
import {
  hashToken,
  isAwaitingEmailOwnership,
  lockUserRow,
  recordPolicyAcceptances,
} from "@/services/auth/email-ownership.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The three consents are optional in the SCHEMA only because an ordinary
 * reset (account already has a password) carries none. They are REQUIRED —
 * each exactly `true` — whenever the token's account has no password yet
 * (first-time setup after the mailbox was proven); that decision is made
 * server-side from the account's real state, never from anything the client
 * claims about which page it was on.
 */
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
  acceptTerms: z.boolean().optional(),
  acceptPrivacy: z.boolean().optional(),
  acceptBetaNotice: z.boolean().optional(),
});

const CONSENT_REQUIRED_TEXT = "You must accept the Terms, the Privacy Notice and the Beta Notice to continue.";

/** Thrown (and rolled back) when a first-time password setup arrives without all three explicit consents. */
class ConsentRequiredError extends Error {}

/** Where a freshly set-up owner lands: the account is immediately usable. */
const SETUP_REDIRECT = "/owner/first-run";

const RESET_TRANSACTION_TIMEOUT_MS = 5000;

/**
 * The single message returned for every way a reset can fail to redeem — token
 * not found, already used, or expired all collapse to this one response. Distinct
 * messages per case would let a caller distinguish "this token was already used"
 * (proving a real, once-valid token) from "this token never existed," which is
 * exactly the kind of oracle enumeration-resistance exists to close.
 */
const INVALID_TOKEN_TEXT = "This password reset link is invalid or has expired. Please request a new one.";

export const POST = async (request: NextRequest) => {
  try {
    const { token, password, acceptTerms, acceptPrivacy, acceptBetaNotice } = await parseRequestBody(request, resetPasswordSchema);
    const consentsGiven = acceptTerms === true && acceptPrivacy === true && acceptBetaNotice === true;

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    // Mandatory first-time password setup (the body carries any consent field) is the normal onboarding step of every
    // new owner, so it must not share the 5/hour reset bucket: more than five owners behind one office/CGNAT address
    // would otherwise be unable to onboard within the hour. It gets its own bucket and the more generous redeem limit
    // (30/hour). That is safe because the setup link is a single-use 256-bit random token: the limiter is not what
    // protects it from guessing, and a failed redemption sends no email. A plain reset keeps the tight 5/hour bucket.
    const isSetupShaped = acceptTerms !== undefined || acceptPrivacy !== undefined || acceptBetaNotice !== undefined;
    if (isSetupShaped) {
      await requirePgRateLimit(`password-setup-redeem:${ip}`, VERIFY_REDEEM_RATE_LIMIT);
    } else {
      await requirePgRateLimit(`password-reset-redeem:${ip}`, PASSWORD_RESET_RATE_LIMIT);
    }

    const tokenHash = hashToken(token);

    const resetToken = await db.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestError(INVALID_TOKEN_TEXT);
    }

    // Fast pre-check of the consent requirement so a request that can never
    // succeed does not burn a bcrypt hash and, crucially, does not consume the
    // token. The authoritative re-check runs again under the user row lock.
    const preUser = await db.user.findUnique({
      where: { id: resetToken.userId },
      select: { hashedPassword: true },
    });
    if (preUser && preUser.hashedPassword === null && !consentsGiven) {
      throw new ConsentRequiredError();
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const clientAddress = trustedClientAddress(request.headers) ?? (ip !== "unknown" ? ip : null);

    // Redeeming a token, updating the password hash, and revoking every existing
    // session for this user must commit atomically: a failure partway through must
    // never leave a token marked used with the old password still active (locking
    // the user out with no way back in), nor a new password live while stale
    // sessions remain trusted.
    const outcome = await withStatementTimeout(
      db,
      RESET_TRANSACTION_TIMEOUT_MS,
      async (tx: Prisma.TransactionClient) => {
        // Serialise with verification redemption / rotation / another setup for this user.
        await lockUserRow(tx, resetToken.userId);

        // Re-check inside the transaction: two concurrent redemptions of the same
        // raw token must not both succeed. updateMany scoped to usedAt: null makes
        // the second racer's write match zero rows instead of silently overwriting
        // the first's already-used token.
        const claimedAt = new Date();
        const claim = await tx.passwordResetToken.updateMany({
          where: { id: resetToken.id, usedAt: null, expiresAt: { gt: claimedAt } },
          data: { usedAt: claimedAt },
        });
        if (claim.count === 0) {
          throw new BadRequestError(INVALID_TOKEN_TEXT);
        }

        const user = await tx.user.findUniqueOrThrow({
          where: { id: resetToken.userId },
          select: { id: true, isActive: true, hashedPassword: true, emailVerifiedAt: true, requiresEmailVerification: true },
        });

        // A credential may only ever be written for a proven mailbox on a live account. A token can exist for an
        // unverified account only through a defect; refuse it generically rather than mint a credential.
        if (!user.isActive || isAwaitingEmailOwnership(user)) {
          throw new BadRequestError(INVALID_TOKEN_TEXT);
        }

        const isFirstSetup = user.hashedPassword === null;
        if (isFirstSetup && !consentsGiven) {
          // Authoritative: thrown inside the transaction, so the claim above rolls back and the token stays usable.
          throw new ConsentRequiredError();
        }

        const revokedAt = new Date();
        await tx.user.update({
          where: { id: user.id },
          data: { hashedPassword },
        });

        // Reuse the exact bulk-revocation idiom already established for user
        // deactivation (services/user.ts deactivateUser, employee-lifecycle.service.ts):
        // Session has no workspaceId column and is keyed by userId, so revoking by
        // userId is the correct scope — a password reset invalidates every session
        // for this user, not just the one (if any) the requester currently holds.
        await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt },
        });

        if (!isFirstSetup) {
          return { userId: user.id, isFirstSetup, sessionToken: null as string | null };
        }

        // First-time setup after ownership: the policy acceptances are recorded for the PROVEN owner, and the
        // account becomes immediately usable with a fresh session.
        await recordPolicyAcceptances(tx, user.id, clientAddress);
        const sessionToken = randomUUID();
        await tx.session.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            token: sessionToken,
            expiresAt: new Date(Date.now() + getSessionDurationMs()),
            ipAddress: ip !== "unknown" ? ip : null,
            userAgent: request.headers.get("user-agent") ?? null,
          },
        });
        return { userId: user.id, isFirstSetup, sessionToken: sessionToken as string | null };
      },
      "reset-password-redemption"
    );

    if (outcome.sessionToken) {
      // Cookie mutation stays outside the DB transaction, matching signup and
      // login's established convention.
      const cookieStore = await cookies();
      cookieStore.set(getSessionCookieName(), outcome.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: getSessionDurationMs() / 1000,
        path: "/",
      });
    }

    try {
      // emitAuditEvent silently no-ops without a workspaceId (fail-safe — see
      // infra/audit.ts), so a real scope must be resolved first, exactly as
      // login.ts does for its own post-auth audit events.
      const membership = await db.workspaceMembership.findFirst({
        where: { userId: outcome.userId, isActive: true },
        orderBy: { addedAt: "asc" },
        select: { workspaceId: true },
      });
      if (outcome.isFirstSetup) {
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.POLICY_ACCEPTED,
          actorId: outcome.userId,
          workspaceId: membership?.workspaceId,
          payload: { versions: CURRENT_POLICY_VERSIONS },
          visibility: "internal",
        });
      }
      if (outcome.isFirstSetup) {
        // Funnel step "Chose a password": workspace-scoped, no payload, emitted once per account (the setup branch is
        // taken only while hashedPassword is NULL, and the same transaction sets it).
        await recordProductEvent({ name: "password_set", workspaceId: membership?.workspaceId, actorId: outcome.userId });
      }
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.PASSWORD_RESET_COMPLETED,
        actorId: outcome.userId,
        workspaceId: membership?.workspaceId,
        entityType: "user",
        entityId: outcome.userId,
        payload: { initialSetup: outcome.isFirstSetup },
        visibility: "internal",
      });
    } catch (auditError) {
      console.error("[RESET_PASSWORD_AUDIT_FAILURE]", auditError instanceof Error ? auditError.constructor.name : "UnknownError");
    }

    return Response.json(
      outcome.isFirstSetup ? { success: true, redirectTo: SETUP_REDIRECT } : { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
    }
    if (error instanceof ConsentRequiredError) {
      return Response.json({ error: CONSENT_REQUIRED_TEXT, code: "consent_required" }, { status: 400 });
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (error instanceof BadRequestError) {
      // BadRequestError is only ever thrown in this route as `new BadRequestError(INVALID_TOKEN_TEXT)`
      // (every throw site above uses the same constant) -- return that constant directly rather than
      // the instance's .message so this branch reads as a fixed, reviewable string, not a pass-through
      // of whatever an AppError happens to carry.
      return Response.json({ error: INVALID_TOKEN_TEXT }, { status: 400 });
    }
    console.error("[RESET_PASSWORD_FAILED]", error instanceof Error ? error.constructor.name : "UnknownError");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
};
