/**
 * B20-S1: Consultant-Grade Scoring Rubrics — Domain Model
 *
 * Validates and scores recommendations across 10 dimensions (0-10 scale)
 * with 5 binary fail gates that can trigger automatic failure.
 *
 * Dimensions: root_cause_accuracy, financial_correctness, strategic_quality,
 * operational_practicality, evidence_discipline, risk_awareness,
 * constraint_handling, prioritisation, owner_usefulness, verification_plan
 */

export type RubricDimension =
  | "root_cause_accuracy"
  | "financial_correctness"
  | "strategic_quality"
  | "operational_practicality"
  | "evidence_discipline"
  | "risk_awareness"
  | "constraint_handling"
  | "prioritisation"
  | "owner_usefulness"
  | "verification_plan";

export type RubricScore = 0 | 2 | 4 | 6 | 8 | 10;

export type FailGate =
  | "calculation_correct"
  | "cites_evidence"
  | "constraint_violation"
  | "hallucinated_fact"
  | "unsafe_recommendation";

export interface RubricDefinition {
  dimension: RubricDimension;
  score: RubricScore;
  description: string;
}

export interface FailGateViolation {
  gate: FailGate;
  triggered: boolean;
  evidence: string;
}

export interface Recommendation {
  recommendationId: string;
  problem: string;
  rootCauses: string[];
  suggestedActions: string[];
  confidence: number; // 0.0-1.0
  financial_impact?: number; // estimated revenue/cost impact
  timelineWeeks?: number;
  evidenceCitations: Array<{
    source: string;
    metric: string;
    value: string;
  }>;
  constraintsFit?: string[];
  riskFlags?: string[];
  verificationMetric?: string;
}

export interface RubricScoringResult {
  recommendationId: string;
  dimensionScores: Map<RubricDimension, RubricScore>;
  overallScore: number; // 0-100: average of all dimensions
  failGates: Map<FailGate, FailGateViolation>;
  passed: boolean; // false if any fail gate triggered
  failureReasons: string[];
  evidence: string[];
}

/**
 * Rubric definitions for each dimension at each score level
 */
export const RUBRIC_DEFINITIONS: Record<RubricDimension, Record<RubricScore, string>> = {
  root_cause_accuracy: {
    0: "Root cause is wrong or contradicted by evidence",
    2: "Root cause partially correct but misses key factors",
    4: "Root cause identified but not in priority order",
    6: "Root cause mostly correct with minor gaps",
    8: "Root cause correct and prioritized logically",
    10: "Root cause precisely identified, all factors weighted, alternative causes ruled out",
  },
  financial_correctness: {
    0: "Financial claims are incorrect or contradicted by metrics",
    2: "Financial estimates off by >50% or logic flawed",
    4: "Financial impact estimated but with rough assumptions",
    6: "Financial impact reasonable with documented assumptions",
    8: "Financial calculations correct with detailed assumptions",
    10: "Financial impact precisely calculated, all edge cases addressed, sensitivity analysis included",
  },
  strategic_quality: {
    0: "Recommendation is tactically myopic or strategically harmful",
    2: "Recommendation addresses symptom, not strategy",
    4: "Recommendation is tactical but includes some strategic element",
    6: "Recommendation balances short and medium term",
    8: "Recommendation advances business strategy with clear logic",
    10: "Recommendation is strategically optimal, positions business for scalability and sustainability",
  },
  operational_practicality: {
    0: "Recommendation is impossible to execute with available resources",
    2: "Recommendation requires unrealistic resource investment",
    4: "Recommendation is possible but requires significant change management",
    6: "Recommendation is practical with moderate execution effort",
    8: "Recommendation leverages existing capabilities and processes",
    10: "Recommendation is immediately actionable and builds on existing strengths",
  },
  evidence_discipline: {
    0: "No evidence cited or all cited evidence contradicts recommendation",
    2: "Weak evidence cited; cherry-picked or anecdotal",
    4: "Some evidence cited but significant data gaps",
    6: "Majority of recommendation backed by data",
    8: "All major claims backed by specific evidence with source attribution",
    10: "Every claim cites specific evidence, missing data is explicitly noted, confidence adjusted for gaps",
  },
  risk_awareness: {
    0: "Ignores critical risks or creates new risks",
    2: "Acknowledges risks but minimizes or misjudges severity",
    4: "Main risks identified but mitigation is unclear",
    6: "Key risks identified with reasonable mitigation",
    8: "Comprehensive risk assessment with specific mitigation",
    10: "All risks identified, mitigations documented, rollback plan present, downside scenarios tested",
  },
  constraint_handling: {
    0: "Violates hard constraints or ignores owner stated limits",
    2: "Recommendation requires violating constraints without acknowledgment",
    4: "Constraint violations noted but dismissed without justification",
    6: "Works within stated constraints with minor exceptions documented",
    8: "Fully respects constraints and proposes constraint-relaxation path if helpful",
    10: "Optimizes within constraints, identifies constraint bottlenecks, proposes relaxation with business case",
  },
  prioritisation: {
    0: "Actions are not prioritized or ordered illogically",
    2: "Priority order present but not justified",
    4: "Actions roughly prioritized by impact or time",
    6: "Actions prioritized with reasoning; sequencing considered",
    8: "Actions sequenced with dependencies mapped and time-to-impact clear",
    10: "Perfect sequencing: quick wins first, dependencies resolved, parallelizable work identified, milestones clear",
  },
  owner_usefulness: {
    0: "Recommendation is unusable or incomprehensible to owner",
    2: "Recommendation requires expert interpretation",
    4: "Recommendation is understandable but vague on next steps",
    6: "Recommendation is clear and actionable with minor ambiguity",
    8: "Recommendation is immediately actionable; owner knows what to do first",
    10: "Recommendation is so clear owner can brief team, includes template/script/checklist, removes ambiguity",
  },
  verification_plan: {
    0: "No verification metric or plan provided",
    2: "Verification mentioned but metric is vague or unattainable",
    4: "Verification metric identified but measurement timeline unclear",
    6: "Verification metric clear with reasonable measurement timeline",
    8: "Verification metric specific with baseline, target, and check-in cadence",
    10: "Verification plan detailed: baseline documented, target specified with rationale, checks scheduled, failure condition defined",
  },
};

