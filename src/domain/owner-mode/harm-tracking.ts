import { assertWorkspaceScopedQuery } from "./security-rules";

export type HarmCategory =
  | "none"
  | "cash_loss"
  | "margin_damage"
  | "customer_loss"
  | "churn_increase"
  | "revenue_loss"
  | "compliance_risk"
  | "legal_risk"
  | "reputation_damage"
  | "operational_disruption"
  | "staff_overload"
  | "service_quality_damage"
  | "opportunity_cost"
  | "unknown_harm";

export type HarmSeverity = "none" | "low" | "medium" | "high" | "severe";

export type Reversibility =
  | "reversible"
  | "partially_reversible"
  | "irreversible"
  | "unknown";

// Medium/high/severe harm requires human review before any further action
export const HARM_REQUIRES_HUMAN_REVIEW: Readonly<Record<HarmSeverity, boolean>> = {
  none: false,
  low: false,
  medium: true,
  high: true,
  severe: true,
};

// High/severe harm blocks automatic learning admission
export const HARM_BLOCKS_LEARNING: Readonly<Record<HarmSeverity, boolean>> = {
  none: false,
  low: false,
  medium: false,
  high: true,
  severe: true,
};

// Legal/compliance categories trigger incident review path
export const HARM_TRIGGERS_INCIDENT_REVIEW: Readonly<Record<HarmCategory, boolean>> = {
  none: false,
  cash_loss: false,
  margin_damage: false,
  customer_loss: false,
  churn_increase: false,
  revenue_loss: false,
  compliance_risk: true,
  legal_risk: true,
  reputation_damage: false,
  operational_disruption: false,
  staff_overload: false,
  service_quality_damage: false,
  opportunity_cost: false,
  unknown_harm: false,
};

export interface HarmEventInput {
  workspaceId: string;
  businessId: string;
  recommendationId?: string;
  actionId?: string;
  outcomeId?: string;
  harmCategory: HarmCategory;
  harmSeverity: HarmSeverity;
  harmAmountEstimate?: number;
  harmMetric?: string;
  harmDescription: string;
  reversibility: Reversibility;
}

export interface HarmEventValidationResult {
  valid: boolean;
  violations: string[];
  requiresHumanReview: boolean;
  blocksLearning: boolean;
  triggersIncidentReview: boolean;
}

// HARM-RULE-1: harmDescription must be non-trivial
const MIN_DESCRIPTION_LENGTH = 10;

// HARM-RULE-2: must link to at least one of recommendation/action/outcome
// HARM-RULE-3: non-none harm must have a metric or amount estimate
// HARM-RULE-4: harmAmountEstimate must be non-negative when provided
// HARM-RULE-5: irreversible harm of medium+ severity requires human review (enforced in result)

export function validateHarmEvent(input: HarmEventInput): HarmEventValidationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // HARM-RULE-1
  if (!input.harmDescription || input.harmDescription.trim().length < MIN_DESCRIPTION_LENGTH) {
    violations.push(
      `harmDescription must be at least ${MIN_DESCRIPTION_LENGTH} characters (HARM-RULE-1)`
    );
  }

  // HARM-RULE-2
  if (!input.recommendationId && !input.actionId && !input.outcomeId) {
    violations.push(
      "At least one of recommendationId, actionId, or outcomeId is required (HARM-RULE-2)"
    );
  }

  // HARM-RULE-3: non-none harm needs measurable evidence
  if (
    input.harmCategory !== "none" &&
    input.harmSeverity !== "none" &&
    input.harmAmountEstimate === undefined &&
    (!input.harmMetric || input.harmMetric.trim().length === 0)
  ) {
    violations.push(
      "harmMetric or harmAmountEstimate required for non-none harm (HARM-RULE-3)"
    );
  }

  // HARM-RULE-4: amount must be non-negative
  if (input.harmAmountEstimate !== undefined && input.harmAmountEstimate < 0) {
    violations.push(
      "harmAmountEstimate must be non-negative (HARM-RULE-4)"
    );
  }

  const requiresHumanReview = HARM_REQUIRES_HUMAN_REVIEW[input.harmSeverity];
  const blocksLearning = HARM_BLOCKS_LEARNING[input.harmSeverity];
  const triggersIncidentReview = HARM_TRIGGERS_INCIDENT_REVIEW[input.harmCategory];

  return {
    valid: violations.length === 0,
    violations,
    requiresHumanReview,
    blocksLearning,
    triggersIncidentReview,
  };
}

export function harmAllowsLearning(result: HarmEventValidationResult): boolean {
  return result.valid && !result.blocksLearning;
}
