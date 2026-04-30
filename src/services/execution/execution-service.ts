import { db } from "@/lib/db";
import { triggerAction } from "@/services/execution/action-handlers";
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

  if (decision.executionStatus !== "pending") {
    throw new Error(
      `Cannot execute decision: execution status must be 'pending', got '${decision.executionStatus}'`
    );
  }

  const now = new Date();

  try {
    const updated = await db.$transaction(async (tx: any) => {
      const result = await tx.operatorItem.updateMany({
        where: {
          id: decisionId,
          workspaceId,
          executionStatus: "pending",
        },
        data: {
          executionStatus: "running",
          startedAt: now,
          lastUpdatedBy: userId,
          updatedAt: now,
        },
      });

      if (result.count === 0) {
        throw new Error("Execution lock acquired by another request: decision already transitioning");
      }

      return tx.operatorItem.findFirst({
        where: { id: decisionId, workspaceId },
      });
    });

    if (!updated) {
      throw new Error("Decision not found after update");
    }

    // Trigger action if configured (non-blocking, fail-safe)
    triggerAction(
      decisionId,
      workspaceId,
      updated.actionType as any,
      updated.actionPayload as any,
      userId
    ).catch((error) => {
      logger.warn("Failed to trigger action", {
        decisionId,
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return updated;
  } catch (error) {
    throw error;
  }
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
      `Cannot mark success: execution status must be 'running', got '${decision.executionStatus}'`
    );
  }

  const calculatedAccuracy =
    decision.impactExpected > 0
      ? outcomeValue / decision.impactExpected
      : undefined;

  const now = new Date();

  const updated = await db.$transaction(async (tx: any) => {
    const result = await tx.operatorItem.updateMany({
      where: {
        id: decisionId,
        workspaceId,
        executionStatus: "running",
      },
      data: {
        executionStatus: "success",
        executedAt: now,
        executedBy: userId,
        actualOutcomeValue: outcomeValue,
        decisionAccuracy: calculatedAccuracy,
        completedAt: now,
        lastUpdatedBy: userId,
        updatedAt: now,
      },
    });

    if (result.count === 0) {
      throw new Error("Execution already completed: state has changed since read");
    }

    return tx.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });
  });

  if (!updated) {
    throw new Error("Decision not found after update");
  }

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
      `Cannot mark failure: execution status must be 'running', got '${decision.executionStatus}'`
    );
  }

  const now = new Date();

  const updated = await db.$transaction(async (tx: any) => {
    const result = await tx.operatorItem.updateMany({
      where: {
        id: decisionId,
        workspaceId,
        executionStatus: "running",
      },
      data: {
        executionStatus: "failed",
        executedAt: now,
        executedBy: userId,
        blockReason: reason,
        completedAt: now,
        lastUpdatedBy: userId,
        updatedAt: now,
      },
    });

    if (result.count === 0) {
      throw new Error("Execution already completed: state has changed since read");
    }

    return tx.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });
  });

  if (!updated) {
    throw new Error("Decision not found after update");
  }

  return updated;
}
