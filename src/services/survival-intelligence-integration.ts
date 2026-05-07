// SurvivalIntelligenceIntegration - Proven survival-before-growth gating
// Phase 4 Slice 5: Integration layer proving all health signals work together

import { FinancialHealthGate } from './financial-health-gate';
import { CashRunwayEngine } from './cash-runway-engine';
import { BurnPressureEngine } from './burn-pressure-engine';
import { DebtPressureEngine } from './debt-pressure-engine';
import { OperatorLoadEngine } from './operator-load-engine';
import { OrganizationalFrictionEngine } from './organizational-friction-engine';

export interface SurvivalMetrics {
  currentCash: number;
  monthlyBurn: number;
  annualRevenue: number;
  totalDebt: number;
  monthlyDebtService: number;
  monthlyExpenses: number;
  highestCustomerRevenue: number;
  totalCustomerRevenue: number;
  operatorCapacityPercent: number;
  organizationalFrictionScore: number;
}

export interface SurvivalIntelligenceReport {
  healthState: string;
  runwayDays: number;
  runwayStatus: string;
  burnPressurePercent: number;
  burnStatus: string;
  debtToRevenueRatio: number;
  debtStatus: string;
  operatorUtilization: string;
  organizationalFriction: string;
  marginPercent: number;
  revenueConcentration: number;
  canGrow: boolean;
  requiresStabilization: boolean;
  escalationNeeded: boolean;
  reasoning: string[];
}

export class SurvivalIntelligenceIntegration {
  /**
   * Comprehensive survival analysis - all engines working together
   */
  static analyzeSurvival(metrics: SurvivalMetrics): SurvivalIntelligenceReport {
    // Calculate derived metrics
    const runwayAnalysis = CashRunwayEngine.analyzeCashRunway(
      metrics.currentCash,
      metrics.monthlyBurn
    );

    const burnPressure = BurnPressureEngine.analyzeBurnPressure(
      metrics.monthlyBurn,
      metrics.currentCash
    );

    const debtPressure = DebtPressureEngine.analyzeDebtPressure(
      metrics.totalDebt,
      metrics.annualRevenue,
      metrics.monthlyDebtService
    );

    const operatorLoad = OperatorLoadEngine.analyzeOperatorLoad(
      metrics.operatorCapacityPercent
    );

    const friction = OrganizationalFrictionEngine.analyzeFriction(
      metrics.organizationalFrictionScore
    );

    // Calculate margin
    const monthlyRevenue = metrics.annualRevenue / 12;
    const marginPercent =
      monthlyRevenue > 0
        ? ((monthlyRevenue - metrics.monthlyExpenses) / monthlyRevenue) * 100
        : -100;

    // Calculate revenue concentration
    const revenueConcentration =
      metrics.totalCustomerRevenue > 0
        ? (metrics.highestCustomerRevenue / metrics.totalCustomerRevenue) * 100
        : 0;

    // Feed into FinancialHealthGate
    const healthResult = FinancialHealthGate.determineHealthState({
      runwayDays: runwayAnalysis.runwayDays,
      monthlyBurn: metrics.monthlyBurn,
      currentCash: metrics.currentCash,
      debtToRevenueRatio: debtPressure.debtToRevenueRatio,
      marginPercent,
      revenueConcentration,
      operatorLoadPercent: metrics.operatorCapacityPercent,
      organizationalFrictionScore: metrics.organizationalFrictionScore,
    });

    // Evaluate growth permission
    const growthEval = FinancialHealthGate.evaluateGrowthAllowed(
      healthResult.state
    );

    return {
      healthState: healthResult.state,
      runwayDays: runwayAnalysis.runwayDays,
      runwayStatus: runwayAnalysis.riskLevel,
      burnPressurePercent: burnPressure.burnPressurePercent,
      burnStatus: burnPressure.pressureLevel,
      debtToRevenueRatio: debtPressure.debtToRevenueRatio,
      debtStatus: debtPressure.riskLevel,
      operatorUtilization: operatorLoad.utilizationLevel,
      organizationalFriction: friction.frictionLevel,
      marginPercent,
      revenueConcentration,
      canGrow: growthEval.isGrowthAllowed,
      requiresStabilization: growthEval.requiresStabilization,
      escalationNeeded: growthEval.escalationNeeded,
      reasoning: healthResult.reasoning,
    };
  }

  /**
   * Check if growth recommendation should be blocked
   */
  static shouldBlockGrowthRecommendation(metrics: SurvivalMetrics): boolean {
    const analysis = this.analyzeSurvival(metrics);
    return !analysis.canGrow;
  }

  /**
   * Get growth feasibility reason
   */
  static getGrowthBlockReason(metrics: SurvivalMetrics): string | null {
    const analysis = this.analyzeSurvival(metrics);

    if (analysis.healthState === 'SURVIVAL_CRITICAL') {
      return `Critical survival state: ${analysis.reasoning.join('; ')}`;
    }
    if (analysis.healthState === 'SURVIVAL_RISK') {
      return `Survival risk: ${analysis.reasoning.join('; ')}`;
    }
    if (analysis.requiresStabilization) {
      return 'Stabilization required before growth';
    }

    return null;
  }
}
