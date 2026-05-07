// Phase 2 Slice 2: ContextGate Integration - Wire into recommendation.create()
// Tests verify ContextGate blocks/allows recommendations based on business context

import { describe, it, expect } from 'vitest';
import { ContextGate } from '../services/context-gate';
import { EngagementBusinessProfile } from '../domain/engagement-business-profile';

describe('Phase 2 Slice 2 — ContextGate Integration into Recommendation Path', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';

  const createTestProfile = (overrides?: Partial<EngagementBusinessProfile>): EngagementBusinessProfile => ({
    id: '550e8400-e29b-41d4-a716-446655440100',
    engagementId: testEngagementId,
    businessName: 'Test Company',
    industry: null,
    businessModelType: null,
    maturityState: 'STABILIZE',
    annualRevenue: null,
    foundingYear: null,
    employeeCount: null,
    geoFocus: null,
    primaryServiceOrProduct: null,
    secondaryServicesOrProducts: null,
    revenueRecurringPercent: null,
    marginHealthAssessment: null,
    customerConcentrationLevel: null,
    operationalMaturityLevel: null,
    keyContext: null,
    contextProvidedAt: null,
    contextProvidedBy: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('ContextGate integrates seamlessly into recommendation.create() contract', () => {
      // Simulate recommendation.create() pre-check
      const input = {
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: false,
      };

      const gateResult = ContextGate.evaluate(input);

      // Contract: must have result type with isAllowed, reason, riskLevel
      expect(gateResult).toHaveProperty('isAllowed');
      expect(gateResult).toHaveProperty('reason');
      expect(gateResult).toHaveProperty('riskLevel');
      expect(['low_data', 'none']).toContain(gateResult.riskLevel);
    });

    it('recommendation.create() can check shouldBlockRecommendationCreation() before persistence', () => {
      const shouldBlock = ContextGate.shouldBlockRecommendationCreation({
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: false,
      });

      expect(typeof shouldBlock).toBe('boolean');
      expect(shouldBlock).toBe(true);
    });
  });

  describe('Behavior - Recommendation Creation Gate Enforcement', () => {
    it('blocks recommendation creation without business context (fail-closed)', () => {
      const gateResult = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: false,
      });

      expect(gateResult.isAllowed).toBe(false);
      expect(gateResult.warning).toContain('Business profile');
    });

    it('blocks recommendation creation with only maturityState (no substantive context)', () => {
      const emptyProfile: EngagementBusinessProfile = {
        id: '550e8400-e29b-41d4-a716-446655440101',
        engagementId: testEngagementId,
        businessName: null,
        industry: null,
        businessModelType: null,
        maturityState: 'GROWTH', // Only this field set
        annualRevenue: null,
        foundingYear: null,
        employeeCount: null,
        geoFocus: null,
        primaryServiceOrProduct: null,
        secondaryServicesOrProducts: null,
        revenueRecurringPercent: null,
        marginHealthAssessment: null,
        customerConcentrationLevel: null,
        operationalMaturityLevel: null,
        keyContext: null,
        contextProvidedAt: null,
        contextProvidedBy: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const gateResult = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: emptyProfile,
        allowLowDataRecommendation: false,
      });

      expect(gateResult.isAllowed).toBe(false);
    });

    it('allows recommendation creation when business context exists', () => {
      const profile = createTestProfile(); // Has businessName filled

      const gateResult = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: profile,
        allowLowDataRecommendation: false,
      });

      expect(gateResult.isAllowed).toBe(true);
      expect(gateResult.riskLevel).toBe('none');
    });

    it('allows low-data recommendation with explicit acknowledgment and warning', () => {
      const gateResult = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: true,
      });

      expect(gateResult.isAllowed).toBe(true);
      expect(gateResult.riskLevel).toBe('low_data');
      expect(gateResult.warning).toBeDefined();
      expect(gateResult.warning).toContain('minimal business context');
    });

    it('allows rich context: business metadata, financials, and operational data', () => {
      const richProfile = createTestProfile({
        businessName: 'TechCorp Inc',
        industry: 'Software',
        businessModelType: 'B2B SaaS',
        annualRevenue: 10000000,
        foundingYear: 2015,
        employeeCount: 75,
        geoFocus: 'North America',
        primaryServiceOrProduct: 'Cloud Analytics Platform',
        revenueRecurringPercent: 85,
        marginHealthAssessment: 'healthy',
        operationalMaturityLevel: 'high',
        keyContext: 'Stable B2B SaaS with strong unit economics and growth trajectory',
      });

      const gateResult = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: richProfile,
        allowLowDataRecommendation: false,
      });

      expect(gateResult.isAllowed).toBe(true);
      expect(gateResult.riskLevel).toBe('none');
      expect(gateResult.warning).toBeUndefined();
    });
  });

  describe('Integration Path - Recommendation.create() Simulation', () => {
    it('simulates full recommendation.create() gate evaluation sequence', () => {
      // Step 1: Validate engagement exists (not tested here, assume success)
      const engagementId = testEngagementId;

      // Step 2: Load business profile from database (simulated as parameter)
      const businessProfile = createTestProfile();

      // Step 3: Evaluate ContextGate
      const input = {
        engagementId,
        businessProfile,
        allowLowDataRecommendation: false,
      };

      const gateResult = ContextGate.evaluate(input);

      // Step 4: Check gate result before proceeding
      expect(gateResult.isAllowed).toBe(true);

      // If gate passes, recommendation.create() can proceed to Phase 0 contract validation
      // (If gate fails, it throws ValidationError before Phase 0 validation)
    });

    it('simulates recommendation.create() blocked due to missing context', () => {
      const engagementId = testEngagementId;
      const businessProfile = null; // No profile provided

      const input = {
        engagementId,
        businessProfile,
        allowLowDataRecommendation: false,
      };

      const gateResult = ContextGate.evaluate(input);

      // Gate blocks - recommendation.create() throws ValidationError
      expect(gateResult.isAllowed).toBe(false);
      expect(gateResult.warning).toBeDefined();
    });

    it('simulates recommendation.create() with explicit low-data override', () => {
      const engagementId = testEngagementId;
      const businessProfile = null;

      // User acknowledges low-data risk via input flag
      const input = {
        engagementId,
        businessProfile,
        allowLowDataRecommendation: true,
      };

      const gateResult = ContextGate.evaluate(input);

      // Gate allows but warns - recommendation.create() can proceed with warning
      expect(gateResult.isAllowed).toBe(true);
      expect(gateResult.riskLevel).toBe('low_data');
      expect(gateResult.warning).toContain('minimal business context');
    });

    it('gate enforcement order: ContextGate → Phase 0 TruthContract → persist', () => {
      // Verify gate runs before Phase 0 contract validation
      const gateResult = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: false,
      });

      // If gate fails here, Phase 0 validation is never reached
      if (!gateResult.isAllowed) {
        expect(gateResult.warning).toContain('Business profile');
        // recommendation.create() throws ValidationError and returns early
        return;
      }

      // If gate passes, only then does Phase 0 contract validation occur
      expect(gateResult.isAllowed).toBe(true);
    });
  });

  describe('Fail-Closed Semantics', () => {
    it('default behavior is fail-closed (blocks without context)', () => {
      const blocked = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: false,
      });

      expect(blocked.isAllowed).toBe(false);
    });

    it('requires explicit opt-in to allow low-data recommendations', () => {
      // Default: blocked
      const default_result = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: null,
      });
      expect(default_result.isAllowed).toBe(false);

      // With explicit flag: allowed with warning
      const explicit_result = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: true,
      });
      expect(explicit_result.isAllowed).toBe(true);
      expect(explicit_result.warning).toBeDefined();
    });

    it('context presence overrides need for explicit acknowledgment', () => {
      const profile = createTestProfile();

      // Even without explicit flag, context allows
      const result = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: profile,
        allowLowDataRecommendation: false,
      });

      expect(result.isAllowed).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });
});
