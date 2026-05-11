import { describe, it, expect } from 'vitest';
import {
  DataQualityFactorSchema,
  HistoricalPerformanceSchema,
  TrustSignalSchema,
  TrustBenchmarkScoreSchema,
  BatchTrustAnalysisSchema,
  calculateDataQualityScore,
  calculateHistoricalAccuracyScore,
  calculateExecutionCertaintyScore,
  calculateOverallTrustScore,
  determineRecommendationStrength,
  determineRiskLevel,
  calculateConfidenceInterval,
  generateTrustBenchmarkScore,
  analyzeBatchTrustScores,
  generateMockDataQualityFactors,
  generateMockHistoricalPerformance,
  generateMockTrustSignals,
  generateMockTrustBenchmarkScore,
  generateMockBatchTrustScores,
  type DataQualityFactor,
  type HistoricalPerformance,
  type TrustSignal,
  type TrustBenchmarkScore,
} from '@/domain/trust-benchmarks/trust-engine';

describe('ADDENDUM F: Trust Benchmarks Engine', () => {
  describe('Data Quality Factor Schema', () => {
    it('should validate data quality factors', () => {
      const factors: DataQualityFactor = {
        completeness: 85,
        accuracy: 90,
        consistency: 80,
        freshness: 95,
        lineageClarity: 75,
      };

      const result = DataQualityFactorSchema.safeParse(factors);
      expect(result.success).toBe(true);
    });

    it('should enforce factor bounds 0-100', () => {
      const invalidFactors = {
        completeness: 150,
        accuracy: 90,
        consistency: 80,
        freshness: 95,
        lineageClarity: 75,
      };

      const result = DataQualityFactorSchema.safeParse(invalidFactors);
      expect(result.success).toBe(false);
    });
  });

  describe('Historical Performance Schema', () => {
    it('should validate historical performance', () => {
      const performance: HistoricalPerformance = {
        totalDecisions: 50,
        successfulDecisions: 40,
        averageOutcome: 1.2,
        outcomeVariance: 0.5,
        consistencyScore: 85,
      };

      const result = HistoricalPerformanceSchema.safeParse(performance);
      expect(result.success).toBe(true);
    });

    it('should allow zero decisions', () => {
      const performance: HistoricalPerformance = {
        totalDecisions: 0,
        successfulDecisions: 0,
        averageOutcome: 0,
        outcomeVariance: 0,
        consistencyScore: 50,
      };

      const result = HistoricalPerformanceSchema.safeParse(performance);
      expect(result.success).toBe(true);
    });
  });

  describe('Trust Signal Schema', () => {
    it('should validate trust signal', () => {
      const signal: TrustSignal = {
        signalType: 'positive',
        weight: 0.8,
        source: 'historical_data',
        evidence: 'Strong historical performance',
        timestamp: new Date(),
      };

      const result = TrustSignalSchema.safeParse(signal);
      expect(result.success).toBe(true);
    });

    it('should validate all signal types', () => {
      const types = ['positive', 'neutral', 'negative'] as const;

      for (const signalType of types) {
        const signal: TrustSignal = {
          signalType,
          weight: 0.5,
          source: 'test',
          timestamp: new Date(),
        };

        const result = TrustSignalSchema.safeParse(signal);
        expect(result.success).toBe(true);
      }
    });

    it('should enforce weight bounds 0-1', () => {
      const invalidSignal = {
        signalType: 'positive',
        weight: 1.5,
        source: 'test',
        timestamp: new Date(),
      };

      const result = TrustSignalSchema.safeParse(invalidSignal);
      expect(result.success).toBe(false);
    });
  });

  describe('Trust Benchmark Score Schema', () => {
    it('should validate trust benchmark score', () => {
      const score: TrustBenchmarkScore = {
        entityId: 'entity_1',
        entityType: 'decision',
        overallTrustScore: 85,
        dataQualityScore: 80,
        historicalAccuracyScore: 90,
        executionCertaintyScore: 85,
        recommendationStrength: 'high',
        riskLevel: 'low',
        confidenceInterval: { lower: 80, upper: 90 },
        trustSignals: [],
        calculatedAt: new Date(),
      };

      const result = TrustBenchmarkScoreSchema.safeParse(score);
      expect(result.success).toBe(true);
    });

    it('should validate all entity types', () => {
      const types = ['decision', 'recommendation', 'action', 'prediction'] as const;

      for (const entityType of types) {
        const score: TrustBenchmarkScore = {
          entityId: 'entity_1',
          entityType,
          overallTrustScore: 75,
          dataQualityScore: 75,
          historicalAccuracyScore: 75,
          executionCertaintyScore: 75,
          recommendationStrength: 'moderate',
          riskLevel: 'moderate',
          confidenceInterval: { lower: 70, upper: 80 },
          trustSignals: [],
          calculatedAt: new Date(),
        };

        const result = TrustBenchmarkScoreSchema.safeParse(score);
        expect(result.success).toBe(true);
      }
    });

    it('should validate all recommendation strengths', () => {
      const strengths = ['very_high', 'high', 'moderate', 'low', 'very_low'] as const;

      for (const strength of strengths) {
        const score: TrustBenchmarkScore = {
          entityId: 'entity_1',
          entityType: 'decision',
          overallTrustScore: 75,
          dataQualityScore: 75,
          historicalAccuracyScore: 75,
          executionCertaintyScore: 75,
          recommendationStrength: strength,
          riskLevel: 'moderate',
          confidenceInterval: { lower: 70, upper: 80 },
          trustSignals: [],
          calculatedAt: new Date(),
        };

        const result = TrustBenchmarkScoreSchema.safeParse(score);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Batch Trust Analysis Schema', () => {
    it('should validate batch trust analysis', () => {
      const analysis = {
        batchId: 'batch_1',
        entitiesAnalyzed: 10,
        averageTrustScore: 80,
        trustDistribution: {
          veryHigh: 3,
          high: 4,
          moderate: 2,
          low: 1,
          veryLow: 0,
        },
        riskSummary: {
          criticalCount: 0,
          highCount: 1,
          moderateCount: 3,
        },
        analysisTime: new Date(),
      };

      const result = BatchTrustAnalysisSchema.safeParse(analysis);
      expect(result.success).toBe(true);
    });
  });

  describe('Data Quality Score Calculation', () => {
    it('should calculate balanced data quality score', () => {
      const factors: DataQualityFactor = {
        completeness: 80,
        accuracy: 80,
        consistency: 80,
        freshness: 80,
        lineageClarity: 80,
      };

      const score = calculateDataQualityScore(factors);
      expect(score).toBe(80);
    });

    it('should weight accuracy higher', () => {
      const factors1: DataQualityFactor = {
        completeness: 100,
        accuracy: 50,
        consistency: 100,
        freshness: 100,
        lineageClarity: 100,
      };

      const factors2: DataQualityFactor = {
        completeness: 50,
        accuracy: 100,
        consistency: 100,
        freshness: 100,
        lineageClarity: 100,
      };

      const score1 = calculateDataQualityScore(factors1);
      const score2 = calculateDataQualityScore(factors2);

      expect(score2).toBeGreaterThan(score1);
    });
  });

  describe('Historical Accuracy Score Calculation', () => {
    it('should calculate score from success rate', () => {
      const performance: HistoricalPerformance = {
        totalDecisions: 100,
        successfulDecisions: 80,
        averageOutcome: 1.0,
        outcomeVariance: 5,
        consistencyScore: 75,
      };

      const score = calculateHistoricalAccuracyScore(performance);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return default score for no history', () => {
      const performance: HistoricalPerformance = {
        totalDecisions: 0,
        successfulDecisions: 0,
        averageOutcome: 0,
        outcomeVariance: 0,
        consistencyScore: 50,
      };

      const score = calculateHistoricalAccuracyScore(performance);
      expect(score).toBe(50);
    });

    it('should penalize high outcome variance', () => {
      const performance1: HistoricalPerformance = {
        totalDecisions: 100,
        successfulDecisions: 80,
        averageOutcome: 1.0,
        outcomeVariance: 5,
        consistencyScore: 80,
      };

      const performance2: HistoricalPerformance = {
        totalDecisions: 100,
        successfulDecisions: 80,
        averageOutcome: 1.0,
        outcomeVariance: 30,
        consistencyScore: 80,
      };

      const score1 = calculateHistoricalAccuracyScore(performance1);
      const score2 = calculateHistoricalAccuracyScore(performance2);

      expect(score1).toBeGreaterThan(score2);
    });
  });

  describe('Execution Certainty Score Calculation', () => {
    it('should calculate score from action certainty', () => {
      const score = calculateExecutionCertaintyScore(85, 0, 0);
      expect(score).toBe(85);
    });

    it('should penalize dependencies', () => {
      const score1 = calculateExecutionCertaintyScore(85, 0, 0);
      const score2 = calculateExecutionCertaintyScore(85, 5, 0);

      expect(score2).toBeLessThan(score1);
      expect(score2).toBe(85 - 5 * 2);
    });

    it('should penalize risk factors', () => {
      const score1 = calculateExecutionCertaintyScore(85, 0, 0);
      const score2 = calculateExecutionCertaintyScore(85, 0, 3);

      expect(score2).toBeLessThan(score1);
    });

    it('should not go below zero', () => {
      const score = calculateExecutionCertaintyScore(10, 10, 10);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Overall Trust Score Calculation', () => {
    it('should calculate weighted trust score', () => {
      const score = calculateOverallTrustScore(80, 80, 80);
      expect(score).toBe(80);
    });

    it('should apply positive trust signals', () => {
      const signals: TrustSignal[] = [
        {
          signalType: 'positive',
          weight: 0.5,
          source: 'test',
          timestamp: new Date(),
        },
      ];

      const score1 = calculateOverallTrustScore(80, 80, 80);
      const score2 = calculateOverallTrustScore(80, 80, 80, signals);

      expect(score2).toBeGreaterThan(score1);
    });

    it('should apply negative trust signals', () => {
      const signals: TrustSignal[] = [
        {
          signalType: 'negative',
          weight: 0.5,
          source: 'test',
          timestamp: new Date(),
        },
      ];

      const score1 = calculateOverallTrustScore(80, 80, 80);
      const score2 = calculateOverallTrustScore(80, 80, 80, signals);

      expect(score2).toBeLessThan(score1);
    });
  });

  describe('Recommendation Strength Determination', () => {
    it('should classify very high trust', () => {
      const strength = determineRecommendationStrength(90);
      expect(strength).toBe('very_high');
    });

    it('should classify high trust', () => {
      const strength = determineRecommendationStrength(75);
      expect(strength).toBe('high');
    });

    it('should classify moderate trust', () => {
      const strength = determineRecommendationStrength(60);
      expect(strength).toBe('moderate');
    });

    it('should classify low trust', () => {
      const strength = determineRecommendationStrength(35);
      expect(strength).toBe('low');
    });

    it('should classify very low trust', () => {
      const strength = determineRecommendationStrength(15);
      expect(strength).toBe('very_low');
    });
  });

  describe('Risk Level Determination', () => {
    it('should classify minimal risk', () => {
      const risk = determineRiskLevel(90);
      expect(risk).toBe('minimal');
    });

    it('should classify low risk', () => {
      const risk = determineRiskLevel(75);
      expect(risk).toBe('low');
    });

    it('should classify moderate risk', () => {
      const risk = determineRiskLevel(60);
      expect(risk).toBe('moderate');
    });

    it('should classify high risk', () => {
      const risk = determineRiskLevel(35);
      expect(risk).toBe('high');
    });

    it('should classify critical risk', () => {
      const risk = determineRiskLevel(15);
      expect(risk).toBe('critical');
    });
  });

  describe('Confidence Interval Calculation', () => {
    it('should calculate interval for large dataset', () => {
      const interval = calculateConfidenceInterval(80, 100);

      expect(interval.lower).toBeLessThanOrEqual(80);
      expect(interval.upper).toBeGreaterThanOrEqual(80);
    });

    it('should be wider for small datasets', () => {
      const interval1 = calculateConfidenceInterval(80, 10);
      const interval2 = calculateConfidenceInterval(80, 100);

      const range1 = interval1.upper - interval1.lower;
      const range2 = interval2.upper - interval2.lower;

      expect(range1).toBeGreaterThan(range2);
    });

    it('should bound results 0-100', () => {
      const interval1 = calculateConfidenceInterval(10, 5);
      const interval2 = calculateConfidenceInterval(95, 5);

      expect(interval1.lower).toBeGreaterThanOrEqual(0);
      expect(interval2.upper).toBeLessThanOrEqual(100);
    });
  });

  describe('Trust Benchmark Score Generation', () => {
    it('should generate complete trust score', () => {
      const score = generateMockTrustBenchmarkScore();

      expect(score.entityId).toBeDefined();
      expect(score.overallTrustScore).toBeGreaterThanOrEqual(0);
      expect(score.overallTrustScore).toBeLessThanOrEqual(100);
    });

    it('should validate generated score', () => {
      const score = generateMockTrustBenchmarkScore();
      const result = TrustBenchmarkScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });
  });

  describe('Batch Trust Analysis', () => {
    it('should analyze batch of scores', () => {
      const scores = generateMockBatchTrustScores(10);
      const analysis = analyzeBatchTrustScores(scores);

      expect(analysis.entitiesAnalyzed).toBe(10);
      expect(analysis.averageTrustScore).toBeGreaterThanOrEqual(0);
      expect(analysis.averageTrustScore).toBeLessThanOrEqual(100);
    });

    it('should handle empty batch', () => {
      const analysis = analyzeBatchTrustScores([]);

      expect(analysis.entitiesAnalyzed).toBe(0);
      expect(analysis.averageTrustScore).toBe(0);
    });

    it('should calculate trust distribution', () => {
      const scores = generateMockBatchTrustScores(20);
      const analysis = analyzeBatchTrustScores(scores);

      const total =
        analysis.trustDistribution.veryHigh +
        analysis.trustDistribution.high +
        analysis.trustDistribution.moderate +
        analysis.trustDistribution.low +
        analysis.trustDistribution.veryLow;

      expect(total).toBe(20);
    });

    it('should count risks', () => {
      const scores = generateMockBatchTrustScores(20);
      const analysis = analyzeBatchTrustScores(scores);

      expect(analysis.riskSummary.criticalCount).toBeGreaterThanOrEqual(0);
      expect(analysis.riskSummary.highCount).toBeGreaterThanOrEqual(0);
      expect(analysis.riskSummary.moderateCount).toBeGreaterThanOrEqual(0);
    });

    it('should validate analysis', () => {
      const scores = generateMockBatchTrustScores(10);
      const analysis = analyzeBatchTrustScores(scores);
      const result = BatchTrustAnalysisSchema.safeParse(analysis);

      expect(result.success).toBe(true);
    });
  });

  describe('Mock Data Consistency', () => {
    it('should generate consistent quality factors', () => {
      const factors1 = generateMockDataQualityFactors();
      const factors2 = generateMockDataQualityFactors();

      expect(factors1).toBeDefined();
      expect(factors2).toBeDefined();
    });

    it('should generate consistent performance data', () => {
      const perf1 = generateMockHistoricalPerformance();
      const perf2 = generateMockHistoricalPerformance();

      expect(perf1.totalDecisions).toBeGreaterThanOrEqual(0);
      expect(perf2.totalDecisions).toBeGreaterThanOrEqual(0);
    });

    it('should generate multiple benchmark scores', () => {
      const scores = generateMockBatchTrustScores(25);

      expect(scores).toHaveLength(25);
      for (const score of scores) {
        const result = TrustBenchmarkScoreSchema.safeParse(score);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Comprehensive Trust Coverage', () => {
    it('should provide end-to-end trust scoring', () => {
      const dataQuality = generateMockDataQualityFactors();
      const performance = generateMockHistoricalPerformance();
      const certainty = 80;
      const signals = generateMockTrustSignals();

      const score = generateTrustBenchmarkScore(
        'test_entity',
        'decision',
        dataQuality,
        performance,
        certainty,
        signals,
      );

      expect(score.overallTrustScore).toBeGreaterThanOrEqual(0);
      expect(score.dataQualityScore).toBeGreaterThanOrEqual(0);
      expect(score.historicalAccuracyScore).toBeGreaterThanOrEqual(0);
      expect(score.executionCertaintyScore).toBeGreaterThanOrEqual(0);
    });

    it('should align trust metrics', () => {
      const score = generateMockTrustBenchmarkScore();

      // Risk should align with trust score
      if (score.overallTrustScore > 85) {
        expect(['minimal', 'low']).toContain(score.riskLevel);
      }

      // Recommendation should align with trust score
      if (score.overallTrustScore > 85) {
        expect(['very_high', 'high']).toContain(score.recommendationStrength);
      }
    });

    it('should track all entity types', () => {
      const types: Array<TrustBenchmarkScore['entityType']> = ['decision', 'recommendation', 'action', 'prediction'];
      const scores = types.map((t) =>
        generateTrustBenchmarkScore(
          `entity_${t}`,
          t,
          generateMockDataQualityFactors(),
          generateMockHistoricalPerformance(),
          70,
        ),
      );

      expect(scores).toHaveLength(4);
      for (let i = 0; i < types.length; i++) {
        expect(scores[i]!.entityType).toBe(types[i]);
      }
    });
  });
});
