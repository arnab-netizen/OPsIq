/**
 * Operator-visible signal for a verification email that did NOT go out. Signup and resend deliberately answer
 * success regardless (the account exists and can retry), so without this the only trace of a missing provider or a
 * wrong public URL is a console line. Never throws; payload carries an enum reason only (no address, no link).
 */
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export type VerificationEmailFailureReason = "NO_PROVIDER" | "SEND_FAILED" | "BASE_URL_NOT_PUBLIC";

/** In production a localhost/unset base URL makes every verification link unusable (the default is localhost:3000). */
export function verificationBaseUrlProblem(baseUrl: string, nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  if (nodeEnv !== "production") return false;
  try {
    const host = new URL(baseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  } catch {
    return true;
  }
}

export async function recordVerificationEmailNotSent(args: {
  reason: VerificationEmailFailureReason;
  userId: string;
  workspaceId?: string;
}): Promise<void> {
  try {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EMAIL_VERIFICATION_NOT_SENT,
      actorId: args.userId,
      workspaceId: args.workspaceId,
      entityType: "user",
      entityId: args.userId,
      payload: { reason: args.reason },
      visibility: "internal",
    });
  } catch {
    /* the signal must never turn a real signup into a failure */
  }
}
