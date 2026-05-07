// Service for managing quick-start context delivery
// Phase 2 Acceptance Criterion #11: "Quick-start context path"

import {
  OnboardingSession,
  OnboardingSessionSchema,
  QuickStartContext,
  OnboardingContextType,
} from '../domain/onboarding-session';
import { BusinessModelProfile } from '../domain/business-model-profile';
import { FinancialConstraintProfile } from '../domain/financial-constraint-profile';
import { CustomerProfile } from '../domain/customer-profile';
import { CapacityProfile } from '../domain/capacity-profile';
import { ComplianceFlag } from '../domain/compliance-flag';
import { BusinessModelProfileService } from './business-model-profile';
import { FinancialConstraintProfileService } from './financial-constraint-profile';
import { CustomerProfileService } from './customer-profile';
import { CapacityProfileService } from './capacity-profile';
import { ComplianceFlagService } from './compliance-flag';

export interface OnboardingInputs {
  businessModel: BusinessModelProfile | null;
  financialConstraint: FinancialConstraintProfile | null;
  customerProfile: CustomerProfile | null;
  capacityProfile: CapacityProfile | null;
  complianceFlags: ComplianceFlag[];
  operatorAdherenceScore: number | null;
  latestRecommendations: Array<{ id: string; priority: string }>;
  cacheHours: number;
}

export class OnboardingSessionService {
  /**
   * Generate quick-start context from engagement profiles
   */
  static generateQuickStartContext(inputs: OnboardingInputs): QuickStartContext {
    // Business model snapshot
    const businessModelSnapshot = {
      primaryModel: inputs.businessModel?.primaryModel || 'unknown',
      isDiversified: inputs.businessModel
        ? BusinessModelProfileService.isDiversifiedModel(inputs.businessModel)
        : false,
      complexity: inputs.businessModel
        ? BusinessModelProfileService.getComplexityDescription(
            inputs.businessModel.operationalComplexityScore
          )
        : 'simple',
      maturityState: inputs.businessModel?.maturityState || 'SURVIVAL',
    };

    // Constraint summary
    const constraintSummary = {
      financialStatus: inputs.financialConstraint
        ? inputs.financialConstraint.financialHealthStatus
        : undefined,
      customerHealthStatus: inputs.customerProfile
        ? inputs.customerProfile.customerHealthStatus
        : undefined,
      capacityStatus: inputs.capacityProfile
        ? inputs.capacityProfile.overallCapacityStatus
        : undefined,
      complianceGapCount: inputs.complianceFlags.filter(
        (f) => f.status === 'non_compliant' || f.status === 'partial'
      ).length,
      totalConstraintCount: [
        inputs.businessModel ? 1 : 0,
        inputs.financialConstraint ? 1 : 0,
        inputs.customerProfile ? 1 : 0,
        inputs.capacityProfile ? 1 : 0,
        inputs.complianceFlags.length > 0 ? 1 : 0,
      ].reduce((a, b) => a + b, 0),
    };

    // Key metrics
    const keyMetrics = {
      revenueGrowthTrend:
        inputs.financialConstraint?.monthlyBurnRate &&
        inputs.financialConstraint?.monthlyRecurringRevenue
          ? inputs.financialConstraint.monthlyRecurringRevenue >
            inputs.financialConstraint.monthlyBurnRate * 2
            ? 'positive'
            : 'negative'
          : undefined,
      customerChurnRisk: inputs.customerProfile?.customerChurnRateMonthly
        ? inputs.customerProfile.customerChurnRateMonthly > 0.05
          ? 'high'
          : 'normal'
        : undefined,
      teamCapacityUtilization: inputs.capacityProfile
        ? inputs.capacityProfile.projectCapacityUtilization
        : undefined,
      budgetUtilizationPercent: inputs.operatorAdherenceScore
        ? Math.min(100, inputs.operatorAdherenceScore * 100)
        : undefined,
    };

    // Operator readiness
    const operatorReadiness = {
      hasRecentHistory: Boolean(inputs.operatorAdherenceScore),
      hasAdherenceData: Boolean(inputs.operatorAdherenceScore),
      contextFreshnessHours: inputs.cacheHours,
    };

    return {
      businessModelSnapshot,
      constraintSummary,
      keyMetrics,
      operatorReadiness,
    };
  }

