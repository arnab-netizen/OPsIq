/**
 * Startup hypothesis generation and prioritization — pure domain, no I/O.
 * Prioritization formula: DECISION_VALUE × UNCERTAINTY ÷ (COST × TIME)
 */

export type HypothesisType =
  | "DEMAND"
  | "PRICING"
  | "DELIVERY"
  | "ACQUISITION"
  | "ECONOMIC"
  | "REGULATORY"
  | "SUPPLIER";

export interface HypothesisTemplate {
  type: HypothesisType;
  statement: string;
  falsificationCriteria: string;
  validationMethod: string;
  defaultPriority: number;
  isCritical: boolean;
  expectedCostCents: number;
  expectedDurationDays: number;
}

export interface GeneratedHypothesis extends HypothesisTemplate {
  id?: string;
  confidenceBefore: number;
  priorityScore: number;
  requiresOwnerApproval: boolean;
}

export const HYPOTHESIS_TEMPLATES: HypothesisTemplate[] = [
  {
    type: "DEMAND",
    statement: "At least 10 potential customers in the target market have the identified problem and are actively seeking a solution",
    falsificationCriteria: "Fewer than 5 of 20 interviewed potential customers confirm the problem exists and they would seek a solution",
    validationMethod: "CUSTOMER_INTERVIEW",
    defaultPriority: 90,
    isCritical: true,
    expectedCostCents: 0,
    expectedDurationDays: 14,
  },
  {
    type: "PRICING",
    statement: "Target customers are willing to pay at least the estimated unit price for the proposed solution",
    falsificationCriteria: "Fewer than 3 of 10 interviewed customers indicate willingness to pay at or above break-even price",
    validationMethod: "PRICE_TEST",
    defaultPriority: 85,
    isCritical: true,
    expectedCostCents: 0,
    expectedDurationDays: 7,
  },
  {
    type: "DELIVERY",
    statement: "The proposed delivery method can be executed by the owner within the stated time and cost constraints",
    falsificationCriteria: "Initial delivery trial exceeds estimated cost by more than 30% or time by more than 50%",
    validationMethod: "CONCIERGE",
    defaultPriority: 80,
    isCritical: true,
    expectedCostCents: 50000,
    expectedDurationDays: 21,
  },
  {
    type: "ACQUISITION",
    statement: "Customers can be reached through the stated acquisition channels at an acceptable cost",
    falsificationCriteria: "Customer acquisition cost exceeds 3× the gross contribution per unit",
    validationMethod: "LANDING_PAGE",
    defaultPriority: 75,
    isCritical: true,
    expectedCostCents: 30000,
    expectedDurationDays: 14,
  },
  {
    type: "ECONOMIC",
    statement: "The business model generates positive gross contribution within 6 months at projected volume",
    falsificationCriteria: "Break-even analysis shows negative gross margin at any achievable volume within cash runway",
    validationMethod: "CUSTOMER_INTERVIEW",
    defaultPriority: 85,
    isCritical: true,
    expectedCostCents: 0,
    expectedDurationDays: 3,
  },
  {
    type: "REGULATORY",
    statement: "No licence or registration requirement blocks launch in the stated geography",
    falsificationCriteria: "Local authority or legal review confirms a licence or registration is required before first sale",
    validationMethod: "SUPPLIER_QUOTE",
    defaultPriority: 95,
    isCritical: true,
    expectedCostCents: 20000,
    expectedDurationDays: 5,
  },
  {
    type: "SUPPLIER",
    statement: "At least two independent suppliers can fulfil the required inputs at the estimated cost and lead time",
    falsificationCriteria: "Fewer than two suppliers can confirm supply within stated cost +20% and lead time +50%",
    validationMethod: "SUPPLIER_QUOTE",
    defaultPriority: 70,
    isCritical: false,
    expectedCostCents: 0,
    expectedDurationDays: 7,
  },
];

export function generateHypotheses(
  ideaName: string,
  industry: string,
  _screeningData?: Record<string, unknown>
): GeneratedHypothesis[] {
  return HYPOTHESIS_TEMPLATES.map((t) => ({
    ...t,
    statement: `[${ideaName} — ${industry}] ${t.statement}`,
    confidenceBefore: 50,
    priorityScore: t.defaultPriority,
    requiresOwnerApproval: t.isCritical && t.expectedCostCents > 0,
  }));
}

export function prioritizeHypotheses(
  hypotheses: GeneratedHypothesis[]
): GeneratedHypothesis[] {
  return [...hypotheses].sort((a, b) => b.priorityScore - a.priorityScore);
}

export type HypothesisMemoryType = "STARTUP_VALIDATED_HYPOTHESIS" | "STARTUP_FAILED_HYPOTHESIS";

export interface HypothesisEvaluation {
  hypothesisId: string;
  result: "CONFIRMED" | "DISCONFIRMED" | "PARTIALLY_CONFIRMED" | "INCONCLUSIVE";
  confidenceAfter: number;
  effectOnScore: number;
  followUpAction: string;
  memoryKey: string;
  memoryType: HypothesisMemoryType;
}

export function evaluateHypothesisResult(
  hypothesisId: string,
  type: HypothesisType,
  isCritical: boolean,
  result: "CONFIRMED" | "DISCONFIRMED" | "PARTIALLY_CONFIRMED" | "INCONCLUSIVE",
  confidenceBefore: number
): HypothesisEvaluation {
  const delta =
    result === "CONFIRMED" ? 30
    : result === "DISCONFIRMED" ? -40
    : result === "PARTIALLY_CONFIRMED" ? 10
    : -5;

  const confidenceAfter = Math.min(100, Math.max(0, confidenceBefore + delta));
  const effectOnScore = isCritical ? delta * 2 : delta;
  const memoryType: HypothesisMemoryType =
    result === "CONFIRMED" || result === "PARTIALLY_CONFIRMED"
      ? "STARTUP_VALIDATED_HYPOTHESIS"
      : "STARTUP_FAILED_HYPOTHESIS";

  const followUpAction =
    result === "DISCONFIRMED" && isCritical
      ? "Reassess idea viability — critical hypothesis failed. Consider MODIFY or REJECT."
      : result === "PARTIALLY_CONFIRMED"
      ? "Partial evidence — run additional experiment to increase confidence before proceeding."
      : result === "INCONCLUSIVE"
      ? "Insufficient data — redesign experiment with clearer pass/fail criteria."
      : "Proceed with dependent hypotheses.";

  return {
    hypothesisId,
    result,
    confidenceAfter,
    effectOnScore,
    followUpAction,
    memoryKey: `hypothesis:${type.toLowerCase()}:${hypothesisId}`,
    memoryType,
  };
}
