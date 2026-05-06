import { FailureClass } from "./failure-classification";
import { ActionState } from "./action";

export enum ContainmentStrategy {
  ISOLATE = "ISOLATE",
  ROLLBACK = "ROLLBACK",
  ESCALATE = "ESCALATE",
}

export interface FailureContainmentInput {
  action_id: string;
  failure_class: FailureClass;
  error_message: string;
  downstream_actions: string[];
  decision_id: string;
  workspace_id: string;
}

export interface ActionImpact {
  action_id: string;
  current_state: ActionState;
  new_state: ActionState;
  reason: string;
}

export interface ContainmentResult {
  action_id: string;
  strategy: ContainmentStrategy;
  affected_actions: string[];
  action_impacts: ActionImpact[];
  containment_success: boolean;
  cascade_prevented: boolean;
  reason: string;
  timestamp: Date;
}

export const STRATEGY_BY_FAILURE_CLASS: Record<FailureClass, ContainmentStrategy> = {
  [FailureClass.RECOVERABLE]: ContainmentStrategy.ISOLATE,
  [FailureClass.RETRYABLE]: ContainmentStrategy.ISOLATE,
  [FailureClass.FATAL]: ContainmentStrategy.ROLLBACK,
};

export const STATE_TRANSITION_FOR_STRATEGY: Record<ContainmentStrategy, Record<ActionState, ActionState>> = {
  [ContainmentStrategy.ISOLATE]: {
    [ActionState.DRAFT]: ActionState.BLOCKED,
    [ActionState.READY]: ActionState.BLOCKED,
    [ActionState.IN_PROGRESS]: ActionState.FAILED,
    [ActionState.DONE]: ActionState.DONE, // Cannot change completed actions
    [ActionState.BLOCKED]: ActionState.BLOCKED,
    [ActionState.FAILED]: ActionState.FAILED,
    [ActionState.CANCELLED]: ActionState.CANCELLED,
  },
  [ContainmentStrategy.ROLLBACK]: {
    [ActionState.DRAFT]: ActionState.CANCELLED,
    [ActionState.READY]: ActionState.CANCELLED,
    [ActionState.IN_PROGRESS]: ActionState.CANCELLED,
    [ActionState.DONE]: ActionState.DONE, // Cannot rollback completed actions
    [ActionState.BLOCKED]: ActionState.CANCELLED,
    [ActionState.FAILED]: ActionState.CANCELLED,
    [ActionState.CANCELLED]: ActionState.CANCELLED,
  },
  [ContainmentStrategy.ESCALATE]: {
    [ActionState.DRAFT]: ActionState.BLOCKED,
    [ActionState.READY]: ActionState.BLOCKED,
    [ActionState.IN_PROGRESS]: ActionState.BLOCKED,
    [ActionState.DONE]: ActionState.DONE, // Cannot change completed actions
    [ActionState.BLOCKED]: ActionState.BLOCKED,
    [ActionState.FAILED]: ActionState.BLOCKED,
    [ActionState.CANCELLED]: ActionState.CANCELLED,
  },
};
