import { db } from "@/lib/db";

/**
 * Fetch complete decision detail with all context
 * Enriches raw decision with evaluation, audit trail, and metadata
 */
export async function getDecisionDetail(
  decisionId: string,
  workspaceId: string
) {
  // Fetch decision from database
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found");
  }

  // Fetch audit trail
  const auditEvents = await db.auditEvent.findMany({
    where: {
      entityId: decisionId,
      workspaceId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  // Return enriched decision detail
  return {
    id: decision.id,
    workspaceId: decision.workspaceId,

    // Content
    title: decision.problem,
    description: decision.action,

    // Evaluation
    confidence: decision.confidence,
    impactExpected: decision.impactExpected,
    impactLow: decision.impactLow,
    impactHigh: decision.impactHigh,

    // Status & State
    status: decision.status,
    blockStage: decision.blockStage,
    blockReason: decision.blockReason,

    // Evaluation Result
    evaluation: decision.explanation,

    // Ownership & Assignment
    createdBy: decision.createdBy,
    ownerUserId: decision.ownerUserId,
    assignedTo: decision.assignedTo,
    reviewedBy: decision.reviewedBy,

    // Execution
    executionStatus: decision.executionStatus,

    // Timestamps
    createdAt: decision.createdAt,
    updatedAt: decision.updatedAt,

    // Audit Trail
    auditTrail: auditEvents,

    // Inputs snapshot
    inputs: decision.inputsSnapshot,
  };
}

/**
 * Get minimal decision summary for list views
 */
export async function getDecisionSummary(
  decisionId: string,
  workspaceId: string
) {
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found");
  }

  return {
    id: decision.id,
    title: decision.problem,
    status: decision.status,
    impact: decision.impactExpected,
    confidence: decision.confidence,
    assignedTo: decision.assignedTo,
    createdAt: decision.createdAt,
  };
}