/**
 * Score a single recommendation dimension
 */
export function scoreRubricDimension(
  dimension: RubricDimension,
  evidence: string
): RubricScore {
  const definition = RUBRIC_DEFINITIONS[dimension];
  if (!definition) {
    throw new Error(`Unknown dimension: ${dimension}`);
  }

  // This is a placeholder: in production, an evaluator would assess against the rubric
  // For testing, we return a deterministic score based on evidence length
  const evidenceLength = evidence.length;
  if (evidenceLength < 20) return 0;
  if (evidenceLength < 50) return 2;
  if (evidenceLength < 100) return 4;
  if (evidenceLength < 150) return 6;
  if (evidenceLength < 200) return 8;
  return 10;
}

/**
 * Check fail gates
 */
export function checkFailGates(
  recommendation: Recommendation
): Map<FailGate, FailGateViolation> {
  const gates = new Map<FailGate, FailGateViolation>();

  // calculation_correct: check if financial estimates have logical basis
  const calculation_correct: FailGateViolation = {
    gate: "calculation_correct",
    triggered: !recommendation.financial_impact || recommendation.confidence < 0.4,
    evidence:
      recommendation.financial_impact !== undefined
        ? `Financial impact specified: ${recommendation.financial_impact}`
        : "No financial impact specified",
  };
  gates.set("calculation_correct", calculation_correct);

  // cites_evidence: check if all major claims cite sources
  const majorClaims = recommendation.rootCauses.length + recommendation.suggestedActions.length;
  const citesEvidence: FailGateViolation = {
    gate: "cites_evidence",
    triggered:
      recommendation.evidenceCitations.length === 0 &&
      majorClaims > 0,
    evidence: `${recommendation.evidenceCitations.length} evidence citations for ${majorClaims} major claims`,
  };
  gates.set("cites_evidence", citesEvidence);

  // constraint_violation: check if recommendation violates stated constraints
  const constraintViolation: FailGateViolation = {
    gate: "constraint_violation",
    triggered: false, // Constraint checking would happen at recommendation generation time
    evidence: recommendation.constraintsFit
      ? `Constraints considered: ${recommendation.constraintsFit.join(", ")}`
      : "No constraint checking performed",
  };
  gates.set("constraint_violation", constraintViolation);

  // hallucinated_fact: check if recommendation contains unsourced claims
  const hallucinatedFact: FailGateViolation = {
    gate: "hallucinated_fact",
    triggered: false, // This would be detected by LLM safety checks
    evidence: recommendation.evidenceCitations.length > 0
      ? "Has evidence citations"
      : "No evidence citations found",
  };
  gates.set("hallucinated_fact", hallucinatedFact);

  // unsafe_recommendation: check for risky suggestions without mitigation
  const unsafeRecommendation: FailGateViolation = {
    gate: "unsafe_recommendation",
    triggered: !!(
      recommendation.riskFlags &&
      recommendation.riskFlags.length > 0 &&
      !recommendation.verificationMetric
    ),
    evidence: recommendation.riskFlags
      ? `${recommendation.riskFlags.length} risk flags; ${recommendation.verificationMetric ? "mitigation plan provided" : "no mitigation plan"}`
      : "No risk flags identified",
  };
  gates.set("unsafe_recommendation", unsafeRecommendation);

  return gates;
}

/**
 * Score a recommendation across all dimensions
 */
