import { logger } from "@/infra/logger";
import {
  Action,
  ActionState,
  ActionStateChange,
  ActionTransition,
  VALID_TRANSITIONS,
  REQUIRED_FIELDS_BY_STATE,
} from "@/domain/execution/action";
import { createHash } from "crypto";

export interface TransitionResult {
  success: boolean;
  action: Action;
  transition: ActionTransition;
  error?: string;
}

export interface StateValidationResult {
  is_valid: boolean;
  missing_fields: string[];
  reason: string;
}

export class ActionFSM {
  /**
   * Validate action can transition to target state
   */
  validateTransition(
    action: Action,
    target_state: ActionState,
    state_reason: string,
    actor: string
  ): ActionTransition {
    const valid_targets = VALID_TRANSITIONS[action.state] || [];
    const is_valid = valid_targets.includes(target_state);

    const required_fields = REQUIRED_FIELDS_BY_STATE[target_state] || [];
    const missing_fields = this.findMissingFields(action, required_fields);

    return {
      from_state: action.state,
      to_state: target_state,
      is_valid: is_valid && missing_fields.length === 0,
      required_fields,
      reason: !is_valid
        ? `Invalid transition: ${action.state} → ${target_state}`
        : missing_fields.length > 0
          ? `Missing required fields: ${missing_fields.join(", ")}`
          : undefined,
    };
  }

  /**
   * Transition action to new state
   */
  transition(
    action: Action,
    target_state: ActionState,
    state_reason: string,
    actor: string
  ): TransitionResult {
    const validation = this.validateTransition(
      action,
      target_state,
      state_reason,
      actor
    );

    if (!validation.is_valid) {
      logger.warn("Invalid state transition attempted", {
        action_id: action.action_id,
        from_state: action.state,
        to_state: target_state,
        reason: validation.reason,
      });

      return {
        success: false,
        action,
        transition: validation,
        error: validation.reason,
      };
    }

    const state_change: ActionStateChange = {
      from_state: action.state,
      to_state: target_state,
      state_reason,
      timestamp: new Date().toISOString(),
      actor,
    };

    const updated_action: Action = {
      ...action,
      state: target_state,
      state_history: [...action.state_history, state_change],
      updated_at: new Date().toISOString(),
    };

    logger.info("Action state transition", {
      action_id: action.action_id,
      from_state: action.state,
      to_state: target_state,
      actor,
    });

    return {
      success: true,
      action: updated_action,
      transition: validation,
    };
  }

  /**
   * Get current state and allowed transitions
   */
  getCurrentState(action: Action): {
    state: ActionState;
    allowed_transitions: ActionState[];
  } {
    const allowed_transitions = VALID_TRANSITIONS[action.state] || [];
    return {
      state: action.state,
      allowed_transitions,
    };
  }

  /**
   * Validate action state consistency
   */
  validateActionState(action: Action): StateValidationResult {
    if (!action.state || !Object.values(ActionState).includes(action.state)) {
      return {
        is_valid: false,
        missing_fields: [],
        reason: `Invalid state: ${action.state}`,
      };
    }

    const required_fields = REQUIRED_FIELDS_BY_STATE[action.state] || [];
    const missing_fields = this.findMissingFields(action, required_fields);

    if (missing_fields.length > 0) {
      return {
        is_valid: false,
        missing_fields,
        reason: `Missing required fields for state ${action.state}: ${missing_fields.join(", ")}`,
      };
    }

    // Validate state-specific rules
    if (action.state === ActionState.IN_PROGRESS && !action.start_time) {
      return {
        is_valid: false,
        missing_fields: ["start_time"],
        reason: "IN_PROGRESS requires start_time",
      };
    }

    if (action.state === ActionState.DONE && !action.end_time) {
      return {
        is_valid: false,
        missing_fields: ["end_time"],
        reason: "DONE requires end_time",
      };
    }

    if (action.state === ActionState.FAILED && !action.failure_classification) {
      return {
        is_valid: false,
        missing_fields: ["failure_classification"],
        reason: "FAILED requires failure_classification",
      };
    }

    if (action.state === ActionState.BLOCKED && !action.blocked_reason) {
      return {
        is_valid: false,
        missing_fields: ["blocked_reason"],
        reason: "BLOCKED requires blocked_reason",
      };
    }

    return {
      is_valid: true,
      missing_fields: [],
      reason: "Valid state",
    };
  }

  /**
   * Generate deterministic action_id hash
   */
  generateActionId(
    decision_id: string,
    workspace_id: string,
    action_index: number,
    title: string
  ): string {
    const combined = `${decision_id}:${workspace_id}:${action_index}:${title}`;
    return createHash("sha256").update(combined).digest("hex").substring(0, 16);
  }

  /**
   * Find missing required fields in action
   */
  private findMissingFields(action: Action, required_fields: string[]): string[] {
    return required_fields.filter((field) => {
      const value = (action as unknown as Record<string, unknown>)[field];
      return value === undefined || value === null || value === "";
    });
  }
}

export const actionFSM = new ActionFSM();
