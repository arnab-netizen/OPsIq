/**
 * ADDENDUM F: Trust Benchmarks Engine
 *
 * Calculates trust scores and confidence metrics for decisions, recommendations, and actions
 * based on historical performance, data quality, and execution certainty.
 *
 * Non-DB: Pure scoring algorithms with mock data (no persistence).
 * Ready for: Integration with decision confidence scoring once database available.
 */

import { z } from 'zod';

// ============================================================================
// TRUST BENCHMARK CONTRACTS
// ============================================================================

/** Data quality factor */
export const DataQualityFactorSchema = z.object({
  completeness: z.number().min(0).max(100),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  freshness: z.number().min(0).max(100),
  lineageClarity: z.number().min(0).max(100),
});

export type DataQualityFactor = z.infer<typeof DataQualityFactorSchema>;

/** Historical performance */
export const HistoricalPerformanceSchema = z.object({
  totalDecisions: z.number().min(0),
  successfulDecisions: z.number().min(0),
  averageOutcome: z.number(),
  outcomeVariance: z.number().min(0),
  consistencyScore: z.number().min(0).max(100),
});

export type HistoricalPerformance = z.infer<typeof HistoricalPerformanceSchema>;

/** Trust signal */
export const TrustSignalSchema = z.object({
  signalType: z.enum(['positive', 'neutral', 'negative']),
  weight: z.number().min(0).max(1),
  source: z.string(),
  evidence: z.string().optional(),
  timestamp: z.date(),
});

export type TrustSignal = z.infer<typeof TrustSignalSchema>;

/** Trust benchmark score */
export const TrustBenchmarkScoreSchema = z.object({
  entityId: z.string(),
  entityType: z.enum(['decision', 'recommendation', 'action', 'prediction']),
  overallTrustScore: z.number().min(0).max(100),
  dataQualityScore: z.number().min(0).max(100),
  historicalAccuracyScore: z.number().min(0).max(100),
  executionCertaintyScore: z.number().min(0).max(100),
  recommendationStrength: z.enum(['very_high', 'high', 'moderate', 'low', 'very_low']),
  riskLevel: z.enum(['minimal', 'low', 'moderate', 'high', 'critical']),
  confidenceInterval: z.object({
    lower: z.number().min(0).max(100),
    upper: z.number().min(0).max(100),
  }),
  trustSignals: z.array(TrustSignalSchema),
  calculatedAt: z.date(),
});

export type TrustBenchmarkScore = z.infer<typeof TrustBenchmarkScoreSchema>;

