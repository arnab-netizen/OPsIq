import {
  RecommendationState,
  StateTransition,
  ALLOWED_TRANSITIONS,
} from "../../domain/governance/governance-contracts";

/**
 * Deterministic recommendation state machine.
 * Enforces allowed transitions, fail-closed on illegal transitions.
 */

export interface TransitionResult {
  success: boolean;
  new_state?: RecommendationState;
  error?: string;
  transition?: StateTransition;
}

/**
 * Validate and execute state transition
 */
export function transitionRecommendationState(
  current_state: RecommendationState,
  target_state: RecommendationState,
  reason: string,
  actor: string
): TransitionResult {
  // Check if transition is allowed
  const allowed = ALLOWED_TRANSITIONS[current_state];
  if (!allowed.includes(target_state)) {
    return {
      success: false,
      error: `Illegal transition: ${current_state} → ${target_state}`,
    };
  }

  // Validate required fields
  if (!reason || reason.trim().length === 0) {
    return {
      success: false,
      error: "Transition reason required",
    };
  }

  if (!actor || actor.trim().length === 0) {
    return {
      success: false,
      error: "Actor/source required",
    };
  }

  // Create transition record (recommendation_id will be filled in by caller)
  const transition: StateTransition = {
    recommendation_id: "pending", // Placeholder, caller must set actual ID
    from_state: current_state,
    to_state: target_state,
    reason,
    actor,
    timestamp: new Date(),
  };

  return {
    success: true,
    new_state: target_state,
    transition,
  };
}

/**
 * Get all allowed transitions from current state
 */
export function getAllowedTransitions(current_state: RecommendationState): RecommendationState[] {
  return ALLOWED_TRANSITIONS[current_state] || [];
}

/**
 * Check if transition is legal
 */
export function isLegalTransition(
  from_state: RecommendationState,
  to_state: RecommendationState
): boolean {
  const allowed = ALLOWED_TRANSITIONS[from_state];
  return allowed ? allowed.includes(to_state) : false;
}
