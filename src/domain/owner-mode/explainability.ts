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

/** Named dimension scores from the 13-dimension arbitration. All values 0..1. */
export interface GoalArbitrationDimensionScores {
  urgencyScore?: number | null;
  typeWeight?: number | null;
  dim_roi?: number | null;
  ownerPriorityNorm?: number | null;
  hasBlockingDependencies?: boolean | null;
  dim_resourceAvailability?: number | null;
  resourceBudgetUsedPct?: number | null;
  dim_cashImpact?: number | null;
  dim_operationalRisk?: number | null;
  dim_customerImpact?: number | null;
  dim_regulatoryWeight?: number | null;
  reversible?: boolean | null;
  confidence?: number | null;
}

/** Build an explainability record for a goal arbitration decision.
 * Derives factors from all 13 named dimensions when provided. */
export function explainGoalArbitration(opts: {
  winnerObjectiveId: string | null;
  dominantConstraint: string | null;
  totalCandidates: number;
  confidence: number;
  winnerDimensions?: GoalArbitrationDimensionScores | null;
  portfolioDecision?: string | null;
  portfolioRationale?: string | null;
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

  const d = opts.winnerDimensions;

  if (d) {
    // Dim 1: Urgency
    if (d.urgencyScore != null) {
      factors.push({
        name: "Urgency",
        value: parseFloat((d.urgencyScore * 100).toFixed(1)),
        weight: d.urgencyScore >= 0.7 ? "HIGH" : d.urgencyScore >= 0.4 ? "MEDIUM" : "LOW",
        direction: d.urgencyScore >= 0.6 ? "POSITIVE" : "NEUTRAL",
        description: `Time-pressure score: ${Math.round(d.urgencyScore * 100)}% (deadline × time horizon)`,
      });
    }

    // Dim 2: Strategic impact / type weight
    if (d.typeWeight != null) {
      factors.push({
        name: "Strategic impact",
        value: parseFloat((d.typeWeight * 100).toFixed(1)),
        weight: d.typeWeight >= 0.85 ? "HIGH" : d.typeWeight >= 0.7 ? "MEDIUM" : "LOW",
        direction: "POSITIVE",
        description: `Objective type strategic weight: ${Math.round(d.typeWeight * 100)}%`,
      });
    }

    // Dim 3: ROI
    if (d.dim_roi != null) {
      const roiMissing = d.dim_roi === 0.5;
      factors.push({
        name: "ROI",
        value: roiMissing ? "unknown" : parseFloat((d.dim_roi * 100).toFixed(1)),
        weight: d.dim_roi >= 0.7 ? "HIGH" : "MEDIUM",
        direction: roiMissing ? "NEUTRAL" : d.dim_roi >= 0.5 ? "POSITIVE" : "NEGATIVE",
        description: roiMissing
          ? "ROI unknown — neutral default applied (0.5)"
          : `Estimated return score: ${Math.round(d.dim_roi * 100)}%`,
      });
    }

    // Dim 4: Owner priority
    if (d.ownerPriorityNorm != null) {
      factors.push({
        name: "Owner priority",
        value: parseFloat((d.ownerPriorityNorm * 100).toFixed(1)),
        weight: d.ownerPriorityNorm >= 0.8 ? "HIGH" : d.ownerPriorityNorm >= 0.5 ? "MEDIUM" : "LOW",
        direction: d.ownerPriorityNorm >= 0.5 ? "POSITIVE" : "NEUTRAL",
        description: `Owner-set priority score: ${Math.round(d.ownerPriorityNorm * 100)}/100`,
      });
    }

    // Dim 5: Dependencies
    if (d.hasBlockingDependencies != null) {
      factors.push({
        name: "Blocking dependencies",
        value: d.hasBlockingDependencies,
        weight: "HIGH",
        direction: d.hasBlockingDependencies ? "NEGATIVE" : "POSITIVE",
        description: d.hasBlockingDependencies
          ? "Blocked by unresolved dependencies — cannot proceed"
          : "No blocking dependencies — execution is unblocked",
      });
    }

    // Dim 6: Resource availability
    if (d.dim_resourceAvailability != null) {
      const missing = d.dim_resourceAvailability === 0.5; // 0.5 = neutral default when ratio was unknown
      factors.push({
        name: "Resource availability",
        value: parseFloat((d.dim_resourceAvailability * 100).toFixed(1)),
        weight: "MEDIUM",
        direction: d.dim_resourceAvailability >= 0.6 ? "POSITIVE" : d.dim_resourceAvailability <= 0.2 ? "NEGATIVE" : "NEUTRAL",
        description: missing
          ? "Resource availability unknown — neutral default (0.5) applied"
          : `Available capacity ratio: ${Math.round(d.dim_resourceAvailability * 100)}%`,
      });
    }

    // Dim 7: Execution cost
    if (d.resourceBudgetUsedPct != null) {
      factors.push({
        name: "Execution cost",
        value: d.resourceBudgetUsedPct,
        weight: d.resourceBudgetUsedPct >= 95 ? "HIGH" : "LOW",
        direction: d.resourceBudgetUsedPct >= 95 ? "NEGATIVE" : "NEUTRAL",
        description: `Resource budget used: ${Math.round(d.resourceBudgetUsedPct)}%`,
      });
    }

    // Dim 8: Cash impact
    if (d.dim_cashImpact != null) {
      factors.push({
        name: "Cash impact",
        value: parseFloat((d.dim_cashImpact * 100).toFixed(1)),
        weight: d.dim_cashImpact >= 0.2 ? "HIGH" : "LOW",
        direction: "POSITIVE",
        description: `Objective type cash impact modifier: ${Math.round(d.dim_cashImpact * 100)}%`,
      });
    }

    // Dim 9: Operational risk
    if (d.dim_operationalRisk != null) {
      const missing = d.dim_operationalRisk === 0.3;
      factors.push({
        name: "Operational risk",
        value: parseFloat((d.dim_operationalRisk * 100).toFixed(1)),
        weight: d.dim_operationalRisk >= 0.6 ? "HIGH" : "MEDIUM",
        direction: d.dim_operationalRisk >= 0.5 ? "NEGATIVE" : "POSITIVE",
        description: missing
          ? "Operational risk unknown — moderate default (0.3) applied"
          : `Risk of execution failure: ${Math.round(d.dim_operationalRisk * 100)}%`,
      });
    }

    // Dim 10: Customer impact
    if (d.dim_customerImpact != null && d.dim_customerImpact > 0) {
      factors.push({
        name: "Customer impact",
        value: parseFloat((d.dim_customerImpact * 100).toFixed(1)),
        weight: d.dim_customerImpact >= 0.15 ? "HIGH" : "LOW",
        direction: "POSITIVE",
        description: `Customer-facing impact modifier: ${Math.round(d.dim_customerImpact * 100)}%`,
      });
    }

    // Dim 11: Regulatory weight
    if (d.dim_regulatoryWeight != null && d.dim_regulatoryWeight > 0) {
      factors.push({
        name: "Regulatory weight",
        value: parseFloat((d.dim_regulatoryWeight * 100).toFixed(1)),
        weight: d.dim_regulatoryWeight >= 0.25 ? "HIGH" : "LOW",
        direction: "POSITIVE",
        description: `Mandatory compliance modifier: ${Math.round(d.dim_regulatoryWeight * 100)}% (COMPLIANCE objectives prioritized)`,
      });
    }

    // Dim 12: Reversibility
    if (d.reversible != null) {
      factors.push({
        name: "Reversibility",
        value: d.reversible,
        weight: "MEDIUM",
        direction: d.reversible ? "POSITIVE" : "NEGATIVE",
        description: d.reversible
          ? "Execution can be reversed if needed"
          : "Irreversible action — higher risk of action penalty applied",
      });
    }

    // Dim 13: Evidence confidence
    if (d.confidence != null) {
      factors.push({
        name: "Evidence confidence",
        value: parseFloat((d.confidence * 100).toFixed(1)),
        weight: d.confidence >= 0.7 ? "HIGH" : "MEDIUM",
        direction: d.confidence >= 0.5 ? "POSITIVE" : "NEGATIVE",
        description: `Data quality and completeness confidence: ${Math.round(d.confidence * 100)}%`,
      });
    }
  }

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

  const portfolioPart = opts.portfolioDecision
    ? ` Portfolio decision: ${opts.portfolioDecision}${opts.portfolioRationale ? ` — ${opts.portfolioRationale}` : ""}.`
    : "";

  const outcome = opts.winnerObjectiveId
    ? `Objective ${opts.winnerObjectiveId} selected as highest priority.${portfolioPart}`
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
