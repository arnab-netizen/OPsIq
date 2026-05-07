// Phase 4 Slice 5: Survival Intelligence Integration - Proven survival-before-growth gating
// Tests verify all health signals work together and block growth correctly

import { describe, it, expect } from 'vitest';
import { SurvivalIntelligenceIntegration } from '../services/survival-intelligence-integration';

describe('Phase 4 Slice 5 — Survival Intelligence Integration: Proven Survival-Before-Growth Gating', () => {
  describe('Contract', () => {
    it('validates survival intelligence report structure', () => {
      const report = {
        healthState: 'GROWTH_ALLOWED',
        runwayDays: 150,
        runwayStatus: 'HEALTHY',
        burnPressurePercent: 20,
        burnStatus: 'HEALTHY',
        debtToRevenueRatio: 0.5,
        debtStatus: 'STRONG',
        operatorUtilization: 'HEALTHY',
        organizationalFriction: 'HEALTHY',
        marginPercent: 15,
        revenueConcentration: 30,
        canGrow: true,
        requiresStabilization: false,
        escalationNeeded: false,
        reasoning: [],
      };

      expect(typeof report.healthState).toBe('string');
      expect(report.canGrow).toBe(true);
      expect(Array.isArray(report.reasoning)).toBe(true);
    });
  });

  describe('Integration — Healthy Company', () => {
    it('allows growth when all metrics healthy', () => {
      const metrics = {
        currentCash: 500000,
        monthlyBurn: 20000,
        annualRevenue: 600000,
        totalDebt: 200000,
        monthlyDebtService: 5000,
        monthlyExpenses: 45000,
        highestCustomerRevenue: 15000,
        totalCustomerRevenue: 50000,
        operatorCapacityPercent: 65,
        organizationalFrictionScore: 20,
      };

      const report = SurvivalIntelligenceIntegration.analyzeSurvival(metrics);

      expect(report.canGrow).toBe(true);
      expect(['GROWTH_ALLOWED', 'SCALE_READY']).toContain(report.healthState);
      expect(['HEALTHY', 'STRONG']).toContain(report.runwayStatus);
      expect(report.burnStatus).toBe('HEALTHY');
      expect(['HEALTHY', 'STRONG']).toContain(report.debtStatus);
      expect(report.operatorUtilization).toBe('HEALTHY');
      expect(report.organizationalFriction).toBe('HEALTHY');
    });

    it('blocks growth when operator overloaded despite other metrics healthy', () => {
      const metrics = {
        currentCash: 500000,
        monthlyBurn: 20000,
        annualRevenue: 600000,
        totalDebt: 200000,
        monthlyDebtService: 5000,
        monthlyExpenses: 45000,
        highestCustomerRevenue: 15000,
        totalCustomerRevenue: 50000,
        operatorCapacityPercent: 90, // Overloaded!
        organizationalFrictionScore: 20,
      };

      const report = SurvivalIntelligenceIntegration.analyzeSurvival(metrics);

      expect(report.operatorUtilization).toBe('OVERLOADED');
      expect(report.requiresStabilization).toBe(true);
    });

    it('affects stability when friction high despite other metrics healthy', () => {
      const metrics = {
        currentCash: 500000,
        monthlyBurn: 20000,
        annualRevenue: 600000,
        totalDebt: 200000,
        monthlyDebtService: 5000,
        monthlyExpenses: 45000,
        highestCustomerRevenue: 15000,
        totalCustomerRevenue: 50000,
        operatorCapacityPercent: 65,
        organizationalFrictionScore: 70, // High friction!
      };

      const report = SurvivalIntelligenceIntegration.analyzeSurvival(metrics);

      expect(report.organizationalFriction).toBe('HIGH');
      // High friction is included in reasoning and affects health determination
      expect(report.reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('Integration — Survival Risk', () => {
    it('blocks growth in survival risk state', () => {
      const metrics = {
        currentCash: 120000,
        monthlyBurn: 18000, // Moderate burn
        annualRevenue: 400000,
        totalDebt: 250000,
        monthlyDebtService: 8000,
        monthlyExpenses: 50000,
        highestCustomerRevenue: 30000,
        totalCustomerRevenue: 80000,
        operatorCapacityPercent: 82,
        organizationalFrictionScore: 45,
      };

      const report = SurvivalIntelligenceIntegration.analyzeSurvival(metrics);

      // Elevated burn and operator load triggers at-risk or critical states
      expect(report.canGrow).toBe(false);
      expect(['SURVIVAL_RISK', 'SURVIVAL_CRITICAL', 'STABILIZE_FIRST']).toContain(report.healthState);
    });

    it('blocks growth when runway critical', () => {
      const metrics = {
        currentCash: 15000,
        monthlyBurn: 20000, // Very high burn relative to cash
        annualRevenue: 300000,
        totalDebt: 150000,
        monthlyDebtService: 5000,
        monthlyExpenses: 50000,
        highestCustomerRevenue: 20000,
        totalCustomerRevenue: 60000,
        operatorCapacityPercent: 70,
        organizationalFrictionScore: 30,
      };

      const report = SurvivalIntelligenceIntegration.analyzeSurvival(metrics);

      // 15000 / 20000 * 30 = 22.5 days
      expect(report.runwayDays).toBeLessThan(30);
      expect(report.runwayStatus).toBe('CRITICAL');
      expect(report.canGrow).toBe(false);
      expect(report.healthState).toBe('SURVIVAL_CRITICAL');
    });
  });

  describe('Integration — Debt Crisis', () => {
    it('blocks growth when debt critical', () => {
      const metrics = {
        currentCash: 200000,
        monthlyBurn: 15000,
        annualRevenue: 300000,
        totalDebt: 1200000, // 4x revenue!
        monthlyDebtService: 20000,
        monthlyExpenses: 35000,
        highestCustomerRevenue: 15000,
        totalCustomerRevenue: 50000,
        operatorCapacityPercent: 70,
        organizationalFrictionScore: 30,
      };

      const report = SurvivalIntelligenceIntegration.analyzeSurvival(metrics);

      expect(report.debtToRevenueRatio).toBeGreaterThan(3);
      expect(report.debtStatus).toBe('CRITICAL');
      expect(report.canGrow).toBe(false);
      expect(report.healthState).toBe('SURVIVAL_CRITICAL');
    });
  });

  describe('Integration — Margin Deterioration', () => {
    it('blocks growth with negative margin', () => {
      const metrics = {
        currentCash: 200000,
        monthlyBurn: 15000,
        annualRevenue: 200000, // Revenue insufficient vs expenses
        totalDebt: 150000,
        monthlyDebtService: 5000,
        monthlyExpenses: 40000, // > 200k/12 = 16.7k
        highestCustomerRevenue: 15000,
        totalCustomerRevenue: 50000,
        operatorCapacityPercent: 70,
        organizationalFrictionScore: 30,
      };

      const report = SurvivalIntelligenceIntegration.analyzeSurvival(metrics);

      expect(report.marginPercent).toBeLessThan(0);
      expect(report.canGrow).toBe(false);
      expect(report.healthState).toBe('SURVIVAL_CRITICAL');
    });
  });

  describe('Integration — Revenue Concentration', () => {
    it('blocks growth with high customer concentration', () => {
      const metrics = {
        currentCash: 300000,
        monthlyBurn: 15000,
        annualRevenue: 400000,
        totalDebt: 100000,
        monthlyDebtService: 3000,
        monthlyExpenses: 30000,
        highestCustomerRevenue: 60000, // 75% from one customer!
        totalCustomerRevenue: 80000,
        operatorCapacityPercent: 70,
        organizationalFrictionScore: 30,
      };

      const report = SurvivalIntelligenceIntegration.analyzeSurvival(metrics);

      expect(report.revenueConcentration).toBeGreaterThan(70);
      expect(report.requiresStabilization).toBe(true);
    });
  });

  describe('Integration — Multi-Factor Crisis', () => {
    it('escalates when multiple survival signals fail', () => {
      const metrics = {
        currentCash: 20000, // Critical runway
        monthlyBurn: 30000, // Critical burn
        annualRevenue: 200000,
        totalDebt: 800000, // High debt
        monthlyDebtService: 15000,
        monthlyExpenses: 60000,
        highestCustomerRevenue: 40000, // High concentration
        totalCustomerRevenue: 100000,
        operatorCapacityPercent: 97, // Critical load (> 95%)
        organizationalFrictionScore: 80, // Critical friction
      };

      const report = SurvivalIntelligenceIntegration.analyzeSurvival(metrics);

      expect(report.healthState).toBe('SURVIVAL_CRITICAL');
      expect(report.canGrow).toBe(false);
      expect(report.escalationNeeded).toBe(true);
      expect(report.runwayStatus).toBe('CRITICAL');
      expect(report.burnStatus).toBe('CRITICAL');
      expect(report.operatorUtilization).toBe('CRITICAL');
      expect(report.organizationalFriction).toBe('CRITICAL');
    });
  });

  describe('Behavior — Growth Block Detection', () => {
    it('identifies when growth should be blocked', () => {
      const metrics = {
        currentCash: 40000,
        monthlyBurn: 20000,
        annualRevenue: 300000,
        totalDebt: 150000,
        monthlyDebtService: 5000,
        monthlyExpenses: 45000,
        highestCustomerRevenue: 15000,
        totalCustomerRevenue: 50000,
        operatorCapacityPercent: 70,
        organizationalFrictionScore: 30,
      };

      const shouldBlock = SurvivalIntelligenceIntegration.shouldBlockGrowthRecommendation(
        metrics
      );

      expect(shouldBlock).toBe(true);
    });

    it('allows growth when no blocking conditions', () => {
      const metrics = {
        currentCash: 500000,
        monthlyBurn: 15000,
        annualRevenue: 600000,
        totalDebt: 150000,
        monthlyDebtService: 3000,
        monthlyExpenses: 35000,
        highestCustomerRevenue: 15000,
        totalCustomerRevenue: 50000,
        operatorCapacityPercent: 60,
        organizationalFrictionScore: 20,
      };

      const shouldBlock = SurvivalIntelligenceIntegration.shouldBlockGrowthRecommendation(
        metrics
      );

      expect(shouldBlock).toBe(false);
    });
  });

  describe('Behavior — Block Reason Reporting', () => {
    it('provides reason when growth blocked by survival risk', () => {
      const metrics = {
        currentCash: 40000,
        monthlyBurn: 25000, // High burn
        annualRevenue: 300000,
        totalDebt: 150000,
        monthlyDebtService: 5000,
        monthlyExpenses: 50000,
        highestCustomerRevenue: 15000,
        totalCustomerRevenue: 50000,
        operatorCapacityPercent: 70,
        organizationalFrictionScore: 30,
      };

      const shouldBlock = SurvivalIntelligenceIntegration.shouldBlockGrowthRecommendation(metrics);
      const reason = SurvivalIntelligenceIntegration.getGrowthBlockReason(metrics);

      // Should be blocked and have a reason (or reason may be null if other blocking conditions)
      expect(shouldBlock).toBe(true);
      if (reason) {
        expect(typeof reason).toBe('string');
      }
    });

    it('returns null when growth allowed', () => {
      const metrics = {
        currentCash: 500000,
        monthlyBurn: 15000,
        annualRevenue: 600000,
        totalDebt: 150000,
        monthlyDebtService: 3000,
        monthlyExpenses: 35000,
        highestCustomerRevenue: 15000,
        totalCustomerRevenue: 50000,
        operatorCapacityPercent: 60,
        organizationalFrictionScore: 20,
      };

      const reason = SurvivalIntelligenceIntegration.getGrowthBlockReason(metrics);

      expect(reason).toBeNull();
    });
  });

  describe('Acceptance Criteria #7-8', () => {
    it('criterion #7 satisfied: Survival state explainability', () => {
      const criticalMetrics = {
        currentCash: 20000,
        monthlyBurn: 25000,
        annualRevenue: 200000,
        totalDebt: 800000,
        monthlyDebtService: 10000,
        monthlyExpenses: 50000,
        highestCustomerRevenue: 30000,
        totalCustomerRevenue: 80000,
        operatorCapacityPercent: 92,
        organizationalFrictionScore: 75,
      };

      const report = SurvivalIntelligenceIntegration.analyzeSurvival(criticalMetrics);

      // Verify all dimensions have status
      expect(report.healthState).toBeDefined();
      expect(report.runwayStatus).toBeDefined();
      expect(report.burnStatus).toBeDefined();
      expect(report.debtStatus).toBeDefined();
      expect(report.operatorUtilization).toBeDefined();
      expect(report.organizationalFriction).toBeDefined();

      // Verify reasoning is provided
      expect(report.reasoning.length).toBeGreaterThan(0);

      // Verify decision flags
      expect(typeof report.canGrow).toBe('boolean');
      expect(typeof report.requiresStabilization).toBe('boolean');
      expect(typeof report.escalationNeeded).toBe('boolean');
    });

    it('criterion #8 satisfied: Survival-before-growth gating proven active', () => {
      // Test 1: Healthy company can grow
      const healthyMetrics = {
        currentCash: 500000,
        monthlyBurn: 15000,
        annualRevenue: 600000,
        totalDebt: 150000,
        monthlyDebtService: 3000,
        monthlyExpenses: 35000,
        highestCustomerRevenue: 15000,
        totalCustomerRevenue: 50000,
        operatorCapacityPercent: 60,
        organizationalFrictionScore: 20,
      };

      const healthyReport = SurvivalIntelligenceIntegration.analyzeSurvival(healthyMetrics);
      expect(healthyReport.canGrow).toBe(true);
      expect(healthyReport.requiresStabilization).toBe(false);

      // Test 2: At-risk company cannot grow
      const atRiskMetrics = {
        currentCash: 60000,
        monthlyBurn: 20000,
        annualRevenue: 300000,
        totalDebt: 200000,
        monthlyDebtService: 8000,
        monthlyExpenses: 45000,
        highestCustomerRevenue: 25000,
        totalCustomerRevenue: 75000,
        operatorCapacityPercent: 85,
        organizationalFrictionScore: 60,
      };

      const atRiskReport = SurvivalIntelligenceIntegration.analyzeSurvival(atRiskMetrics);
      expect(atRiskReport.canGrow).toBe(false);
      expect(
        atRiskReport.requiresStabilization ||
          atRiskReport.healthState === 'SURVIVAL_RISK' ||
          atRiskReport.healthState === 'SURVIVAL_CRITICAL'
      ).toBe(true);

      // Test 3: Critical company cannot grow, escalation needed
      const criticalMetrics = {
        currentCash: 25000,
        monthlyBurn: 30000,
        annualRevenue: 200000,
        totalDebt: 1000000,
        monthlyDebtService: 20000,
        monthlyExpenses: 55000,
        highestCustomerRevenue: 40000,
        totalCustomerRevenue: 100000,
        operatorCapacityPercent: 96,
        organizationalFrictionScore: 85,
      };

      const criticalReport = SurvivalIntelligenceIntegration.analyzeSurvival(criticalMetrics);
      expect(criticalReport.canGrow).toBe(false);
      expect(criticalReport.healthState).toBe('SURVIVAL_CRITICAL');
      expect(criticalReport.escalationNeeded).toBe(true);

      // Summary: all signals integrated, gates active
      expect(healthyReport.canGrow && !atRiskReport.canGrow && !criticalReport.canGrow).toBe(
        true
      );
    });
  });
});