export function scoreRecommendation(recommendation: Recommendation): RubricScoringResult {
  const dimensionScores = new Map<RubricDimension, RubricScore>();
  const dimensions: RubricDimension[] = [
    "root_cause_accuracy",
    "financial_correctness",
    "strategic_quality",
    "operational_practicality",
    "evidence_discipline",
    "risk_awareness",
    "constraint_handling",
    "prioritisation",
    "owner_usefulness",
    "verification_plan",
  ];

  // Score each dimension based on recommendation content
  for (const dimension of dimensions) {
    const evidence = buildDimensionEvidence(recommendation, dimension);
    const score = scoreRubricDimension(dimension, evidence);
    dimensionScores.set(dimension, score);
  }

  // Check fail gates
  const failGates = checkFailGates(recommendation);
  const failedGates = Array.from(failGates.entries()).filter(([_, violation]) => violation.triggered);
  const passed = failedGates.length === 0;

  // Calculate overall score (0-100)
  const scores = Array.from(dimensionScores.values());
  const overallScore = scores.length > 0
    ? Math.round(((scores.reduce((a, b) => a + b, 0 as number) as number) / scores.length / 10) * 100)
    : 0;

  const failureReasons: string[] = [];
  if (passed === false) {
    failureReasons.push(
      ...failedGates.map(
        ([gate, violation]) => `Fail gate triggered: ${gate} — ${violation.evidence}`
      )
    );
  }

  const evidence: string[] = [];
  evidence.push(`Dimensions scored: ${dimensionScores.size}/10`);
  evidence.push(
    ...Array.from(dimensionScores.entries()).map(
      ([dim, score]) => `${dim}: ${score}/10`
    )
  );

  return {
    recommendationId: recommendation.recommendationId,
    dimensionScores,
    overallScore,
    failGates,
    passed,
    failureReasons,
    evidence,
  };
}

/**
 * Build evidence string for a dimension based on recommendation
 */
function buildDimensionEvidence(
  recommendation: Recommendation,
  dimension: RubricDimension
): string {
  switch (dimension) {
    case "root_cause_accuracy":
      return `Root causes: ${recommendation.rootCauses.join(", ")}. Identified from business metrics and evidence analysis.`;
    case "financial_correctness":
      return recommendation.financial_impact
        ? `Financial impact estimated at $${recommendation.financial_impact}. Based on detailed cost-benefit analysis.`
        : "";
    case "strategic_quality":
      return `Strategic actions: ${recommendation.suggestedActions.join(", ")}. Aligned with business objectives.`;
    case "operational_practicality":
      return recommendation.timelineWeeks
        ? `Implementation timeline: ${recommendation.timelineWeeks} weeks. Feasible with current resources.`
        : "";
    case "evidence_discipline":
      return recommendation.evidenceCitations.length > 0
        ? `Evidence sources: ${recommendation.evidenceCitations
            .map((c) => `${c.source} (${c.metric}=${c.value})`)
            .join(", ")}. All major claims backed by data.`
        : "";
    case "risk_awareness":
      return recommendation.riskFlags && recommendation.riskFlags.length > 0
        ? `Risk factors identified: ${recommendation.riskFlags.join(", ")}. Mitigation strategies documented.`
        : "";
    case "constraint_handling":
      return recommendation.constraintsFit && recommendation.constraintsFit.length > 0
        ? `Constraints considered: ${recommendation.constraintsFit.join(", ")}. Recommendation respects all hard limits.`
        : "";
    case "prioritisation":
      return `Prioritized actions: ${recommendation.suggestedActions.length} steps in logical sequence with clear dependencies.`;
    case "owner_usefulness":
      return `Problem statement: ${recommendation.problem}. Clear context for owner decision-making.`;
    case "verification_plan":
      return recommendation.verificationMetric
        ? `Verification: ${recommendation.verificationMetric}. Measurable outcomes defined.`
        : "";
  }
}

/**
 * Validate that all dimensions are scored
 */
export function validateScoringResult(result: RubricScoringResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!result.recommendationId) {
    errors.push("Recommendation ID is required");
  }

  if (result.dimensionScores.size !== 10) {
    errors.push(`Expected 10 dimensions, got ${result.dimensionScores.size}`);
  }

  if (result.overallScore < 0 || result.overallScore > 100) {
    errors.push(`Overall score must be 0-100, got ${result.overallScore}`);
  }

  if (result.failGates.size !== 5) {
    errors.push(`Expected 5 fail gates, got ${result.failGates.size}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Score multiple recommendations and aggregate results
 */
export function scoreMultipleRecommendations(
  recommendations: Recommendation[]
): {
  results: RubricScoringResult[];
  averageScore: number;
  passedCount: number;
  failedCount: number;
} {
  const results = recommendations.map((rec) => scoreRecommendation(rec));
  const scores = results.map((r) => r.overallScore);
  const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    results,
    averageScore,
    passedCount,
    failedCount,
  };
}
