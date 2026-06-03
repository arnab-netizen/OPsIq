import { db } from "@/lib/db";
import { ValidationError, NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { checkFraudRisk } from "./verification";
import {
  DecisionState,
  requireTransitionAllowed,
  mapStatusToState,
  mapStateToStatus,
} from "@/domain/decision-lifecycle";

/**
 * Request to modify a recorded outcome
 * Transitions decision from OUTCOME_RECORDED → PENDING_MODIFICATION
 */
export async function requestOutcomeModification(
  decisionId: string,
  workspaceId: string,
  newActualOutcomeValue: number,
  requestReason: string,
  requestorId: string,
  approverUserId: string
): Promise<{
  decisionId: string;
  previousStatus: string;
  newStatus: string;
  modificationContext: { beforeValue: number; afterValue: number; reason: string };
}> {
  // Fetch decision
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new NotFoundError("Decision", decisionId);
  }

  // Validate input
  if (typeof newActualOutcomeValue !== "number" || newActualOutcomeValue < 0) {
    throw new ValidationError("Invalid field: newActualOutcomeValue must be non-negative number");
  }

  if (!requestReason?.trim()) {
    throw new ValidationError("Reason required for modification request");
  }

  // Verify decision is in state where outcome has been recorded
  const currentState = mapStatusToState(decision.status);
  if (currentState !== "OUTCOME_RECORDED") {
    throw new ValidationError(
      `Cannot request modification: decision must be OUTCOME_RECORDED, currently ${currentState}`
    );
  }

  const previousValue = decision.actualOutcomeValue ?? 0;

  // Calculate fraud risk impact
  const fraudRiskBefore = checkFraudRisk(previousValue, decision.impactExpected ?? 0, null);
  const fraudRiskAfter = checkFraudRisk(newActualOutcomeValue, decision.impactExpected ?? 0, previousValue);

  // Transition to PENDING_MODIFICATION
  try {
    requireTransitionAllowed("OUTCOME_RECORDED", "PENDING_MODIFICATION", null);
  } catch (error) {
    throw new ValidationError(
      `Transition not allowed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Update decision state
  const updated = await db.operatorItem.update({
    where: { id: decisionId },
    data: {
      status: mapStateToStatus("PENDING_MODIFICATION"),
      updatedAt: new Date(),
      lastUpdatedBy: requestorId,
      verificationEvidence: {
        ...(decision.verificationEvidence as Record<string, any>),
        modificationRequest: {
          requestedAt: new Date().toISOString(),
          requestedBy: requestorId,
          approverUserId,
          beforeValue: previousValue,
          afterValue: newActualOutcomeValue,
          reason: requestReason,
          fraudRiskBefore,
          fraudRiskAfter,
        },
      },
    },
  });

  logger.info("Outcome modification requested", {
    decisionId,
    previousValue,
    newValue: newActualOutcomeValue,
    requestorId,
    approverUserId,
  });

  return {
    decisionId,
    previousStatus: decision.status,
    newStatus: updated.status,
    modificationContext: {
      beforeValue: previousValue,
      afterValue: newActualOutcomeValue,
      reason: requestReason,
    },
  };
}

/**
 * Approve and apply a modification request
 * Transitions decision from PENDING_MODIFICATION → OUTCOME_RECORDED with new value
 */
export async function approveOutcomeModification(
  decisionId: string,
  workspaceId: string,
  approverUserId: string,
  decision: "APPROVE" | "REJECT",
  approvalReason: string,
  newActualOutcomeValue?: number
): Promise<{
  decisionId: string;
  decision: "APPROVE" | "REJECT";
  newStatus: string;
}> {
  // Fetch decision
  const currentDecision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!currentDecision) {
    throw new NotFoundError("Decision", decisionId);
  }

  // Verify current state
  const currentState = mapStatusToState(currentDecision.status);
  if (currentState !== "PENDING_MODIFICATION") {
    throw new ValidationError(
      `Cannot approve modification: decision must be PENDING_MODIFICATION, currently ${currentState}`
    );
  }

  if (decision === "REJECT") {
    // Revert to OUTCOME_RECORDED without change
    const reverted = await db.operatorItem.update({
      where: { id: decisionId },
      data: {
        status: mapStateToStatus("OUTCOME_RECORDED"),
        updatedAt: new Date(),
        lastUpdatedBy: approverUserId,
        verificationEvidence: {
          ...(currentDecision.verificationEvidence as Record<string, any>),
          modificationRejected: {
            rejectedAt: new Date().toISOString(),
            rejectedBy: approverUserId,
            reason: approvalReason,
          },
        },
      },
    });

    logger.info("Outcome modification rejected", {
      decisionId,
      approverUserId,
      reason: approvalReason,
    });

    return {
      decisionId,
      decision: "REJECT",
      newStatus: reverted.status,
    };
  }

  // APPROVE: Apply modification with new value
  if (newActualOutcomeValue === undefined) {
    throw new ValidationError("newActualOutcomeValue required when approving modification");
  }

  if (typeof newActualOutcomeValue !== "number" || newActualOutcomeValue < 0) {
    throw new ValidationError("Invalid field: newActualOutcomeValue must be non-negative number");
  }

  // Recalculate fraud risk with new value (retroactive modification will be detected)
  const previousValue = currentDecision.actualOutcomeValue ?? 0;
  const fraudRisk = checkFraudRisk(newActualOutcomeValue, currentDecision.impactExpected ?? 0, previousValue);
  const verificationStatus = fraudRisk.riskLevel === "high" ? "disputed" : "unverified";

  // Apply modification and return to OUTCOME_RECORDED with new value
  const updated = await db.operatorItem.update({
    where: { id: decisionId },
    data: {
      actualOutcomeValue: newActualOutcomeValue,
      status: mapStateToStatus("OUTCOME_RECORDED"),
      verificationStatus,
      updatedAt: new Date(),
      lastUpdatedBy: approverUserId,
      verificationEvidence: {
        ...(currentDecision.verificationEvidence as Record<string, any>),
        modificationApproved: {
          approvedAt: new Date().toISOString(),
          approvedBy: approverUserId,
          reason: approvalReason,
          beforeValue: previousValue,
          afterValue: newActualOutcomeValue,
          fraudAssessment: fraudRisk,
        },
      },
      auditTrail: [
        ...(Array.isArray(currentDecision.auditTrail) ? currentDecision.auditTrail : []),
        {
          timestamp: new Date().toISOString(),
          actorId: approverUserId,
          action: "OUTCOME_MODIFICATION_APPROVED",
          beforeValue: previousValue,
          afterValue: newActualOutcomeValue,
          reason: `Modification approved: ${approvalReason}`,
        },
      ],
    },
  });

  logger.info("Outcome modification approved", {
    decisionId,
    previousValue,
    newValue: newActualOutcomeValue,
    approverUserId,
    fraudRisk: fraudRisk.riskLevel,
  });

  return {
    decisionId,
    decision: "APPROVE",
    newStatus: updated.status,
  };
}

/**
 * Map database status field to DecisionState type
 */
function mapStatusToState(status: string): DecisionState {
  // Handle legacy statuses
  if (status === "pending") return "SUBMITTED";
  if (status === "in_progress") return "EXECUTED";
  if (status === "done") return "OUTCOME_RECORDED";
  if (status === "blocked") return "REJECTED";
  if (status === "failed") return "FAILED";

  // Handle canonical states
  const stateMap: Record<string, DecisionState> = {
    draft: "DRAFT",
    submitted: "SUBMITTED",
    approved: "APPROVED",
    executed: "EXECUTED",
    outcome_recorded: "OUTCOME_RECORDED",
    pending_modification: "PENDING_MODIFICATION",
    closed: "CLOSED",
    rejected: "REJECTED",
    cancelled: "CANCELLED",
    failed: "FAILED",
  };

  return (stateMap[status.toLowerCase()] || "DRAFT") as DecisionState;
}

/**
 * Map DecisionState to database status field
 */
function mapStateToStatus(state: DecisionState): string {
  const stateMap: Record<DecisionState, string> = {
    DRAFT: "draft",
    SUBMITTED: "submitted",
    APPROVED: "approved",
    EXECUTED: "in_progress",
    OUTCOME_RECORDED: "outcome_recorded",
    PENDING_MODIFICATION: "pending_modification",
    CLOSED: "closed",
    REJECTED: "blocked",
    CANCELLED: "cancelled",
    FAILED: "failed",
  };

  return stateMap[state] || "draft";
}
