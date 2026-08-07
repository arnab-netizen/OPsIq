import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { triggerExecutionFailureAlert, triggerBlockedAlert } from "@/services/alerts/alert-service";

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
  let concurrencyBlocked = false;

  try {
    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const result = await tx.operatorItem.updateMany({
        where: {
          id: decisionId,
          workspaceId,
          executionStatus: "pending",
        },
        data: {
          executionStatus: "running",
          startedAt: now,
          lastUpdatedByUserId: userId,
          updatedAt: now,
        },
      });

      if (result.count === 0) {
        concurrencyBlocked = true;
        triggerBlockedAlert(workspaceId, userId, decisionId, "concurrency conflict — another request is already executing this decision").catch(() => {});
        throw new Error("Execution lock acquired by another request: decision already transitioning");
      }

      return tx.operatorItem.findFirst({
        where: { id: decisionId, workspaceId },
      });
    });

    if (!updated) {
      throw new Error("Decision not found after update");
    }

    await emitAuditEvent({
      workspaceId,
      eventName: AUDIT_EVENTS.DECISION_EXECUTION_STARTED,
      actorId: userId,
      entityType: "OperatorItem",
      entityId: decisionId,
      payload: {
        status: "running",
        startedAt: now.toISOString(),
      },
    });

    return updated;
  } catch (error) {
    if (!concurrencyBlocked) {
      triggerExecutionFailureAlert(workspaceId, userId, decisionId, "execution failed").catch(() => {});
    }
    throw error;
  }
}

export async function markSuccess(
  decisionId: string,
  workspaceId: string,
  userId: string,
  outcomeValue: number
) {
  // GAP-PROOF-02 — fail-closed. This legacy writer marked a decision "success" with a
  // self-supplied outcome and no proof / separation-of-duties / authorization. It has no
  // runtime callers. It must not be silently re-wired: the governed outcome path is
  // recordDecisionOutcome (decision-lifecycle) + approveOutcomeVerification (with SoD).
  throw new Error(
    "markSuccess is retired and ungoverned. Use recordDecisionOutcome + approveOutcomeVerification (proof/SoD-gated) instead."
  );
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

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
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
        lastUpdatedByUserId: userId,
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
      executedAt: now.toISOString(),
    },
  });

  // NOTE (M7): the former `recordDecisionMetrics(...)` call wrote to a Prisma model (`learning_records`)
  // that does not exist, so it always threw and was swallowed — nothing persisted. The real success/outcome
  // is recorded on the OperatorItem row (above) + the audit event, which the live decision-learning
  // read-back (recommendation.ts, B6) consumes. Dead writer removed.

  return updated;
}

export async function markFailure(
  decisionId: string,
  workspaceId: string,
  userId: string,
  reason: string
) {
  // GAP-PROOF-02 — fail-closed (see markSuccess). Retired ungoverned writer with no callers;
  // the governed failure path is recordDecisionOutcome / the decision `fail` route.
  throw new Error(
    "markFailure is retired and ungoverned. Use the governed decision outcome/fail path instead."
  );
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

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
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
        lastUpdatedByUserId: userId,
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

  await emitAuditEvent({
    workspaceId,
    eventName: AUDIT_EVENTS.DECISION_EXECUTION_FAILED,
    actorId: userId,
    entityType: "OperatorItem",
    entityId: decisionId,
    payload: {
      status: "failed",
      reason,
      failedAt: now.toISOString(),
    },
  });

  // NOTE (M7): removed the dead `recordDecisionMetrics(...)` writer (nonexistent `learning_records` table;
  // threw + swallowed). This path is also unreachable — `markFailure` is retired and throws above.

  return updated;
}
