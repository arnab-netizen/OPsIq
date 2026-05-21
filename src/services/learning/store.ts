import { classifyOperatorError } from "@/lib/operator-error-governance";
import { OperatorItem } from "@/domain/operator/types";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";

export interface LearningRecordInput {
  workspaceId: string;
  problemType: string;
  actionTaken: string;
  success: boolean;
  impact: number;
  actorId?: string;
}

/**
 * Record a decision outcome to the learning store.
 * Called when a decision is completed and outcomes are known.
 */
export async function recordLearning(input: LearningRecordInput): Promise<void> {
  const actorId = input.actorId || "system";

  await db.learningRecord.create({
    data: {
      workspaceId: input.workspaceId,
      problemType: input.problemType,
      actionTaken: input.actionTaken,
      success: input.success,
      impact: input.impact,
      timestamp: new Date(),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.LEARNING_RECORDED,
    actorId,
    entityType: "learning_record",
    entityId: `${input.workspaceId}:${input.problemType}`,
    workspaceId: input.workspaceId,
    payload: {
      problemType: input.problemType,
      actionTaken: input.actionTaken,
      success: input.success,
      impact: input.impact,
    },
    visibility: "internal",
  }).catch((error) => {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.warn("Failed to emit audit event for learning record", {
      workspaceId: input.workspaceId,
      error: governed.operatorMessage,
    });
  });
}

/**
 * Extract learning from a completed operator item.
 * Determines success based on outcome value and records the learning.
 */
export async function recordOperatorItemLearning(
  item: OperatorItem
): Promise<void> {
  // Only record if item is completed with outcome data
  if (item.status !== "done") {
    return;
  }

  if (!item.problemType) {
    return;
  }

  // Determine success from actual outcome
  let actualOutcome = 0;
  if (item.actualOutcomeValue !== null && item.actualOutcomeValue !== undefined) {
    actualOutcome = Number(item.actualOutcomeValue);
  } else if (item.outcomeDelta !== null && item.outcomeDelta !== undefined) {
    actualOutcome = Number(item.outcomeDelta);
  } else {
    // No outcome data to record
    return;
  }

  const success = actualOutcome > 0;

  await recordLearning({
    workspaceId: item.workspaceId,
    problemType: item.problemType,
    actionTaken: item.action,
    success,
    impact: Math.abs(actualOutcome),
  });
}

/**
 * Get learning records for pattern analysis.
 * Returns recent records for a workspace, filtered by problemType if specified.
 */
export async function getLearningRecords(
  workspaceId: string,
  problemType?: string,
  limit: number = 100
) {
  const where: any = {
    workspaceId,
  };

  if (problemType) {
    where.problemType = problemType;
  }

  return await db.learningRecord.findMany({
    where,
    orderBy: {
      timestamp: "desc",
    },
    take: limit,
  });
}

/**
 * Get learning records from last N days.
 */
export async function getLearningRecordsFromDays(
  workspaceId: string,
  days: number = 30,
  limit: number = 500
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await db.learningRecord.findMany({
    where: {
      workspaceId,
      timestamp: {
        gte: startDate,
      },
    },
    orderBy: {
      timestamp: "desc",
    },
    take: limit,
  });
}
