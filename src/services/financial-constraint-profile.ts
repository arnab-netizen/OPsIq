// Service for managing financial constraints
// Phase 2 Acceptance Criterion #2: "Financial constraints are captured"

import {
  CreateFinancialConstraintProfileRequest,
  CreateFinancialConstraintProfileRequestSchema,
  FinancialConstraintProfile,
  FinancialConstraintProfileSchema,
} from '../domain/financial-constraint-profile';

export class FinancialConstraintProfileService {
  // Pure function: check if financial profile indicates cash constraint
  // Returns true if company has concerning cash/debt metrics
  static hasSignificantConstraint(profile: FinancialConstraintProfile | null): boolean {
    if (!profile) return false;

    // Constraint scenarios:
    // - Runway less than 6 months
    // - Monthly burn > 2x MRR (spending unsustainably)
    // - Debt service > 40% of MRR
    // - Cash health is "strained" or "critical"

    const hasLowRunway =
      profile.cashRunwayMonths !== null &&
      profile.cashRunwayMonths !== undefined &&
      profile.cashRunwayMonths < 6;
    const hasHighBurn =
      profile.monthlyBurnRate !== null &&
      profile.monthlyBurnRate !== undefined &&
      profile.monthlyRecurringRevenue !== null &&
      profile.monthlyRecurringRevenue !== undefined &&
      profile.monthlyBurnRate > profile.monthlyRecurringRevenue * 2;
    const hasHighDebtService =
      profile.debtServiceMonthly !== null &&
      profile.debtServiceMonthly !== undefined &&
      profile.monthlyRecurringRevenue !== null &&
      profile.monthlyRecurringRevenue !== undefined &&
      profile.debtServiceMonthly > profile.monthlyRecurringRevenue * 0.4;
    const hasWeakHealth =
      profile.financialHealthStatus === 'strained' || profile.financialHealthStatus === 'critical';

    return hasLowRunway || hasHighBurn || hasHighDebtService || hasWeakHealth;
  }

  // Validate request structure
  static validateRequest(request: unknown): CreateFinancialConstraintProfileRequest {
    return CreateFinancialConstraintProfileRequestSchema.parse(request);
  }

  // Validate response structure
  static validateProfile(profile: unknown): FinancialConstraintProfile {
    return FinancialConstraintProfileSchema.parse(profile);
  }

  // Calculate financial health summary
  static assessFinancialHealth(profile: FinancialConstraintProfile): {
    healthScore: number; // 0-100
    riskFactors: string[];
    recommendations: string[];
  } {
    const riskFactors: string[] = [];
    let healthScore = 100;

    // Check runway
    if (profile.cashRunwayMonths !== null && profile.cashRunwayMonths !== undefined) {
      if (profile.cashRunwayMonths < 3) {
        riskFactors.push('Critical: Runway < 3 months');
        healthScore -= 40;
      } else if (profile.cashRunwayMonths < 6) {
        riskFactors.push('High: Runway < 6 months');
        healthScore -= 20;
      }
    }

    // Check burn ratio
    if (
      profile.monthlyBurnRate &&
      profile.monthlyRecurringRevenue &&
      profile.monthlyBurnRate > profile.monthlyRecurringRevenue
    ) {
      const burnRatio = profile.monthlyBurnRate / profile.monthlyRecurringRevenue;
      riskFactors.push(`Burn ratio: ${burnRatio.toFixed(1)}x MRR`);
      healthScore -= Math.min(20, burnRatio * 10);
    }

    // Check debt service
    if (
      profile.debtServiceMonthly &&
      profile.monthlyRecurringRevenue &&
      profile.debtServiceMonthly > profile.monthlyRecurringRevenue * 0.4
    ) {
      const debtRatio = profile.debtServiceMonthly / profile.monthlyRecurringRevenue;
      riskFactors.push(`Debt service: ${(debtRatio * 100).toFixed(0)}% of MRR`);
      healthScore -= 15;
    }

    // Check working capital
    if (
      profile.workingCapitalDaysOfReceivables &&
      profile.workingCapitalDaysOfPayables &&
      profile.workingCapitalDaysOfReceivables > profile.workingCapitalDaysOfPayables + 30
    ) {
      riskFactors.push('Working capital: Collections lag payables');
      healthScore -= 10;
    }

    // Check capex
    if (
      profile.majorCapexNeeded &&
      profile.capexEstimatedAmount &&
      profile.monthlyRecurringRevenue &&
      profile.capexEstimatedAmount > profile.monthlyRecurringRevenue * 12
    ) {
      riskFactors.push('Major capex required (> 12 months MRR)');
      healthScore -= 15;
    }

    const recommendations: string[] = [];
    if (healthScore < 40) {
      recommendations.push('Urgent: Focus on cash preservation');
      recommendations.push('Delay non-critical capex');
      recommendations.push('Accelerate collections');
    } else if (healthScore < 70) {
      recommendations.push('Monitor cash closely');
      recommendations.push('Plan capex carefully');
      recommendations.push('Negotiate payment terms with suppliers');
    }

    return {
      healthScore: Math.max(0, healthScore),
      riskFactors,
      recommendations,
    };
  }
}
