/**
 * Shared resend-verification logic, extracted from
 * src/app/api/auth/resend-verification/route.ts so Administration's
 * "Resend verification" customer action reuses the exact same code path
 * (REUSE EXISTING, not a second implementation) rather than duplicating it.
 * The public route still owns rate-limiting/enumeration-resistant response
 * shaping; this function is the actual eligibility check + token + email.
 */
import { recordVerificationEmailNotSent, verificationBaseUrlProblem } from "@/services/auth/verification-email-signal";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  EMAIL_VERIFICATION_TTL_MS,
  invalidateUnusedVerificationTokens,
  isAwaitingEmailOwnership,
  lockUserRow,
  newOpaqueToken,
} from "@/services/auth/email-ownership.service";
import { emitAuditEvent } from "@/infra/audit";
import type { AuditEventName } from "@/domain/constants/audit-events";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { getConfig } from "@/lib/config";

export interface ResendVerificationOptions {
  ip?: string | null;
  /** Overrides the audit event name/actor for an operator-initiated resend (vs. the user's own self-serve request). */
  auditEventName: AuditEventName;
  actorId?: string;
  /**
   * When true every still-unused earlier verification link of the account is
   * invalidated in the same transaction that issues the new one, so only the
   * newest emailed link works. Used by a repeated signup for a pending
   * account (an older link may sit in an inbox the legitimate owner no longer
   * trusts). Defaults to false: a plain resend leaves earlier links valid.
   */
  rotate?: boolean;
}

/**
 * Only an account that actually requires verification and has not yet
 * verified gets a new token + email — every other case (no account, already
 * verified, inactive, or never required verification) silently no-ops.
 * Returns whether an email was actually sent, for a caller (e.g. an
 * admin action) that needs to know, unlike the public route's
 * enumeration-resistant generic response.
 */
export async function resendVerificationEmailIfEligible(
  email: string,
  options: ResendVerificationOptions
): Promise<{ sent: boolean }> {
  const user = await db.user.findUnique({ where: { email } });

  if (!user || !user.isActive || !isAwaitingEmailOwnership(user)) {
    return { sent: false };
  }

  const { raw: rawToken, hash: tokenHash } = newOpaqueToken();
  const ipAddress = options.ip && options.ip !== "unknown" ? options.ip : null;

  if (options.rotate) {
    // Lock the user row, re-check eligibility under the lock (a concurrent redemption may have just verified the
    // account), kill every unused link, then issue the new one — all or nothing.
    const issued = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await lockUserRow(tx, user.id);
      const fresh = await tx.user.findUnique({
        where: { id: user.id },
        select: { isActive: true, requiresEmailVerification: true, emailVerifiedAt: true },
      });
      if (!fresh || !fresh.isActive || !isAwaitingEmailOwnership(fresh)) return false;
      await invalidateUnusedVerificationTokens(tx, user.id, new Date());
      await tx.emailVerificationToken.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
          ipAddress,
        },
      });
      return true;
    });
    if (!issued) return { sent: false };
  } else {
    await db.emailVerificationToken.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
        ipAddress,
      },
    });
  }

  const membership = await db.workspaceMembership.findFirst({
    where: { userId: user.id, isActive: true },
    orderBy: { addedAt: "asc" },
    select: { workspaceId: true },
  });

  await emitAuditEvent({
    eventName: options.auditEventName,
    actorId: options.actorId ?? user.id,
    workspaceId: membership?.workspaceId,
    entityType: "user",
    entityId: user.id,
    visibility: "internal",
  });

  try {
    const provider = getEmailProvider();
    if (provider) {
      const verifyUrl = `${getConfig().NEXT_PUBLIC_APP_URL}/verify-email?token=${rawToken}`;
      if (verificationBaseUrlProblem(getConfig().NEXT_PUBLIC_APP_URL)) {
        await recordVerificationEmailNotSent({ reason: "BASE_URL_NOT_PUBLIC", userId: user.id, workspaceId: membership?.workspaceId });
      }
      await provider.send({
        to: user.email,
        subject: "Verify your OpsIQ account",
        html: `<p><a href="${verifyUrl}">Confirm your email</a> and you'll then choose your password.</p><p>This link expires in 7 days. If you didn't request this, you can safely ignore this email — nothing is activated until you confirm.</p>`,
        text: `Confirm your email for OpsIQ: ${verifyUrl}\n\nYou'll choose your password after you confirm. This link expires in 7 days. If you didn't request this, you can safely ignore this email — nothing is activated until you confirm.`,
      });
    } else {
      console.warn("[RESEND_VERIFICATION] No email provider configured — token created but not emailed", { userId: user.id });
      await recordVerificationEmailNotSent({ reason: "NO_PROVIDER", userId: user.id, workspaceId: membership?.workspaceId });
    }
  } catch (emailError) {
    await recordVerificationEmailNotSent({ reason: "SEND_FAILED", userId: user.id, workspaceId: membership?.workspaceId });
    console.error("[RESEND_VERIFICATION] Email dispatch failed", {
      userId: user.id,
      errorType: emailError instanceof Error ? emailError.constructor.name : "UnknownError",
    });
  }

  return { sent: true };
}
