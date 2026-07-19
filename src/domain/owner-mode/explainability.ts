/**
 * Phase 4 — Explainability Layer (Capability 14).
 *
 * Constructs structured, human-readable explanation records for every
 * significant decision or recommendation. Captures which factors were
 * used, what data points were observed, and what the confidence basis was.
 *
 * Design principles:
 * - Every explanation is deterministic given the same inputs.
 * - No fabrication: factors not present in input are not mentioned.
 * - Confidence is always shown with its components.
 *
 * Pure — no DB, no I/O.
 */

export type DecisionExplainabilityType =
  | "GOAL_ARBITRATION"
  | "OBJECTIVE_PORTFOLIO_RANKING"
  | "RESOURCE_ALLOCATION"
  | "OPPORTUNITY_ARBITRATION"
  | "CONSTRAINT_IDENTIFICATION"
  | "RISK_ASSESSMENT"
  | "KPI_REVIEW_TRIGGER"
  | "OUTCOME_VERIFICATION";

export interface ExplainabilityFactor {
  name: string;
  value: string | number | boolean;
  weight: string; // e.g. "HIGH", "MEDIUM", "LOW"
  direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  description: string;
}

export interface ExplainabilityDataPoint {
  label: string;
  observed: string | number | boolean | null;
  expected: string | number | null;
  source: string;
  freshness: "CURRENT" | "RECENT" | "STALE" | "MISSING";
}

export interface ExplainabilityInput {
  decisionRef: string; // e.g. objectiveId, signalId, riskCode
  decisionType: DecisionExplainabilityType;
  factors: ExplainabilityFactor[];
  dataPoints: ExplainabilityDataPoint[];
  confidence: number; // 0..1
  confidenceLevel: "very_high" | "high" | "moderate" | "low" | "very_low";
  outcome: string; // human-readable result ("Recommended", "Blocked by cash constraint", etc.)
}

export interface ExplainabilityRecord {
  decisionRef: string;
  decisionType: DecisionExplainabilityType;
  explanationText: string;
  factorsUsed: ExplainabilityFactor[];
  dataPoints: ExplainabilityDataPoint[];
  confidence: number;
  confidenceLevel: string;
}

const CONFIDENCE_LABEL: Record<ExplainabilityInput["confidenceLevel"], string> = {
  very_high: "very high",
  high: "high",
  moderate: "moderate",
  low: "low",
  very_low: "very low",
};

const FACTOR_WEIGHT_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Build a natural-language explanation sentence from factors and outcome. */
function buildExplanationText(input: ExplainabilityInput): string {
  const positive = input.factors
    .filter((f) => f.direction === "POSITIVE")
    .sort((a, b) => (FACTOR_WEIGHT_ORDER[a.weight] ?? 99) - (FACTOR_WEIGHT_ORDER[b.weight] ?? 99))
    .slice(0, 3)
    .map((f) => f.name);

  const negative = input.factors
    .filter((f) => f.direction === "NEGATIVE")
    .sort((a, b) => (FACTOR_WEIGHT_ORDER[a.weight] ?? 99) - (FACTOR_WEIGHT_ORDER[b.weight] ?? 99))
    .slice(0, 2)
    .map((f) => f.name);

  const missingData = input.dataPoints
    .filter((d) => d.freshness === "MISSING")
    .map((d) => d.label);

  const parts: string[] = [];

  if (positive.length > 0) {
    parts.push(`Key supporting factors: ${positive.join(", ")}.`);
  }
  if (negative.length > 0) {
    parts.push(`Limiting factors: ${negative.join(", ")}.`);
  }
  if (missingData.length > 0) {
    parts.push(`Missing data reduced confidence: ${missingData.join(", ")}.`);
  }

  const confidenceStr = `Confidence is ${CONFIDENCE_LABEL[input.confidenceLevel]} (${Math.round(input.confidence * 100)}%).`;

  return `${input.outcome}. ${parts.join(" ")} ${confidenceStr}`.trim();
}

/**
 * Build a structured ExplainabilityRecord ready for persistence.
 * The record is the canonical source for the UI's "Why this decision?" view.
 */
export function buildExplainabilityRecord(input: ExplainabilityInput): ExplainabilityRecord {
  const sortedFactors = [...input.factors].sort(
    (a, b) => (FACTOR_WEIGHT_ORDER[a.weight] ?? 99) - (FACTOR_WEIGHT_ORDER[b.weight] ?? 99),
  );

  return {
    decisionRef: input.decisionRef,
    decisionType: input.decisionType,
    explanationText: buildExplanationText(input),
    factorsUsed: sortedFactors,
    dataPoints: input.dataPoints,
    confidence: parseFloat((input.confidence).toFixed(3)),
    confidenceLevel: input.confidenceLevel,
  };
}

/** Build a minimal explainability record for a goal arbitration decision. */
export function explainGoalArbitration(opts: {
  winnerObjectiveId: string | null;
  dominantConstraint: string | null;
  totalCandidates: number;
  confidence: number;
}): ExplainabilityRecord {
  const factors: ExplainabilityFactor[] = [
    {
      name: "Candidate count",
      value: opts.totalCandidates,
      weight: "LOW",
      direction: "NEUTRAL",
      description: `${opts.totalCandidates} active objective(s) competed`,
    },
  ];

  if (opts.dominantConstraint) {
    factors.push({
      name: `Dominant constraint: ${opts.dominantConstraint}`,
      value: opts.dominantConstraint,
      weight: "HIGH",
      direction: "NEGATIVE",
      description: "A hard constraint blocked one or more candidates",
    });
  }

  if (opts.winnerObjectiveId) {
    factors.push({
      name: "Winner selected",
      value: opts.winnerObjectiveId,
      weight: "HIGH",
      direction: "POSITIVE",
      description: "Highest-priority feasible objective selected",
    });
  }

  const outcome = opts.winnerObjectiveId
    ? `Objective ${opts.winnerObjectiveId} selected as highest priority.`
    : "No clear winner — all objectives blocked or tied.";

  const confidenceScore = opts.confidence;
  const confidenceLevel: ExplainabilityInput["confidenceLevel"] =
    confidenceScore >= 0.85 ? "very_high"
    : confidenceScore >= 0.70 ? "high"
    : confidenceScore >= 0.50 ? "moderate"
    : confidenceScore >= 0.30 ? "low"
    : "very_low";

  return buildExplainabilityRecord({
    decisionRef: opts.winnerObjectiveId ?? "no_winner",
    decisionType: "GOAL_ARBITRATION",
    factors,
    dataPoints: [],
    confidence: confidenceScore,
    confidenceLevel,
    outcome,
  });
}
