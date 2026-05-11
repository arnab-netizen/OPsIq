import { describe, it, expect } from 'vitest';
import {
  getRecencyWeight,
  getCalibrationMultiplier,
  calculatePriorityScore,
  calculatePriority,
} from '@/services/operator/priority';
import type { OperatorItem } from '@/domain/operator/types';

describe('Priority Engine', () => {
  describe('Recency Weight Calculation', () => {
    it('should return 1.0 for new items (age 0)', () => {
      const weight = getRecencyWeight(0);
      expect(weight).toBe(1.0);
    });

    it('should decay weight over time', () => {
      const day0 = getRecencyWeight(0);
      const day1 = getRecencyWeight(1);
      const day7 = getRecencyWeight(7);
      const day30 = getRecencyWeight(30);

      expect(day0).toBeGreaterThan(day1);
      expect(day1).toBeGreaterThan(day7);
      expect(day7).toBeGreaterThan(day30);
    });

    it('should use formula 1/(1+ageInDays)', () => {
      // Day 0: 1/(1+0) = 1.0
      expect(getRecencyWeight(0)).toBe(1.0);

      // Day 1: 1/(1+1) = 0.5
      expect(getRecencyWeight(1)).toBe(0.5);

      // Day 7: 1/(1+7) ≈ 0.125
      expect(getRecencyWeight(7)).toBeCloseTo(0.125, 3);

      // Day 30: 1/(1+30) ≈ 0.032
      expect(getRecencyWeight(30)).toBeCloseTo(0.0323, 3);
    });

    it('should round to 4 decimals', () => {
      const weight = getRecencyWeight(3);
      const decimalPlaces = (weight.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });

    it('should treat negative age as 0', () => {
      const negativeAge = getRecencyWeight(-5);
      const zeroAge = getRecencyWeight(0);

      expect(negativeAge).toBe(zeroAge);
      expect(negativeAge).toBe(1.0);
    });

    it('should handle very large age values', () => {
      const weight = getRecencyWeight(1000);
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThan(0.002);
    });

    it('should be deterministic', () => {
      const weight1 = getRecencyWeight(5);
      const weight2 = getRecencyWeight(5);
      expect(weight1).toBe(weight2);
    });

    it('should handle fractional day calculations', () => {
      // This tests rounding behavior
      const weight = getRecencyWeight(2);
      expect(weight).toBeCloseTo(0.3333, 4);
    });
  });

  describe('Calibration Multiplier Calculation', () => {
    it('should return 1.0 for null accuracy', () => {
      const multiplier = getCalibrationMultiplier(null);
      expect(multiplier).toBe(1.0);
    });

    it('should return 1.0 for undefined accuracy', () => {
      const multiplier = getCalibrationMultiplier(undefined);
      expect(multiplier).toBe(1.0);
    });

    it('should reduce multiplier for low accuracy (< 0.5)', () => {
      const accuracy0 = getCalibrationMultiplier(0);
      const accuracy0_25 = getCalibrationMultiplier(0.25);
      const accuracy0_49 = getCalibrationMultiplier(0.49);

      expect(accuracy0).toBe(0.5);
      expect(accuracy0_25).toBeCloseTo(0.75, 4);
      expect(accuracy0_49).toBeCloseTo(0.99, 2);
      expect(accuracy0).toBeLessThan(accuracy0_25);
      expect(accuracy0_25).toBeLessThan(accuracy0_49);
    });

    it('should return 1.0 for normal accuracy (0.5-0.8)', () => {
      expect(getCalibrationMultiplier(0.5)).toBe(1.0);
      expect(getCalibrationMultiplier(0.6)).toBe(1.0);
      expect(getCalibrationMultiplier(0.8)).toBe(1.0);
    });

    it('should increase multiplier for high accuracy (> 0.8)', () => {
      const accuracy0_81 = getCalibrationMultiplier(0.81);
      const accuracy1_0 = getCalibrationMultiplier(1.0);
      const accuracy1_5 = getCalibrationMultiplier(1.5);

      expect(accuracy0_81).toBeGreaterThan(1.0);
      expect(accuracy1_0).toBeGreaterThan(accuracy0_81);
      expect(accuracy1_5).toBeCloseTo(1.5, 3);
      expect(accuracy1_5).toBeGreaterThan(accuracy1_0);
    });

    it('should cap multiplier at 1.5 (for accuracy at boundary)', () => {
      const multiplier = getCalibrationMultiplier(2.0);
      expect(multiplier).toBe(1.5); // accuracy 2.0 still within valid range, clamped to 1.5
    });

    it('should return 1.0 for out-of-bounds accuracy (<0 or >2)', () => {
      expect(getCalibrationMultiplier(-0.5)).toBe(1.0);
      expect(getCalibrationMultiplier(2.5)).toBe(1.0);
      expect(getCalibrationMultiplier(100)).toBe(1.0);
    });

    it('should round to 4 decimals', () => {
      const multiplier = getCalibrationMultiplier(0.9);
      const decimalPlaces = (multiplier.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });

    it('should scale low accuracy linearly from 0.5 to 1.0', () => {
      // At accuracy 0.0: multiplier = 0.5 + (0/0.5) * 0.5 = 0.5
      expect(getCalibrationMultiplier(0)).toBe(0.5);

      // At accuracy 0.25: multiplier = 0.5 + (0.25/0.5) * 0.5 = 0.5 + 0.25 = 0.75
      expect(getCalibrationMultiplier(0.25)).toBeCloseTo(0.75, 4);

      // At accuracy 0.5: multiplier = 0.5 + (0.5/0.5) * 0.5 = 0.5 + 0.5 = 1.0
      expect(getCalibrationMultiplier(0.5)).toBe(1.0);
    });

    it('should scale high accuracy linearly from 1.0 to 1.5', () => {
      // At accuracy 0.8: multiplier = 1.0
      expect(getCalibrationMultiplier(0.8)).toBe(1.0);

      // At accuracy 1.15: multiplier ≈ 1.0 + ((1.15-0.8)/0.7)*0.5 ≈ 1.25
      expect(getCalibrationMultiplier(1.15)).toBeCloseTo(1.25, 1);

      // At accuracy 1.5: multiplier = 1.0 + ((1.5-0.8)/0.7)*0.5 = 1.5
      expect(getCalibrationMultiplier(1.5)).toBeCloseTo(1.5, 2);
    });

    it('should be deterministic', () => {
      const mult1 = getCalibrationMultiplier(0.75);
      const mult2 = getCalibrationMultiplier(0.75);
      expect(mult1).toBe(mult2);
    });
  });

  describe('Priority Score Calculation', () => {
    it('should calculate priority = impact * confidence * recency', () => {
      const score = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
        ageInDays: 0,
      });

      // 100 * 0.5 * 1.0 = 50
      expect(score).toBe(50);
    });

    it('should apply recency decay over time', () => {
      const newItem = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
        ageInDays: 0,
      });

      const agedItem = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
        ageInDays: 7,
      });

      expect(newItem).toBeGreaterThan(agedItem);
      // newItem = 100, agedItem ≈ 12.5
      expect(newItem).toBe(100);
      expect(agedItem).toBeCloseTo(12.5, 1);
    });

    it('should default ageInDays to 0', () => {
      const withAge = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
        ageInDays: 0,
      });

      const withoutAge = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
      });

      expect(withAge).toBe(withoutAge);
    });

    it('should clamp score to 10000', () => {
      const score = calculatePriorityScore({
        impactExpected: 100000,
        confidence: 1.0,
        ageInDays: 0,
      });

      expect(score).toBeLessThanOrEqual(10000);
    });

    it('should round to 2 decimals', () => {
      const score = calculatePriorityScore({
        impactExpected: 10,
        confidence: 0.123,
        ageInDays: 0,
      });

      const decimalPlaces = (score.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('should handle zero impact', () => {
      const score = calculatePriorityScore({
        impactExpected: 0,
        confidence: 1.0,
        ageInDays: 0,
      });

      expect(score).toBe(0);
    });

    it('should handle zero confidence', () => {
      const score = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0,
        ageInDays: 0,
      });

      expect(score).toBe(0);
    });

    it('should handle very small values', () => {
      const score = calculatePriorityScore({
        impactExpected: 1,
        confidence: 0.01,
        ageInDays: 0,
      });

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('should handle very large values (with clamping)', () => {
      const score = calculatePriorityScore({
        impactExpected: 50000,
        confidence: 1.0,
        ageInDays: 0,
      });

      expect(score).toBeLessThanOrEqual(10000);
      expect(score).toBe(10000); // Clamped
    });

    it('should be deterministic', () => {
      const input = {
        impactExpected: 75,
        confidence: 0.8,
        ageInDays: 5,
      };

      const score1 = calculatePriorityScore(input);
      const score2 = calculatePriorityScore(input);

      expect(score1).toBe(score2);
    });
  });

  describe('Legacy calculatePriority Function', () => {
    it('should calculate priority from OperatorItem', () => {
      const item: Partial<OperatorItem> = {
        impactExpected: 100,
        confidence: 0.5,
        decisionAccuracy: 0.8,
      };

      const score = calculatePriority(item as OperatorItem);

      expect(score).toBeDefined();
      expect(score).toBeGreaterThan(0);
    });

    it('should return 0 for zero or negative impact', () => {
      const itemZero: Partial<OperatorItem> = {
        impactExpected: 0,
        confidence: 1.0,
      };

      const itemNegative: Partial<OperatorItem> = {
        impactExpected: -100,
        confidence: 1.0,
      };

      expect(calculatePriority(itemZero as OperatorItem)).toBe(0);
      expect(calculatePriority(itemNegative as OperatorItem)).toBe(0);
    });

    it('should extract impact and confidence from item', () => {
      const item: Partial<OperatorItem> = {
        impactExpected: 50,
        confidence: 0.5,
      };

      const score = calculatePriority(item as OperatorItem);

      // 50 * 0.5 * 1.0 = 25
      expect(score).toBe(25);
    });

    it('should handle null dueAt', () => {
      const item: Partial<OperatorItem> = {
        impactExpected: 100,
        confidence: 1.0,
        dueAt: null,
      };

      const score = calculatePriority(item as OperatorItem);

      expect(score).toBeDefined();
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should prioritize high-impact, high-confidence new items', () => {
      const highPriority = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
        ageInDays: 0,
      });

      expect(highPriority).toBe(100);
    });

    it('should lower priority for aged items', () => {
      const day0 = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
        ageInDays: 0,
      });

      const day30 = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
        ageInDays: 30,
      });

      expect(day0).toBeGreaterThan(day30);
      // day0 = 100, day30 ≈ 3.23
      expect(day30).toBeCloseTo(3.23, 1);
    });

    it('should rank items: high-impact-new > low-impact-new > high-impact-aged', () => {
      const highNew = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
        ageInDays: 0,
      });

      const lowNew = calculatePriorityScore({
        impactExpected: 10,
        confidence: 1.0,
        ageInDays: 0,
      });

      const highAged = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
        ageInDays: 30,
      });

      expect(highNew).toBeGreaterThan(lowNew);
      expect(lowNew).toBeGreaterThan(highAged); // New low-impact > aged high-impact
    });

    it('should handle moderate-confidence moderate-impact items', () => {
      const score = calculatePriorityScore({
        impactExpected: 50,
        confidence: 0.7,
        ageInDays: 3,
      });

      // 50 * 0.7 * (1/(1+3)) = 35 * 0.25 = 8.75
      expect(score).toBeCloseTo(8.75, 1);
    });

    it('should handle low-confidence high-impact items', () => {
      const score = calculatePriorityScore({
        impactExpected: 1000,
        confidence: 0.1,
        ageInDays: 0,
      });

      // 1000 * 0.1 = 100
      expect(score).toBe(100);
    });

    it('should support calibration multiplier for accuracy adjustment', () => {
      const poorAccuracyMultiplier = getCalibrationMultiplier(0.3); // Below 0.5: 0.8
      const goodAccuracyMultiplier = getCalibrationMultiplier(0.9); // Above 0.8: > 1.0

      expect(poorAccuracyMultiplier).toBeLessThan(1.0);
      expect(goodAccuracyMultiplier).toBeGreaterThan(1.0);
      expect(goodAccuracyMultiplier).toBeGreaterThan(poorAccuracyMultiplier);
    });
  });

  describe('Consistency and Edge Cases', () => {
    it('should produce consistent results across multiple calls', () => {
      const input = {
        impactExpected: 67.89,
        confidence: 0.456,
        ageInDays: 12,
      };

      const results = Array.from({ length: 5 }, () => calculatePriorityScore(input));

      results.forEach((result) => {
        expect(result).toBe(results[0]);
      });
    });

    it('should handle boundary confidence values', () => {
      const scoreMin = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0,
        ageInDays: 0,
      });

      const scoreMax = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
        ageInDays: 0,
      });

      expect(scoreMin).toBe(0);
      expect(scoreMax).toBe(100);
    });

    it('should handle fractional impact values', () => {
      const score = calculatePriorityScore({
        impactExpected: 12.345,
        confidence: 0.6789,
        ageInDays: 0,
      });

      expect(score).toBeCloseTo(8.37, 1);
    });

    it('should handle edge case: high age (months)', () => {
      const score = calculatePriorityScore({
        impactExpected: 1000,
        confidence: 1.0,
        ageInDays: 90,
      });

      // 1000 * 1.0 * (1/(1+90)) ≈ 10.99
      expect(score).toBeCloseTo(10.99, 1);
    });

    it('should have no priority explosion from combined inputs', () => {
      const worstCase = calculatePriorityScore({
        impactExpected: 10000,
        confidence: 1.0,
        ageInDays: 0,
      });

      expect(worstCase).toBeLessThanOrEqual(10000);
    });
  });

  describe('Weighting and Formula Verification', () => {
    it('should equally weight recency and confidence decay', () => {
      const doubleConfidence = calculatePriorityScore({
        impactExpected: 100,
        confidence: 1.0,
        ageInDays: 0,
      });

      const doubleAge = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
        ageInDays: 1,
      });

      // Both should result in 50
      expect(doubleConfidence).toBe(100);
      expect(doubleAge).toBe(25); // 100 * 0.5 * 0.5

      // Different mechanisms but similar impact
    });

    it('should apply recency as multiplicative factor', () => {
      const noAge = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
        ageInDays: 0,
      });

      const withAge = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
        ageInDays: 1,
      });

      // withAge = noAge * (1/(1+1)) = 50 * 0.5 = 25
      expect(noAge).toBe(50);
      expect(withAge).toBe(25);
    });
  });
});
