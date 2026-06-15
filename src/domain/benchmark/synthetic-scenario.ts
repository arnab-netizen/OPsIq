/**
 * B17-S1: Synthetic Business Scenario Simulator — Domain Model
 *
 * Represents synthetic business scenarios for testing diagnosis engine accuracy.
 * These are artificially constructed scenarios with known root causes,
 * expected recommendations, and failure conditions.
 *
 * Each scenario is fully deterministic and reproducible.
 */

export type ScenarioType =
  | "cash_crisis"
  | "high_revenue_low_profit"
  | "low_revenue_high_profit"
  | "bad_marketing_roi"
  | "high_churn"
  | "inventory_overstock"
  | "staff_productivity_problem"
  | "founder_blind_spot"
  | "debt_overload"
  | "seasonal_business"
  | "customer_concentration"
  | "fast_growth_negative_cash";

export interface BusinessMetrics {
  monthlyRevenue: number;
  costOfGoodsSold: number;
  operatingExpenses: number;
  cashOnHand: number;
  accountsReceivable: number;
  inventory: number;
  staffCount: number;
  customerCount: number;
  churnRate: number; // percentage
  averageOrderValue: number;
  marketingSpend: number;
  marketingGeneratedRevenue: number;
  monthNumber: number; // month of scenario (1-12)
}

export interface RiskFlag {
  riskType: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
}

export interface ExpectedOutcome {
  rootCauses: string[];
  recommendations: string[];
  riskFlags: RiskFlag[];
  acceptableAnswerRange: {
    minPrecision: number; // 0.0-1.0: % of recommendations that should be correct
    maxFalsePositives: number; // max number of incorrect recommendations
  };
}

export interface FailureCondition {
  type: string; // e.g., "missing_critical_risk", "hallucinated_cause"
  description: string;
  failsSlice: boolean; // if true, scenario fails completely on this condition
}

export interface ScenarioInput {
  scenarioId: string;
  type: ScenarioType;
  title: string;
  description: string;
  metrics: BusinessMetrics;
  industry: string;
  businessSize: "startup" | "small" | "medium" | "large";
  businessModel: string;
}

export interface SyntheticScenario {
  id: string; // scenario_<type>_<version>
  type: ScenarioType;
  title: string;
  description: string;
  version: number; // allows versioning of scenarios

  // Input data
  industryContext: string;
  businessModel: string;
  businessSize: "startup" | "small" | "medium" | "large";
  initialMetrics: BusinessMetrics;

  // Expected diagnosis
  expectedRootCauses: string[];
  causeDescription: string; // Narrative explanation of why these are the root causes

  // Expected recommendations
  expectedRecommendations: string[];
  recommendationDescription: string;

  // Expected risk detection
  expectedRiskFlags: RiskFlag[];
  riskFlagDescription: string;

  // Acceptance criteria
  acceptableAnswerRange: {
    minCauseAccuracy: number; // 0.0-1.0: what % of causes should be identified
    minRecommendationQuality: number; // 0.0-1.0: what % of recommendations should be actionable
    maxFalsePositives: number; // max causes/recommendations identified incorrectly
  };

