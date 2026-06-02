/**
 * Decision Lifecycle Service
 *
 * Enforces canonical lifecycle state machine for decisions.
 * Every mutation must route through lifecycle validation.
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { captureOutcomeVerificationMetadata } from "@/services/outcome/verification";
import { classifyOutcome } from "@/services/operator/outcome-classifier";
import {
  DecisionState,
  requireTransitionAllowed,
  requireExecutable,
  requireOutcomeRecordable,
  requireTerminalOutcome,
  isTerminalState,
} from "@/domain/decision-lifecycle";
import {
  NotFoundError,
  ValidationError,
} from "@/infra/errors";

/**
 * Transition decision to a new state
 *
 * Enforces:
 * - Valid state transition via allowedTransitions
 * - Reason required for terminal states (rejected/cancelled/failed)
 * - Emits audit event for state change
 *
 * @throws {ValidationError} If transition not allowed
 * @throws {NotFoundError} If decision not found
 */
export async function transitionDecisionState(
  decisionId: string,
  workspaceId: string,
  toState: DecisionState,
  reason?: string | null,
  actorId?: string
): Promise<{ id: string; status: string }> {
  // Fetch current decision
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new NotFoundError("Decision", decisionId);
  }

  // Map old status field to new state
  const fromState = mapStatusToState(decision.status);

  // Validate transition is allowed
  try {
    requireTransitionAllowed(fromState, toState, reason || null);
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    throw new ValidationError(governed.operatorMessage);
  }

  // Prepare update data based on target state
  const updateData: Record<string, any> = {
    status: mapStateToStatus(toState),
    lastUpdatedBy: actorId || null,
    updatedAt: new Date(),
  };

  // Set state-specific fields
  if (toState === "SUBMITTED") {
    updateData.submittedAt = new Date();
  } else if (toState === "APPROVED") {
    updateData.approvedAt = new Date();
  } else if (toState === "EXECUTED") {
    updateData.startedAt = new Date();
    updateData.executionStatus = "started";
  } else if (toState === "OUTCOME_RECORDED") {
    // Outcome recording happens in separate service
  } else if (toState === "CLOSED") {
    updateData.completedAt = new Date();
    updateData.executionStatus = "completed";
  } else if (toState === "REJECTED") {
    updateData.blockReason = reason || "Rejected";
    updateData.status = "rejected";
  } else if (toState === "CANCELLED") {
    updateData.blockReason = reason || "Cancelled";
    updateData.status = "cancelled";
  } else if (toState === "FAILED") {
    updateData.blockReason = reason || "Failed";
    updateData.status = "failed";
  }

  // Apply transition
  const updated = await db.operatorItem.update({
    where: { id: decisionId },
    data: updateData,
  });

  // Emit audit event for state transition
  const eventName = getAuditEventName(fromState, toState);
  await emitAuditEvent({
    eventName: eventName as any,
    entityType: "OperatorItem",
    entityId: decisionId,
    workspaceId,
    actorId: actorId || undefined,
    payload: {
      fromState,
      toState,
      reason: reason || null,
    },
    visibility: "internal",
  }).catch((error) => {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.warn("Failed to emit audit event for decision transition", {
      decisionId,
      fromState,
      toState,
      error: governed.operatorMessage,
    });
  });

  logger.info("Decision transitioned", {
    decisionId,
    fromState,
    toState,
    actorId,
    reason: reason || null,
  });

  return {
    id: updated.id,
    status: updated.status,
  };
}

/**
 * Submit decision for approval
 *
 * Transition: DRAFT → SUBMITTED
 */
export async function submitDecision(
  decisionId: string,
  workspaceId: string,
  actorId: string
): Promise<{ id: string; status: string }> {
  return transitionDecisionState(
    decisionId,
    workspaceId,
    "SUBMITTED",
    undefined,
    actorId
  );
}

/**
 * Approve decision for execution
 *
 * Transition: SUBMITTED → APPROVED
 */
export async function approveDecision(
  decisionId: string,
  workspaceId: string,
  actorId: string
): Promise<{ id: string; status: string }> {
  return transitionDecisionState(
    decisionId,
    workspaceId,
    "APPROVED",
    undefined,
    actorId
  );
}

/**
 * Reject decision
 *
 * Transition: SUBMITTED → REJECTED (terminal)
 * Requires reason
 */
export async function rejectDecision(
  decisionId: string,
  workspaceId: string,
  reason: string,
  actorId: string
): Promise<{ id: string; status: string }> {
  if (!reason?.trim()) {
    throw new ValidationError("Rejection reason is required");
  }

  return transitionDecisionState(
    decisionId,
    workspaceId,
    "REJECTED",
    reason,
    actorId
  );
}

