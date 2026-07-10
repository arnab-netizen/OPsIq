import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { AuditEventName } from "@/domain/constants/audit-events";

export type ExecutionStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "failed";

/**
 * Update decision execution status
 * Tracks implementation progress after approval
 */
export async function updateExecutionStatus(
  decisionId: string,
  workspaceId: string,
  userId: string,
  status: ExecutionStatus,
  notes?: string
) {
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found");
  }

  const previousStatus = decision.executionStatus;
  const timestamp = new Date();

  const executionEventMap: Partial<Record<ExecutionStatus, AuditEventName>> = {
    in_progress: AUDIT_EVENTS.DECISION_EXECUTION_STARTED,
    completed: AUDIT_EVENTS.DECISION_EXECUTION_SUCCESS,
    failed: AUDIT_EVENTS.DECISION_EXECUTION_FAILED,
  };
  const eventName: AuditEventName =
    executionEventMap[status] ?? AUDIT_EVENTS.DECISION_STATUS_CHANGED;

  // CAS + audit in transaction (fail-closed):
  // updateMany enforces workspaceId isolation atomically with the write.
  // Audit rolls back with the state change on failure.
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const res = await tx.operatorItem.updateMany({
      where: { id: decisionId, workspaceId },
      data: { executionStatus: status, updatedAt: timestamp },
    });

    if (res.count !== 1) {
      throw new Error(`Execution status update failed for decision ${decisionId}`);
    }

    await emitAuditEvent(
      {
        eventName,
        workspaceId,
        actorId: userId,
        actorType: "user",
        entityType: "Decision",
        entityId: decisionId,
        payload: {
          from: previousStatus,
          to: status,
          action: "update_execution_status",
          timestamp: timestamp.toISOString(),
          ...(notes && { notes }),
        },
        visibility: "internal",
      },
      tx
    );
  });

  const updated = await db.operatorItem.findUnique({ where: { id: decisionId } });
  if (!updated) throw new Error("Decision not found after update");
  return updated;
}

/**
 * Get execution progress summary
 */
export async function getExecutionSummary(
  decisionId: string,
  workspaceId: string
) {
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found");
  }

  // Fetch execution-related audit events
  const executionEvents = await db.auditEvent.findMany({
    where: {
      workspaceId,
      entityId: decisionId,
      eventName: {
        in: [
          AUDIT_EVENTS.DECISION_EXECUTION_STARTED,
          AUDIT_EVENTS.DECISION_EXECUTION_SUCCESS,
          AUDIT_EVENTS.DECISION_EXECUTION_FAILED,
          AUDIT_EVENTS.DECISION_APPROVED,
        ],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return {
    decisionId,
    status: decision.status,
    executionStatus: decision.executionStatus,
    approvedAt: executionEvents.find((e: typeof executionEvents[number]) => e.eventName === AUDIT_EVENTS.DECISION_APPROVED)
      ?.createdAt,
    startedAt: executionEvents.find(
      (e: typeof executionEvents[number]) =>
        e.eventName === AUDIT_EVENTS.DECISION_EXECUTION_STARTED
    )?.createdAt,
    completedAt: executionEvents.find(
      (e: typeof executionEvents[number]) =>
        e.eventName === AUDIT_EVENTS.DECISION_EXECUTION_SUCCESS ||
        e.eventName === AUDIT_EVENTS.DECISION_EXECUTION_FAILED
    )?.createdAt,
    timeline: executionEvents,
  };
}

/**
 * Check if decision is ready for execution
 */
export function isReadyForExecution(status: string): boolean {
  return status === "approved";
}

/**
 * Get execution stage description
 */
export function getExecutionStageDescription(status: ExecutionStatus): string {
  const descriptions: Record<ExecutionStatus, string> = {
    not_started: "Awaiting execution to begin",
    in_progress: "Currently being executed",
    completed: "Execution completed successfully",
    failed: "Execution failed",
  };

  return descriptions[status];
}
