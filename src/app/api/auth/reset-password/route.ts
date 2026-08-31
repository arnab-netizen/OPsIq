import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { db, withStatementTimeout } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requireRateLimit, RateLimitError, PASSWORD_RESET_RATE_LIMIT } from "@/infra/rate-limit";
import { ValidationError, BadRequestError } from "@/infra/errors";
import { z } from "zod/v4";
import * as bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

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
    const { token, password } = await parseRequestBody(request, resetPasswordSchema);

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    requireRateLimit(`password-reset-redeem:${ip}`, PASSWORD_RESET_RATE_LIMIT);

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const resetToken = await db.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestError(INVALID_TOKEN_TEXT);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Redeeming a token, updating the password hash, and revoking every existing
    // session for this user must commit atomically: a failure partway through must
    // never leave a token marked used with the old password still active (locking
    // the user out with no way back in), nor a new password live while stale
    // sessions remain trusted.
    await withStatementTimeout(
      db,
      RESET_TRANSACTION_TIMEOUT_MS,
      async (tx: Prisma.TransactionClient) => {
        // Re-check inside the transaction: two concurrent redemptions of the same
        // raw token must not both succeed. updateMany scoped to usedAt: null makes
        // the second racer's write match zero rows instead of silently overwriting
        // the first's already-used token.
        const claim = await tx.passwordResetToken.updateMany({
          where: { id: resetToken.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claim.count === 0) {
          throw new BadRequestError(INVALID_TOKEN_TEXT);
        }

        await tx.user.update({
          where: { id: resetToken.userId },
          data: { hashedPassword },
        });

        // Reuse the exact bulk-revocation idiom already established for user
        // deactivation (services/user.ts deactivateUser, employee-lifecycle.service.ts):
        // Session has no workspaceId column and is keyed by userId, so revoking by
        // userId is the correct scope — a password reset invalidates every session
        // for this user, not just the one (if any) the requester currently holds.
        await tx.session.updateMany({
          where: { userId: resetToken.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      "reset-password-redemption"
    );

    try {
      // emitAuditEvent silently no-ops without a workspaceId (fail-safe — see
      // infra/audit.ts), so a real scope must be resolved first, exactly as
      // login.ts does for its own post-auth audit events.
      const membership = await db.workspaceMembership.findFirst({
        where: { userId: resetToken.userId, isActive: true },
        orderBy: { addedAt: "asc" },
        select: { workspaceId: true },
      });
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.PASSWORD_RESET_COMPLETED,
        actorId: resetToken.userId,
        workspaceId: membership?.workspaceId,
        entityType: "user",
        entityId: resetToken.userId,
        visibility: "internal",
      });
    } catch (auditError) {
      console.error("[RESET_PASSWORD_AUDIT_FAILURE]", auditError instanceof Error ? auditError.constructor.name : "UnknownError");
    }

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (error instanceof BadRequestError) {
      // BadRequestError is only ever thrown in this route as `new BadRequestError(INVALID_TOKEN_TEXT)`
      // (both throw sites above use the same constant) -- return that constant directly rather than
      // the instance's .message so this branch reads as a fixed, reviewable string, not a pass-through
      // of whatever an AppError happens to carry.
      return Response.json({ error: INVALID_TOKEN_TEXT }, { status: 400 });
    }
    console.error("[RESET_PASSWORD_FAILED]", error instanceof Error ? error.constructor.name : "UnknownError");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
};
