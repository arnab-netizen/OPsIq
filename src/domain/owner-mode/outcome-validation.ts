import { assertWorkspaceScopedQuery } from "./security-rules";

export type RiskLevel = "low" | "standard" | "high" | "critical";

export interface ValidationCriteriaInput {
  workspaceId: string;
  businessId: string;
  recommendationId?: string;
  actionId?: string;
  metricName: string;
  baselineValue?: number;
  targetValue?: number;
  minimumSampleSize?: number;
  measurementStartAt?: Date;
  measurementEndAt?: Date;
  successCondition: string;
  partialSuccessCondition?: string;
  failureCondition?: string;
  stopCondition?: string;
  escalationCondition?: string;
  riskLevel?: RiskLevel;
  isProvisional?: boolean;
  reviewAt?: Date;
}

export interface ValidationCriteriaResult {
  valid: boolean;
  violations: string[];
  requiresStopLoss: boolean;
  requiresEscalation: boolean;
}

// VAL-RULE-1: successCondition must be non-trivial
const MIN_CONDITION_LENGTH = 10;

// VAL-RULE-2: metricName required
// VAL-RULE-3: high/critical risk requires stopCondition
// VAL-RULE-4: if both baselineValue and targetValue, target must differ from baseline
// VAL-RULE-5: at least one of recommendationId or actionId required
// VAL-RULE-6: minimumSampleSize must be positive if provided
// VAL-RULE-7: measurementEndAt must be after measurementStartAt if both provided

export function validateValidationCriteria(
  input: ValidationCriteriaInput
): ValidationCriteriaResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // VAL-RULE-1: successCondition must be substantive
  if (!input.successCondition || input.successCondition.trim().length < MIN_CONDITION_LENGTH) {
    violations.push(
      `successCondition must be at least ${MIN_CONDITION_LENGTH} characters (VAL-RULE-1)`
    );
  }

  // VAL-RULE-2: metricName required
  if (!input.metricName || input.metricName.trim().length === 0) {
    violations.push("metricName is required (VAL-RULE-2)");
  }

  const riskLevel = input.riskLevel ?? "standard";
  const requiresStopLoss =
    riskLevel === "high" || riskLevel === "critical";

  // VAL-RULE-3: high/critical risk requires stopCondition
  if (requiresStopLoss && (!input.stopCondition || input.stopCondition.trim().length === 0)) {
    violations.push(
      "stopCondition required for high or critical risk actions (VAL-RULE-3)"
    );
  }

  // VAL-RULE-4: target must differ from baseline if both provided
  if (
    input.baselineValue !== undefined &&
    input.targetValue !== undefined &&
    input.baselineValue === input.targetValue
  ) {
    violations.push(
      "targetValue must differ from baselineValue (VAL-RULE-4)"
    );
  }

  // VAL-RULE-5: must link to at least one of recommendationId or actionId
  if (!input.recommendationId && !input.actionId) {
    violations.push(
      "At least one of recommendationId or actionId is required (VAL-RULE-5)"
    );
  }

  // VAL-RULE-6: minimumSampleSize must be positive
  if (input.minimumSampleSize !== undefined && input.minimumSampleSize <= 0) {
    violations.push(
      "minimumSampleSize must be a positive integer (VAL-RULE-6)"
    );
  }

  // VAL-RULE-7: measurementEndAt must be after measurementStartAt
  if (
    input.measurementStartAt !== undefined &&
    input.measurementEndAt !== undefined &&
    input.measurementEndAt <= input.measurementStartAt
  ) {
    violations.push(
      "measurementEndAt must be after measurementStartAt (VAL-RULE-7)"
    );
  }

  const requiresEscalation =
    riskLevel === "critical" &&
    (!input.escalationCondition || input.escalationCondition.trim().length === 0);

  if (requiresEscalation) {
    violations.push(
      "escalationCondition required for critical risk actions (VAL-RULE-8)"
    );
  }

  return {
    valid: violations.length === 0,
    violations,
    requiresStopLoss,
    requiresEscalation: riskLevel === "critical",
  };
}

// Guard: accepted strong recommendation must have criteria unless provisional/data_limited
export function assertRecommendationHasCriteria(
  recommendationStatus: string,
  hasCriteria: boolean,
  isProvisional: boolean
): void {
  const requiresCriteria =
    recommendationStatus === "accepted" && !isProvisional;

  if (requiresCriteria && !hasCriteria) {
    throw new Error(
      "Accepted recommendation requires validation criteria unless provisional (VAL-GUARD-1)"
    );
  }
}

export function computeTargetDelta(
  baseline: number,
  target: number
): { absoluteDelta: number; percentageDelta: number } {
  const absoluteDelta = target - baseline;
  const percentageDelta = baseline !== 0
    ? Math.round((absoluteDelta / Math.abs(baseline)) * 10000) / 100
    : 0;
  return { absoluteDelta, percentageDelta };
}