/**
 * Cancel decision
 *
 * Transition: DRAFT | APPROVED → CANCELLED (terminal)
 * Requires reason
 */
export async function cancelDecision(
  decisionId: string,
  workspaceId: string,
  reason: string,
  actorId: string
): Promise<{ id: string; status: string }> {
  if (!reason?.trim()) {
    throw new ValidationError("Cancellation reason is required");
  }

  return transitionDecisionState(
    decisionId,
    workspaceId,
    "CANCELLED",
    reason,
    actorId
  );
}

/**
 * Execute decision (begin execution)
 *
 * Transition: APPROVED → EXECUTED
 * Enforces: Decision must be APPROVED before execution
 */
export async function executeDecision(
  decisionId: string,
  workspaceId: string,
  actorId: string,
  idempotencyKey?: string
): Promise<{ id: string; status: string }> {
  // Idempotency check
  if (idempotencyKey) {
    const { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } = await import(
      "@/services/idempotency"
    );

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "executeDecision",
      actorId,
      payload: { decisionId, workspaceId },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body as { id: string; status: string };
    }

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
      throw idempotencyCheck.cachedError;
    }
  }

  try {
    // Fetch to verify state
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      throw new NotFoundError("Decision", decisionId);
    }

    const currentState = mapStatusToState(decision.status);

    // Verify decision is in executable state
    try {
      requireExecutable(currentState);
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      throw new ValidationError(governed.operatorMessage);
    }

    const result = await transitionDecisionState(
      decisionId,
      workspaceId,
      "EXECUTED",
      undefined,
      actorId
    );

    if (idempotencyKey) {
      const { recordIdempotencyResponse } = await import("@/services/idempotency");
      await recordIdempotencyResponse(idempotencyKey, 200, result);
    }

    return result;
  } catch (error) {
    if (idempotencyKey) {
      const { recordIdempotencyError } = await import("@/services/idempotency");
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
    }
    throw error;
  }
}

/**
 * Record decision outcome
 *
 * Transition: EXECUTED → OUTCOME_RECORDED
 * Enforces: Decision must be EXECUTED before recording outcome
 */
export async function recordDecisionOutcome(
  decisionId: string,
  workspaceId: string,
  outcomeData: {
    actualOutcome?: string | null;
    actualOutcomeValue?: number | null;
    decisionAccuracy?: number | null;
    decisionError?: number | null;
    outcomeDelta?: number | null;
    outcomeNotes?: string | null;
  },
  actorId: string
): Promise<{ id: string; status: string }> {
  // Fetch to verify state
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new NotFoundError("Decision", decisionId);
  }

  const currentState = mapStatusToState(decision.status);

  // Verify decision is in state where outcome can be recorded
  try {
    requireOutcomeRecordable(currentState);
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    throw new ValidationError(governed.operatorMessage);
  }

  // Apply canonical outcome classification and verification
  const updateData: any = { ...outcomeData };

  // Classify outcome if actualOutcomeValue provided
  if (outcomeData.actualOutcomeValue !== undefined && outcomeData.actualOutcomeValue !== null) {
    const classification = classifyOutcome(outcomeData.actualOutcomeValue, decision.impactExpected ?? null);
    updateData.actualOutcome = classification.category;

    // Require notes for failure/uncertain
    if ((classification.category === "failure" || classification.category === "uncertain") && !outcomeData.outcomeNotes?.trim()) {
      throw new ValidationError(`Outcome notes required for ${classification.category} outcome: ${classification.reason}`);
    }

    // Capture verification metadata (same as operator route)
    const verificationMetadata = captureOutcomeVerificationMetadata(
      outcomeData.actualOutcomeValue,
      decision.impactExpected ?? 0,
      decision.actualOutcomeValue ?? null,
      actorId
    );
    updateData.verificationStatus = verificationMetadata.verificationStatus;
    updateData.verificationMethod = verificationMetadata.verificationMethod;
    updateData.verificationConfidence = verificationMetadata.verificationConfidence;
    updateData.verificationEvidence = verificationMetadata.verificationEvidence;
    updateData.auditTrail = verificationMetadata.auditTrail;
  }

  // Update with outcome data
  const updated = await db.operatorItem.update({
    where: { id: decisionId },
    data: {
      ...updateData,
      status: mapStateToStatus("OUTCOME_RECORDED"),
      updatedAt: new Date(),
      lastUpdatedBy: actorId,
    },
  });

  // Emit audit event
  await emitAuditEvent({
    eventName: "outcome.recorded" as any,
    entityType: "OperatorItem",
    entityId: decisionId,
    workspaceId,
    actorId,
    payload: {
      fromState: "EXECUTED",
      toState: "OUTCOME_RECORDED",
      outcomeData,
    },
    visibility: "internal",
  }).catch((error) => {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.warn("Failed to emit audit event for outcome recording", {
      decisionId,
      error: governed.operatorMessage,
    });
  });

  logger.info("Decision outcome recorded", {
    decisionId,
    actualOutcome: outcomeData.actualOutcome,
    actualOutcomeValue: outcomeData.actualOutcomeValue,
    decisionAccuracy: outcomeData.decisionAccuracy,
  });

  return {
    id: updated.id,
    status: updated.status,
  };
}

