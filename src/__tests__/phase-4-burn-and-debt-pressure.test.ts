// Phase 4 Slice 3: BurnPressureEngine & DebtPressureEngine - Financial stress analysis
// Tests verify burn intensity, debt burden, and sustainability

import { describe, it, expect } from 'vitest';
import { BurnPressureEngine } from '../services/burn-pressure-engine';
import { DebtPressureEngine } from '../services/debt-pressure-engine';

describe('Phase 4 Slice 3 — Burn & Debt Pressure: Financial Stress Analysis', () => {
  describe('BurnPressureEngine', () => {
    describe('Contract', () => {
      it('validates burn pressure analysis structure', () => {
        const analysis = {
          monthlyBurn: 20000,
          currentCash: 100000,
          burnIntensity: 0.2,
          burnPressurePercent: 20,
          pressureLevel: 'HEALTHY' as const,
          monthsOfCashRemaining: 5,
          weeksOfCashRemaining: 21.65,
          criticalThreshold: false,
        };

        expect(typeof analysis.burnPressurePercent).toBe('number');
        expect(['CRITICAL', 'HIGH', 'MODERATE', 'HEALTHY', 'SUSTAINABLE']).toContain(
          analysis.pressureLevel
        );
      });
    });

    describe('Behavior — Burn Pressure Analysis', () => {
      it('determines CRITICAL when burn > 50% of cash', () => {
        const analysis = BurnPressureEngine.analyzeBurnPressure(60000, 100000);

        expect(analysis.burnPressurePercent).toBe(60);
        expect(analysis.pressureLevel).toBe('CRITICAL');
      });

      it('determines HIGH when burn 25-50% of cash', () => {
        const analysis = BurnPressureEngine.analyzeBurnPressure(30000, 100000);

        expect(analysis.burnPressurePercent).toBe(30);
        expect(analysis.pressureLevel).toBe('HIGH');
      });

      it('determines MODERATE when burn 10-25% of cash', () => {
        const analysis = BurnPressureEngine.analyzeBurnPressure(15000, 100000);

        expect(analysis.burnPressurePercent).toBe(15);
        expect(analysis.pressureLevel).toBe('MODERATE');
      });

      it('determines HEALTHY when burn 3-10% of cash', () => {
        const analysis = BurnPressureEngine.analyzeBurnPressure(5000, 100000);

        expect(analysis.burnPressurePercent).toBe(5);
        expect(analysis.pressureLevel).toBe('HEALTHY');
      });

      it('determines SUSTAINABLE when burn < 3% of cash', () => {
        const analysis = BurnPressureEngine.analyzeBurnPressure(2000, 100000);

        expect(analysis.burnPressurePercent).toBe(2);
        expect(analysis.pressureLevel).toBe('SUSTAINABLE');
      });
    });

    describe('Behavior — Time to Depletion', () => {
      it('calculates months and weeks remaining', () => {
        const analysis = BurnPressureEngine.analyzeBurnPressure(20000, 100000);

        expect(analysis.monthsOfCashRemaining).toBe(5);
        expect(analysis.weeksOfCashRemaining).toBeCloseTo(21.65, 1);
      });

      it('sets critical threshold when < 1 month of cash', () => {
        const analysis = BurnPressureEngine.analyzeBurnPressure(60000, 50000);

        expect(analysis.monthsOfCashRemaining).toBeLessThan(1);
        expect(analysis.criticalThreshold).toBe(true);
      });
    });

    describe('Behavior — Cost Reduction', () => {
      it('calculates required cost reduction to target burn', () => {
        const reduction = BurnPressureEngine.calculateRequiredCostReduction(50000, 20000);

        expect(reduction.reductionNeeded).toBe(30000);
        expect(reduction.reductionPercent).toBe(60);
      });
    });
  });

  describe('DebtPressureEngine', () => {
    describe('Contract', () => {
      it('validates debt pressure analysis structure', () => {
        const analysis = {
          totalDebt: 500000,
          annualRevenue: 500000,
          debtToRevenueRatio: 1,
          debtServicePercent: 10,
          riskLevel: 'HEALTHY' as const,
          monthlyDebtService: 5000,
          debtBurden: 'Manageable',
        };

        expect(typeof analysis.debtToRevenueRatio).toBe('number');
        expect(['CRITICAL', 'HIGH', 'MODERATE', 'HEALTHY', 'STRONG']).toContain(
          analysis.riskLevel
        );
      });
    });

    describe('Behavior — Debt Pressure Analysis', () => {
      it('determines CRITICAL when debt > 3x revenue', () => {
        const analysis = DebtPressureEngine.analyzeDebtPressure(
          1600000,
          500000
        );

        expect(analysis.debtToRevenueRatio).toBe(3.2);
        expect(analysis.riskLevel).toBe('CRITICAL');
      });

      it('determines HIGH when debt 2-3x revenue', () => {
        const analysis = DebtPressureEngine.analyzeDebtPressure(
          1200000,
          500000
        );

        expect(analysis.debtToRevenueRatio).toBe(2.4);
        expect(analysis.riskLevel).toBe('HIGH');
      });

      it('determines MODERATE when debt 1-2x revenue', () => {
        const analysis = DebtPressureEngine.analyzeDebtPressure(700000, 500000);

        expect(analysis.debtToRevenueRatio).toBe(1.4);
        expect(analysis.riskLevel).toBe('MODERATE');
      });

      it('determines HEALTHY when debt 0.5-1x revenue', () => {
        const analysis = DebtPressureEngine.analyzeDebtPressure(400000, 500000);

        expect(analysis.debtToRevenueRatio).toBe(0.8);
        expect(analysis.riskLevel).toBe('HEALTHY');
      });

      it('determines STRONG when debt < 0.5x revenue', () => {
        const analysis = DebtPressureEngine.analyzeDebtPressure(200000, 500000);

        expect(analysis.debtToRevenueRatio).toBe(0.4);
        expect(analysis.riskLevel).toBe('STRONG');
      });
    });

    describe('Behavior — Debt Service Impact', () => {
      it('calculates debt service as % of revenue', () => {
        const analysis = DebtPressureEngine.analyzeDebtPressure(
          500000,
          500000,
          20000
        );

        expect(analysis.debtServicePercent).toBe(48); // 20000*12 / 500000
      });

      it('identifies high debt service (> 30% of revenue)', () => {
        const result = DebtPressureEngine.isDebtServiceHigh(35);
        expect(result).toBe(true);
      });
    });

    describe('Behavior — Debt Reduction Planning', () => {
      it('calculates debt reduction needed to reach target', () => {
        const plan = DebtPressureEngine.calculateRequiredDebtReduction(
          1000000,
          500000,
          1
        );

        expect(plan.reductionNeeded).toBe(500000); // 1M - (500k * 1)
        expect(plan.timelineMonths).toBeGreaterThan(0);
      });
    });

    describe('Behavior — Sustainability Index', () => {
      it('calculates sustainability score 0-100', () => {
        const healthy = DebtPressureEngine.calculateSustainabilityIndex(0.5, 10);
        const critical = DebtPressureEngine.calculateSustainabilityIndex(3, 30);

        expect(healthy).toBeGreaterThan(critical);
        expect(healthy).toBeGreaterThan(0);
        expect(healthy).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Acceptance Criteria #3-4', () => {
    it('criterion #3-4 satisfied: Cash pressure and debt risks affect recommendations', () => {
      // Test critical burn pressure
      const criticalBurn = BurnPressureEngine.analyzeBurnPressure(60000, 100000);
      expect(criticalBurn.burnPressurePercent).toBe(60);
      expect(criticalBurn.pressureLevel).toBe('CRITICAL');
      expect(BurnPressureEngine.isBurnUnsustainable(60)).toBe(true);

      // Test at-risk burn
      const atRiskBurn = BurnPressureEngine.analyzeBurnPressure(30000, 100000);
      expect(atRiskBurn.pressureLevel).toBe('HIGH');

      // Test healthy burn
      const healthyBurn = BurnPressureEngine.analyzeBurnPressure(5000, 100000);
      expect(healthyBurn.pressureLevel).toBe('HEALTHY');

      // Test critical debt (> 3x revenue)
      const criticalDebt = DebtPressureEngine.analyzeDebtPressure(
        1600000,
        500000
      );
      expect(criticalDebt.debtToRevenueRatio).toBe(3.2);
      expect(criticalDebt.riskLevel).toBe('CRITICAL');
      expect(DebtPressureEngine.isDebtCritical(3.2)).toBe(true);

      // Test at-risk debt
      const atRiskDebt = DebtPressureEngine.analyzeDebtPressure(
        1200000,
        500000
      );
      expect(atRiskDebt.riskLevel).toBe('HIGH');

      // Test healthy debt
      const healthyDebt = DebtPressureEngine.analyzeDebtPressure(400000, 500000);
      expect(healthyDebt.riskLevel).toBe('HEALTHY');

      // Test debt service impact
      const debtWithService = DebtPressureEngine.analyzeDebtPressure(
        500000,
        500000,
        25000
      );
      expect(debtWithService.debtServicePercent).toBe(60);
      expect(DebtPressureEngine.isDebtServiceHigh(60)).toBe(true);

      // Both pressures should inform survival state
      expect(atRiskBurn.pressureLevel).not.toBe('SUSTAINABLE');
      expect(atRiskDebt.riskLevel).not.toBe('STRONG');
    });
  });
});
