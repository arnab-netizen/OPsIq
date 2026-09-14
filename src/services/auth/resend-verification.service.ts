/**
 * Shared resend-verification logic, extracted from
 * src/app/api/auth/resend-verification/route.ts so Administration's
 * "Resend verification" customer action reuses the exact same code path
 * (REUSE EXISTING, not a second implementation) rather than duplicating it.
 * The public route still owns rate-limiting/enumeration-resistant response
 * shaping; this function is the actual eligibility check + token + email.
 */
import { randomBytes, createHash, randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import type { AuditEventName } from "@/domain/constants/audit-events";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { getConfig } from "@/lib/config";

/** Same 7-day window as the token issued at signup — a resend is not a shorter-lived grant. */
const EMAIL_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResendVerificationOptions {
  ip?: string | null;
  /** Overrides the audit event name/actor for an operator-initiated resend (vs. the user's own self-serve request). */
  auditEventName: AuditEventName;
  actorId?: string;
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

  if (!user || !user.isActive || !user.requiresEmailVerification || user.emailVerifiedAt) {
    return { sent: false };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await db.emailVerificationToken.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      ipAddress: options.ip && options.ip !== "unknown" ? options.ip : null,
    },
  });

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
      await provider.send({
        to: user.email,
        subject: "Verify your OpsIQ account",
        html: `<p><a href="${verifyUrl}">Verify your email to activate your account</a></p><p>This link expires in 7 days. If you didn't request this, you can safely ignore this email.</p>`,
        text: `Verify your OpsIQ account: ${verifyUrl}\n\nThis link expires in 7 days. If you didn't request this, you can safely ignore this email.`,
      });
    } else {
      console.warn("[RESEND_VERIFICATION] No email provider configured — token created but not emailed", { userId: user.id });
    }
  } catch (emailError) {
    console.error("[RESEND_VERIFICATION] Email dispatch failed", {
      userId: user.id,
      errorType: emailError instanceof Error ? emailError.constructor.name : "UnknownError",
    });
  }

  return { sent: true };
}
