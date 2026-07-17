/**
 * ADDENDUM F Item 7: Decision Confidence Engine
 *
 * Calculates confidence scores for decision recommendations based on
 * data quality factors, historical accuracy, execution certainty, and
 * trust signals. Pure calculation logic with no persistence.
 *
 * Non-DB: Pure scoring algorithms with mock data (no database).
 * Ready for: Integration with decision recommendation scoring once database available.
 */

import { z } from 'zod';

// ============================================================================
// DECISION CONFIDENCE CONTRACTS
// ============================================================================

/** Data quality contribution to decision confidence */
export const DataQualityFactorSchema = z.object({
  completeness: z.number().min(0).max(100), // % of required fields present
  accuracy: z.number().min(0).max(100), // Confidence in data correctness
  consistency: z.number().min(0).max(100), // Value uniformity across sources
  freshness: z.number().min(0).max(100), // Recency of data
  sourceReliability: z.number().min(0).max(100), // Reliability of data source
});

export type DataQualityFactor = z.infer<typeof DataQualityFactorSchema>;

/** Historical decision accuracy tracking */
export const DecisionHistorySchema = z.object({
  totalDecisions: z.number().min(0),
  successfulDecisions: z.number().min(0),
  averageOutcome: z.number().min(0).max(100), // 0-100% success rate
  outcomeVariance: z.number().min(0), // Variance in outcomes
  consistencyScore: z.number().min(0).max(100), // Consistency of results
});

export type DecisionHistory = z.infer<typeof DecisionHistorySchema>;

/** Execution factors affecting decision certainty */
export const ExecutionFactorSchema = z.object({
  ownerCapability: z.number().min(0).max(100), // Owner's ability to execute
  dependencyCount: z.number().min(0), // Number of external dependencies
  riskFactors: z.number().min(0), // Number of identified risks
  executionTimelineRisk: z.number().min(0).max(100), // Risk from timeline pressure
  resourceAvailability: z.number().min(0).max(100), // % of required resources available
});

export type ExecutionFactor = z.infer<typeof ExecutionFactorSchema>;

/** Trust signal for confidence scoring */
export const ConfidenceSignalSchema = z.object({
  signalType: z.enum(['positive', 'neutral', 'negative']),
  weight: z.number().min(0).max(1),
  source: z.string(),
  evidence: z.string().optional(),
  timestamp: z.date(),
});

export type ConfidenceSignal = z.infer<typeof ConfidenceSignalSchema>;

/** Decision confidence assessment result */
export const DecisionConfidenceScoreSchema = z.object({
  decisionId: z.string(),
  dataQualityConfidence: z.number().min(0).max(100),
  historicalAccuracyConfidence: z.number().min(0).max(100),
  executionCertaintyScore: z.number().min(0).max(100),
  overallConfidence: z.number().min(0).max(100),
  confidenceLevel: z.enum(['very_high', 'high', 'moderate', 'low', 'very_low']),
  recommendationStrength: z.enum(['strong', 'moderate', 'weak']),
  riskLevel: z.enum(['minimal', 'low', 'moderate', 'high', 'critical']),
  confidenceInterval: z.object({
    lower: z.number().min(0).max(100),
    upper: z.number().min(0).max(100),
  }),
  keyRisks: z.array(z.string()),
  confidenceSignals: z.array(ConfidenceSignalSchema),
  calculatedAt: z.date(),
});

export type DecisionConfidenceScore = z.infer<typeof DecisionConfidenceScoreSchema>;

/** Batch confidence analysis */
export const BatchConfidenceAnalysisSchema = z.object({
  batchId: z.string(),
  decisionsAnalyzed: z.number(),
  averageConfidence: z.number().min(0).max(100),
  confidenceDistribution: z.object({
    veryHigh: z.number().min(0),
    high: z.number().min(0),
    moderate: z.number().min(0),
    low: z.number().min(0),
    veryLow: z.number().min(0),
  }),
  riskSummary: z.object({
    criticalCount: z.number().min(0),
    highCount: z.number().min(0),
    moderateCount: z.number().min(0),
  }),
  analysisTime: z.date(),
});

export type BatchConfidenceAnalysis = z.infer<typeof BatchConfidenceAnalysisSchema>;

// ============================================================================
// CONFIDENCE SCORING ALGORITHMS
// ============================================================================

/**
 * Calculate data quality confidence contribution
 */
export function calculateDataQualityConfidence(factors: DataQualityFactor): number {
  const weights = {
    completeness: 0.25,
    accuracy: 0.3,
    consistency: 0.2,
    freshness: 0.15,
    sourceReliability: 0.1,
  };

  const score =
    factors.completeness * weights.completeness +
    factors.accuracy * weights.accuracy +
    factors.consistency * weights.consistency +
    factors.freshness * weights.freshness +
    factors.sourceReliability * weights.sourceReliability;

  return Math.round(score);
}

/**
 * Calculate historical accuracy confidence
 */
