// Phase 2 Slice 1: ContextGate - Fail-closed gate for business context
// Tests verify recommendations cannot be created without business context (unless explicitly acknowledged)

import { describe, it, expect } from 'vitest';
import { ContextGate } from '../services/context-gate';
import { EngagementBusinessProfile } from '../domain/engagement-business-profile';

describe('Phase 2 Slice 1 — ContextGate: Business Context Validation', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';

  describe('Contract', () => {
    it('accepts valid ContextGateRequest and returns typed ContextGateResult', () => {
      const request = {
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: false,
      };

      const result = ContextGate.evaluate(request);

      expect(result).toHaveProperty('isAllowed');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('riskLevel');
      expect(typeof result.isAllowed).toBe('boolean');
      expect(typeof result.reason).toBe('string');
      expect(['low_data', 'low_context', 'none']).toContain(result.riskLevel);
    });

    it('handles null businessProfile gracefully', () => {
      const request = {
        engagementId: testEngagementId,
        businessProfile: null,
      };

      const result = ContextGate.evaluate(request);
      expect(result.isAllowed).toBe(false);
      expect(result.riskLevel).toBe('low_data');
    });

    it('handles undefined businessProfile gracefully', () => {
      const request = {
        engagementId: testEngagementId,
      };

      const result = ContextGate.evaluate(request);
      expect(result.isAllowed).toBe(false);
      expect(result.riskLevel).toBe('low_data');
    });
  });

  describe('Behavior', () => {
    it('blocks recommendation creation when engagement has no business context', () => {
      const result = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: false,
      });

      expect(result.isAllowed).toBe(false);
      expect(result.riskLevel).toBe('low_data');
      expect(result.warning).toContain('Business profile');
    });

    it('allows recommendation creation with explicit low-data acknowledgment', () => {
      const result = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: true,
      });

      expect(result.isAllowed).toBe(true);
      expect(result.riskLevel).toBe('low_data');
      expect(result.warning).toContain('minimal business context');
    });

    it('allows recommendation creation when business context exists', () => {
      const profile: EngagementBusinessProfile = {
        id: '550e8400-e29b-41d4-a716-446655440001',
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
      };

      const result = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: profile,
        allowLowDataRecommendation: false,
      });

      expect(result.isAllowed).toBe(true);
      expect(result.riskLevel).toBe('none');
      expect(result.warning).toBeUndefined();
    });

    it('fail-closed: requires explicit acknowledgment without context', () => {
      const blocked = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: false,
      });

      const allowed = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: true,
      });

      expect(blocked.isAllowed).toBe(false);
      expect(allowed.isAllowed).toBe(true);
    });

    it('allows recommendation even without explicit acknowledgment when context exists', () => {
      const profile: EngagementBusinessProfile = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        engagementId: testEngagementId,
        businessName: null,
        industry: 'Software',
        businessModelType: 'B2B',
        maturityState: 'GROWTH',
        annualRevenue: 5000000,
        foundingYear: null,
        employeeCount: 50,
        geoFocus: 'NA',
        primaryServiceOrProduct: 'SaaS Platform',
        secondaryServicesOrProducts: null,
        revenueRecurringPercent: 80,
        marginHealthAssessment: 'healthy',
        customerConcentrationLevel: 'low',
        operationalMaturityLevel: 'medium',
        keyContext: 'Growing tech startup with strong margins',
        contextProvidedAt: new Date(),
        contextProvidedBy: '550e8400-e29b-41d4-a716-446655440003',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = ContextGate.evaluate({
        engagementId: testEngagementId,
        businessProfile: profile,
        allowLowDataRecommendation: false,
      });

      expect(result.isAllowed).toBe(true);
      expect(result.riskLevel).toBe('none');
    });
  });

  describe('Gate Logic', () => {
    it('shouldBlockRecommendationCreation returns inverse of evaluate.isAllowed', () => {
      const requestNoContext = {
        engagementId: testEngagementId,
        businessProfile: null,
        allowLowDataRecommendation: false,
      };

      const resultNoContext = ContextGate.evaluate(requestNoContext);
      const shouldBlockNoContext = ContextGate.shouldBlockRecommendationCreation(requestNoContext);

      expect(shouldBlockNoContext).toBe(!resultNoContext.isAllowed);
      expect(shouldBlockNoContext).toBe(true);
    });

    it('shouldBlockRecommendationCreation returns false when context exists', () => {
      const profile: EngagementBusinessProfile = {
        id: '550e8400-e29b-41d4-a716-446655440004',
        engagementId: testEngagementId,
        businessName: 'Company',
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
      };

      const requestWithContext = {
        engagementId: testEngagementId,
        businessProfile: profile,
        allowLowDataRecommendation: false,
      };

      const shouldBlock = ContextGate.shouldBlockRecommendationCreation(requestWithContext);
      expect(shouldBlock).toBe(false);
    });
  });
});
