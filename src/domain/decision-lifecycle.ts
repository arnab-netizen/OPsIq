/**
 * Decision Lifecycle Contract
 *
 * Defines canonical lifecycle states, transitions, and invariants.
 * Enforces no skipped states, proper sequencing, and outcome recording rules.
 */

/**
 * All possible decision states
 */
export const DECISION_STATES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "EXECUTED",
  "OUTCOME_RECORDED",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
  "FAILED",
] as const;

export type DecisionState = (typeof DECISION_STATES)[number];

/**
 * States that cannot be transitioned from (final states)
 */
export const TERMINAL_STATES: DecisionState[] = [
  "CLOSED",
  "REJECTED",
  "CANCELLED",
  "FAILED",
];

/**
 * States that require a reason when entered
 */
export const STATES_REQUIRING_REASON: DecisionState[] = [
  "REJECTED",
  "CANCELLED",
  "FAILED",
];

/**
 * Valid state transitions
 *
 * Maps from state → set of allowed destination states
 */
export const ALLOWED_TRANSITIONS: Record<DecisionState, DecisionState[]> = {
  // Happy path
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["EXECUTED", "CANCELLED"],
  EXECUTED: ["OUTCOME_RECORDED", "FAILED"],
  OUTCOME_RECORDED: ["CLOSED"],
  CLOSED: [], // Terminal

  // Alternative paths
  REJECTED: [], // Terminal
  CANCELLED: [], // Terminal
  FAILED: [], // Terminal
};

/**
 * Verify a state transition is allowed
 *
 * @throws {Error} If transition is not allowed
 */
export function requireTransitionAllowed(
  fromState: DecisionState,
  toState: DecisionState,
  reason?: string | null
): void {
  // Verify states are valid
  if (!DECISION_STATES.includes(fromState)) {
    throw new Error(`Invalid from state: ${fromState}`);
  }
  if (!DECISION_STATES.includes(toState)) {
    throw new Error(`Invalid to state: ${toState}`);
  }

  // Cannot transition from terminal state
  if (TERMINAL_STATES.includes(fromState)) {
    throw new Error(`Cannot transition from terminal state: ${fromState}`);
  }

  // Verify transition is in allowed map
  const allowedDestinations = ALLOWED_TRANSITIONS[fromState];
  if (!allowedDestinations.includes(toState)) {
    throw new Error(
      `Transition not allowed: ${fromState} → ${toState}. Allowed: ${allowedDestinations.join(", ") || "none (terminal)"}`
    );
  }

  // If entering state that requires reason, verify reason provided
  if (STATES_REQUIRING_REASON.includes(toState) && !reason?.trim()) {
    throw new Error(`Transition to ${toState} requires a reason`);
  }
}

/**
 * Verify decision is in a state that can be executed
 *
 * @throws {Error} If state does not allow execution
 */
export function requireExecutable(state: DecisionState): void {
  const executableStates: DecisionState[] = ["APPROVED"];

  if (!executableStates.includes(state)) {
    throw new Error(
      `Decision must be APPROVED before execution, current state: ${state}`
    );
  }
}

/**
 * Verify decision is in a state where outcome can be recorded
 *
 * @throws {Error} If state does not allow outcome recording
 */
export function requireOutcomeRecordable(state: DecisionState): void {
  const outcomeRecordableStates: DecisionState[] = ["EXECUTED"];

  if (!outcomeRecordableStates.includes(state)) {
    throw new Error(
      `Decision must be EXECUTED before recording outcome, current state: ${state}`
    );
  }
}

/**
 * Verify decision is in a terminal state and get the terminal state
 *
 * Terminal states are final and immutable:
 * - CLOSED: Successfully completed with outcome recorded
 * - REJECTED: Rejected during approval phase
 * - CANCELLED: Cancelled before execution
 * - FAILED: Failed during execution
 *
 * @throws {Error} If state is not terminal
 */
export function requireTerminalOutcome(state: DecisionState): DecisionState {
  if (!TERMINAL_STATES.includes(state)) {
    throw new Error(
      `Decision is not in terminal state: ${state}. Terminal states: ${TERMINAL_STATES.join(", ")}`
    );
  }

  return state;
}

/**
 * Check if a state is terminal (immutable)
 */
export function isTerminalState(state: DecisionState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Check if a state requires a reason when entered
 */
export function requiresReason(state: DecisionState): boolean {
  return STATES_REQUIRING_REASON.includes(state);
}

/**
 * Get allowed next states from current state
 */
export function getAllowedNextStates(state: DecisionState): DecisionState[] {
  return ALLOWED_TRANSITIONS[state] ?? [];
}

/**
 * Get human-readable description of a state
 */
export function describeState(state: DecisionState): string {
  const descriptions: Record<DecisionState, string> = {
    DRAFT: "Draft - decision created but not yet submitted",
    SUBMITTED: "Submitted - awaiting approval decision",
    APPROVED: "Approved - ready for execution",
    EXECUTED: "Executed - action taken, awaiting outcome measurement",
    OUTCOME_RECORDED: "Outcome Recorded - impact measured and recorded",
    CLOSED: "Closed - decision completed successfully",
    REJECTED: "Rejected - decision was rejected during approval",
    CANCELLED: "Cancelled - decision was cancelled before execution",
    FAILED: "Failed - decision failed during execution",
  };

  return descriptions[state] ?? `Unknown state: ${state}`;
}

/**
 * Get human-readable description of why a state is terminal
 */
export function describeTerminalReason(state: DecisionState): string {
  const reasons: Record<DecisionState, string> = {
    CLOSED: "Decision completed successfully with recorded outcome",
    REJECTED: "Decision was rejected and cannot be re-evaluated",
    CANCELLED: "Decision was cancelled and cannot be resumed",
    FAILED: "Decision failed during execution and cannot be retried",
    // Non-terminal states don't have terminal reasons
    DRAFT: "",
    SUBMITTED: "",
    APPROVED: "",
    EXECUTED: "",
    OUTCOME_RECORDED: "",
  };

  return reasons[state] ?? "";
}

/**
 * Validate full lifecycle sequence (for analysis/testing)
 *
 * Checks that a sequence of states follows all transition rules.
 * For transitions to terminal states, provides default reason if needed.
 */
export function validateLifecycleSequence(
  states: DecisionState[],
  reasons?: Record<number, string>
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (states.length === 0) {
    return { valid: false, errors: ["Empty sequence"] };
  }

  for (let i = 0; i < states.length - 1; i++) {
    const fromState = states[i];
    const toState = states[i + 1];

    try {
      // For states requiring reason, use provided reason or default
      let reason: string | undefined;
      if (STATES_REQUIRING_REASON.includes(toState)) {
        reason = reasons?.[i] ?? `Default reason for ${toState}`;
      }

      requireTransitionAllowed(fromState, toState, reason);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : `Unknown error at step ${i}`
      );
    }
  }

  // Verify final state makes sense
  const finalState = states[states.length - 1];
  if (!TERMINAL_STATES.includes(finalState)) {
    errors.push(`Sequence does not end in terminal state: ${finalState}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