export function calculateHistoricalAccuracyConfidence(history: DecisionHistory): number {
  if (history.totalDecisions === 0) {
    return 50; // Default for no history
  }

  const successRate = (history.successfulDecisions / history.totalDecisions) * 100;
  const outcomeConsistency = Math.max(0, 100 - history.outcomeVariance);

  const score = successRate * 0.5 + history.consistencyScore * 0.3 + outcomeConsistency * 0.2;

  return Math.round(score);
}

/**
 * Calculate execution certainty score
 */
export function calculateExecutionCertaintyScore(factors: ExecutionFactor): number {
  let score = factors.ownerCapability;

  // Reduce by dependency complexity (each dependency reduces by 2%, max 20%)
  score -= Math.min(factors.dependencyCount * 2, 20);

  // Reduce by risk factors (each risk reduces by 3%, max 25%)
  score -= Math.min(factors.riskFactors * 3, 25);

  // Apply timeline risk penalty
  score -= (factors.executionTimelineRisk / 100) * 15;

  // Apply resource availability boost
  score += (factors.resourceAvailability / 100) * 10;

  // Clamp to [0, 100]: ownerCapability (<=100) plus the resource-availability
  // boost (<=+10) can push the raw score above 100, which violates this score's
  // own schema (executionCertaintyScore <= 100). Mirror calculateOverallConfidence,
  // which already clamps both ends.
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Calculate overall decision confidence
 */
export function calculateOverallConfidence(
  dataQuality: number,
  historicalAccuracy: number,
  executionCertainty: number,
  signals: ConfidenceSignal[] = [],
): number {
  let score = dataQuality * 0.35 + historicalAccuracy * 0.35 + executionCertainty * 0.3;

  // Apply confidence signal adjustments
  let signalAdjustment = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    if (signal.signalType === 'positive') {
      signalAdjustment += 8 * signal.weight;
    } else if (signal.signalType === 'negative') {
      signalAdjustment -= 15 * signal.weight;
    }
    totalWeight += signal.weight;
  }

  if (totalWeight > 0) {
    score += signalAdjustment / totalWeight;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Determine confidence level based on score
 */
export function determineConfidenceLevel(score: number): DecisionConfidenceScore['confidenceLevel'] {
  if (score >= 85) return 'very_high';
  if (score >= 70) return 'high';
  if (score >= 50) return 'moderate';
  if (score >= 30) return 'low';
  return 'very_low';
}

/**
 * Determine recommendation strength based on confidence
 */
export function determineRecommendationStrength(
  score: number,
): DecisionConfidenceScore['recommendationStrength'] {
  if (score >= 75) return 'strong';
  if (score >= 50) return 'moderate';
  return 'weak';
}

/**
 * Determine risk level based on confidence
 */
export function determineRiskLevel(score: number): DecisionConfidenceScore['riskLevel'] {
  if (score >= 85) return 'minimal';
  if (score >= 70) return 'low';
  if (score >= 50) return 'moderate';
  if (score >= 30) return 'high';
  return 'critical';
}

/**
 * Identify key risks from execution factors
 */
export function identifyKeyRisks(factors: ExecutionFactor): string[] {
  const risks: string[] = [];

  if (factors.ownerCapability < 60) {
    risks.push('Owner capability below threshold');
  }

  if (factors.dependencyCount > 5) {
    risks.push(`High dependency count (${factors.dependencyCount} dependencies)`);
  }

  if (factors.riskFactors > 3) {
    risks.push(`Multiple identified risks (${factors.riskFactors} factors)`);
  }

  if (factors.executionTimelineRisk > 70) {
    risks.push('High timeline pressure');
  }

  if (factors.resourceAvailability < 60) {
    risks.push('Insufficient resources available');
  }

  return risks;
}

/**
 * Calculate confidence interval around score
 */
export function calculateConfidenceInterval(
  score: number,
  decisionCount: number,
): { lower: number; upper: number } {
  // Wider interval for smaller datasets
  const marginOfError = Math.max(5, Math.min(25, 100 / Math.sqrt(Math.max(1, decisionCount))));

  return {
    lower: Math.max(0, Math.round(score - marginOfError)),
    upper: Math.min(100, Math.round(score + marginOfError)),
  };
}

/**
 * Generate decision confidence score
 */
export function generateDecisionConfidenceScore(
  decisionId: string,
  dataQuality: DataQualityFactor,
  history: DecisionHistory,
  executionFactors: ExecutionFactor,
  signals: ConfidenceSignal[] = [],
): DecisionConfidenceScore {
  const dataQualityConfidence = calculateDataQualityConfidence(dataQuality);
  const historicalAccuracyConfidence = calculateHistoricalAccuracyConfidence(history);
  const executionCertaintyScore = calculateExecutionCertaintyScore(executionFactors);

  const overallConfidence = calculateOverallConfidence(
    dataQualityConfidence,
    historicalAccuracyConfidence,
    executionCertaintyScore,
    signals,
  );

  const confidenceLevel = determineConfidenceLevel(overallConfidence);
  const recommendationStrength = determineRecommendationStrength(overallConfidence);
  const riskLevel = determineRiskLevel(overallConfidence);
  const keyRisks = identifyKeyRisks(executionFactors);
  const confidenceInterval = calculateConfidenceInterval(overallConfidence, history.totalDecisions);

  return {
    decisionId,
    dataQualityConfidence,
    historicalAccuracyConfidence,
    executionCertaintyScore,
    overallConfidence,
    confidenceLevel,
    recommendationStrength,
    riskLevel,
    confidenceInterval,
    keyRisks,
    confidenceSignals: signals,
    calculatedAt: new Date(),
  };
}

/**
 * Analyze batch decision confidence scores
 */
export function analyzeBatchConfidenceScores(scores: DecisionConfidenceScore[]): BatchConfidenceAnalysis {
  if (scores.length === 0) {
    return {
      batchId: `batch_${Date.now()}`,
      decisionsAnalyzed: 0,
      averageConfidence: 0,
      confidenceDistribution: {
        veryHigh: 0,
        high: 0,
        moderate: 0,
        low: 0,
        veryLow: 0,
      },
      riskSummary: {
        criticalCount: 0,
        highCount: 0,
        moderateCount: 0,
      },
      analysisTime: new Date(),
    };
  }

  const averageConfidence = Math.round(
    scores.reduce((sum, s) => sum + s.overallConfidence, 0) / scores.length,
  );

  const distribution = {
    veryHigh: scores.filter((s) => s.overallConfidence >= 85).length,
    high: scores.filter((s) => s.overallConfidence >= 70 && s.overallConfidence < 85).length,
    moderate: scores.filter((s) => s.overallConfidence >= 50 && s.overallConfidence < 70).length,
    low: scores.filter((s) => s.overallConfidence >= 30 && s.overallConfidence < 50).length,
    veryLow: scores.filter((s) => s.overallConfidence < 30).length,
  };

  const riskSummary = {
    criticalCount: scores.filter((s) => s.riskLevel === 'critical').length,
    highCount: scores.filter((s) => s.riskLevel === 'high').length,
    moderateCount: scores.filter((s) => s.riskLevel === 'moderate').length,
  };

  return {
    batchId: `batch_${Date.now()}`,
    decisionsAnalyzed: scores.length,
    averageConfidence,
    confidenceDistribution: distribution,
    riskSummary,
    analysisTime: new Date(),
  };
}

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

/**
 * Generate mock data quality factors
 */
export function generateMockDataQualityFactors(): DataQualityFactor {
  return {
    completeness: 70 + Math.random() * 30,
    accuracy: 75 + Math.random() * 25,
    consistency: 65 + Math.random() * 35,
    freshness: 80 + Math.random() * 20,
    sourceReliability: 70 + Math.random() * 30,
  };
}

/**
 * Generate mock decision history
 */
export function generateMockDecisionHistory(): DecisionHistory {
  const totalDecisions = 20 + Math.floor(Math.random() * 80);
  const successfulDecisions = Math.floor(totalDecisions * (0.6 + Math.random() * 0.4));

  return {
    totalDecisions,
    successfulDecisions,
    averageOutcome: 60 + Math.random() * 40,
    outcomeVariance: 5 + Math.random() * 20,
    consistencyScore: 60 + Math.random() * 40,
  };
}

/**
 * Generate mock execution factors
 */
export function generateMockExecutionFactors(): ExecutionFactor {
  return {
    ownerCapability: 50 + Math.random() * 50,
    dependencyCount: Math.floor(Math.random() * 8),
    riskFactors: Math.floor(Math.random() * 5),
    executionTimelineRisk: Math.random() * 100,
    resourceAvailability: 60 + Math.random() * 40,
  };
}

/**
 * Generate mock confidence signals
 */
export function generateMockConfidenceSignals(count: number = 2): ConfidenceSignal[] {
  const signalTypes: Array<ConfidenceSignal['signalType']> = ['positive', 'neutral', 'negative'];
  const sources = ['peer_review', 'historical_success', 'expert_validation', 'market_validation', 'risk_assessment'];

  return Array.from({ length: count }, (_, i) => ({
    signalType: signalTypes[Math.floor(Math.random() * signalTypes.length)]!,
    weight: 0.3 + Math.random() * 0.7,
    source: sources[i % sources.length]!,
    evidence: `Signal evidence ${i + 1}`,
    timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
  }));
}

/**
 * Generate mock decision confidence score
 */
export function generateMockDecisionConfidenceScore(): DecisionConfidenceScore {
  return generateDecisionConfidenceScore(
    `decision_${Date.now()}`,
    generateMockDataQualityFactors(),
    generateMockDecisionHistory(),
    generateMockExecutionFactors(),
    generateMockConfidenceSignals(2),
  );
}

/**
 * Generate batch of decision confidence scores
 */
export function generateMockBatchConfidenceScores(count: number = 10): DecisionConfidenceScore[] {
  return Array.from({ length: count }, () => generateMockDecisionConfidenceScore());
}
