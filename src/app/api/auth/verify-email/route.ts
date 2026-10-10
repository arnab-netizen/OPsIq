import { recordProductEvent } from "@/services/analytics/product-events.service";
import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { db, withStatementTimeout } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requirePgRateLimit, RateLimitError, EMAIL_VERIFICATION_RATE_LIMIT } from "@/infra/rate-limit";
import { ValidationError, BadRequestError } from "@/infra/errors";
import { getSessionCookieName, getSessionDurationMs } from "@/services/auth";
import { randomUUID } from "crypto";
import { z } from "zod/v4";
import { cookies } from "next/headers";

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
    await requirePgRateLimit(`verify-email-redeem:${ip}`, EMAIL_VERIFICATION_RATE_LIMIT);

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const verificationToken = await db.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!verificationToken || verificationToken.usedAt || verificationToken.expiresAt < new Date()) {
      throw new BadRequestError(INVALID_TOKEN_TEXT);
    }

    // Redeeming the token, marking the account verified, and issuing the
    // first usable session must commit atomically — a failure partway
    // through must never leave a token marked used with the account still
    // unverified (permanently locking the user out with no way back in),
    // nor a verified account with no session to show for it.
    const { user, sessionToken } = await withStatementTimeout(
      db,
      VERIFY_TRANSACTION_TIMEOUT_MS,
      async (tx: Prisma.TransactionClient) => {
        // Re-check inside the transaction: two concurrent redemptions of the
        // same raw token must not both succeed. updateMany scoped to
        // usedAt: null makes the second racer's write match zero rows
        // instead of silently overwriting the first's already-used token.
        const claim = await tx.emailVerificationToken.updateMany({
          where: { id: verificationToken.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claim.count === 0) {
          throw new BadRequestError(INVALID_TOKEN_TEXT);
        }

        const user = await tx.user.update({
          where: { id: verificationToken.userId },
          data: { emailVerifiedAt: new Date() },
        });

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

        return { user, sessionToken };
      },
      "verify-email-redemption"
    );

    // Cookie mutation stays outside the DB transaction, matching signup and
    // login's established convention — it is not a database operation and
    // must never be coupled to Prisma's rollback semantics.
    const cookieStore = await cookies();
    cookieStore.set(getSessionCookieName(), sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: getSessionDurationMs() / 1000,
      path: "/",
    });

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
        visibility: "internal",
      });
      await recordProductEvent({ name: "email_verified", workspaceId: membership?.workspaceId, actorId: user.id });
    } catch (auditError) {
      console.error("[VERIFY_EMAIL_AUDIT_FAILURE]", auditError instanceof Error ? auditError.constructor.name : "UnknownError");
    }

    return Response.json({ success: true, user: { id: user.id, email: user.email } });
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
    console.error("[VERIFY_EMAIL_FAILED]", error instanceof Error ? error.constructor.name : "UnknownError");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
};
