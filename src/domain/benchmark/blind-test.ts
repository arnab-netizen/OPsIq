/**
 * B19-S1: Blind Outcome Testing — Domain Model
 *
 * Represents a blind test case where:
 * - System is given visible business context (but not outcomes)
 * - System generates recommendation without seeing actual outcome
 * - Recommendation is compared against expert action and actual result
 * - Test proves system cannot leak or access hidden fields
 *
 * "Blind" means the outcome and expert action are NOT visible to diagnosis engine.
 */

export interface BlindTestContext {
  contextId: string;
  title: string;
  description: string;
  businessMetrics: Record<string, number | string>;
  evidence: string[];
  constraints: string[];
  // NOT included: actual outcome, expert action taken
}

export interface HiddenOutcome {
  outcomeId: string;
  timeframe: string; // e.g., "3 months after diagnosis"
  metricsChanged: {
    metric: string;
    beforeValue: string;
    afterValue: string;
    direction: "up" | "down" | "flat";
  }[];
  success: boolean; // did the situation improve?
  successMetrics: string[]; // which metrics improved
  failureMetrics: string[]; // which metrics worsened or stayed same
  rootCauseProbability: number; // 0.0-1.0: how likely was our diagnosis
}

export interface ExpertAction {
  actionId: string;
  description: string;
  rationale: string;
  expectedOutcome: string;
  confidenceLevel: number; // 0.0-1.0: expert's confidence in action
}

export interface SystemRecommendation {
  recommendationId: string;
  causes: string[];
  actions: string[];
  confidenceScore: number; // 0.0-1.0: system confidence
  reasoning: string;
}

export interface BlindTestResult {
  testId: string;
  contextId: string;
  systemRecommendation: SystemRecommendation;
  expertAction: ExpertAction; // revealed after system recommendation
  actualOutcome: HiddenOutcome; // revealed after system recommendation

  // Comparison metrics
  causesCorrect: number; // how many expert-identified causes did system get right?
  actionsAligned: number; // how many system actions align with expert action?
  outcomeAlignment: number; // 0.0-1.0: did system's recommendation lead toward actual outcome?

  // Scoring
  score: number; // 0-100: overall correctness
  passed: boolean; // did recommendation prove sound?
  failureReasons: string[];
  evidence: string[];

  // Metadata
  testedAt: Date;
  executionTimeMs: number;
}

/**
 * Validate that a blind test case is well-formed
 */
export function validateBlindTestContext(context: BlindTestContext): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!context.contextId || !context.contextId.startsWith("blind_")) {
    errors.push("Context ID must start with 'blind_'");
  }

  if (!context.businessMetrics || Object.keys(context.businessMetrics).length === 0) {
    errors.push("Context must have at least one business metric");
  }

  if (!context.evidence || context.evidence.length === 0) {
    errors.push("Context must have at least one evidence item");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate hidden outcome is well-formed
 */
export function validateHiddenOutcome(outcome: HiddenOutcome): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!outcome.outcomeId) {
    errors.push("Outcome ID is required");
  }

  if (!outcome.metricsChanged || outcome.metricsChanged.length === 0) {
    errors.push("Outcome must have at least one metric change");
  }

  if (outcome.rootCauseProbability < 0 || outcome.rootCauseProbability > 1) {
    errors.push("rootCauseProbability must be between 0 and 1");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check for hidden field leakage
 * Returns true if result contains hidden fields (indicates leakage)
 */
export function hasHiddenFieldLeakage(
  result: BlindTestResult,
  context: BlindTestContext
): boolean {
  // Check if system's recommendation mentions information not in context
  const contextText = JSON.stringify(context).toLowerCase();
  const recommendationText = JSON.stringify(result.systemRecommendation).toLowerCase();

  // This is a simple check; in production would be more sophisticated
  // Check for outcome-specific language
  const outcomeIndicators = [
    "improved",
    "worsened",
    "success",
    "failure",
    "3 months",
    "6 months",
    "outcome",
  ];

  for (const indicator of outcomeIndicators) {
    if (!contextText.includes(indicator) && recommendationText.includes(indicator)) {
      return true; // Potential leakage
    }
  }

  return false;
}

/**
 * Compare system recommendation to expert action
 */
export function compareRecommendationToExpert(
  systemRec: SystemRecommendation,
  expertAction: ExpertAction,
  actualOutcome: HiddenOutcome
): {
  causesCorrect: number;
  actionsAligned: number;
  outcomeAlignment: number;
} {
  // Parse expert action for cause/action mentions
  const expertActionText = expertAction.description.toLowerCase();
  const expertRationaleText = expertAction.rationale.toLowerCase();

  // Count how many system causes are mentioned in expert action
  let causesCorrect = 0;
  for (const cause of systemRec.causes) {
    if (
      expertActionText.includes(cause.toLowerCase()) ||
      expertRationaleText.includes(cause.toLowerCase())
    ) {
      causesCorrect++;
    }
  }

  // Count how many system actions align with expert action description
  let actionsAligned = 0;
  for (const action of systemRec.actions) {
    if (expertActionText.includes(action.toLowerCase())) {
      actionsAligned++;
    }
  }

  // Calculate outcome alignment (0-1): did the expert action lead to success?
  let outcomeAlignment = 0;
  if (actualOutcome.success) {
    // If actual outcome was successful, increase alignment
    // If expert's action was successful, system's alignment with expert is positive
    outcomeAlignment = expertAction.confidenceLevel * (actualOutcome.successMetrics.length / Math.max(1, actualOutcome.metricsChanged.length));
  } else {
    // If outcome wasn't successful but expert tried, partial credit for attempt
    outcomeAlignment = 0.3;
  }

  return {
    causesCorrect: Math.min(causesCorrect, systemRec.causes.length),
    actionsAligned: Math.min(actionsAligned, systemRec.actions.length),
    outcomeAlignment: Math.max(0, Math.min(1, outcomeAlignment)),
  };
}

/**
 * Score blind test result
 */
export function scoreBlindTestResult(
  result: BlindTestResult,
  hasLeakage: boolean
): number {
  if (hasLeakage) {
    return 0; // Automatic fail for hidden field leakage
  }

  let score = 0;

  // Causes correctness (30%)
  const causesRatio = result.systemRecommendation.causes.length > 0
    ? result.causesCorrect / result.systemRecommendation.causes.length
    : 0;
  score += causesRatio * 30;

  // Actions alignment (30%)
  const actionsRatio = result.systemRecommendation.actions.length > 0
    ? result.actionsAligned / result.systemRecommendation.actions.length
    : 0;
  score += actionsRatio * 30;

  // Outcome alignment (40%)
  score += result.outcomeAlignment * 40;

  return Math.max(0, Math.min(100, score));
}
