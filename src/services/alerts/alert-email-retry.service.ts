import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { NotFoundError, ConflictError } from "@/infra/errors";

const EMAIL_MAX_ATTEMPTS = 3;
const EMAIL_CLAIM_LEASE_MS = 5 * 60 * 1000;

function isRetryableProviderError(error: unknown): boolean {
  const msg = String(error);
  return /429|503|502|500|504|timeout|ECONNRESET|ETIMEDOUT|network/i.test(msg);
}

export interface RetryEmailAlertResult {
  alertId: string;
  status: "SENT" | "FAILED" | "SKIPPED" | "ALREADY_TERMINAL";
  attemptCount: number;
  message?: string;
}

export async function retryEmailAlert(
  alertId: string,
  workspaceId: string,
  actorId: string
): Promise<RetryEmailAlertResult> {
  enforceWorkspaceId(workspaceId, "retryEmailAlert", "Alert");

  const alert = await db.alert.findFirst({
    where: { id: alertId, workspaceId },
  });

  if (!alert) throw new NotFoundError("Alert", alertId);

  // SENT is terminal — cannot retry a successfully delivered alert.
  if (alert.emailDeliveryStatus === "SENT") {
    return { alertId, status: "ALREADY_TERMINAL", attemptCount: alert.emailAttemptCount, message: "Alert already delivered" };
  }

  // SKIPPED is terminal — misconfigured recipient or no provider.
  if (alert.emailDeliveryStatus === "SKIPPED") {
    return { alertId, status: "ALREADY_TERMINAL", attemptCount: alert.emailAttemptCount, message: "Alert delivery permanently skipped" };
  }

  // FAILED: only retryable if below max attempts.
  if (alert.emailDeliveryStatus === "FAILED" && alert.emailAttemptCount >= EMAIL_MAX_ATTEMPTS) {
    throw new ConflictError(`Alert ${alertId} has reached maximum delivery attempts (${EMAIL_MAX_ATTEMPTS})`);
  }

  // CLAIMED: only retryable if lease is expired (crash recovery path).
  if (alert.emailDeliveryStatus === "CLAIMED") {
    const leaseExpired = alert.emailClaimExpiresAt != null && alert.emailClaimExpiresAt < new Date();
    if (!leaseExpired) {
      return { alertId, status: "ALREADY_TERMINAL", attemptCount: alert.emailAttemptCount, message: "Delivery in progress — lease not expired" };
    }
  }

  const provider = getEmailProvider();
  if (!provider) {
    throw new ConflictError("Email provider not configured — set RESEND_API_KEY to enable delivery");
  }

  const recipient = await db.user.findFirst({
    where: {
      id: alert.userId,
      workspaceMemberships: { some: { workspaceId, isActive: true } },
    },
    select: { email: true },
  });

  if (!recipient?.email) {
    const reason = !recipient ? "user_not_in_workspace" : "user_no_email_address";
    await db.alert.update({
      where: { id: alertId },
      data: { emailDeliveryStatus: "SKIPPED", emailError: reason },
    });
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ALERT_EMAIL_RETRY,
      actorId,
      entityType: "alert",
      entityId: alertId,
      workspaceId,
      payload: { outcome: "SKIPPED", reason, attemptCount: alert.emailAttemptCount },
      visibility: "internal",
    }).catch(() => {});
    return { alertId, status: "SKIPPED", attemptCount: alert.emailAttemptCount };
  }

  // Atomic claim with lease — same pattern as initial delivery.
  const claimExpiry = new Date(Date.now() + EMAIL_CLAIM_LEASE_MS);
  const claimed = await db.$executeRaw`
    UPDATE "alerts"
    SET "email_delivery_status"  = 'CLAIMED',
        "email_claimed_at"       = NOW(),
        "email_claim_expires_at" = ${claimExpiry},
        "email_last_attempt_at"  = NOW(),
        "email_attempt_count"    = "email_attempt_count" + 1
    WHERE "id" = ${alertId}
      AND "workspace_id" = ${workspaceId}
      AND (
        ("email_delivery_status" = 'FAILED')
        OR ("email_delivery_status" = 'CLAIMED' AND "email_claim_expires_at" < NOW())
      )
  `;

  if (claimed === 0) {
    return { alertId, status: "ALREADY_TERMINAL", attemptCount: alert.emailAttemptCount, message: "Could not claim delivery slot" };
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ALERT_EMAIL_RETRY,
    actorId,
    entityType: "alert",
    entityId: alertId,
    workspaceId,
    payload: { outcome: "CLAIMED", attemptCount: alert.emailAttemptCount + 1 },
    visibility: "internal",
  }).catch(() => {});

  const severityLabel = alert.severity === "critical" ? "🔴 CRITICAL" : alert.severity === "high" ? "🟠 HIGH" : "⚠️ ALERT";

  try {
    const result = await provider.send({
      to: recipient.email,
      subject: `${severityLabel}: ${alert.type.replace(/_/g, " ")} — OpsIQ`,
      html: `<p><strong>${severityLabel}</strong></p><p>${alert.message}</p><p style="color:#666;font-size:12px">Alert ID: ${alertId}</p>`,
      text: `${severityLabel}\n\n${alert.message}\n\nAlert ID: ${alertId}`,
    });

    const updated = await db.alert.update({
      where: { id: alertId },
      data: {
        emailDeliveryStatus: "SENT",
        emailSentAt: new Date(),
        resendMessageId: result.id ?? null,
        emailError: null,
      },
      select: { emailAttemptCount: true },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ALERT_EMAIL_DELIVERED,
      actorId,
      entityType: "alert",
      entityId: alertId,
      workspaceId,
      payload: {
        resendMessageId: result.id ?? null,
        toDomain: recipient.email.split("@")[1] ?? "unknown",
        severity: alert.severity,
        viaRetry: true,
      },
      visibility: "internal",
    }).catch(() => {});

    logger.info("Email alert delivered via retry", { alertId, actorId });
    return { alertId, status: "SENT", attemptCount: updated.emailAttemptCount };
  } catch (error) {
    const safeMessage = classifyOperatorError(
      error instanceof Error ? error : new Error(String(error)),
      { context: "network" }
    ).operatorMessage.slice(0, 500);

    const updatedAlert = await db.alert.findFirst({
      where: { id: alertId },
      select: { emailAttemptCount: true },
    }).catch(() => null);

    const attemptCount = updatedAlert?.emailAttemptCount ?? alert.emailAttemptCount + 1;
    const isPermanentlyFailed = !isRetryableProviderError(error) || attemptCount >= EMAIL_MAX_ATTEMPTS;

    await db.alert.update({
      where: { id: alertId },
      data: {
        emailDeliveryStatus: "FAILED",
        emailError: safeMessage,
        emailSentAt: null,
      },
    }).catch(() => {});

    await emitAuditEvent({
      eventName: isPermanentlyFailed ? AUDIT_EVENTS.ALERT_EMAIL_PERMANENTLY_FAILED : AUDIT_EVENTS.ALERT_EMAIL_FAILED,
      actorId,
      entityType: "alert",
      entityId: alertId,
      workspaceId,
      payload: { errorClass: error instanceof Error ? error.constructor.name : "UnknownError", severity: alert.severity, attemptCount, retryable: !isPermanentlyFailed },
      visibility: "internal",
    }).catch(() => {});

    logger.warn("Email alert retry failed", { alertId, attemptCount, isPermanentlyFailed });
    return { alertId, status: "FAILED", attemptCount, message: safeMessage };
  }
}
