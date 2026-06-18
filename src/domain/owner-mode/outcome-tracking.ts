import { assertWorkspaceScopedQuery } from "./security-rules";

export type OutcomeStatus =
  | "worked"
  | "partially_worked"
  | "did_not_work"
  | "made_worse"
  | "not_measurable"
  | "too_early_to_judge"
  | "invalid_test"
  | "executed_differently"
  | "external_event_interference";

export type EvidenceQuality = "strong" | "moderate" | "weak" | "anecdotal" | "none";

// Outcomes that prove a meaningful result (positive or negative) and enable learning
export const OUTCOME_ENABLES_LEARNING: Readonly<Record<OutcomeStatus, boolean>> = {
  worked: true,
  partially_worked: true,
  did_not_work: true,
  made_worse: true,
  not_measurable: false,
  too_early_to_judge: false,
  invalid_test: false,
  executed_differently: false,
  external_event_interference: false,
};

// Outcomes that indicate harm or risk
export const OUTCOME_INDICATES_HARM: Readonly<Record<OutcomeStatus, boolean>> = {
  worked: false,
  partially_worked: false,
  did_not_work: false,
  made_worse: true,
  not_measurable: false,
  too_early_to_judge: false,
  invalid_test: false,
  executed_differently: false,
  external_event_interference: false,
};

// Outcomes requiring causal adjudication before learning can proceed
export const OUTCOME_REQUIRES_ADJUDICATION: Readonly<Record<OutcomeStatus, boolean>> = {
  worked: false,
  partially_worked: false,
  did_not_work: false,
  made_worse: true,
  not_measurable: false,
  too_early_to_judge: false,
  invalid_test: true,
  executed_differently: true,
  external_event_interference: true,
};

export interface OutcomeInput {
  workspaceId: string;
  businessId: string;
  recommendationId?: string;
  actionId?: string;
  outcomeStatus: OutcomeStatus;
  ownerReportedResult?: string;
  actualMetricName?: string;
  beforeValue?: number;
  afterValue?: number;
  measurementPeriodStart?: Date;
  measurementPeriodEnd?: Date;
  evidenceQuality?: EvidenceQuality;
  externalEventFlag?: boolean;
  externalEventDescription?: string;
}

export interface OutcomeValidationResult {
  valid: boolean;
  violations: string[];
  enablesLearning: boolean;
  indicatesHarm: boolean;
  requiresAdjudication: boolean;
  absoluteChange: number | null;
  percentageChange: number | null;
}

// OUT-RULE-1: must link to recommendation or action
// OUT-RULE-2: external_event_interference requires externalEventDescription
// OUT-RULE-3: made_worse requires ownerReportedResult
// OUT-RULE-4: if beforeValue and afterValue provided, absoluteChange is computed
// OUT-RULE-5: measurement period end must be after start if both provided
// OUT-RULE-6: actualMetricName required when beforeValue or afterValue is provided

export function validateOutcome(input: OutcomeInput): OutcomeValidationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // OUT-RULE-1
  if (!input.recommendationId && !input.actionId) {
    violations.push(
      "At least one of recommendationId or actionId is required (OUT-RULE-1)"
    );
  }

  // OUT-RULE-2: external event requires description
  if (
    input.outcomeStatus === "external_event_interference" &&
    (!input.externalEventDescription || input.externalEventDescription.trim().length === 0)
  ) {
    violations.push(
      "externalEventDescription required for external_event_interference outcome (OUT-RULE-2)"
    );
  }

  // OUT-RULE-3: made_worse requires ownerReportedResult
  if (
    input.outcomeStatus === "made_worse" &&
    (!input.ownerReportedResult || input.ownerReportedResult.trim().length === 0)
  ) {
    violations.push(
      "ownerReportedResult required for made_worse outcome (OUT-RULE-3)"
    );
  }

  // OUT-RULE-5: measurement window
  if (
    input.measurementPeriodStart !== undefined &&
    input.measurementPeriodEnd !== undefined &&
    input.measurementPeriodEnd <= input.measurementPeriodStart
  ) {
    violations.push(
      "measurementPeriodEnd must be after measurementPeriodStart (OUT-RULE-5)"
    );
  }

  // OUT-RULE-6: metric name required with values
  if (
    (input.beforeValue !== undefined || input.afterValue !== undefined) &&
    (!input.actualMetricName || input.actualMetricName.trim().length === 0)
  ) {
    violations.push(
      "actualMetricName required when beforeValue or afterValue is provided (OUT-RULE-6)"
    );
  }

  // Compute deltas
  let absoluteChange: number | null = null;
  let percentageChange: number | null = null;
  if (input.beforeValue !== undefined && input.afterValue !== undefined) {
    absoluteChange = Math.round((input.afterValue - input.beforeValue) * 10000) / 10000;
    percentageChange =
      input.beforeValue !== 0
        ? Math.round(((input.afterValue - input.beforeValue) / Math.abs(input.beforeValue)) * 10000) / 100
        : null;
  }

  return {
    valid: violations.length === 0,
    violations,
    enablesLearning: OUTCOME_ENABLES_LEARNING[input.outcomeStatus],
    indicatesHarm: OUTCOME_INDICATES_HARM[input.outcomeStatus],
    requiresAdjudication: OUTCOME_REQUIRES_ADJUDICATION[input.outcomeStatus],
    absoluteChange,
    percentageChange,
  };
}

export function outcomeAllowsLearning(result: OutcomeValidationResult): boolean {
  return result.valid && result.enablesLearning && !result.requiresAdjudication;
}
