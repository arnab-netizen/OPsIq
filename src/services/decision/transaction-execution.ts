import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";

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

  // Update execution status
  const updated = await db.operatorItem.update({
    where: { id: decisionId },
    data: {
      executionStatus: status,
      updatedAt: new Date(),
    },
  });

  // Log execution status change
  await logAuditEvent({
    eventName: "DECISION_EXECUTION_STATUS_CHANGED",
    entityType: "Decision",
    entityId: decisionId,
    actorId: userId,
    role: null,
    before: {
      executionStatus: previousStatus,
    },
    after: {
      executionStatus: status,
    },
    metadata: {
      action: "update_execution_status",
      status,
      notes,
      timestamp: new Date().toISOString(),
    },
    workspaceId,
  }).catch((err: unknown) => {
    const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
    console.error(
      `Audit logging failed: ${governed.operatorMessage}`
    );
  });

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
          "DECISION_EXECUTION_STATUS_CHANGED",
          "DECISION_APPROVED",
          "DECISION_COMPLETED",
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
    approvedAt: executionEvents.find((e: typeof executionEvents[number]) => e.eventName === "DECISION_APPROVED")
      ?.createdAt,
    startedAt: executionEvents.find(
      (e: typeof executionEvents[number]) =>
        e.eventName === "DECISION_EXECUTION_STATUS_CHANGED" &&
        e.metadata?.status === "in_progress"
    )?.createdAt,
    completedAt: executionEvents.find(
      (e: typeof executionEvents[number]) =>
        e.eventName === "DECISION_EXECUTION_STATUS_CHANGED" &&
        (e.metadata?.status === "completed" || e.metadata?.status === "failed")
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
