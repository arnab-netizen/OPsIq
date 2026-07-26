import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getEmailProvider } from "@/lib/integrations/email-provider";

export type AlertType = "blocked" | "threshold_breach" | "execution_failure";
export type AlertChannel = "in_app" | "email";
export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface CreateAlertInput {
  workspaceId: string;
  userId: string;
  type: AlertType;
  channel: AlertChannel;
  message: string;
  entityType?: string;
  entityId?: string;
  severity?: AlertSeverity;
  idempotencyKey?: string;
}

export type EmailDeliveryStatus = "PENDING" | "CLAIMED" | "SENT" | "FAILED" | "SKIPPED";

export interface Alert {
  id: string;
  workspaceId: string;
  userId: string;
  type: AlertType;
  channel: AlertChannel;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  severity: AlertSeverity;
  idempotencyKey?: string | null;
  isRead: boolean;
  readAt?: Date | null;
  resolvedAt?: Date | null;
  emailSentAt?: Date | null;
  emailError?: string | null;
  resendMessageId?: string | null;
  emailDeliveryStatus: EmailDeliveryStatus;
  emailClaimedAt?: Date | null;
  emailClaimExpiresAt?: Date | null;
  emailLastAttemptAt?: Date | null;
  emailAttemptCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  const {
    workspaceId,
    userId,
    type,
    channel,
    message,
    entityType,
    entityId,
    severity = "medium",
    idempotencyKey,
  } = input;

  enforceWorkspaceId(workspaceId, "createAlert", "Alert");

  try {
    if (idempotencyKey) {
      // If the same idempotency key already exists in this workspace, return it without creating a duplicate.
      const existing = await db.alert.findFirst({
        where: { workspaceId, idempotencyKey },
      });
      if (existing) {
        return existing as unknown as Alert;
      }
    }

    const created = await db.alert.create({
      data: {
        workspaceId,
        userId,
        type,
        channel,
        message,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        severity,
        idempotencyKey: idempotencyKey ?? null,
      },
    });

    const alert = created as unknown as Alert;

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ALERT_CREATED,
      actorId: userId,
      entityType: "alert",
      entityId: alert.id,
      workspaceId,
      payload: { type, channel, message, severity, entityType: entityType ?? null, entityId: entityId ?? null },
      visibility: "internal",
    }).catch((error) => {
      logger.warn("Failed to emit audit event for alert creation", {
        alertId: alert.id,
        error: classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).operatorMessage,
      });
    });

    if (channel === "email") {
      deliverEmailAlert(alert).catch((error) => {
        logger.warn("Failed to deliver email alert", {
          alertId: alert.id,
          userId,
          error: classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).operatorMessage,
        });
      });
    }

    logger.info("Alert created", { alertId: alert.id, type, severity, channel, userId, workspaceId });
    return alert;
  } catch (error) {
    logger.error("Failed to create alert", {
      workspaceId,
      userId,
      type,
      error: classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).operatorMessage,
    });
    throw error;
  }
}

export async function markAlertAsRead(
  alertId: string,
  workspaceId: string,
  actorId: string
): Promise<Alert> {
  try {
    const existingAlert = await db.alert.findFirst({
      where: { id: alertId, workspaceId },
    });

    if (!existingAlert) {
      throw new Error("Alert not found");
    }

    const alert = await db.alert.update({
      where: { id: alertId, workspaceId },
      data: { isRead: true, readAt: new Date() },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ALERT_UPDATED,
      actorId,
      entityType: "alert",
      entityId: alertId,
      workspaceId,
      payload: { isRead: true },
      visibility: "internal",
    }).catch((error) => {
      logger.warn("Failed to emit audit event for alert update", {
        alertId,
        error: classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).operatorMessage,
      });
    });

    logger.info("Alert marked as read", { alertId, workspaceId });
    return alert as unknown as Alert;
  } catch (error) {
    logger.error("Failed to mark alert as read", {
      alertId,
      error: classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).operatorMessage,
    });
    throw error;
  }
}