/** Batch trust analysis */
export const BatchTrustAnalysisSchema = z.object({
  batchId: z.string(),
  entitiesAnalyzed: z.number(),
  averageTrustScore: z.number().min(0).max(100),
  trustDistribution: z.object({
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

export type BatchTrustAnalysis = z.infer<typeof BatchTrustAnalysisSchema>;

// ============================================================================
// TRUST SCORING ALGORITHMS
// ============================================================================

/**
 * Calculate data quality score
 */
export function calculateDataQualityScore(factors: DataQualityFactor): number {
  const weights = {
    completeness: 0.25,
    accuracy: 0.3,
    consistency: 0.2,
    freshness: 0.15,
    lineageClarity: 0.1,
  };

  const score =
    factors.completeness * weights.completeness +
    factors.accuracy * weights.accuracy +
    factors.consistency * weights.consistency +
    factors.freshness * weights.freshness +
    factors.lineageClarity * weights.lineageClarity;

  return Math.round(score);
}

/**
 * Calculate historical accuracy score
 */
export function calculateHistoricalAccuracyScore(performance: HistoricalPerformance): number {
  if (performance.totalDecisions === 0) {
    return 50; // Default for no history
  }

  const successRate = (performance.successfulDecisions / performance.totalDecisions) * 100;
  const outcomeConsistency = Math.max(0, 100 - performance.outcomeVariance);

  const score = successRate * 0.5 + performance.consistencyScore * 0.3 + outcomeConsistency * 0.2;

  return Math.round(score);
}

/**
 * Calculate execution certainty score
 */
export function calculateExecutionCertaintyScore(
  actionCertainty: number,
  dependencyCount: number,
  riskFactors: number,
): number {
  // Base is action certainty
  let score = actionCertainty;

  // Reduce by dependency complexity (each dependency reduces by 2%)
  score -= Math.min(dependencyCount * 2, 20);

  // Reduce by risk factors (each risk reduces by 5%)
  score -= Math.min(riskFactors * 5, 30);

  return Math.max(0, Math.round(score));
}

/**
 * Calculate overall trust score
 */
export function calculateOverallTrustScore(
  dataQuality: number,
  historicalAccuracy: number,
  executionCertainty: number,
  trustSignals: TrustSignal[] = [],
): number {
  let score = dataQuality * 0.3 + historicalAccuracy * 0.4 + executionCertainty * 0.3;

  // Apply trust signal adjustments
  let signalAdjustment = 0;
  let totalWeight = 0;

  for (const signal of trustSignals) {
    if (signal.signalType === 'positive') {
      signalAdjustment += 5 * signal.weight;
    } else if (signal.signalType === 'negative') {
      signalAdjustment -= 10 * signal.weight;
    }
    totalWeight += signal.weight;
  }

  if (totalWeight > 0) {
    score += signalAdjustment / totalWeight;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Determine recommendation strength based on trust score
 */
export function determineRecommendationStrength(
  trustScore: number,
): TrustBenchmarkScore['recommendationStrength'] {
  if (trustScore >= 85) return 'very_high';
  if (trustScore >= 70) return 'high';
  if (trustScore >= 50) return 'moderate';
  if (trustScore >= 30) return 'low';
  return 'very_low';
}

/**
 * Determine risk level based on trust score
 */
export function determineRiskLevel(trustScore: number): TrustBenchmarkScore['riskLevel'] {
  if (trustScore >= 85) return 'minimal';
  if (trustScore >= 70) return 'low';
  if (trustScore >= 50) return 'moderate';
  if (trustScore >= 30) return 'high';
  return 'critical';
}

/**
 * Calculate confidence interval around trust score
 */
export function calculateConfidenceInterval(
  trustScore: number,
  dataCount: number,
): { lower: number; upper: number } {
  // Wider interval for smaller datasets
  const marginOfError = Math.max(5, Math.min(20, 100 / Math.sqrt(Math.max(1, dataCount))));

  return {
    lower: Math.max(0, Math.round(trustScore - marginOfError)),
    upper: Math.min(100, Math.round(trustScore + marginOfError)),
  };
}

/**
 * Generate trust benchmark score
 */
export function generateTrustBenchmarkScore(
  entityId: string,
  entityType: TrustBenchmarkScore['entityType'],
  dataQuality: DataQualityFactor,
  historicalPerformance: HistoricalPerformance,
  actionCertainty: number,
  trustSignals: TrustSignal[] = [],
): TrustBenchmarkScore {
  const dataQualityScore = calculateDataQualityScore(dataQuality);
  const historicalAccuracyScore = calculateHistoricalAccuracyScore(historicalPerformance);
  const executionCertaintyScore = calculateExecutionCertaintyScore(actionCertainty, 0, 0);

  const overallScore = calculateOverallTrustScore(
    dataQualityScore,
    historicalAccuracyScore,
    executionCertaintyScore,
    trustSignals,
  );

  const recommendationStrength = determineRecommendationStrength(overallScore);
  const riskLevel = determineRiskLevel(overallScore);
  const confidenceInterval = calculateConfidenceInterval(overallScore, historicalPerformance.totalDecisions);

  return {
    entityId,
    entityType,
    overallTrustScore: overallScore,
    dataQualityScore,
    historicalAccuracyScore,
    executionCertaintyScore,
    recommendationStrength,
    riskLevel,
    confidenceInterval,
    trustSignals,
    calculatedAt: new Date(),
  };
}

/**
 * Analyze batch trust scores
 */
export function analyzeBatchTrustScores(scores: TrustBenchmarkScore[]): BatchTrustAnalysis {
  if (scores.length === 0) {
    return {
      batchId: `batch_${Date.now()}`,
      entitiesAnalyzed: 0,
      averageTrustScore: 0,
      trustDistribution: {
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

  const averageScore = Math.round(scores.reduce((sum, s) => sum + s.overallTrustScore, 0) / scores.length);

  const distribution = {
    veryHigh: scores.filter((s) => s.overallTrustScore >= 85).length,
    high: scores.filter((s) => s.overallTrustScore >= 70 && s.overallTrustScore < 85).length,
    moderate: scores.filter((s) => s.overallTrustScore >= 50 && s.overallTrustScore < 70).length,
    low: scores.filter((s) => s.overallTrustScore >= 30 && s.overallTrustScore < 50).length,
    veryLow: scores.filter((s) => s.overallTrustScore < 30).length,
  };

  const riskSummary = {
    criticalCount: scores.filter((s) => s.riskLevel === 'critical').length,
    highCount: scores.filter((s) => s.riskLevel === 'high').length,
    moderateCount: scores.filter((s) => s.riskLevel === 'moderate').length,
  };

  return {
    batchId: `batch_${Date.now()}`,
    entitiesAnalyzed: scores.length,
    averageTrustScore: averageScore,
    trustDistribution: distribution,
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
    consistency: 60 + Math.random() * 40,
    freshness: 80 + Math.random() * 20,
    lineageClarity: 65 + Math.random() * 35,
  };
}

/**
 * Generate mock historical performance
 */
export function generateMockHistoricalPerformance(): HistoricalPerformance {
  const totalDecisions = 20 + Math.floor(Math.random() * 80);
  const successfulDecisions = Math.floor(totalDecisions * (0.6 + Math.random() * 0.4));

  return {
    totalDecisions,
    successfulDecisions,
    averageOutcome: 0.5 + Math.random() * 1.5,
    outcomeVariance: 5 + Math.random() * 15,
    consistencyScore: 60 + Math.random() * 40,
  };
}

/**
 * Generate mock trust signals
 */
export function generateMockTrustSignals(count: number = 2): TrustSignal[] {
  const signalTypes: Array<TrustSignal['signalType']> = ['positive', 'neutral', 'negative'];
  const sources = ['historical_data', 'recent_validation', 'expert_review', 'peer_comparison', 'quality_metrics'];

  return Array.from({ length: count }, (_, i) => ({
    signalType: signalTypes[Math.floor(Math.random() * signalTypes.length)]!,
    weight: 0.3 + Math.random() * 0.7,
    source: sources[i % sources.length]!,
    evidence: `Signal evidence ${i + 1}`,
    timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
  }));
}

/**
 * Generate mock trust benchmark score
 */
export function generateMockTrustBenchmarkScore(
  entityType: TrustBenchmarkScore['entityType'] = 'decision',
): TrustBenchmarkScore {
  return generateTrustBenchmarkScore(
    `entity_${Date.now()}`,
    entityType,
    generateMockDataQualityFactors(),
    generateMockHistoricalPerformance(),
    60 + Math.random() * 40,
    generateMockTrustSignals(2),
  );
}

/**
 * Generate batch of trust benchmark scores
 */
export function generateMockBatchTrustScores(count: number = 10): TrustBenchmarkScore[] {
  const types: Array<TrustBenchmarkScore['entityType']> = ['decision', 'recommendation', 'action', 'prediction'];

  return Array.from({ length: count }, (_, i) =>
    generateMockTrustBenchmarkScore(types[i % types.length]!),
  );
}
