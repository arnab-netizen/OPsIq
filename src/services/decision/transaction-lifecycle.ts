/**
 * Decision lifecycle state machine
 * Defines valid state transitions and metadata
 */

export type DecisionStatus =
  | "pending"
  | "evaluated"
  | "approved"
  | "rejected"
  | "blocked"
  | "done"
  | "failed";

export interface DecisionState {
  status: DecisionStatus;
  stage: string;
  canApprove: boolean;
  canReject: boolean;
  canOverride: boolean;
  canEvaluate: boolean;
  isTerminal: boolean;
}

/**
 * Get lifecycle state for a decision status
 */
export function getDecisionState(status: string): DecisionState {
  const states: Record<string, DecisionState> = {
    pending: {
      status: "pending",
      stage: "intake",
      canApprove: true,
      canReject: true,
      canOverride: false,
      canEvaluate: true,
      isTerminal: false,
    },
    evaluated: {
      status: "evaluated",
      stage: "evaluation",
      canApprove: true,
      canReject: true,
      canOverride: false,
      canEvaluate: false,
      isTerminal: false,
    },
    approved: {
      status: "approved",
      stage: "execution",
      canApprove: false,
      canReject: false,
      canOverride: false,
      canEvaluate: false,
      isTerminal: false,
    },
    rejected: {
      status: "rejected",
      stage: "terminal",
      canApprove: false,
      canReject: false,
      canOverride: false,
      canEvaluate: false,
      isTerminal: true,
    },
    blocked: {
      status: "blocked",
      stage: "review",
      canApprove: true,
      canReject: true,
      canOverride: true,
      canEvaluate: false,
      isTerminal: false,
    },
    done: {
      status: "done",
      stage: "terminal",
      canApprove: false,
      canReject: false,
      canOverride: false,
      canEvaluate: false,
      isTerminal: true,
    },
    failed: {
      status: "failed",
      stage: "terminal",
      canApprove: false,
      canReject: false,
      canOverride: false,
      canEvaluate: false,
      isTerminal: true,
    },
  };

  return states[status] || states.pending;
}

/**
 * Validate if transition is allowed
 */
export function isValidTransition(
  fromStatus: string,
  toStatus: string
): boolean {
  const validTransitions: Record<string, string[]> = {
    pending: ["approved", "rejected", "blocked"],
    evaluated: ["approved", "rejected", "blocked"],
    approved: ["done", "failed"],
    rejected: ["done"],
    blocked: ["approved", "rejected"],
    done: [],
    failed: [],
  };

  const allowed = validTransitions[fromStatus] || [];
  return allowed.includes(toStatus);
}

/**
 * Get stage description
 */
export function getStageDescription(stage: string): string {
  const descriptions: Record<string, string> = {
    intake: "Decision submitted and awaiting evaluation",
    evaluation: "Decision evaluated by governance engine",
    review: "Decision blocked, awaiting review or override",
    execution: "Decision approved and ready for execution",
    terminal: "Decision in final state",
  };

  return descriptions[stage] || "Unknown stage";
}
