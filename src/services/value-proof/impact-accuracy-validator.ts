/**
 * Impact Accuracy Validator
 *
 * Validates prediction accuracy by comparing predicted vs actual outcomes.
 * Calculates accuracy scores based on confidence level and outcome delta.
 *
 * Accuracy formula: 100 - |confidence_gain - target_gain|
 * Where confidence_gain = actualConfidence - predictedConfidence
 * And target_gain = predicted confidence level (baseline expectation)
 */

export interface PredictionMetrics {
  predictedConfidence: number; // 0-100
  predictedSeverity: string; // low, medium, high, critical, existential
  predictedImpactLevel: string; // minor, moderate, significant, severe
}

export interface ActualOutcome {
  actualConfidence: number; // 0-100
  actualSeverity: string;
  actualImpactLevel: string;
  recordedAt: Date;
}

export interface AccuracyAssessment {
  predictedConfidence: number;
  actualConfidence: number;
  confidenceGain: number; // positive = improved, negative = degraded
  targetGain: number; // expected improvement based on predicted confidence
  accuracyScore: number; // 0-100
  accuracyStatus: "excellent" | "good" | "fair" | "poor";
  assessment: string;
}

export interface ImpactDelta {
  severityImproved: boolean;
  severityDelta: string; // description of change
  impactImproved: boolean;
  impactDelta: string;
}

/**
 * Severity ranking for comparison
 */
const SEVERITY_RANK: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  existential: 5,
};

/**
 * Impact level ranking
 */
const IMPACT_RANK: Record<string, number> = {
  minor: 1,
  moderate: 2,
  significant: 3,
  severe: 4,
};

/**
 * Validate impact accuracy by comparing predictions vs actuals
 */
export function validateImpactAccuracy(
  prediction: PredictionMetrics,
  outcome: ActualOutcome
): AccuracyAssessment {
  const confidenceGain = outcome.actualConfidence - prediction.predictedConfidence;

  // Target gain is based on predicted confidence:
  // High confidence predictions = high expectation of improvement
  // Low confidence predictions = lower expectation
  const targetGain = prediction.predictedConfidence * 0.1; // 10% improvement per 100 confidence

  // Accuracy score: how close actual gain is to target gain
  const delta = Math.abs(confidenceGain - targetGain);
  let accuracyScore = 100 - delta;

  // Floor at 0, ceiling at 100
  accuracyScore = Math.max(0, Math.min(100, accuracyScore));

  // Determine status
  let accuracyStatus: "excellent" | "good" | "fair" | "poor";
  if (accuracyScore >= 90) accuracyStatus = "excellent";
  else if (accuracyScore >= 75) accuracyStatus = "good";
  else if (accuracyScore >= 60) accuracyStatus = "fair";
  else accuracyStatus = "poor";

  // Generate assessment text
  const assessment = generateAccuracyAssessment(
    prediction.predictedConfidence,
    outcome.actualConfidence,
    confidenceGain,
    targetGain,
    accuracyScore
  );

  return {
    predictedConfidence: prediction.predictedConfidence,
    actualConfidence: outcome.actualConfidence,
    confidenceGain,
    targetGain,
    accuracyScore: Math.round(accuracyScore * 100) / 100,
    accuracyStatus,
    assessment,
  };
}

/**
 * Calculate impact delta between predicted and actual
 */