  // Failure conditions (deterministic, not interpretive)
  failureConditions: FailureCondition[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface ScenarioRunResult {
  scenarioId: string;
  runId: string;
  identifiedCauses: string[];
  identifiedRecommendations: string[];
  identifiedRisks: RiskFlag[];
  confidenceScores: {
    cause: string;
    confidence: number;
  }[];

  // Scoring
  causeAccuracy: number; // 0.0-1.0: how many expected causes were identified
  recommendationQuality: number; // 0.0-1.0: how many recommendations are actionable
  falsePositives: number; // causes/risks incorrectly identified
  falseNegatives: number; // expected causes not identified

  // Pass/fail determination
  passed: boolean;
  failureReasons: string[];
  evidence: string[];

  // Metadata
  ranAt: Date;
  executionTimeMs: number;
}

/**
 * Validate that a synthetic scenario is well-formed
 */
export function validateSyntheticScenario(
  scenario: SyntheticScenario
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!scenario.id || !scenario.id.startsWith("scenario_")) {
    errors.push("Scenario ID must start with 'scenario_'");
  }

  if (!scenario.expectedRootCauses || scenario.expectedRootCauses.length === 0) {
    errors.push("Scenario must have at least one expected root cause");
  }

  if (!scenario.expectedRecommendations || scenario.expectedRecommendations.length === 0) {
    errors.push("Scenario must have at least one expected recommendation");
  }

  if (scenario.acceptableAnswerRange.minCauseAccuracy < 0 || scenario.acceptableAnswerRange.minCauseAccuracy > 1) {
    errors.push("minCauseAccuracy must be between 0 and 1");
  }

  if (scenario.acceptableAnswerRange.minRecommendationQuality < 0 || scenario.acceptableAnswerRange.minRecommendationQuality > 1) {
    errors.push("minRecommendationQuality must be between 0 and 1");
  }

  if (!scenario.failureConditions || scenario.failureConditions.length === 0) {
    errors.push("Scenario must have at least one failure condition");
  }

  // Validate initial metrics
  const metrics = scenario.initialMetrics;
  if (metrics.monthlyRevenue < 0) {
    errors.push("monthlyRevenue cannot be negative");
  }
  if (metrics.cashOnHand < 0) {
    errors.push("cashOnHand cannot be negative");
  }
  if (metrics.churnRate < 0 || metrics.churnRate > 100) {
    errors.push("churnRate must be between 0 and 100");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a scenario run passed all failure conditions
 * (Exported for testing and internal use)
 */
export function checkFailureConditions(
  scenario: SyntheticScenario,
  result: ScenarioRunResult
): {
  hasFatal: boolean;
  failedConditions: FailureCondition[];
  nonFatalViolations: FailureCondition[];
} {
  const failedConditions: FailureCondition[] = [];
  const nonFatalViolations: FailureCondition[] = [];

  for (const condition of scenario.failureConditions) {
    let violated = false;

    switch (condition.type) {
      case "missing_critical_risk":
        // Check if all expected risk flags were identified
        const expectedRiskTypes = new Set(scenario.expectedRiskFlags.map((r) => r.riskType));
        const identifiedRiskTypes = new Set(result.identifiedRisks.map((r) => r.riskType));
        violated = !Array.from(expectedRiskTypes).every((rt) => identifiedRiskTypes.has(rt));
        break;

      case "hallucinated_cause":
        // Check if false positives exceed threshold
        violated = result.falsePositives > 0;
        break;

      case "missing_primary_cause":
        // Check if the first (primary) expected cause was identified
        violated = !result.identifiedCauses.includes(scenario.expectedRootCauses[0]);
        break;

      case "poor_cause_accuracy":
        // Check if cause accuracy meets minimum
        violated = result.causeAccuracy < scenario.acceptableAnswerRange.minCauseAccuracy;
        break;

      case "poor_recommendation_quality":
        // Check if recommendation quality meets minimum
        violated = result.recommendationQuality < scenario.acceptableAnswerRange.minRecommendationQuality;
        break;

      case "too_many_false_positives":
        // Check if false positives exceed threshold
        violated = result.falsePositives > scenario.acceptableAnswerRange.maxFalsePositives;
        break;
    }

    if (violated) {
      if (condition.failsSlice) {
        failedConditions.push(condition);
      } else {
        nonFatalViolations.push(condition);
      }
    }
  }

  return {
    hasFatal: failedConditions.length > 0,
    failedConditions,
    nonFatalViolations,
  };
}

/**
 * Score a scenario run result
 */
export function scoreScenarioResult(
  scenario: SyntheticScenario,
  result: ScenarioRunResult
): number {
  // Base score: how well did we identify causes and recommendations
  let score = 0;

  // Cause accuracy (40% of score)
  score += result.causeAccuracy * 40;

  // Recommendation quality (40% of score)
  score += result.recommendationQuality * 40;

  // Risk flag detection (20% of score)
  const expectedRiskCount = scenario.expectedRiskFlags.length;
  const identifiedRiskTypes = new Set(result.identifiedRisks.map((r) => r.riskType));
  const expectedRiskTypes = new Set(scenario.expectedRiskFlags.map((r) => r.riskType));
  const identifiedExpectedRisks = Array.from(expectedRiskTypes).filter((rt) => identifiedRiskTypes.has(rt)).length;
  const riskAccuracy = expectedRiskCount > 0 ? identifiedExpectedRisks / expectedRiskCount : 0;
  score += riskAccuracy * 20;

  // Penalty for false positives
  score -= result.falsePositives * 5;

  return Math.max(0, Math.min(100, score));
}
