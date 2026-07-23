import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

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

async function deliverEmailAlert(alert: Alert): Promise<void> {
  logger.info("Email alert delivery (stub — transport not yet wired)", {
    alertId: alert.id,
    userId: alert.userId,
    type: alert.type,
    message: alert.message,
  });
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