export function calculateImpactDelta(
  prediction: PredictionMetrics,
  outcome: ActualOutcome
): ImpactDelta {
  const predictedRank = SEVERITY_RANK[prediction.predictedSeverity.toLowerCase()] || 1;
  const actualRank = SEVERITY_RANK[outcome.actualSeverity.toLowerCase()] || 1;

  const impactPredicted = IMPACT_RANK[prediction.predictedImpactLevel.toLowerCase()] || 1;
  const impactActual = IMPACT_RANK[outcome.actualImpactLevel.toLowerCase()] || 1;

  const severityImproved = actualRank < predictedRank;
  const impactImproved = impactActual < impactPredicted;

  let severityDelta = "";
  if (severityImproved) {
    severityDelta = `${prediction.predictedSeverity} → ${outcome.actualSeverity} (improved)`;
  } else if (actualRank > predictedRank) {
    severityDelta = `${prediction.predictedSeverity} → ${outcome.actualSeverity} (degraded)`;
  } else {
    severityDelta = `${prediction.predictedSeverity} (unchanged)`;
  }

  let impactDelta = "";
  if (impactImproved) {
    impactDelta = `${prediction.predictedImpactLevel} → ${outcome.actualImpactLevel} (improved)`;
  } else if (impactActual > impactPredicted) {
    impactDelta = `${prediction.predictedImpactLevel} → ${outcome.actualImpactLevel} (degraded)`;
  } else {
    impactDelta = `${prediction.predictedImpactLevel} (unchanged)`;
  }

  return {
    severityImproved,
    severityDelta,
    impactImproved,
    impactDelta,
  };
}

/**
 * Generate human-readable accuracy assessment
 */
function generateAccuracyAssessment(
  predicted: number,
  actual: number,
  gained: number,
  target: number,
  score: number
): string {
  const improved = actual > predicted;
  const direction = improved ? "improved" : "degraded";
  const magnitude = Math.abs(gained);

  if (score >= 90) {
    return `Prediction was highly accurate. Confidence ${direction} by ${magnitude.toFixed(1)} (target: ${target.toFixed(1)}).`;
  } else if (score >= 75) {
    return `Prediction was accurate. Confidence ${direction} by ${magnitude.toFixed(1)} (target: ${target.toFixed(1)}).`;
  } else if (score >= 60) {
    return `Prediction was reasonably accurate. Confidence ${direction} by ${magnitude.toFixed(1)}, slightly ${improved ? "less" : "more"} than expected.`;
  } else {
    return `Prediction accuracy was low. Expected confidence gain of ${target.toFixed(1)}, but actual ${direction} was ${magnitude.toFixed(1)}.`;
  }
}

/**
 * Validate accuracy profile across multiple decisions
 */
export function aggregateAccuracyScores(
  assessments: AccuracyAssessment[]
): {
  averageScore: number;
  excellentCount: number;
  goodCount: number;
  fairCount: number;
  poorCount: number;
  successRate: number; // % with score >= 75
} {
  if (assessments.length === 0) {
    return {
      averageScore: 0,
      excellentCount: 0,
      goodCount: 0,
      fairCount: 0,
      poorCount: 0,
      successRate: 0,
    };
  }

  const average = assessments.reduce((sum, a) => sum + a.accuracyScore, 0) / assessments.length;

  const byStatus = {
    excellent: assessments.filter(a => a.accuracyStatus === "excellent").length,
    good: assessments.filter(a => a.accuracyStatus === "good").length,
    fair: assessments.filter(a => a.accuracyStatus === "fair").length,
    poor: assessments.filter(a => a.accuracyStatus === "poor").length,
  };

  const successCount = byStatus.excellent + byStatus.good;
  const successRate = (successCount / assessments.length) * 100;

  return {
    averageScore: Math.round(average * 100) / 100,
    excellentCount: byStatus.excellent,
    goodCount: byStatus.good,
    fairCount: byStatus.fair,
    poorCount: byStatus.poor,
    successRate: Math.round(successRate),
  };
}

/**
 * Determine if accuracy meets acceptance threshold
 * For high-confidence decisions, accuracy must be >= 85%
 * For medium-confidence decisions, accuracy must be >= 75%
 * For low-confidence decisions, accuracy must be >= 65%
 */
export function meetsAccuracyThreshold(
  assessment: AccuracyAssessment,
  confidenceThreshold: "high" | "medium" | "low" = "medium"
): boolean {
  const thresholds = {
    high: 85,
    medium: 75,
    low: 65,
  };

  return assessment.accuracyScore >= thresholds[confidenceThreshold];
}
