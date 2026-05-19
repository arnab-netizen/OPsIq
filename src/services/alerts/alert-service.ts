import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export type AlertType = "blocked" | "threshold_breach" | "execution_failure";
export type AlertChannel = "in_app" | "email";

export interface CreateAlertInput {
  workspaceId: string;
  userId: string;
  type: AlertType;
  channel: AlertChannel;
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface Alert {
  id: string;
  workspaceId: string;
  userId: string;
  type: AlertType;
  channel: AlertChannel;
  message: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  const { workspaceId, userId, type, channel, message, entityType, entityId } =
    input;

  // Enforce workspace isolation
  enforceWorkspaceId(workspaceId, "createAlert", "Alert");

  try {
    const alert = await db.alert.create({
      data: {
        workspaceId,
        userId,
        type,
        channel,
        message,
        entityType: entityType || null,
        entityId: entityId || null,
      },
    });

    // Emit audit event
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ALERT_CREATED,
      actorId: userId,
      workspaceId,
      capability: 'ALERT_CREATE',
      decision: 'alert_created',
      requestId: context?.requestId,
      entityType: "alert",
      entityId: alert.id,
      payload: {
        type,
        channel,
        message,
        entityType: entityType || null,
        entityId: entityId || null,
      },
      visibility: "internal",
    }).catch((error) => {
      logger.warn("Failed to emit audit event for alert creation", {
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Deliver based on channel
    if (channel === "email") {
      deliverEmailAlert(alert as any).catch((error) => {
        logger.warn("Failed to deliver email alert", {
          alertId: alert.id,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    logger.info("Alert created", {
      alertId: alert.id,
      type,
      channel,
      userId,
      workspaceId,
    });

    return alert as Alert;
  } catch (error) {
    logger.error("Failed to create alert", {
      workspaceId,
      userId,
      type,
      error: error instanceof Error ? error.message : String(error),
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
    // Verify alert exists and belongs to workspace
    const existingAlert = await db.alert.findFirst({
      where: { id: alertId, workspaceId },
    });

    if (!existingAlert) {
      throw new Error("Alert not found");
    }

    const alert = await db.alert.update({
      where: { id: alertId, workspaceId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    // Emit audit event
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ALERT_UPDATED,
      actorId,
      entityType: "alert",
      entityId: alertId,
      workspaceId,
      payload: {
        isRead: true,
      },
      visibility: "internal",
    }).catch((error) => {
      logger.warn("Failed to emit audit event for alert update", {
        alertId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info("Alert marked as read", { alertId, workspaceId });
    return alert as Alert;
  } catch (error) {
    logger.error("Failed to mark alert as read", {
      alertId,
      error: error instanceof Error ? error.message : String(error),
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
  } = {}
): Promise<Alert[]> {
  const { unreadOnly = false, limit = 50 } = options;

  try {
    const alerts = await db.alert.findMany({
      where: {
        workspaceId,
        userId,
        ...(unreadOnly && { isRead: false }),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    return alerts as Alert[];
  } catch (error) {
    logger.error("Failed to fetch alerts", {
      workspaceId,
      userId,
      error: error instanceof Error ? error.message : String(error),
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
    message: `Decision execution blocked: ${reason}`,
    entityType: "OperatorItem",
    entityId: decisionId,
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
    message: `Threshold breach: ${thresholdName} (current: ${currentValue}, threshold: ${threshold})`,
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
    message: `Decision execution failed: ${failureReason}`,
    entityType: "OperatorItem",
    entityId: decisionId,
  });
}

async function deliverEmailAlert(alert: Alert): Promise<void> {
  // Email stub: log instead of actually sending
  logger.info("Email alert delivered (stub)", {
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
    const count = await db.alert.count({
      where: {
        workspaceId,
        userId,
        isRead: false,
      },
    });
    return count;
  } catch (error) {
    logger.error("Failed to get unread alert count", {
      workspaceId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
