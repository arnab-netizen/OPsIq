import { describe, it, expect } from 'vitest';
import {
  normalizeFinancialImpact,
  type FinancialImpactNormalized,
} from '@/services/financial-normalization/financial-normalization.service';

describe('Financial Normalization Engine', () => {
  describe('Basic Functionality', () => {
    it('should normalize financial impact with full data', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: 1000000,
      });

      expect(result).toBeDefined();
      expect(result.revenueAtRiskPct).toBe(10);
      expect(result.monthlyImpact).toBe(33333.33);
      expect(result.marginImpactPct).toBe(6);
      expect(result.burnRateImpact).toBe(13333.33);
      expect(result.normalizedLevel).toBe('medium'); // 10% is >= 5%, so medium
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('should return structured FinancialImpactNormalized object', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 50000,
        revenue: 500000,
      });

      expect(result).toHaveProperty('revenueAtRiskPct');
      expect(result).toHaveProperty('monthlyImpact');
      expect(result).toHaveProperty('marginImpactPct');
      expect(result).toHaveProperty('burnRateImpact');
      expect(result).toHaveProperty('normalizedLevel');
      expect(result).toHaveProperty('reasons');
      expect(Array.isArray(result.reasons)).toBe(true);
    });
  });

  describe('Missing or Invalid Estimated Loss', () => {
    it('should handle undefined estimated loss', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: undefined,
        revenue: 1000000,
      });

      expect(result.revenueAtRiskPct).toBeNull();
      expect(result.monthlyImpact).toBeNull();
      expect(result.marginImpactPct).toBeNull();
      expect(result.burnRateImpact).toBeNull();
      expect(result.normalizedLevel).toBe('unknown');
      expect(result.reasons).toContain('Estimated loss unavailable');
    });

    it('should handle null estimated loss', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: null,
        revenue: 1000000,
      });

      expect(result.normalizedLevel).toBe('unknown');
      expect(result.revenueAtRiskPct).toBeNull();
    });

    it('should handle zero estimated loss', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 0,
        revenue: 1000000,
      });

      expect(result.normalizedLevel).toBe('unknown');
      expect(result.revenueAtRiskPct).toBeNull();
    });

    it('should handle negative estimated loss', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: -50000,
        revenue: 1000000,
      });

      expect(result.normalizedLevel).toBe('unknown');
      expect(result.revenueAtRiskPct).toBeNull();
    });
  });

  describe('Missing or Invalid Revenue', () => {
    it('should handle undefined revenue', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: undefined,
      });

      expect(result.revenueAtRiskPct).toBeNull();
      expect(result.marginImpactPct).toBeNull();
      expect(result.monthlyImpact).toBeDefined();
      expect(result.monthlyImpact).not.toBeNull();
      expect(result.burnRateImpact).toBeDefined();
      expect(result.normalizedLevel).toBe('unknown');
      expect(result.reasons).toContain('Revenue unavailable; percentage impact cannot be normalized');
    });

    it('should handle null revenue', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: null,
      });

      expect(result.revenueAtRiskPct).toBeNull();
      expect(result.normalizedLevel).toBe('unknown');
    });

    it('should handle zero revenue', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: 0,
      });

      expect(result.revenueAtRiskPct).toBeNull();
      expect(result.normalizedLevel).toBe('unknown');
    });

    it('should handle negative revenue', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: -1000000,
      });

      expect(result.revenueAtRiskPct).toBeNull();
      expect(result.normalizedLevel).toBe('unknown');
    });
  });

  describe('Monthly Impact Calculation', () => {
    it('should calculate monthly impact as estimatedLoss / 3', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 300000,
        revenue: 1000000,
      });

      expect(result.monthlyImpact).toBe(100000);
    });

    it('should round monthly impact to 2 decimals', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: 1000000,
      });

      expect(result.monthlyImpact).toBe(33333.33);
    });

    it('should calculate monthly impact even without revenue', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 150000,
        revenue: undefined,
      });

      expect(result.monthlyImpact).toBe(50000);
    });

    it('should handle small loss amounts', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100,
        revenue: 1000000,
      });

      expect(result.monthlyImpact).toBe(33.33);
    });

    it('should handle very large loss amounts', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 1000000000,
        revenue: 2000000000,
      });

      expect(result.monthlyImpact).toBe(333333333.33);
    });
  });

  describe('Revenue at Risk Calculation', () => {
    it('should calculate revenue at risk percentage correctly', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: 1000000,
      });

      expect(result.revenueAtRiskPct).toBe(10);
    });

    it('should round revenue at risk to 2 decimals', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 33333,
        revenue: 1000000,
      });

      expect(result.revenueAtRiskPct).toBe(3.33);
    });

    it('should handle small percentages', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 1000,
        revenue: 1000000,
      });

      expect(result.revenueAtRiskPct).toBe(0.1);
    });

    it('should handle large percentages', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 500000,
        revenue: 1000000,
      });

      expect(result.revenueAtRiskPct).toBe(50);
    });
  });

  describe('Margin Impact Calculation', () => {
    it('should calculate margin impact as 60% of revenue at risk', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: 1000000,
      });

      // 10% * 0.6 = 6%
      expect(result.marginImpactPct).toBe(6);
    });

    it('should round margin impact to 2 decimals', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 1,
        revenue: 1000,
      });

      expect(typeof result.marginImpactPct).toBe('number');
      // Should be rounded to 2 decimals
    });

    it('should be null when revenue is missing', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: undefined,
      });

      expect(result.marginImpactPct).toBeNull();
    });
  });

  describe('Burn Rate Impact Calculation', () => {
    it('should calculate burn rate impact as 40% of monthly impact', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: 1000000,
      });

      // Monthly impact = 33333.33
      // Burn rate = 33333.33 * 0.4 = 13333.33
      expect(result.burnRateImpact).toBe(13333.33);
    });

    it('should calculate burn rate impact even without revenue', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: undefined,
      });

      expect(result.burnRateImpact).not.toBeNull();
      // Without revenue, burnRate = monthlyImpact * 0.5 = 33333.33 * 0.5 = 16666.67
      expect(result.burnRateImpact).toBe(16666.67);
    });

    it('should round burn rate impact to 2 decimals', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: undefined,
      });

      const decimalPlaces = (result.burnRateImpact?.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });

  describe('Impact Level Classification', () => {
    it('should classify as critical for ≥30% revenue at risk', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 300000,
        revenue: 1000000,
      });

      expect(result.normalizedLevel).toBe('critical');
    });

    it('should classify as critical for >30% revenue at risk', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 400000,
        revenue: 1000000,
      });

      expect(result.normalizedLevel).toBe('critical');
    });

    it('should classify as high for 15-29% revenue at risk', () => {
      const result1 = normalizeFinancialImpact({
        estimatedLoss: 150000,
        revenue: 1000000,
      });
      expect(result1.normalizedLevel).toBe('high');

      const result2 = normalizeFinancialImpact({
        estimatedLoss: 290000,
        revenue: 1000000,
      });
      expect(result2.normalizedLevel).toBe('high');
    });

    it('should classify as medium for 5-14% revenue at risk', () => {
      const result1 = normalizeFinancialImpact({
        estimatedLoss: 50000,
        revenue: 1000000,
      });
      expect(result1.normalizedLevel).toBe('medium');

      const result2 = normalizeFinancialImpact({
        estimatedLoss: 140000,
        revenue: 1000000,
      });
      expect(result2.normalizedLevel).toBe('medium');
    });

    it('should classify as low for <5% revenue at risk', () => {
      const result1 = normalizeFinancialImpact({
        estimatedLoss: 10000,
        revenue: 1000000,
      });
      expect(result1.normalizedLevel).toBe('low');

      const result2 = normalizeFinancialImpact({
        estimatedLoss: 49000,
        revenue: 1000000,
      });
      expect(result2.normalizedLevel).toBe('low');
    });

    it('should classify as unknown when revenue is missing', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 300000,
        revenue: undefined,
      });

      expect(result.normalizedLevel).toBe('unknown');
    });

    it('should classify as unknown when estimated loss is missing', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: undefined,
        revenue: 1000000,
      });

      expect(result.normalizedLevel).toBe('unknown');
    });
  });

  describe('Reasons Generation', () => {
    it('should include revenue at risk reason', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: 1000000,
      });

      expect(result.reasons.some((r) => r.includes('Revenue at risk'))).toBe(true);
    });

    it('should include monthly impact reason', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: 1000000,
      });

      expect(result.reasons.some((r) => r.includes('Monthly impact'))).toBe(true);
    });

    it('should indicate when estimated loss is unavailable', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: undefined,
        revenue: 1000000,
      });

      expect(result.reasons).toContain('Estimated loss unavailable');
    });

    it('should indicate when revenue is unavailable', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: undefined,
      });

      expect(result.reasons).toContain('Revenue unavailable; percentage impact cannot be normalized');
    });

    it('should have reasons array when data is complete', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000,
        revenue: 1000000,
      });

      expect(Array.isArray(result.reasons)).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle very small loss and large revenue', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 0.01,
        revenue: 1000000000,
      });

      expect(result.revenueAtRiskPct).toBeCloseTo(0.000001);
      expect(result.normalizedLevel).toBe('low');
    });

    it('should handle loss equal to revenue', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 1000000,
        revenue: 1000000,
      });

      expect(result.revenueAtRiskPct).toBe(100);
      expect(result.normalizedLevel).toBe('critical');
    });

    it('should handle loss greater than revenue', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 2000000,
        revenue: 1000000,
      });

      expect(result.revenueAtRiskPct).toBe(200);
      expect(result.normalizedLevel).toBe('critical');
    });

    it('should handle fractional currency values', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 12345.67,
        revenue: 98765.43,
      });

      expect(result.monthlyImpact).toBe(4115.22);
      expect(result.revenueAtRiskPct).toBeCloseTo(12.5, 1);
    });

    it('should handle both inputs being the same small value', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100,
        revenue: 100,
      });

      expect(result.revenueAtRiskPct).toBe(100);
      expect(result.normalizedLevel).toBe('critical');
    });
  });

  describe('Consistency and Determinism', () => {
    it('should return same result for identical inputs', () => {
      const input = { estimatedLoss: 100000, revenue: 1000000 };

      const result1 = normalizeFinancialImpact(input);
      const result2 = normalizeFinancialImpact(input);

      expect(result1).toEqual(result2);
    });

    it('should be deterministic across multiple calls', () => {
      const results = Array.from({ length: 5 }, () =>
        normalizeFinancialImpact({ estimatedLoss: 75000, revenue: 500000 }),
      );

      results.forEach((result) => {
        expect(result).toEqual(results[0]);
      });
    });

    it('should maintain precision across calculations', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 333333.33,
        revenue: 1000000,
      });

      // Monthly: 333333.33 / 3 = 111111.11
      expect(result.monthlyImpact).toBe(111111.11);
      // Revenue at risk: 333333.33 / 1000000 * 100 = 33.33%
      expect(result.revenueAtRiskPct).toBe(33.33);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should normalize impact for startup with critical cash runway issue', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 500000, // $500k loss
        revenue: 1000000, // $1M annual revenue
      });

      expect(result.normalizedLevel).toBe('critical');
      expect(result.revenueAtRiskPct).toBe(50);
      expect(result.monthlyImpact).toBe(166666.67);
    });

    it('should normalize impact for enterprise with manageable loss', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 100000, // $100k loss
        revenue: 100000000, // $100M annual revenue
      });

      expect(result.normalizedLevel).toBe('low');
      expect(result.revenueAtRiskPct).toBe(0.1);
      expect(result.monthlyImpact).toBe(33333.33);
    });

    it('should handle partial data scenario (loss known, revenue TBD)', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 250000,
        revenue: undefined,
      });

      expect(result.monthlyImpact).toBe(83333.33);
      expect(result.revenueAtRiskPct).toBeNull();
      expect(result.normalizedLevel).toBe('unknown');
    });

    it('should handle pre-revenue startup scenario', () => {
      const result = normalizeFinancialImpact({
        estimatedLoss: 50000,
        revenue: 0,
      });

      expect(result.monthlyImpact).toBe(16666.67);
      expect(result.revenueAtRiskPct).toBeNull();
      expect(result.normalizedLevel).toBe('unknown');
      expect(result.reasons).toContain('Revenue unavailable; percentage impact cannot be normalized');
    });
  });
});
