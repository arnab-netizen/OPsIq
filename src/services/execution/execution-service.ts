import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { recordDecisionMetrics } from "@/services/metrics/decision-metrics-service";
import { logger } from "@/infra/logger";

export async function executeDecision(
  decisionId: string,
  workspaceId: string,
  userId: string
) {
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found or access denied");
  }

  if (decision.executionStatus !== "pending" && decision.executionStatus !== "not_started") {
    throw new Error(
      `Cannot execute decision with status: ${decision.executionStatus}`
    );
  }

  const updated = await db.operatorItem.update({
    where: { id: decisionId },
    data: {
      executionStatus: "running",
      startedAt: new Date(),
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    },
  });

  await emitAuditEvent({
    workspaceId,
    eventName: AUDIT_EVENTS.DECISION_EXECUTION_STARTED,
    actorId: userId,
    entityType: "OperatorItem",
    entityId: decisionId,
    payload: {
      status: "running",
      startedAt: new Date().toISOString(),
    },
  });

  return updated;
}

export async function markSuccess(
  decisionId: string,
  workspaceId: string,
  userId: string,
  outcomeValue: number
) {
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found or access denied");
  }

  if (decision.executionStatus !== "running") {
    throw new Error(
      `Cannot mark success: execution status is ${decision.executionStatus}`
    );
  }

  const calculatedAccuracy =
    decision.impactExpected > 0
      ? outcomeValue / decision.impactExpected
      : undefined;

  const updated = await db.operatorItem.update({
    where: { id: decisionId },
    data: {
      executionStatus: "success",
      executedAt: new Date(),
      executedBy: userId,
      actualOutcomeValue: outcomeValue,
      decisionAccuracy: calculatedAccuracy,
      completedAt: new Date(),
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    },
  });

  await emitAuditEvent({
    workspaceId,
    eventName: AUDIT_EVENTS.DECISION_EXECUTION_SUCCESS,
    actorId: userId,
    entityType: "OperatorItem",
    entityId: decisionId,
    payload: {
      status: "success",
      actualOutcomeValue: outcomeValue,
      expectedOutcome: decision.impactExpected,
      accuracy: calculatedAccuracy,
      executedAt: new Date().toISOString(),
    },
  });

  await recordDecisionMetrics(workspaceId, {
    problemType: decision.problemType || "general",
    actionTaken: decision.action,
    success: true,
    actualOutcome: outcomeValue,
    expectedOutcome: decision.impactExpected,
  }).catch((metricsError) => {
    logger.warn("Failed to record success metrics", {
      decisionId,
      workspaceId,
      error: metricsError instanceof Error ? metricsError.message : String(metricsError),
    });
  });

  return updated;
}

export async function markFailure(
  decisionId: string,
  workspaceId: string,
  userId: string,
  reason: string
) {
  if (!reason.trim()) {
    throw new Error("Failure reason is required");
  }

  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found or access denied");
  }

  if (decision.executionStatus !== "running") {
    throw new Error(
      `Cannot mark failure: execution status is ${decision.executionStatus}`
    );
  }

  const updated = await db.operatorItem.update({
    where: { id: decisionId },
    data: {
      executionStatus: "failed",
      executedAt: new Date(),
      executedBy: userId,
      blockReason: reason,
      completedAt: new Date(),
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    },
  });

  await emitAuditEvent({
    workspaceId,
    eventName: AUDIT_EVENTS.DECISION_EXECUTION_FAILED,
    actorId: userId,
    entityType: "OperatorItem",
    entityId: decisionId,
    payload: {
      status: "failed",
      reason,
      failedAt: new Date().toISOString(),
    },
  });

  await recordDecisionMetrics(workspaceId, {
    problemType: decision.problemType || "general",
    actionTaken: decision.action,
    success: false,
    actualOutcome: 0,
    expectedOutcome: decision.impactExpected,
  }).catch((metricsError) => {
    logger.warn("Failed to record failure metrics", {
      decisionId,
      workspaceId,
      error: metricsError instanceof Error ? metricsError.message : String(metricsError),
    });
  });

  return updated;
}
