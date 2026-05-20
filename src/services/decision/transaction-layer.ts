/**
 * Decision Transaction Layer
 * High-level orchestration for decision lifecycle, actions, and execution
 * Composes detail, actions, lifecycle, and execution services
 */

import {
  getDecisionDetail,
  getDecisionSummary,
} from "@/services/decision/transaction-detail";
import {
  executeDecisionAction,
  getAvailableActions,
  validateActionParams,
} from "@/services/decision/transaction-actions";
import {
  getDecisionState,
  isValidTransition,
} from "@/services/decision/transaction-lifecycle";
import {
  updateExecutionStatus,
  getExecutionSummary,
  isReadyForExecution,
} from "@/services/decision/transaction-execution";

/**
 * Complete transaction context for a decision
 */
export async function getDecisionTransaction(
  decisionId: string,
  workspaceId: string
) {
  // Fetch decision detail
  const detail = await getDecisionDetail(decisionId, workspaceId);

  // Get lifecycle state
  const lifecycleState = getDecisionState(detail.status);

  // Get execution summary
  const executionSummary = await getExecutionSummary(decisionId, workspaceId);

  // Get available actions
  const availableActions = getAvailableActions(detail.status);

  return {
    id: detail.id,
    detail,
    lifecycle: lifecycleState,
    execution: executionSummary,
    actions: availableActions,

    // Helpers
    canTransitionTo: (toStatus: string) =>
      isValidTransition(detail.status, toStatus),
    isReadyForExecution: isReadyForExecution(detail.status),
  };
}

/**
 * Execute action with full transaction context
 */
export async function executeDecisionTransaction(
  decisionId: string,
  workspaceId: string,
  userId: string,
  action: "approve" | "reject" | "override",
  options?: {
    overrideReason?: string;
  }
) {
  // Validate action parameters
  if (!validateActionParams(action, options || {})) {
    throw new Error(`Invalid parameters for action: ${action}`);
  }

  // Execute the action
  const result = await executeDecisionAction(
    decisionId,
    workspaceId,
    userId,
    action,
    undefined,
    options?.overrideReason
  );

  // Return updated transaction context
  return getDecisionTransaction(decisionId, workspaceId);
}

/**
 * Start execution of an approved decision
 */
export async function startDecisionExecution(
  decisionId: string,
  workspaceId: string,
  userId: string
) {
  // Check if ready for execution
  const detail = await getDecisionDetail(decisionId, workspaceId);

  if (!isReadyForExecution(detail.status)) {
    throw new Error(
      `Decision not approved. Current status: ${detail.status}`
    );
  }

  // Update execution status to in_progress
  await updateExecutionStatus(
    decisionId,
    workspaceId,
    userId,
    "in_progress",
    undefined,
    "Execution started"
  );

  // Return updated context
  return getDecisionTransaction(decisionId, workspaceId);
}

/**
 * Mark decision execution as complete
 */
export async function completeDecisionExecution(
  decisionId: string,
  workspaceId: string,
  userId: string,
  notes?: string
) {
  await updateExecutionStatus(
    decisionId,
    workspaceId,
    userId,
    "completed",
    undefined,
    notes || "Execution completed"
  );

  // Return updated context
  return getDecisionTransaction(decisionId, workspaceId);
}

/**
 * Mark decision execution as failed
 */
export async function failDecisionExecution(
  decisionId: string,
  workspaceId: string,
  userId: string,
  reason?: string
) {
  await updateExecutionStatus(
    decisionId,
    workspaceId,
    userId,
    "failed",
    undefined,
    reason || "Execution failed"
  );

  // Return updated context
  return getDecisionTransaction(decisionId, workspaceId);
}