  /**
   * Identify critical items requiring immediate attention
   */
  static getEmergencyItems(inputs: OnboardingInputs): string[] {
    const items: string[] = [];

    // Financial emergencies
    if (
      inputs.financialConstraint?.financialHealthStatus === 'critical' ||
      inputs.financialConstraint?.financialHealthStatus === 'strained'
    ) {
      items.push('financial_health_critical');
    }

    // Customer emergencies
    if (
      inputs.customerProfile?.customerHealthStatus === 'critical' ||
      inputs.customerProfile?.customerHealthStatus === 'at_risk'
    ) {
      items.push('customer_health_at_risk');
    }

    // Capacity emergencies
    if (inputs.capacityProfile?.overallCapacityStatus === 'critical') {
      items.push('capacity_critically_constrained');
    }

    // Compliance emergencies
    const criticalCompliance = inputs.complianceFlags.filter(
      (f) => f.severity === 'critical' && f.status !== 'compliant'
    );
    if (criticalCompliance.length > 0) {
      items.push('critical_compliance_gaps');
    }

    // High-priority recommendations
    const criticalRecs = inputs.latestRecommendations.filter(
      (r) => r.priority === 'critical'
    );
    if (criticalRecs.length > 0) {
      items.push('critical_recommendations_pending');
    }

    return items;
  }

  /**
   * Get recommendation pointers for quick-start navigation
   */
  static getKeyRecommendationPointers(
    inputs: OnboardingInputs,
    contextType: OnboardingContextType
  ): string[] {
    const pointers: string[] = [];

    if (contextType === 'full_context' || contextType === 'constraint_snapshot') {
      // Critical items first
      const emergencies = this.getEmergencyItems(inputs);
      pointers.push(...emergencies);

      // Next: unresolved high-priority items
      const highPriority = inputs.latestRecommendations.filter(
        (r) => r.priority === 'high'
      );
      if (highPriority.length > 0) {
        pointers.push('high_priority_recommendations');
      }
    }

    if (contextType === 'kpi_summary') {
      // Metrics that need attention
      if (inputs.financialConstraint?.cashRunwayMonths !== null) {
        pointers.push('cash_runway_assessment');
      }
      if (inputs.customerProfile?.customerChurnRateMonthly !== null) {
        pointers.push('customer_churn_analysis');
      }
    }

    if (contextType === 'health_digest') {
      pointers.push('health_overview');
      pointers.push('risk_assessment');
    }

    return pointers;
  }

  /**
   * Assess context freshness and expiration
   */
  static calculateContextExpirationDate(
    preparedAt: Date,
    contextType: OnboardingContextType
  ): Date {
    const expirationHours =
      contextType === 'full_context'
        ? 24 // Full context expires in 24 hours
        : contextType === 'constraint_snapshot'
          ? 12 // Constraint snapshot in 12 hours
          : contextType === 'kpi_summary'
            ? 6 // KPI summary in 6 hours (fast-moving metrics)
            : 48; // Health digest in 48 hours

    const expirationDate = new Date(preparedAt);
    expirationDate.setHours(expirationDate.getHours() + expirationHours);
    return expirationDate;
  }

  /**
   * Assess if context is still fresh
   */
  static isContextFresh(
    preparedAt: Date,
    contextType: OnboardingContextType
  ): boolean {
    const expirationDate = this.calculateContextExpirationDate(preparedAt, contextType);
    return new Date() < expirationDate;
  }

  /**
   * Get context staleness (0 = fresh, 1 = expired)
   */
  static getContextStalenessScore(
    preparedAt: Date,
    contextType: OnboardingContextType
  ): number {
    const expirationDate = this.calculateContextExpirationDate(preparedAt, contextType);
    const now = new Date();

    if (now < preparedAt) return 0;
    if (now > expirationDate) return 1;

    const totalMs = expirationDate.getTime() - preparedAt.getTime();
    const elapsedMs = now.getTime() - preparedAt.getTime();
    return Math.min(1, elapsedMs / totalMs);
  }

  /**
   * Should this session be refreshed
   */
  static needsRefresh(
    contextType: OnboardingContextType,
    preparedAt: Date,
    lastViewedAt: Date | null
  ): boolean {
    // If never viewed, don't refresh
    if (!lastViewedAt) return false;

    // If context is stale, needs refresh
    if (!this.isContextFresh(preparedAt, contextType)) return true;

    // If viewed more than 2 hours ago, check staleness score
    const hoursSinceView = (new Date().getTime() - lastViewedAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceView > 2 && this.getContextStalenessScore(preparedAt, contextType) > 0.5;
  }

  /**
   * Validate onboarding session schema
   */
  static validateSession(session: unknown): OnboardingSession {
    return OnboardingSessionSchema.parse(session);
  }
}