export async function getAlerts(
  workspaceId: string,
  userId: string,
  options: {
    unreadOnly?: boolean;
    limit?: number;
    severity?: AlertSeverity;
  } = {}
): Promise<Alert[]> {
  const { unreadOnly = false, limit = 50, severity } = options;

  try {
    const alerts = await db.alert.findMany({
      where: {
        workspaceId,
        userId,
        ...(unreadOnly && { isRead: false }),
        ...(severity && { severity }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return alerts as unknown as Alert[];
  } catch (error) {
    logger.error("Failed to fetch alerts", {
      workspaceId,
      userId,
      error: classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).operatorMessage,
    });
    throw error;
  }
}

export async function triggerBlockedAlert(
  workspaceId: string,
  userId: string,
  decisionId: string,
  reason: string
): Promise<Alert> {
  return createAlert({
    workspaceId,
    userId,
    type: "blocked",
    channel: "in_app",
    severity: "high",
    message: `Decision execution blocked: ${reason}`,
    entityType: "OperatorItem",
    entityId: decisionId,
    idempotencyKey: `blocked:${decisionId}`,
  });
}

export async function triggerThresholdBreachAlert(
  workspaceId: string,
  userId: string,
  thresholdName: string,
  currentValue: number,
  threshold: number
): Promise<Alert> {
  return createAlert({
    workspaceId,
    userId,
    type: "threshold_breach",
    channel: "in_app",
    severity: "medium",
    message: `Threshold breach: ${thresholdName} (current: ${currentValue}, threshold: ${threshold})`,
    idempotencyKey: `threshold:${thresholdName}:${workspaceId}`,
  });
}

export async function triggerExecutionFailureAlert(
  workspaceId: string,
  userId: string,
  decisionId: string,
  failureReason: string
): Promise<Alert> {
  return createAlert({
    workspaceId,
    userId,
    type: "execution_failure",
    channel: "in_app",
    severity: "critical",
    message: `Decision execution failed: ${failureReason}`,
    entityType: "OperatorItem",
    entityId: decisionId,
    idempotencyKey: `failure:${decisionId}`,
  });
}

// Maximum delivery attempts before permanently abandoning (FAILED terminal state).
const EMAIL_MAX_ATTEMPTS = 3;
// Lease duration in milliseconds — claim expires after 5 minutes (crash recovery window).
const EMAIL_CLAIM_LEASE_MS = 5 * 60 * 1000;

// Retryable provider errors: transient network, rate limits, server errors.
function isRetryableProviderError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /429|503|502|500|504|timeout|ECONNRESET|ETIMEDOUT|network/i.test(msg);
}

async function deliverEmailAlert(alert: Alert): Promise<void> {
  // Provider check first — mark SKIPPED before touching the delivery slot.
  const provider = getEmailProvider();
  if (!provider) {
    logger.warn("Email alert queued but RESEND_API_KEY not configured — falling back to in-app only", {
      alertId: alert.id,
      userId: alert.userId,
      type: alert.type,
      severity: alert.severity,
    });
    await db.$executeRaw`
      UPDATE "alerts"
      SET "email_delivery_status" = 'SKIPPED',
          "email_error" = 'RESEND_API_KEY not configured — email delivery skipped'
      WHERE "id" = ${alert.id} AND "email_delivery_status" = 'PENDING'
    `.catch(() => {});
    return;
  }

  // Workspace-membership check: recipient must have an active membership in the alert's workspace.
  const recipient = await db.user.findFirst({
    where: {
      id: alert.userId,
      workspaceMemberships: { some: { workspaceId: alert.workspaceId, isActive: true } },
    },
    select: { email: true },
  });
  if (!recipient) {
    logger.warn("Email alert skipped — user not found or not a member of workspace", {
      alertId: alert.id,
      userId: alert.userId,
      workspaceId: alert.workspaceId,
    });
    await db.$executeRaw`
      UPDATE "alerts"
      SET "email_delivery_status" = 'SKIPPED',
          "email_error" = 'user_not_in_workspace'
      WHERE "id" = ${alert.id} AND "email_delivery_status" = 'PENDING'
    `.catch(() => {});
    return;
  }
  if (!recipient.email) {
    logger.warn("Email alert skipped — user has no email address", { alertId: alert.id, userId: alert.userId });
    await db.$executeRaw`
      UPDATE "alerts"
      SET "email_delivery_status" = 'SKIPPED',
          "email_error" = 'user_no_email_address'
      WHERE "id" = ${alert.id} AND "email_delivery_status" = 'PENDING'
    `.catch(() => {});
    return;
  }

  // Atomic delivery claim with lease. Transitions PENDING → CLAIMED.
  // Also reclaims CLAIMED records whose lease has expired (crash recovery).
  // Returns 0 if already claimed by another worker, SENT, FAILED (terminal), or SKIPPED.
  const claimExpiry = new Date(Date.now() + EMAIL_CLAIM_LEASE_MS);
  const claimed = await db.$executeRaw`
    UPDATE "alerts"
    SET "email_delivery_status"  = 'CLAIMED',
        "email_claimed_at"       = NOW(),
        "email_claim_expires_at" = ${claimExpiry},
        "email_last_attempt_at"  = NOW(),
        "email_attempt_count"    = "email_attempt_count" + 1
    WHERE "id" = ${alert.id}
      AND (
        ("email_delivery_status" = 'PENDING')
        OR ("email_delivery_status" = 'CLAIMED' AND "email_claim_expires_at" < NOW())
      )
  `;
  if (claimed === 0) {
    logger.info("Email alert delivery already claimed or terminal — skipping", { alertId: alert.id });
    return;
  }

  const severityLabel = alert.severity === "critical" ? "🔴 CRITICAL" : alert.severity === "high" ? "🟠 HIGH" : "⚠️ ALERT";
  try {
    const result = await provider.send({
      to: recipient.email,
      subject: `${severityLabel}: ${alert.type.replace(/_/g, " ")} — OpsIQ`,
      html: `<p><strong>${severityLabel}</strong></p><p>${alert.message}</p><p style="color:#666;font-size:12px">Alert ID: ${alert.id}</p>`,
      text: `${severityLabel}\n\n${alert.message}\n\nAlert ID: ${alert.id}`,
    });

    // Provider confirmed delivery. emailSentAt = NOW() ONLY at this point (not during claim).
    await db.alert.update({
      where: { id: alert.id },
      data: {
        emailDeliveryStatus: "SENT",
        emailSentAt: new Date(),
        resendMessageId: result.id ?? null,
        emailError: null,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ALERT_EMAIL_DELIVERED,
      actorId: alert.userId,
      entityType: "alert",
      entityId: alert.id,
      workspaceId: alert.workspaceId,
      payload: {
        resendMessageId: result.id ?? null,
        toDomain: recipient.email.split("@")[1] ?? "unknown",
        severity: alert.severity,
      },
      visibility: "internal",
    }).catch(() => {
      logger.warn("Failed to emit ALERT_EMAIL_DELIVERED audit event", { alertId: alert.id });
    });

    logger.info("Email alert delivered", { alertId: alert.id, userId: alert.userId });
  } catch (error) {
    const errorMessage = classifyOperatorError(
      error instanceof Error ? error : new Error(String(error)),
      { context: "network" }
    ).operatorMessage.slice(0, 500);

    // Determine final state: check attempt count to decide if permanently terminal.
    const current = await db.alert.findFirst({
      where: { id: alert.id },
      select: { emailAttemptCount: true },
    }).catch(() => null);

    const attemptCount = current?.emailAttemptCount ?? 1;
    const isPermanentlyFailed = !isRetryableProviderError(error) || attemptCount >= EMAIL_MAX_ATTEMPTS;

    // emailSentAt remains NULL — only SENT state sets it.
    await db.alert.update({
      where: { id: alert.id },
      data: {
        emailDeliveryStatus: "FAILED",
        emailError: errorMessage,
        emailSentAt: null,
      },
    }).catch(() => {});

    const auditEvent = isPermanentlyFailed
      ? AUDIT_EVENTS.ALERT_EMAIL_PERMANENTLY_FAILED
      : AUDIT_EVENTS.ALERT_EMAIL_FAILED;

    await emitAuditEvent({
      eventName: auditEvent,
      actorId: alert.userId,
      entityType: "alert",
      entityId: alert.id,
      workspaceId: alert.workspaceId,
      payload: {
        errorClass: error instanceof Error ? error.constructor.name : "UnknownError",
        severity: alert.severity,
        attemptCount,
        retryable: !isPermanentlyFailed,
      },
      visibility: "internal",
    }).catch(() => {
      logger.warn("Failed to emit email failure audit event", { alertId: alert.id });
    });

    throw error;
  }
}

export async function triggerComplianceDeadlineAlert(
  workspaceId: string,
  userId: string,
  itemTitle: string,
  daysUntilDeadline: number,
  itemId: string,
): Promise<Alert> {
  return createAlert({
    workspaceId,
    userId,
    type: "threshold_breach",
    channel: "email",
    severity: daysUntilDeadline <= 3 ? "critical" : daysUntilDeadline <= 7 ? "high" : "medium",
    message: `Compliance item "${itemTitle}" is due in ${daysUntilDeadline} day${daysUntilDeadline === 1 ? "" : "s"}.`,
    entityType: "ComplianceItem",
    entityId: itemId,
    idempotencyKey: `compliance-deadline:${itemId}:days${daysUntilDeadline}`,
  });
}

export async function triggerCriticalStateAlert(
  workspaceId: string,
  userId: string,
  domain: "cash" | "risk" | "operations",
  stateLabel: string,
  entityId?: string,
): Promise<Alert> {
  return createAlert({
    workspaceId,
    userId,
    type: "threshold_breach",
    channel: "email",
    severity: "critical",
    message: `CRITICAL ${domain.toUpperCase()} STATE: ${stateLabel}. Immediate attention required.`,
    entityType: domain === "cash" ? "CashflowDiagnosis" : domain === "risk" ? "BusinessRisk" : "OperationsSnapshot",
    entityId: entityId ?? undefined,
    idempotencyKey: `critical-state:${domain}:${workspaceId}:${stateLabel.slice(0, 40)}`,
  });
}

export async function resolveAlert(
  alertId: string,
  workspaceId: string,
  actorId: string
): Promise<Alert> {
  try {
    const existingAlert = await db.alert.findFirst({
      where: { id: alertId, workspaceId },
    });

    if (!existingAlert) {
      throw new Error("Alert not found");
    }

    const alert = await db.alert.update({
      where: { id: alertId, workspaceId },
      data: { resolvedAt: new Date(), isRead: true, readAt: existingAlert.readAt ?? new Date() },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ALERT_UPDATED,
      actorId,
      entityType: "alert",
      entityId: alertId,
      workspaceId,
      payload: { resolvedAt: alert.resolvedAt },
      visibility: "internal",
    }).catch((error) => {
      logger.warn("Failed to emit audit event for alert resolution", {
        alertId,
        error: classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).operatorMessage,
      });
    });

    logger.info("Alert resolved", { alertId, workspaceId });
    return alert as unknown as Alert;
  } catch (error) {
    logger.error("Failed to resolve alert", {
      alertId,
      error: classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).operatorMessage,
    });
    throw error;
  }
}

export async function getUnreadAlertCount(
  workspaceId: string,
  userId: string
): Promise<number> {
  try {
    return await db.alert.count({
      where: { workspaceId, userId, isRead: false },
    });
  } catch (error) {
    logger.error("Failed to get unread alert count", {
      workspaceId,
      userId,
      error: classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).operatorMessage,
    });
    return 0;
  }
}
