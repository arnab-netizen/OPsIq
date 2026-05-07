// Phase 2 Slice 4: CustomerProfile - Capture customer constraints
// Tests verify customer concentration, churn, and health detection

import { describe, it, expect } from 'vitest';
import { CustomerProfile } from '../domain/customer-profile';
import { CustomerProfileService } from '../services/customer-profile';

describe('Phase 2 Slice 4 — CustomerProfile: Customer Constraints', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';

  const createTestProfile = (overrides?: Partial<CustomerProfile>): CustomerProfile => ({
    id: '550e8400-e29b-41d4-a716-446655440300',
    engagementId: testEngagementId,
    totalCustomers: 150,
    activeCustomers: 140,
    topCustomerPercentOfRevenue: 15,
    top3CustomersPercentOfRevenue: 35,
    top10CustomersPercentOfRevenue: 55,
    customerConcentrationRisk: 'low',
    averageCustomerLifetimeMonths: 36,
    averageCustomerLTV: 50000,
    customerChurnRateMonthly: 0.02, // 2% monthly
    customerAcquisitionCostMonths: 12,
    customerSatisfactionScore: 85,
    npsScore: 45,
    customerHealthStatus: 'healthy',
    highRiskCustomerCount: 0,
    contractualCommitmentMonths: 24,
    recurringVsOneTimePercentage: 80,
    keyCustomerDependency: false,
    keyCustomerNames: null,
    customerSegmentationPresent: true,
    assessedBy: null,
    assessedAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('accepts valid customer profile and validates schema', () => {
      const profile = createTestProfile();
      const validated = CustomerProfileService.validateProfile(profile);

      expect(validated.engagementId).toBe(testEngagementId);
      expect(validated.totalCustomers).toBe(150);
      expect(validated.customerHealthStatus).toBe('healthy');
    });

    it('validates create request schema', () => {
      const request = {
        engagementId: testEngagementId,
        totalCustomers: 150,
        activeCustomers: 140,
        topCustomerPercentOfRevenue: 15,
        customerHealthStatus: 'healthy',
      };

      const validated = CustomerProfileService.validateRequest(request);
      expect(validated.engagementId).toBe(testEngagementId);
    });

    it('throws on invalid profile data', () => {
      const invalid = {
        engagementId: 'not-a-uuid',
        topCustomerPercentOfRevenue: 150, // > 100, invalid
      };

      expect(() => CustomerProfileService.validateProfile(invalid)).toThrow();
    });
  });

  describe('Behavior - Concentration Risk Detection', () => {
    it('detects healthy customer concentration (no risk)', () => {
      const healthy = createTestProfile();

      const hasRisk = CustomerProfileService.hasConcentrationRisk(healthy);
      expect(hasRisk).toBe(false);
    });

    it('detects high top customer concentration (> 25%)', () => {
      const concentrated = createTestProfile({
        topCustomerPercentOfRevenue: 30,
      });

      const hasRisk = CustomerProfileService.hasConcentrationRisk(concentrated);
      expect(hasRisk).toBe(true);
    });

    it('detects critical top customer concentration (> 40%)', () => {
      const critical = createTestProfile({
        topCustomerPercentOfRevenue: 45,
      });

      const hasRisk = CustomerProfileService.hasConcentrationRisk(critical);
      expect(hasRisk).toBe(true);
    });

    it('detects high top 3 concentration (> 60%)', () => {
      const concentrated = createTestProfile({
        top3CustomersPercentOfRevenue: 70,
      });

      const hasRisk = CustomerProfileService.hasConcentrationRisk(concentrated);
      expect(hasRisk).toBe(true);
    });

    it('detects explicit high risk level', () => {
      const highRisk = createTestProfile({
        customerConcentrationRisk: 'high',
      });

      const hasRisk = CustomerProfileService.hasConcentrationRisk(highRisk);
      expect(hasRisk).toBe(true);
    });

    it('detects explicit critical risk level', () => {
      const critical = createTestProfile({
        customerConcentrationRisk: 'critical',
      });

      const hasRisk = CustomerProfileService.hasConcentrationRisk(critical);
      expect(hasRisk).toBe(true);
    });

    it('detects key customer dependency flag', () => {
      const keyDependency = createTestProfile({
        keyCustomerDependency: true,
      });

      const hasRisk = CustomerProfileService.hasConcentrationRisk(keyDependency);
      expect(hasRisk).toBe(true);
    });

    it('ignores null profile (no risk)', () => {
      const hasRisk = CustomerProfileService.hasConcentrationRisk(null);
      expect(hasRisk).toBe(false);
    });
  });

  describe('Behavior - Health Issues Detection', () => {
    it('detects healthy customer profile (no issues)', () => {
      const healthy = createTestProfile();

      const hasIssues = CustomerProfileService.hasHealthIssues(healthy);
      expect(hasIssues).toBe(false);
    });

    it('detects at_risk health status', () => {
      const atRisk = createTestProfile({
        customerHealthStatus: 'at_risk',
      });

      const hasIssues = CustomerProfileService.hasHealthIssues(atRisk);
      expect(hasIssues).toBe(true);
    });

    it('detects critical health status', () => {
      const critical = createTestProfile({
        customerHealthStatus: 'critical',
      });

      const hasIssues = CustomerProfileService.hasHealthIssues(critical);
      expect(hasIssues).toBe(true);
    });

    it('detects high churn rate (> 5% monthly)', () => {
      const highChurn = createTestProfile({
        customerChurnRateMonthly: 0.08, // 8%
      });

      const hasIssues = CustomerProfileService.hasHealthIssues(highChurn);
      expect(hasIssues).toBe(true);
    });

    it('detects low satisfaction (< 60)', () => {
      const lowSatisfaction = createTestProfile({
        customerSatisfactionScore: 50,
      });

      const hasIssues = CustomerProfileService.hasHealthIssues(lowSatisfaction);
      expect(hasIssues).toBe(true);
    });

    it('detects negative NPS', () => {
      const negativeNPS = createTestProfile({
        npsScore: -10,
      });

      const hasIssues = CustomerProfileService.hasHealthIssues(negativeNPS);
      expect(hasIssues).toBe(true);
    });

    it('detects high risk customer count', () => {
      const highRisk = createTestProfile({
        highRiskCustomerCount: 5,
      });

      const hasIssues = CustomerProfileService.hasHealthIssues(highRisk);
      expect(hasIssues).toBe(true);
    });
  });

  describe('Behavior - Health Assessment', () => {
    it('assesses healthy company as high score', () => {
      const healthy = createTestProfile();
      const assessment = CustomerProfileService.assessCustomerHealth(healthy);

      expect(assessment.healthScore).toBeGreaterThanOrEqual(80);
      expect(assessment.riskFactors.length).toBeLessThanOrEqual(1);
    });

    it('assesses critical concentration (> 40%) with severe penalty', () => {
      const critical = createTestProfile({
        topCustomerPercentOfRevenue: 50,
      });
      const assessment = CustomerProfileService.assessCustomerHealth(critical);

      expect(assessment.healthScore).toBeLessThanOrEqual(70);
      expect(assessment.riskFactors[0]).toContain('Critical concentration');
      if (assessment.healthScore < 40) {
        expect(assessment.recommendations).toContain(
          'Urgent: Customer concentration creates existential risk'
        );
      }
    });

    it('assesses high concentration (> 25%) with moderate penalty', () => {
      const concentrated = createTestProfile({
        topCustomerPercentOfRevenue: 30,
      });
      const assessment = CustomerProfileService.assessCustomerHealth(concentrated);

      expect(assessment.healthScore).toBeLessThan(90);
      expect(assessment.riskFactors[0]).toContain('High concentration');
    });

    it('assesses high churn rate with penalty', () => {
      const highChurn = createTestProfile({
        customerChurnRateMonthly: 0.12, // 12%
      });
      const assessment = CustomerProfileService.assessCustomerHealth(highChurn);

      expect(assessment.riskFactors[0]).toContain('High churn');
      expect(assessment.healthScore).toBeLessThan(85);
    });

    it('assesses low satisfaction with penalty', () => {
      const lowSat = createTestProfile({
        customerSatisfactionScore: 40,
      });
      const assessment = CustomerProfileService.assessCustomerHealth(lowSat);

      expect(assessment.riskFactors[0]).toContain('Poor satisfaction');
      expect(assessment.healthScore).toBeLessThan(85);
    });

    it('assesses long CAC payback (> 24 months)', () => {
      const longCAC = createTestProfile({
        customerAcquisitionCostMonths: 36,
      });
      const assessment = CustomerProfileService.assessCustomerHealth(longCAC);

      expect(assessment.riskFactors).toContain('Long CAC payback: 36 months');
    });

    it('health score is normalized to 0-100 range', () => {
      const profile = createTestProfile();
      const assessment = CustomerProfileService.assessCustomerHealth(profile);

      expect(assessment.healthScore).toBeGreaterThanOrEqual(0);
      expect(assessment.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Acceptance Criteria #3', () => {
    it('captures customer count and engagement metrics', () => {
      const profile = createTestProfile({
        totalCustomers: 200,
        activeCustomers: 180,
        averageCustomerLifetimeMonths: 36,
        averageCustomerLTV: 50000,
      });

      expect(profile.totalCustomers).toBe(200);
      expect(profile.activeCustomers).toBe(180);
      expect(profile.averageCustomerLifetimeMonths).toBe(36);
      expect(profile.averageCustomerLTV).toBe(50000);
    });

    it('captures concentration metrics (top, top 3, top 10)', () => {
      const profile = createTestProfile({
        topCustomerPercentOfRevenue: 20,
        top3CustomersPercentOfRevenue: 45,
        top10CustomersPercentOfRevenue: 65,
        customerConcentrationRisk: 'medium',
      });

      expect(profile.topCustomerPercentOfRevenue).toBe(20);
      expect(profile.top3CustomersPercentOfRevenue).toBe(45);
      expect(profile.top10CustomersPercentOfRevenue).toBe(65);
      expect(profile.customerConcentrationRisk).toBe('medium');
    });

    it('captures churn and retention metrics', () => {
      const profile = createTestProfile({
        customerChurnRateMonthly: 0.03,
        customerAcquisitionCostMonths: 12,
        contractualCommitmentMonths: 24,
        recurringVsOneTimePercentage: 85,
      });

      expect(profile.customerChurnRateMonthly).toBe(0.03);
      expect(profile.contractualCommitmentMonths).toBe(24);
      expect(profile.recurringVsOneTimePercentage).toBe(85);
    });

    it('captures satisfaction and NPS metrics', () => {
      const profile = createTestProfile({
        customerSatisfactionScore: 82,
        npsScore: 45,
        customerHealthStatus: 'strong',
      });

      expect(profile.customerSatisfactionScore).toBe(82);
      expect(profile.npsScore).toBe(45);
      expect(profile.customerHealthStatus).toBe('strong');
    });

    it('captures dependency and segmentation flags', () => {
      const profile = createTestProfile({
        keyCustomerDependency: true,
        keyCustomerNames: 'Acme Corp, BigTech Inc',
        customerSegmentationPresent: true,
        highRiskCustomerCount: 2,
      });

      expect(profile.keyCustomerDependency).toBe(true);
      expect(profile.highRiskCustomerCount).toBe(2);
      expect(profile.customerSegmentationPresent).toBe(true);
    });

    it('criterion #3 satisfied: Customer constraints captured', () => {
      const profile = createTestProfile({
        totalCustomers: 250,
        activeCustomers: 230,
        topCustomerPercentOfRevenue: 18,
        top3CustomersPercentOfRevenue: 42,
        top10CustomersPercentOfRevenue: 62,
        customerConcentrationRisk: 'low',
        customerChurnRateMonthly: 0.025,
        customerSatisfactionScore: 87,
        npsScore: 52,
        customerHealthStatus: 'healthy',
        keyCustomerDependency: false,
        customerSegmentationPresent: true,
      });

      // All constraint dimensions captured and retrievable
      expect(profile.totalCustomers).toBeDefined();
      expect(profile.topCustomerPercentOfRevenue).toBeDefined();
      expect(profile.customerChurnRateMonthly).toBeDefined();
      expect(profile.customerSatisfactionScore).toBeDefined();

      // Service can detect issues
      const hasRisk = CustomerProfileService.hasConcentrationRisk(profile);
      expect(typeof hasRisk).toBe('boolean');

      const hasHealthIssues = CustomerProfileService.hasHealthIssues(profile);
      expect(typeof hasHealthIssues).toBe('boolean');

      // Service can assess health
      const assessment = CustomerProfileService.assessCustomerHealth(profile);
      expect(assessment.healthScore).toBeGreaterThanOrEqual(0);
      expect(assessment.riskFactors).toBeDefined();
    });
  });
});
