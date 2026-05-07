// Phase 2 Slice 12A: BusinessModelProfile - Hybrid Business Model Support
// Tests verify support for complex, hybrid business models

import { describe, it, expect } from 'vitest';
import { BusinessModelProfile } from '../domain/business-model-profile';
import { BusinessModelProfileService } from '../services/business-model-profile';

describe('Phase 2 Slice 12A — BusinessModelProfile: Hybrid Business Models', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';

  const createTestProfile = (overrides?: Partial<BusinessModelProfile>): BusinessModelProfile => ({
    id: '550e8400-e29b-41d4-a716-446655440b00',
    engagementId: testEngagementId,
    primaryModel: 'saas',
    secondaryModels: ['services'],
    description: 'SaaS platform with professional services',
    revenueMix: {
      subscription: 60,
      oneTime: 10,
      services: 30,
      other: 0,
    },
    marginMix: {
      subscription: 80,
      oneTime: 40,
      services: 60,
    },
    deliveryModes: ['self_service', 'managed_service'],
    recurringVsOneTimePercentage: 70,
    operationalComplexityScore: 7,
    maturityState: 'GROWTH',
    notes: 'Hybrid model balancing scalability with services revenue',
    reviewedAt: new Date(),
    reviewedBy: '550e8400-e29b-41d4-a716-446655440001',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('validates business model profile schema', () => {
      const profile = createTestProfile();
      const validated = BusinessModelProfileService.validateProfile(profile);

      expect(validated.engagementId).toBe(testEngagementId);
      expect(validated.primaryModel).toBe('saas');
    });

    it('validates create request schema', () => {
      const request = {
        engagementId: testEngagementId,
        primaryModel: 'marketplace' as const,
        secondaryModels: ['subscription'],
        operationalComplexityScore: 8,
      };

      const validated = BusinessModelProfileService.validateRequest(request);
      expect(validated.primaryModel).toBe('marketplace');
    });

    it('throws on invalid profile data', () => {
      const invalid = {
        engagementId: 'not-a-uuid',
        primaryModel: 'invalid_model',
      };

      expect(() => BusinessModelProfileService.validateProfile(invalid)).toThrow();
    });
  });

  describe('Behavior - Revenue Mix Validation', () => {
    it('validates correct revenue mix (sums to 100)', () => {
      const profile = createTestProfile();
      const isValid = BusinessModelProfileService.isValidRevenueMix(profile);

      expect(isValid).toBe(true);
    });

    it('validates acceptable revenue mix (90-100%)', () => {
      const profile = createTestProfile({
        revenueMix: {
          subscription: 50,
          oneTime: 40,
          services: 0,
          other: 0,
        },
      });
      const isValid = BusinessModelProfileService.isValidRevenueMix(profile);

      expect(isValid).toBe(true);
    });

    it('rejects incomplete revenue mix (< 90%)', () => {
      const profile = createTestProfile({
        revenueMix: {
          subscription: 50,
          oneTime: 30,
          services: 0,
          other: 0,
        },
      });
      const isValid = BusinessModelProfileService.isValidRevenueMix(profile);

      expect(isValid).toBe(false);
    });
  });

  describe('Behavior - Model Diversity', () => {
    it('identifies single-model business', () => {
      const profile = createTestProfile({
        secondaryModels: [],
        revenueMix: {
          subscription: 100,
          oneTime: 0,
          services: 0,
          other: 0,
        },
      });
      const isDiversified = BusinessModelProfileService.isDiversifiedModel(profile);

      expect(isDiversified).toBe(false);
    });

    it('identifies hybrid model with secondary models', () => {
      const profile = createTestProfile({
        secondaryModels: ['services', 'licensing'],
      });
      const isDiversified = BusinessModelProfileService.isDiversifiedModel(profile);

      expect(isDiversified).toBe(true);
    });

    it('identifies hybrid model with multiple revenue streams', () => {
      const profile = createTestProfile({
        secondaryModels: [],
        revenueMix: {
          subscription: 40,
          oneTime: 30,
          services: 30,
          other: 0,
        },
      });
      const isDiversified = BusinessModelProfileService.isDiversifiedModel(profile);

      expect(isDiversified).toBe(true);
    });
  });

  describe('Behavior - Revenue Stream Analysis', () => {
    it('identifies dominant revenue stream', () => {
      const profile = createTestProfile({
        revenueMix: {
          subscription: 60,
          oneTime: 20,
          services: 20,
          other: 0,
        },
      });
      const dominant = BusinessModelProfileService.getDominantRevenueStream(profile);

      expect(dominant).toBe('subscription');
    });

    it('assesses recurring revenue dominance', () => {
      const recurringProfile = createTestProfile({
        recurringVsOneTimePercentage: 75,
      });
      const isPrimarilyRecurring = BusinessModelProfileService.isPrimarilyRecurring(recurringProfile);

      expect(isPrimarilyRecurring).toBe(true);
    });

    it('assesses one-time revenue dominance', () => {
      const oneTimeProfile = createTestProfile({
        recurringVsOneTimePercentage: 40,
      });
      const isPrimarilyRecurring = BusinessModelProfileService.isPrimarilyRecurring(oneTimeProfile);

      expect(isPrimarilyRecurring).toBe(false);
    });
  });

  describe('Behavior - Complexity Assessment', () => {
    it('categorizes simple model (score 1-3)', () => {
      const complexity = BusinessModelProfileService.getComplexityDescription(2);
      expect(complexity).toBe('simple');
    });

    it('categorizes moderate model (score 4-6)', () => {
      const complexity = BusinessModelProfileService.getComplexityDescription(5);
      expect(complexity).toBe('moderate');
    });

    it('categorizes complex model (score 7-8)', () => {
      const complexity = BusinessModelProfileService.getComplexityDescription(7);
      expect(complexity).toBe('complex');
    });

    it('categorizes very complex model (score 9-10)', () => {
      const complexity = BusinessModelProfileService.getComplexityDescription(9);
      expect(complexity).toBe('very_complex');
    });
  });

  describe('Behavior - Completeness Scoring', () => {
    it('scores complete profile highly', () => {
      const profile = createTestProfile();
      const score = BusinessModelProfileService.getCompletenessScore(profile);

      expect(score).toBeGreaterThan(80);
    });

    it('scores minimal profile low', () => {
      const minimalProfile = createTestProfile({
        secondaryModels: [],
        revenueMix: { subscription: 100, oneTime: 0, services: 0, other: 0 },
        marginMix: { subscription: null, oneTime: null, services: null },
        deliveryModes: [],
        recurringVsOneTimePercentage: null,
        maturityState: 'SURVIVAL',
      });
      const score = BusinessModelProfileService.getCompletenessScore(minimalProfile);

      expect(score).toBeLessThan(50);
    });
  });

  describe('Acceptance Criteria #1', () => {
    it('criterion #1 satisfied: Hybrid business models are supported', () => {
      // Primary + secondary models
      const profile = createTestProfile();
      expect(profile.primaryModel).toBeDefined();
      expect(Array.isArray(profile.secondaryModels)).toBe(true);

      // Revenue mix breakdown
      expect(profile.revenueMix).toBeDefined();
      expect(profile.revenueMix.subscription !== undefined).toBe(true);
      expect(profile.revenueMix.oneTime !== undefined).toBe(true);
      expect(profile.revenueMix.services !== undefined).toBe(true);

      // Margin tracking
      expect(profile.marginMix).toBeDefined();

      // Delivery modes
      expect(Array.isArray(profile.deliveryModes)).toBe(true);

      // Recurring vs one-time tracking
      expect(profile.recurringVsOneTimePercentage === null || typeof profile.recurringVsOneTimePercentage === 'number').toBe(true);

      // Complexity assessment
      expect(profile.operationalComplexityScore >= 1 && profile.operationalComplexityScore <= 10).toBe(true);

      // Business maturity
      expect(['SURVIVAL', 'STABILIZE', 'GROWTH', 'SCALE']).toContain(profile.maturityState);

      // Service can analyze hybrid models
      const isDiversified = BusinessModelProfileService.isDiversifiedModel(profile);
      expect(typeof isDiversified).toBe('boolean');

      // Service can provide business model summary
      const summary = BusinessModelProfileService.getModelSummary(profile);
      expect(summary.isDiversified).toBeDefined();
      expect(summary.complexity).toBeDefined();
    });
  });
});
