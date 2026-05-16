import { describe, it, expect } from 'vitest';
import {
  DataQualityFactorSchema,
  DecisionHistorySchema,
  ExecutionFactorSchema,
  ConfidenceSignalSchema,
  DecisionConfidenceScoreSchema,
  BatchConfidenceAnalysisSchema,
  calculateDataQualityConfidence,
  calculateHistoricalAccuracyConfidence,
  calculateExecutionCertaintyScore,
  calculateOverallConfidence,
  determineConfidenceLevel,
  determineRecommendationStrength,
  determineRiskLevel,
  identifyKeyRisks,
  calculateConfidenceInterval,
  generateDecisionConfidenceScore,
  analyzeBatchConfidenceScores,
  generateMockDataQualityFactors,
  generateMockDecisionHistory,
  generateMockExecutionFactors,
  generateMockConfidenceSignals,
  generateMockDecisionConfidenceScore,
  generateMockBatchConfidenceScores,
  type DataQualityFactor,
  type ExecutionFactor,
} from '@/domain/decision-confidence/confidence-engine';

describe('ADDENDUM F Item 7: Decision Confidence Engine', () => {
  describe('Data Quality Factor Schema', () => {
    it('should validate data quality factors', () => {
      const factors: DataQualityFactor = {
        completeness: 80,
        accuracy: 85,
        consistency: 75,
        freshness: 90,
        sourceReliability: 80,
      };

      const result = DataQualityFactorSchema.safeParse(factors);
      expect(result.success).toBe(true);
    });

    it('should enforce bounds on all factors', () => {
      const invalidFactors = {
        completeness: 150,
        accuracy: 85,
        consistency: 75,
        freshness: 90,
        sourceReliability: 80,
      };

      const result = DataQualityFactorSchema.safeParse(invalidFactors);
      expect(result.success).toBe(false);
    });

    it('should allow zero values', () => {
      const factors: DataQualityFactor = {
        completeness: 0,
        accuracy: 0,
        consistency: 0,
        freshness: 0,
        sourceReliability: 0,
      };

      const result = DataQualityFactorSchema.safeParse(factors);
      expect(result.success).toBe(true);
    });
  });

  describe('Decision History Schema', () => {
    it('should validate decision history', () => {
      const history = {
        totalDecisions: 100,
        successfulDecisions: 80,
        averageOutcome: 75,
        outcomeVariance: 10,
        consistencyScore: 85,
      };

      const result = DecisionHistorySchema.safeParse(history);
      expect(result.success).toBe(true);
    });

    it('should allow zero history (no prior decisions)', () => {
      const history = {
        totalDecisions: 0,
        successfulDecisions: 0,
        averageOutcome: 0,
        outcomeVariance: 0,
        consistencyScore: 0,
      };

      const result = DecisionHistorySchema.safeParse(history);
      expect(result.success).toBe(true);
    });
  });

  describe('Execution Factor Schema', () => {
    it('should validate execution factors', () => {
      const factors: ExecutionFactor = {
        ownerCapability: 80,
        dependencyCount: 3,
        riskFactors: 2,
        executionTimelineRisk: 40,
        resourceAvailability: 85,
      };

      const result = ExecutionFactorSchema.safeParse(factors);
      expect(result.success).toBe(true);
    });
  });

  describe('Confidence Signal Schema', () => {
    it('should validate confidence signals', () => {
      const signal = {
        signalType: 'positive' as const,
        weight: 0.8,
        source: 'peer_review',
        timestamp: new Date(),
      };

      const result = ConfidenceSignalSchema.safeParse(signal);
      expect(result.success).toBe(true);
    });

    it('should allow optional evidence', () => {
      const signal = {
        signalType: 'positive' as const,
        weight: 0.8,
        source: 'peer_review',
        evidence: 'Decision reviewed by expert',
        timestamp: new Date(),
      };

      const result = ConfidenceSignalSchema.safeParse(signal);
      expect(result.success).toBe(true);
    });
  });

  describe('Data Quality Confidence Calculation', () => {
    it('should calculate weighted data quality confidence', () => {
      const factors: DataQualityFactor = {
        completeness: 100,
        accuracy: 100,
        consistency: 100,
        freshness: 100,
        sourceReliability: 100,
      };

      const confidence = calculateDataQualityConfidence(factors);
      expect(confidence).toBe(100);
    });

    it('should weight accuracy and completeness higher', () => {
      const lowAccuracy: DataQualityFactor = {
        completeness: 100,
        accuracy: 50,
        consistency: 100,
        freshness: 100,
        sourceReliability: 100,
      };

      const lowCompleteness: DataQualityFactor = {
        completeness: 50,
        accuracy: 100,
        consistency: 100,
        freshness: 100,
        sourceReliability: 100,
      };

      const scoreA = calculateDataQualityConfidence(lowAccuracy);
      const scoreC = calculateDataQualityConfidence(lowCompleteness);

      // Accuracy weighted at 0.3, completeness at 0.25
      expect(scoreA).toBeLessThan(scoreC);
    });

    it('should handle zero factors', () => {
      const factors: DataQualityFactor = {
        completeness: 0,
        accuracy: 0,
        consistency: 0,
        freshness: 0,
        sourceReliability: 0,
      };

      const confidence = calculateDataQualityConfidence(factors);
      expect(confidence).toBe(0);
    });
  });

  describe('Historical Accuracy Confidence Calculation', () => {
    it('should return default for zero history', () => {
      const history = {
        totalDecisions: 0,
        successfulDecisions: 0,
        averageOutcome: 0,
        outcomeVariance: 0,
        consistencyScore: 0,
      };

      const confidence = calculateHistoricalAccuracyConfidence(history);
      expect(confidence).toBe(50);
    });

    it('should calculate high confidence for perfect history', () => {
      const history = {
        totalDecisions: 100,
        successfulDecisions: 100,
        averageOutcome: 100,
        outcomeVariance: 0,
        consistencyScore: 100,
      };

      const confidence = calculateHistoricalAccuracyConfidence(history);
      expect(confidence).toBeGreaterThan(80);
    });

    it('should calculate low confidence for poor history', () => {
      const history = {
        totalDecisions: 100,
        successfulDecisions: 20,
        averageOutcome: 20,
        outcomeVariance: 50,
        consistencyScore: 30,
      };

      const confidence = calculateHistoricalAccuracyConfidence(history);
      expect(confidence).toBeLessThan(50);
    });

    it('should incorporate variance penalty', () => {
      const highVariance = {
        totalDecisions: 100,
        successfulDecisions: 80,
        averageOutcome: 80,
        outcomeVariance: 50,
        consistencyScore: 80,
      };

      const lowVariance = {
        totalDecisions: 100,
        successfulDecisions: 80,
        averageOutcome: 80,
        outcomeVariance: 5,
        consistencyScore: 80,
      };

      const scoreHigh = calculateHistoricalAccuracyConfidence(highVariance);
      const scoreLow = calculateHistoricalAccuracyConfidence(lowVariance);

      expect(scoreHigh).toBeLessThan(scoreLow);
    });
  });

  describe('Execution Certainty Score Calculation', () => {
    it('should base score on owner capability', () => {
      const factors: ExecutionFactor = {
        ownerCapability: 80,
        dependencyCount: 0,
        riskFactors: 0,
        executionTimelineRisk: 0,
        resourceAvailability: 100,
      };

      const score = calculateExecutionCertaintyScore(factors);
      expect(score).toBe(90); // 80 + 10 (resource boost)
    });

    it('should reduce score for dependencies', () => {
      const factors: ExecutionFactor = {
        ownerCapability: 80,
        dependencyCount: 5,
        riskFactors: 0,
        executionTimelineRisk: 0,
        resourceAvailability: 100,
      };

      const score = calculateExecutionCertaintyScore(factors);
      expect(score).toBeLessThan(88);
    });

    it('should reduce score for risk factors', () => {
      const factors: ExecutionFactor = {
        ownerCapability: 80,
        dependencyCount: 0,
        riskFactors: 3,
        executionTimelineRisk: 0,
        resourceAvailability: 100,
      };

      const score = calculateExecutionCertaintyScore(factors);
      expect(score).toBeLessThan(88);
    });

    it('should apply timeline risk penalty', () => {
      const factors: ExecutionFactor = {
        ownerCapability: 80,
        dependencyCount: 0,
        riskFactors: 0,
        executionTimelineRisk: 100,
        resourceAvailability: 100,
      };

      const score = calculateExecutionCertaintyScore(factors);
      expect(score).toBeLessThan(88);
    });

    it('should not go below zero', () => {
      const factors: ExecutionFactor = {
        ownerCapability: 10,
        dependencyCount: 10,
        riskFactors: 10,
        executionTimelineRisk: 100,
        resourceAvailability: 0,
      };

      const score = calculateExecutionCertaintyScore(factors);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Overall Confidence Calculation', () => {
    it('should weight all three factors equally', () => {
      const confidence = calculateOverallConfidence(90, 90, 90, []);
      expect(confidence).toBe(90);
    });

    it('should be 35% data quality, 35% historical, 30% execution', () => {
      const confidence = calculateOverallConfidence(100, 100, 50, []);
      // 100*0.35 + 100*0.35 + 50*0.3 = 35 + 35 + 15 = 85
      expect(confidence).toBe(85);
    });

    it('should apply positive signals', () => {
      const baseConfidence = calculateOverallConfidence(70, 70, 70, []);
      const withPositiveSignal = calculateOverallConfidence(70, 70, 70, [
        {
          signalType: 'positive',
          weight: 1.0,
          source: 'test',
          timestamp: new Date(),
        },
      ]);

      expect(withPositiveSignal).toBeGreaterThan(baseConfidence);
    });

    it('should apply negative signals', () => {
      const baseConfidence = calculateOverallConfidence(70, 70, 70, []);
      const withNegativeSignal = calculateOverallConfidence(70, 70, 70, [
        {
          signalType: 'negative',
          weight: 1.0,
          source: 'test',
          timestamp: new Date(),
        },
      ]);

      expect(withNegativeSignal).toBeLessThan(baseConfidence);
    });

    it('should clamp between 0 and 100', () => {
      const low = calculateOverallConfidence(0, 0, 0, [
        { signalType: 'negative', weight: 1.0, source: 'test', timestamp: new Date() },
        { signalType: 'negative', weight: 1.0, source: 'test2', timestamp: new Date() },
      ]);
      expect(low).toBeGreaterThanOrEqual(0);

      const high = calculateOverallConfidence(100, 100, 100, [
        { signalType: 'positive', weight: 1.0, source: 'test', timestamp: new Date() },
        { signalType: 'positive', weight: 1.0, source: 'test2', timestamp: new Date() },
      ]);
      expect(high).toBeLessThanOrEqual(100);
    });
  });

  describe('Confidence Level Determination', () => {
    it('should assign very_high for 85+', () => {
      expect(determineConfidenceLevel(85)).toBe('very_high');
      expect(determineConfidenceLevel(100)).toBe('very_high');
    });

    it('should assign high for 70-84', () => {
      expect(determineConfidenceLevel(70)).toBe('high');
      expect(determineConfidenceLevel(84)).toBe('high');
    });

    it('should assign moderate for 50-69', () => {
      expect(determineConfidenceLevel(50)).toBe('moderate');
      expect(determineConfidenceLevel(69)).toBe('moderate');
    });

    it('should assign low for 30-49', () => {
      expect(determineConfidenceLevel(30)).toBe('low');
      expect(determineConfidenceLevel(49)).toBe('low');
    });

    it('should assign very_low for <30', () => {
      expect(determineConfidenceLevel(0)).toBe('very_low');
      expect(determineConfidenceLevel(29)).toBe('very_low');
    });
  });

  describe('Recommendation Strength Determination', () => {
    it('should assign strong for 75+', () => {
      expect(determineRecommendationStrength(75)).toBe('strong');
      expect(determineRecommendationStrength(100)).toBe('strong');
    });

    it('should assign moderate for 50-74', () => {
      expect(determineRecommendationStrength(50)).toBe('moderate');
      expect(determineRecommendationStrength(74)).toBe('moderate');
    });

    it('should assign weak for <50', () => {
      expect(determineRecommendationStrength(0)).toBe('weak');
      expect(determineRecommendationStrength(49)).toBe('weak');
    });
  });

  describe('Risk Level Determination', () => {
    it('should assign minimal for 85+', () => {
      expect(determineRiskLevel(85)).toBe('minimal');
      expect(determineRiskLevel(100)).toBe('minimal');
    });

    it('should assign low for 70-84', () => {
      expect(determineRiskLevel(70)).toBe('low');
      expect(determineRiskLevel(84)).toBe('low');
    });

    it('should assign moderate for 50-69', () => {
      expect(determineRiskLevel(50)).toBe('moderate');
      expect(determineRiskLevel(69)).toBe('moderate');
    });

    it('should assign high for 30-49', () => {
      expect(determineRiskLevel(30)).toBe('high');
      expect(determineRiskLevel(49)).toBe('high');
    });

    it('should assign critical for <30', () => {
      expect(determineRiskLevel(0)).toBe('critical');
      expect(determineRiskLevel(29)).toBe('critical');
    });
  });

  describe('Key Risk Identification', () => {
    it('should identify capability risk', () => {
      const factors: ExecutionFactor = {
        ownerCapability: 50,
        dependencyCount: 0,
        riskFactors: 0,
        executionTimelineRisk: 0,
        resourceAvailability: 100,
      };

      const risks = identifyKeyRisks(factors);
      expect(risks).toContain('Owner capability below threshold');
    });

    it('should identify dependency risks', () => {
      const factors: ExecutionFactor = {
        ownerCapability: 100,
        dependencyCount: 6,
        riskFactors: 0,
        executionTimelineRisk: 0,
        resourceAvailability: 100,
      };

      const risks = identifyKeyRisks(factors);
      expect(risks).toContain('High dependency count (6 dependencies)');
    });

    it('should identify multiple risks', () => {
      const factors: ExecutionFactor = {
        ownerCapability: 40,
        dependencyCount: 8,
        riskFactors: 5,
        executionTimelineRisk: 90,
        resourceAvailability: 30,
      };

      const risks = identifyKeyRisks(factors);
      expect(risks.length).toBeGreaterThan(2);
    });

    it('should return empty array when no risks', () => {
      const factors: ExecutionFactor = {
        ownerCapability: 90,
        dependencyCount: 2,
        riskFactors: 1,
        executionTimelineRisk: 30,
        resourceAvailability: 85,
      };

      const risks = identifyKeyRisks(factors);
      expect(risks.length).toBe(0);
    });
  });

  describe('Confidence Interval Calculation', () => {
    it('should provide wider interval for small datasets', () => {
      const interval1 = calculateConfidenceInterval(70, 1);
      const interval100 = calculateConfidenceInterval(70, 100);
      const interval1000 = calculateConfidenceInterval(70, 1000);

      // Margin for 1: max(5, min(25, 100)) = 25
      // Margin for 100: max(5, min(25, 10)) = 10
      // Margin for 1000: max(5, min(25, 3.16)) = 5
      expect(interval1.upper - interval1.lower).toBeGreaterThan(interval100.upper - interval100.lower);
      expect(interval100.upper - interval100.lower).toBeGreaterThan(interval1000.upper - interval1000.lower);
    });

    it('should center interval around score', () => {
      const interval = calculateConfidenceInterval(70, 30);
      expect(interval.lower).toBeLessThan(70);
      expect(interval.upper).toBeGreaterThan(70);
    });

    it('should not exceed bounds', () => {
      const intervalLow = calculateConfidenceInterval(5, 10);
      const intervalHigh = calculateConfidenceInterval(95, 10);

      expect(intervalLow.lower).toBeGreaterThanOrEqual(0);
      expect(intervalHigh.upper).toBeLessThanOrEqual(100);
    });
  });

  describe('Decision Confidence Score Generation', () => {
    it('should generate complete confidence score', () => {
      const score = generateDecisionConfidenceScore(
        'decision_1',
        generateMockDataQualityFactors(),
        generateMockDecisionHistory(),
        generateMockExecutionFactors(),
      );

      const validation = DecisionConfidenceScoreSchema.safeParse(score);
      expect(validation.success).toBe(true);
    });

    it('should include all components', () => {
      const score = generateDecisionConfidenceScore(
        'decision_1',
        generateMockDataQualityFactors(),
        generateMockDecisionHistory(),
        generateMockExecutionFactors(),
      );

      expect(score.decisionId).toBe('decision_1');
      expect(score.dataQualityConfidence).toBeGreaterThanOrEqual(0);
      expect(score.historicalAccuracyConfidence).toBeGreaterThanOrEqual(0);
      expect(score.executionCertaintyScore).toBeGreaterThanOrEqual(0);
      expect(score.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(score.confidenceLevel).toBeDefined();
      expect(score.recommendationStrength).toBeDefined();
      expect(score.riskLevel).toBeDefined();
      expect(score.confidenceInterval).toBeDefined();
      expect(Array.isArray(score.keyRisks)).toBe(true);
    });
  });

  describe('Batch Confidence Analysis', () => {
    it('should analyze empty batch', () => {
      const analysis = analyzeBatchConfidenceScores([]);
      const validation = BatchConfidenceAnalysisSchema.safeParse(analysis);

      expect(validation.success).toBe(true);
      expect(analysis.decisionsAnalyzed).toBe(0);
      expect(analysis.averageConfidence).toBe(0);
    });

    it('should calculate average confidence', () => {
      const scores = [
        generateDecisionConfidenceScore(
          'decision_1',
          { completeness: 100, accuracy: 100, consistency: 100, freshness: 100, sourceReliability: 100 },
          { totalDecisions: 100, successfulDecisions: 100, averageOutcome: 100, outcomeVariance: 0, consistencyScore: 100 },
          { ownerCapability: 100, dependencyCount: 0, riskFactors: 0, executionTimelineRisk: 0, resourceAvailability: 100 },
        ),
        generateDecisionConfidenceScore(
          'decision_2',
          { completeness: 50, accuracy: 50, consistency: 50, freshness: 50, sourceReliability: 50 },
          { totalDecisions: 10, successfulDecisions: 5, averageOutcome: 50, outcomeVariance: 25, consistencyScore: 50 },
          { ownerCapability: 50, dependencyCount: 5, riskFactors: 3, executionTimelineRisk: 50, resourceAvailability: 50 },
        ),
      ];

      const analysis = analyzeBatchConfidenceScores(scores);
      expect(analysis.decisionsAnalyzed).toBe(2);
      expect(analysis.averageConfidence).toBeGreaterThan(0);
      expect(analysis.averageConfidence).toBeLessThanOrEqual(100);
    });

    it('should distribute confidence levels correctly', () => {
      const scores = generateMockBatchConfidenceScores(20);
      const analysis = analyzeBatchConfidenceScores(scores);

      const totalDistribution =
        analysis.confidenceDistribution.veryHigh +
        analysis.confidenceDistribution.high +
        analysis.confidenceDistribution.moderate +
        analysis.confidenceDistribution.low +
        analysis.confidenceDistribution.veryLow;

      expect(totalDistribution).toBe(20);
    });

    it('should summarize risks', () => {
      const scores = generateMockBatchConfidenceScores(20);
      const analysis = analyzeBatchConfidenceScores(scores);

      expect(analysis.riskSummary.criticalCount).toBeGreaterThanOrEqual(0);
      expect(analysis.riskSummary.highCount).toBeGreaterThanOrEqual(0);
      expect(analysis.riskSummary.moderateCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Mock Data Generators', () => {
    it('should generate valid data quality factors', () => {
      const factors = generateMockDataQualityFactors();
      const validation = DataQualityFactorSchema.safeParse(factors);
      expect(validation.success).toBe(true);
    });

    it('should generate valid decision history', () => {
      const history = generateMockDecisionHistory();
      const validation = DecisionHistorySchema.safeParse(history);
      expect(validation.success).toBe(true);
    });

    it('should generate valid execution factors', () => {
      const factors = generateMockExecutionFactors();
      const validation = ExecutionFactorSchema.safeParse(factors);
      expect(validation.success).toBe(true);
    });

    it('should generate valid confidence signals', () => {
      const signals = generateMockConfidenceSignals(3);
      expect(signals.length).toBe(3);
      signals.forEach((signal) => {
        const validation = ConfidenceSignalSchema.safeParse(signal);
        expect(validation.success).toBe(true);
      });
    });

    it('should generate varied mock scores', () => {
      const scores = Array.from({ length: 10 }, () => generateMockDecisionConfidenceScore());
      const confidences = scores.map((s) => s.overallConfidence);
      const uniqueValues = new Set(confidences);

      expect(uniqueValues.size).toBeGreaterThan(1);
    });

    it('should generate batch with correct count', () => {
      const batch = generateMockBatchConfidenceScores(15);
      expect(batch.length).toBe(15);
    });
  });

  describe('Comprehensive Integration', () => {
    it('should execute full decision confidence workflow', () => {
      const score = generateDecisionConfidenceScore(
        'decision_test_1',
        generateMockDataQualityFactors(),
        generateMockDecisionHistory(),
        generateMockExecutionFactors(),
        generateMockConfidenceSignals(2),
      );

      expect(score.decisionId).toBe('decision_test_1');
      expect(score.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(score.overallConfidence).toBeLessThanOrEqual(100);

      // Verify consistency with confidence level
      if (score.overallConfidence >= 85) {
        expect(score.confidenceLevel).toBe('very_high');
      }

      // Verify schema validation
      const validation = DecisionConfidenceScoreSchema.safeParse(score);
      expect(validation.success).toBe(true);
    });

    it('should handle large batch analysis', () => {
      const batch = generateMockBatchConfidenceScores(100);
      const analysis = analyzeBatchConfidenceScores(batch);

      const validation = BatchConfidenceAnalysisSchema.safeParse(analysis);
      expect(validation.success).toBe(true);
      expect(analysis.decisionsAnalyzed).toBe(100);
    });

    it('should maintain confidence bounds across all scenarios', () => {
      // Test extreme scenarios
      const scenarios = [
        // Perfect data, perfect history, perfect execution
        generateDecisionConfidenceScore(
          'd1',
          { completeness: 100, accuracy: 100, consistency: 100, freshness: 100, sourceReliability: 100 },
          { totalDecisions: 1000, successfulDecisions: 1000, averageOutcome: 100, outcomeVariance: 0, consistencyScore: 100 },
          { ownerCapability: 100, dependencyCount: 0, riskFactors: 0, executionTimelineRisk: 0, resourceAvailability: 100 },
        ),
        // Poor data, poor history, poor execution
        generateDecisionConfidenceScore(
          'd2',
          { completeness: 0, accuracy: 0, consistency: 0, freshness: 0, sourceReliability: 0 },
          { totalDecisions: 100, successfulDecisions: 10, averageOutcome: 10, outcomeVariance: 90, consistencyScore: 0 },
          { ownerCapability: 10, dependencyCount: 10, riskFactors: 10, executionTimelineRisk: 100, resourceAvailability: 0 },
        ),
      ];

      scenarios.forEach((score) => {
        expect(score.overallConfidence).toBeGreaterThanOrEqual(0);
        expect(score.overallConfidence).toBeLessThanOrEqual(100);
      });
    });
  });
});