/**
 * Close decision (mark as final)
 *
 * Transition: OUTCOME_RECORDED → CLOSED (terminal)
 * Enforces: Outcome must be recorded before closing
 */
export async function closeDecision(
  decisionId: string,
  workspaceId: string,
  actorId: string
): Promise<{ id: string; status: string }> {
  // Fetch to verify state
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new NotFoundError("Decision", decisionId);
  }

  const currentState = mapStatusToState(decision.status);

  // Verify we can close (requires outcome recorded)
  if (currentState !== "OUTCOME_RECORDED") {
    throw new ValidationError(
      `Cannot close decision: must be OUTCOME_RECORDED, currently ${currentState}`
    );
  }

  return transitionDecisionState(
    decisionId,
    workspaceId,
    "CLOSED",
    undefined,
    actorId
  );
}

/**
 * Mark decision as failed
 *
 * Transition: EXECUTED → FAILED (terminal)
 * Requires reason
 */
export async function failDecision(
  decisionId: string,
  workspaceId: string,
  reason: string,
  actorId: string
): Promise<{ id: string; status: string }> {
  if (!reason?.trim()) {
    throw new ValidationError("Failure reason is required");
  }

  return transitionDecisionState(
    decisionId,
    workspaceId,
    "FAILED",
    reason,
    actorId
  );
}

/**
 * Check if decision is in terminal state
 *
 * Terminal decisions cannot be mutated (except read/export)
 */
export async function isDecisionTerminal(
  decisionId: string,
  workspaceId: string
): Promise<boolean> {
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new NotFoundError("Decision", decisionId);
  }

  const state = mapStatusToState(decision.status);
  return isTerminalState(state);
}

/**
 * Prevent mutation of terminal decisions
 *
 * @throws {ValidationError} If decision is terminal
 */
export async function requireMutableDecision(
  decisionId: string,
  workspaceId: string
): Promise<void> {
  const terminal = await isDecisionTerminal(decisionId, workspaceId);

  if (terminal) {
    throw new ValidationError(
      "Cannot mutate terminal decision. Decision has reached final state."
    );
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

/**
 * Map legacy status field to canonical state
 */
function mapStatusToState(status: string): DecisionState {
  // Handle legacy statuses
  if (status === "pending") return "SUBMITTED"; // Old pending = submitted
  if (status === "in_progress") return "EXECUTED";
  if (status === "done") return "OUTCOME_RECORDED";
  if (status === "blocked") return "REJECTED";
  if (status === "failed") return "FAILED";

  // Handle canonical states (already stored as lowercase versions)
  const stateMap: Record<string, DecisionState> = {
    draft: "DRAFT",
    submitted: "SUBMITTED",
    approved: "APPROVED",
    executed: "EXECUTED",
    outcome_recorded: "OUTCOME_RECORDED",
    closed: "CLOSED",
    rejected: "REJECTED",
    cancelled: "CANCELLED",
    failed: "FAILED",
  };

  return stateMap[status.toLowerCase()] || "DRAFT";
}

/**
 * Map canonical state to storage format
 */
function mapStateToStatus(state: DecisionState): string {
  const statusMap: Record<DecisionState, string> = {
    DRAFT: "draft",
    SUBMITTED: "submitted",
    APPROVED: "approved",
    EXECUTED: "in_progress", // Legacy: in_progress = executing
    OUTCOME_RECORDED: "outcome_recorded",
    CLOSED: "closed",
    REJECTED: "blocked",
    CANCELLED: "cancelled",
    FAILED: "failed",
  };

  return statusMap[state] || "draft";
}

/**
 * Map state transition to audit event name
 */
function getAuditEventName(fromState: DecisionState, toState: DecisionState): string {
  const eventMap: Record<string, string> = {
    "DRAFT→SUBMITTED": "decision.submitted",
    "SUBMITTED→APPROVED": "decision.approved",
    "SUBMITTED→REJECTED": "decision.rejected",
    "APPROVED→EXECUTED": "decision.executed",
    "APPROVED→CANCELLED": "decision.cancelled",
    "EXECUTED→OUTCOME_RECORDED": "outcome.recorded",
    "EXECUTED→FAILED": "decision.failed",
    "OUTCOME_RECORDED→CLOSED": "decision.closed",
  };

  const key = `${fromState}→${toState}`;
  return eventMap[key] || "system.error";
}
