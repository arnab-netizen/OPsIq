// Phase 4 Slice 2: CashRunwayEngine - Cash runway and burn analysis
// Tests verify runway calculation, trend analysis, and forecasting

import { describe, it, expect } from 'vitest';
import { CashRunwayEngine } from '../services/cash-runway-engine';

describe('Phase 4 Slice 2 — CashRunwayEngine: Cash Runway Analysis', () => {
  describe('Contract', () => {
    it('validates cash runway analysis structure', () => {
      const analysis = {
        currentCash: 100000,
        monthlyBurn: 20000,
        runwayDays: 150,
        runwayMonths: 5,
        daysUntilCritical: 120,
        projectedDepletion: new Date(),
        hasAdequateRunway: true,
        riskLevel: 'HEALTHY' as const,
      };

      expect(analysis.currentCash).toBeGreaterThanOrEqual(0);
      expect(analysis.monthlyBurn).toBeGreaterThanOrEqual(0);
      expect(analysis.runwayDays).toBeGreaterThan(0);
      expect(['CRITICAL', 'AT_RISK', 'ADEQUATE', 'HEALTHY', 'STRONG']).toContain(
        analysis.riskLevel
      );
    });

    it('validates burn trend analysis structure', () => {
      const trend = {
        currentMonthBurn: 20000,
        previousMonthBurn: 19000,
        trendDirection: 'increasing' as const,
        monthOverMonthChange: 1000,
        accelerationPercent: 5.26,
        projectedBurnInSixMonths: 26000,
      };

      expect(['increasing', 'stable', 'decreasing']).toContain(
        trend.trendDirection
      );
      expect(typeof trend.accelerationPercent).toBe('number');
    });
  });

  describe('Behavior — Runway Calculation', () => {
    it('calculates runway from cash and burn', () => {
      const analysis = CashRunwayEngine.analyzeCashRunway(60000, 20000);

      expect(analysis.runwayDays).toBe(90); // 60000 / 20000 * 30
      expect(analysis.runwayMonths).toBe(3);
    });

    it('handles zero burn (very long runway)', () => {
      const analysis = CashRunwayEngine.analyzeCashRunway(100000, 0);

      expect(analysis.runwayDays).toBeGreaterThan(100000); // Effectively infinite
      expect(analysis.riskLevel).toBe('STRONG');
    });

    it('determines CRITICAL risk when runway < 30 days', () => {
      const analysis = CashRunwayEngine.analyzeCashRunway(10000, 20000);

      expect(analysis.riskLevel).toBe('CRITICAL');
      expect(analysis.hasAdequateRunway).toBe(false);
    });

    it('determines AT_RISK when runway 30-90 days', () => {
      const analysis = CashRunwayEngine.analyzeCashRunway(40000, 20000);

      expect(analysis.riskLevel).toBe('AT_RISK');
      expect(analysis.hasAdequateRunway).toBe(false);
    });

    it('determines ADEQUATE when runway 90-120 days', () => {
      const analysis = CashRunwayEngine.analyzeCashRunway(60000, 20000);

      expect(analysis.riskLevel).toBe('ADEQUATE');
      expect(analysis.hasAdequateRunway).toBe(false);
    });

    it('determines HEALTHY when runway 120-180 days', () => {
      const analysis = CashRunwayEngine.analyzeCashRunway(100000, 20000);

      expect(analysis.riskLevel).toBe('HEALTHY');
      expect(analysis.hasAdequateRunway).toBe(true);
    });

    it('determines STRONG when runway > 180 days', () => {
      const analysis = CashRunwayEngine.analyzeCashRunway(200000, 20000);

      expect(analysis.riskLevel).toBe('STRONG');
      expect(analysis.hasAdequateRunway).toBe(true);
    });
  });

  describe('Behavior — Burn Trend Analysis', () => {
    it('detects increasing burn', () => {
      const trend = CashRunwayEngine.analyzeBurnTrend(21100, 20000);

      expect(trend.trendDirection).toBe('increasing');
      expect(trend.accelerationPercent).toBeGreaterThan(5);
    });

    it('detects decreasing burn', () => {
      const trend = CashRunwayEngine.analyzeBurnTrend(18900, 20000);

      expect(trend.trendDirection).toBe('decreasing');
      expect(trend.accelerationPercent).toBeLessThan(-5);
    });

    it('detects stable burn', () => {
      const trend = CashRunwayEngine.analyzeBurnTrend(20100, 20000);

      expect(trend.trendDirection).toBe('stable'); // Within 5% threshold
    });

    it('projects future burn with acceleration', () => {
      const trend = CashRunwayEngine.analyzeBurnTrend(25000, 20000);

      expect(trend.accelerationPercent).toBeGreaterThan(0);
      expect(trend.projectedBurnInSixMonths).toBeGreaterThan(25000);
    });
  });

  describe('Behavior — Cash Forecasting', () => {
    it('forecasts cash depletion', () => {
      const forecast = CashRunwayEngine.forecastCash(60000, 20000, 3);

      expect(forecast.projectedCash).toBe(0); // 60000 - 20000*3
      expect(forecast.depleted).toBe(true);
    });

    it('forecasts cash preservation', () => {
      const forecast = CashRunwayEngine.forecastCash(100000, 20000, 2);

      expect(forecast.projectedCash).toBe(60000); // 100000 - 20000*2
      expect(forecast.depleted).toBe(false);
    });

    it('prevents negative cash in forecast', () => {
      const forecast = CashRunwayEngine.forecastCash(10000, 20000, 5);

      expect(forecast.projectedCash).toBe(0); // Capped at 0
      expect(forecast.depleted).toBe(true);
    });
  });

  describe('Behavior — Break-Even Analysis', () => {
    it('calculates required revenue growth to break-even', () => {
      const analysis = CashRunwayEngine.calculateBreakEvenRevenue(
        100000,
        50000,
        30000,
        12
      );

      expect(analysis.currentNetBurn).toBe(20000); // 50000 - 30000
      expect(analysis.requiredRevenueGrowth).toBe(20000);
      expect(analysis.breakEvenMonthlyRevenue).toBe(50000);
    });

    it('identifies achievable break-even within target', () => {
      const analysis = CashRunwayEngine.calculateBreakEvenRevenue(
        100000,
        50000,
        40000,
        12
      );

      expect(analysis.currentNetBurn).toBe(10000);
      expect(analysis.achievableInTargetMonths).toBe(true);
    });
  });

  describe('Behavior — Risk Categorization', () => {
    it('maps runway days to risk levels', () => {
      expect(CashRunwayEngine.getRunwayByRiskLevel(15)).toBe('CRITICAL');
      expect(CashRunwayEngine.getRunwayByRiskLevel(60)).toBe('AT_RISK');
      expect(CashRunwayEngine.getRunwayByRiskLevel(100)).toBe('ADEQUATE');
      expect(CashRunwayEngine.getRunwayByRiskLevel(150)).toBe('HEALTHY');
      expect(CashRunwayEngine.getRunwayByRiskLevel(200)).toBe('STRONG');
    });

    it('identifies when immediate action is required', () => {
      expect(CashRunwayEngine.requiresImmediateAction(30)).toBe(true);
      expect(CashRunwayEngine.requiresImmediateAction(90)).toBe(false);
    });
  });

  describe('Behavior — Edge Cases', () => {
    it('handles zero cash', () => {
      const analysis = CashRunwayEngine.analyzeCashRunway(0, 20000);

      expect(analysis.runwayDays).toBe(0);
      expect(analysis.riskLevel).toBe('CRITICAL');
    });

    it('handles negative cash (treats as zero)', () => {
      const analysis = CashRunwayEngine.analyzeCashRunway(-10000, 20000);

      expect(analysis.currentCash).toBe(0); // Normalized
      expect(analysis.runwayDays).toBe(0);
    });

    it('handles very small burn', () => {
      const analysis = CashRunwayEngine.analyzeCashRunway(100000, 0.01);

      expect(analysis.runwayDays).toBeGreaterThan(100000); // Very long runway
      expect(analysis.riskLevel).toBe('STRONG'); // Very healthy
    });
  });

  describe('Acceptance Criteria #2', () => {
    it('criterion #2 satisfied: Runway affects priorities and determines survival state', () => {
      // Test critical runway
      const critical = CashRunwayEngine.analyzeCashRunway(15000, 20000);
      expect(critical.runwayDays).toBeLessThan(30);
      expect(critical.riskLevel).toBe('CRITICAL');
      expect(CashRunwayEngine.requiresImmediateAction(critical.runwayDays)).toBe(
        true
      );

      // Test at-risk runway (30-90 days)
      const atRisk = CashRunwayEngine.analyzeCashRunway(50000, 20000);
      expect(atRisk.runwayDays).toBeGreaterThanOrEqual(30);
      expect(atRisk.runwayDays).toBeLessThan(90);
      expect(atRisk.riskLevel).toBe('AT_RISK');

      // Test healthy runway (120-180 days)
      const healthy = CashRunwayEngine.analyzeCashRunway(110000, 20000);
      expect(healthy.runwayDays).toBeGreaterThanOrEqual(120);
      expect(healthy.runwayDays).toBeLessThan(180);
      expect(healthy.riskLevel).toBe('HEALTHY');
      expect(healthy.hasAdequateRunway).toBe(true);

      // Test burn trend impact
      const increasing = CashRunwayEngine.analyzeBurnTrend(25000, 20000);
      expect(increasing.trendDirection).toBe('increasing');
      expect(increasing.projectedBurnInSixMonths).toBeGreaterThan(25000);

      // Test forecasting
      const forecast = CashRunwayEngine.forecastCash(100000, 20000, 4);
      expect(forecast.projectedCash).toBe(20000);
      expect(forecast.depleted).toBe(false);

      // Break-even helps determine if stabilization is achievable
      const breakEven = CashRunwayEngine.calculateBreakEvenRevenue(
        100000,
        50000,
        30000,
        12
      );
      expect(breakEven.currentNetBurn).toBe(20000);
    });
  });
});
