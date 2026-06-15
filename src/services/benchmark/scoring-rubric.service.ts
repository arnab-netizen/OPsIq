/**
 * B20-S1: Consultant-Grade Scoring Rubrics — Service
 *
 * Provides scoring implementation with example evaluations
 */

import type {
  Recommendation,
  RubricDimension,
  RubricScore,
  RubricScoringResult,
} from "@/domain/benchmark/scoring-rubric";
import {
  RUBRIC_DEFINITIONS,
  scoreRecommendation,
  scoreMultipleRecommendations,
  checkFailGates,
  validateScoringResult,
} from "@/domain/benchmark/scoring-rubric";

/**
 * Create sample recommendations for testing
 */

function createGoodRecommendation(): Recommendation {
  return {
    recommendationId: "rec_good_001",
    problem: "Cash flow crisis: profitability on paper but cash running low",
    rootCauses: [
      "Extended customer payment terms (45 days vs 15 days market standard)",
      "Excess working capital tied up in inventory",
    ],
    suggestedActions: [
      "Negotiate payment terms with top customers",
      "Implement daily cash forecasting",
      "Reduce discretionary spending by 20%",
      "Accelerate collections with early payment discount",
    ],
    confidence: 0.85,
    financial_impact: 500000, // $500K cash improvement estimated
    timelineWeeks: 12,
    evidenceCitations: [
      {
        source: "AR aging report",
        metric: "accounts_receivable",
        value: "$200K",
      },
      {
        source: "bank statement",
        metric: "cash_balance",
        value: "$45K",
      },
      {
        source: "inventory ledger",
        metric: "days_inventory",
        value: "45 days",
      },
    ],
    constraintsFit: [
      "Cannot lay off staff (already lean)",
      "Committed supplier contracts maintain",
    ],
    riskFlags: [
      "Customer relationship risk if payment terms tightened",
      "Inventory liquidation may damage product quality",
    ],
    verificationMetric: "Cash balance improvement to $250K within 90 days",
  };
}

function createPartialRecommendation(): Recommendation {
  return {
    recommendationId: "rec_partial_001",
    problem: "Margin collapse from 70% to 50%",
    rootCauses: [
      "Product mix shift toward lower-margin items",
      "Production efficiency declined",
    ],
    suggestedActions: [
      "Implement production efficiency improvements",
      "Reduce overhead by 17%",
    ],
    confidence: 0.65,
    financial_impact: 200000,
    timelineWeeks: 24,
    evidenceCitations: [
      {
        source: "P&L statement",
        metric: "gross_margin",
        value: "50%",
      },
    ],
    // Missing constraint fit
    riskFlags: ["Margin recovery may take 6 months"],
    verificationMetric: "Margin recovery to 62% target",
  };
}

function createWeakRecommendation(): Recommendation {
  return {
    recommendationId: "rec_weak_001",
    problem: "Sales declining",
    rootCauses: ["Sales team performance issue"],
    suggestedActions: ["Hire more sales reps", "Increase sales bonus"],
    confidence: 0.3,
    // No financial impact
    timelineWeeks: 8,
    evidenceCitations: [], // No evidence citations
    // No constraint checking
    riskFlags: [],
    // No verification metric
  };
}

function createHallucinatedRecommendation(): Recommendation {
  return {
    recommendationId: "rec_hallucinated_001",
    problem: "Business performance declining",
    rootCauses: [
      "Customer acquisition cost increased due to Google algorithm change",
    ],
    suggestedActions: [
      "Shift budget to Facebook Ads (higher ROAS)",
      "Implement AI-powered customer targeting",
    ],
    confidence: 0.8,
    financial_impact: 150000,
    timelineWeeks: 4,
    evidenceCitations: [
      {
        source: "internal analysis",
        metric: "CAC",
        value: "$150",
      },
    ],
    constraintsFit: ["Marketing budget available"],
    riskFlags: ["Unproven AI platform risk"],
    verificationMetric: "CAC reduction to $100 within 30 days",
  };
}

/**
 * Get all sample recommendations
 */
export function getAllSampleRecommendations(): Recommendation[] {
  return [
    createGoodRecommendation(),
    createPartialRecommendation(),
    createWeakRecommendation(),
    createHallucinatedRecommendation(),
  ];
}

/**
 * Get recommendation by ID
 */
export function getSampleRecommendation(
  recommendationId: string
): Recommendation | null {
  const all = getAllSampleRecommendations();
  return all.find((r) => r.recommendationId === recommendationId) || null;
}

/**
 * Score a recommendation with detailed rubric scoring
 */
export function scoreRecommendationWithRubric(
  recommendation: Recommendation
): RubricScoringResult {
  const result = scoreRecommendation(recommendation);

  // Validate result
  const validation = validateScoringResult(result);
  if (!validation.valid) {
    throw new Error(`Invalid scoring result: ${validation.errors.join("; ")}`);
  }

  return result;
}

/**
 * Score all sample recommendations and provide aggregated results
 */
export function scoreSampleRecommendations(): {
  recommendations: Array<{
    id: string;
    score: number;
    passed: boolean;
    failureReasons: string[];
  }>;
  averageScore: number;
  passedCount: number;
  failedCount: number;
} {
  const recommendations = getAllSampleRecommendations();
  const scoring = scoreMultipleRecommendations(recommendations);

  return {
    recommendations: scoring.results.map((result) => ({
      id: result.recommendationId,
      score: result.overallScore,
      passed: result.passed,
      failureReasons: result.failureReasons,
    })),
    averageScore: scoring.averageScore,
    passedCount: scoring.passedCount,
    failedCount: scoring.failedCount,
  };
}

/**
 * Get rubric definition for a dimension and score
 */
export function getRubricDefinition(
  dimension: RubricDimension,
  score: RubricScore
): string {
  const def = RUBRIC_DEFINITIONS[dimension];
  if (!def) {
    throw new Error(`Unknown dimension: ${dimension}`);
  }
  return def[score] || "Unknown score";
}

/**
 * Compare two recommendations by score
 */
export function compareRecommendations(
  recId1: string,
  recId2: string
): {
  rec1: RubricScoringResult | null;
  rec2: RubricScoringResult | null;
  winner: string | null;
  difference: number;
} {
  const rec1 = getSampleRecommendation(recId1);
  const rec2 = getSampleRecommendation(recId2);

  if (!rec1 || !rec2) {
    return {
      rec1: rec1 ? scoreRecommendationWithRubric(rec1) : null,
      rec2: rec2 ? scoreRecommendationWithRubric(rec2) : null,
      winner: null,
      difference: 0,
    };
  }

  const score1 = scoreRecommendationWithRubric(rec1);
  const score2 = scoreRecommendationWithRubric(rec2);
  const difference = Math.abs(score1.overallScore - score2.overallScore);
  const winner =
    score1.overallScore > score2.overallScore
      ? recId1
      : score1.overallScore < score2.overallScore
        ? recId2
        : null;

  return {
    rec1: score1,
    rec2: score2,
    winner,
    difference,
  };
}
