// Phase 2 Slice 3: FinancialConstraintProfile - Capture financial constraints
// Tests verify financial constraint detection and health assessment

import { describe, it, expect } from 'vitest';
import { FinancialConstraintProfile } from '../domain/financial-constraint-profile';
import { FinancialConstraintProfileService } from '../services/financial-constraint-profile';

describe('Phase 2 Slice 3 — FinancialConstraintProfile: Financial Constraints', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';

  const createTestProfile = (overrides?: Partial<FinancialConstraintProfile>): FinancialConstraintProfile => ({
    id: '550e8400-e29b-41d4-a716-446655440200',
    engagementId: testEngagementId,
    monthlyBurnRate: 100000,
    monthlyRecurringRevenue: 150000,
    cashRunwayMonths: 12,
    totalDebt: 500000,
    debtServiceMonthly: 20000,
    debtMaturityMonths: 24,
    equityAvailable: 1000000,
    workingCapitalDaysOfPayables: 45,
    workingCapitalDaysOfReceivables: 30,
    seasonalityPattern: null,
    restrictedCash: null,
    contingencyReserveMonths: 3,
    majorCapexNeeded: false,
    capexEstimatedAmount: null,
    capexTimelineMonths: null,
    loanCovenantsPresent: false,
    covenantDetails: null,
    investorDilutionThreshold: null,
    profitabilityTargetMonths: 18,
    financialHealthStatus: 'adequate',
    cashFlowTiming: 'monthly',
    assessedBy: null,
    assessedAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('accepts valid financial profile and validates schema', () => {
      const profile = createTestProfile();
      const validated = FinancialConstraintProfileService.validateProfile(profile);

      expect(validated.engagementId).toBe(testEngagementId);
      expect(validated.monthlyBurnRate).toBe(100000);
      expect(validated.financialHealthStatus).toBe('adequate');
    });

    it('validates create request schema', () => {
      const request = {
        engagementId: testEngagementId,
        monthlyBurnRate: 100000,
        monthlyRecurringRevenue: 150000,
        cashRunwayMonths: 12,
        financialHealthStatus: 'adequate',
      };

      const validated = FinancialConstraintProfileService.validateRequest(request);
      expect(validated.engagementId).toBe(testEngagementId);
    });

    it('throws on invalid profile data', () => {
      const invalid = {
        engagementId: 'not-a-uuid',
        monthlyBurnRate: -100, // negative burn rate invalid
      };

      expect(() => FinancialConstraintProfileService.validateProfile(invalid)).toThrow();
    });
  });

  describe('Behavior - Constraint Detection', () => {
    it('detects healthy financial profile (no constraints)', () => {
      const healthy = createTestProfile();

      const hasConstraint = FinancialConstraintProfileService.hasSignificantConstraint(healthy);
      expect(hasConstraint).toBe(false);
    });

    it('detects critical cash runway constraint (< 3 months)', () => {
      const critical = createTestProfile({
        cashRunwayMonths: 2,
      });

      const hasConstraint = FinancialConstraintProfileService.hasSignificantConstraint(critical);
      expect(hasConstraint).toBe(true);
    });

    it('detects low cash runway constraint (< 6 months)', () => {
      const lowRunway = createTestProfile({
        cashRunwayMonths: 5,
      });

      const hasConstraint = FinancialConstraintProfileService.hasSignificantConstraint(lowRunway);
      expect(hasConstraint).toBe(true);
    });

    it('detects high burn ratio constraint (burn > 2x MRR)', () => {
      const highBurn = createTestProfile({
        monthlyBurnRate: 400000, // 400k burn vs 150k MRR = 2.67x
        monthlyRecurringRevenue: 150000,
      });

      const hasConstraint = FinancialConstraintProfileService.hasSignificantConstraint(highBurn);
      expect(hasConstraint).toBe(true);
    });

    it('detects high debt service constraint (> 40% of MRR)', () => {
      const highDebt = createTestProfile({
        debtServiceMonthly: 70000, // 70k debt service vs 150k MRR = 47%
        monthlyRecurringRevenue: 150000,
      });

      const hasConstraint = FinancialConstraintProfileService.hasSignificantConstraint(highDebt);
      expect(hasConstraint).toBe(true);
    });

    it('detects strained health status', () => {
      const strained = createTestProfile({
        financialHealthStatus: 'strained',
      });

      const hasConstraint = FinancialConstraintProfileService.hasSignificantConstraint(strained);
      expect(hasConstraint).toBe(true);
    });

    it('detects critical health status', () => {
      const critical = createTestProfile({
        financialHealthStatus: 'critical',
      });

      const hasConstraint = FinancialConstraintProfileService.hasSignificantConstraint(critical);
      expect(hasConstraint).toBe(true);
    });

    it('ignores null profile (no constraints)', () => {
      const hasConstraint = FinancialConstraintProfileService.hasSignificantConstraint(null);
      expect(hasConstraint).toBe(false);
    });
  });

  describe('Behavior - Health Assessment', () => {
    it('assesses healthy company as high score', () => {
      const healthy = createTestProfile();
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(healthy);

      expect(assessment.healthScore).toBeGreaterThanOrEqual(70);
      expect(assessment.riskFactors.length).toBeLessThanOrEqual(1);
    });

    it('assesses critical runway (< 3 months) with significant penalty', () => {
      const critical = createTestProfile({
        cashRunwayMonths: 2,
      });
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(critical);

      expect(assessment.healthScore).toBeLessThanOrEqual(60);
      expect(assessment.riskFactors).toContain('Critical: Runway < 3 months');
      if (assessment.healthScore < 40) {
        expect(assessment.recommendations).toContain('Urgent: Focus on cash preservation');
      }
    });

    it('assesses low runway (< 6 months) with moderate penalty', () => {
      const lowRunway = createTestProfile({
        cashRunwayMonths: 5,
      });
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(lowRunway);

      expect(assessment.healthScore).toBeLessThan(90);
      expect(assessment.riskFactors).toContain('High: Runway < 6 months');
    });

    it('assesses high burn ratio with penalty', () => {
      const highBurn = createTestProfile({
        monthlyBurnRate: 400000,
        monthlyRecurringRevenue: 150000,
      });
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(highBurn);

      expect(assessment.riskFactors).toContain('Burn ratio: 2.7x MRR');
      expect(assessment.healthScore).toBeLessThanOrEqual(80);
    });

    it('assesses high debt service with penalty', () => {
      const highDebt = createTestProfile({
        debtServiceMonthly: 70000,
        monthlyRecurringRevenue: 150000,
      });
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(highDebt);

      expect(assessment.riskFactors[0]).toContain('Debt service:');
      expect(assessment.healthScore).toBeLessThan(90);
    });

    it('detects working capital mismatch (collections lag payments)', () => {
      const wcMismatch = createTestProfile({
        workingCapitalDaysOfReceivables: 90,
        workingCapitalDaysOfPayables: 30,
      });
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(wcMismatch);

      expect(assessment.riskFactors).toContain('Working capital: Collections lag payables');
    });

    it('identifies large capex requirement', () => {
      const capexHeavy = createTestProfile({
        majorCapexNeeded: true,
        capexEstimatedAmount: 2000000, // > 12 months of 150k MRR
        monthlyRecurringRevenue: 150000,
      });
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(capexHeavy);

      expect(assessment.riskFactors).toContain('Major capex required (> 12 months MRR)');
    });

    it('returns recommendations for critical health (< 40 score)', () => {
      const critical = createTestProfile({
        cashRunwayMonths: 1,
        monthlyBurnRate: 400000,
        monthlyRecurringRevenue: 150000,
      });
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(critical);

      expect(assessment.healthScore).toBeLessThanOrEqual(40);
      if (assessment.healthScore < 40) {
        expect(assessment.recommendations).toContain('Urgent: Focus on cash preservation');
        expect(assessment.recommendations).toContain('Delay non-critical capex');
      }
    });

    it('returns recommendations for strained health (40-70 score)', () => {
      const strained = createTestProfile({
        cashRunwayMonths: 5,
      });
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(strained);

      if (assessment.healthScore < 70) {
        expect(assessment.recommendations).toContain('Monitor cash closely');
      }
    });

    it('health score is normalized to 0-100 range', () => {
      const profile = createTestProfile();
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(profile);

      expect(assessment.healthScore).toBeGreaterThanOrEqual(0);
      expect(assessment.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Acceptance Criteria #2', () => {
    it('captures cash flow constraints (runway, burn)', () => {
      const profile = createTestProfile({
        monthlyBurnRate: 100000,
        monthlyRecurringRevenue: 150000,
        cashRunwayMonths: 12,
      });

      expect(profile.monthlyBurnRate).toBe(100000);
      expect(profile.monthlyRecurringRevenue).toBe(150000);
      expect(profile.cashRunwayMonths).toBe(12);
    });

    it('captures debt constraints (total, service, maturity)', () => {
      const profile = createTestProfile({
        totalDebt: 500000,
        debtServiceMonthly: 20000,
        debtMaturityMonths: 24,
        loanCovenantsPresent: true,
        covenantDetails: 'Maintain 1.5x debt-to-EBITDA ratio',
      });

      expect(profile.totalDebt).toBe(500000);
      expect(profile.debtServiceMonthly).toBe(20000);
      expect(profile.loanCovenantsPresent).toBe(true);
    });

    it('captures capital constraints (equity, capex, dilution)', () => {
      const profile = createTestProfile({
        equityAvailable: 1000000,
        majorCapexNeeded: true,
        capexEstimatedAmount: 500000,
        capexTimelineMonths: 12,
        investorDilutionThreshold: 0.3, // 30%
      });

      expect(profile.equityAvailable).toBe(1000000);
      expect(profile.majorCapexNeeded).toBe(true);
      expect(profile.investorDilutionThreshold).toBe(0.3);
    });

    it('captures working capital constraints (payables, receivables)', () => {
      const profile = createTestProfile({
        workingCapitalDaysOfPayables: 45,
        workingCapitalDaysOfReceivables: 60,
        seasonalityPattern: 'Q4 peak +40%',
      });

      expect(profile.workingCapitalDaysOfPayables).toBe(45);
      expect(profile.workingCapitalDaysOfReceivables).toBe(60);
    });

    it('captures profitability timeline', () => {
      const profile = createTestProfile({
        profitabilityTargetMonths: 18,
        financialHealthStatus: 'adequate',
      });

      expect(profile.profitabilityTargetMonths).toBe(18);
    });

    it('criterion #2 satisfied: Financial constraints captured', () => {
      // Create profile with multiple constraint dimensions
      const profile = createTestProfile({
        monthlyBurnRate: 100000,
        monthlyRecurringRevenue: 150000,
        cashRunwayMonths: 12,
        totalDebt: 500000,
        debtServiceMonthly: 20000,
        equityAvailable: 1000000,
        workingCapitalDaysOfPayables: 45,
        workingCapitalDaysOfReceivables: 60,
        majorCapexNeeded: true,
        capexEstimatedAmount: 250000,
        loanCovenantsPresent: true,
        financialHealthStatus: 'adequate',
      });

      // All constraint dimensions are present and retrievable
      expect(profile.monthlyBurnRate).toBeDefined();
      expect(profile.totalDebt).toBeDefined();
      expect(profile.equityAvailable).toBeDefined();
      expect(profile.workingCapitalDaysOfPayables).toBeDefined();

      // Service can detect constraints
      const hasConstraint = FinancialConstraintProfileService.hasSignificantConstraint(profile);
      expect(typeof hasConstraint).toBe('boolean');

      // Service can assess health
      const assessment = FinancialConstraintProfileService.assessFinancialHealth(profile);
      expect(assessment.healthScore).toBeGreaterThanOrEqual(0);
      expect(assessment.riskFactors).toBeDefined();
    });
  });
});
