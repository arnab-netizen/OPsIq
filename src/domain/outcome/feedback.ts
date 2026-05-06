import { VarianceResult } from "./variance";

export enum FeedbackAction {
  CONTINUE = "CONTINUE",
  REPLAN = "REPLAN",
  ROLLBACK = "ROLLBACK",
  HALT = "HALT",
}

export interface FeedbackLoopInput {
  variance_result: VarianceResult;
  rollback_feasible: boolean;
  owner_id: string;
  decision_id: string;
}

export interface FeedbackLoopResult {
  action: FeedbackAction;
  reason: string;
  escalation_required: boolean;
  requires_owner_approval: boolean;
}
