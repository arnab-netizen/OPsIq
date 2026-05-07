// Phase 2 Slice 9: RecommendationLifecycle - Expiration Policy
// Tests verify recommendation expiration and staleness prevention

import { describe, it, expect } from 'vitest';
import { RecommendationLifecycle } from '../domain/recommendation-lifecycle';
import { RecommendationLifecycleService } from '../services/recommendation-lifecycle';

describe('Phase 2 Slice 9 — RecommendationLifecycle: Expiration Policy', () => {
  const testRecommendationId = '550e8400-e29b-41d4-a716-446655440400';
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';

  const createTestLifecycle = (overrides?: Partial<RecommendationLifecycle>): RecommendationLifecycle => ({
    id: '550e8400-e29b-41d4-a716-446655440800',
    recommendationId: testRecommendationId,
    engagementId: testEngagementId,
    status: 'approved',
    createdAt: new Date(),
    expiresAt: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    expiredAt: null,
    expiryReason: null,
    approvedAt: new Date(),
    approvedBy: '550e8400-e29b-41d4-a716-446655440001',
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    acceptedAt: null,
    acceptedBy: null,
    activatedAt: new Date(),
    completedAt: null,
    completedBy: null,
    isActive: true,
    version: 1,
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('validates recommendation lifecycle schema', () => {
      const lifecycle = createTestLifecycle();
      const validated = RecommendationLifecycleService.validateLifecycle(lifecycle);

      expect(validated.recommendationId).toBe(testRecommendationId);
      expect(validated.status).toBe('approved');
    });

    it('validates create request schema', () => {
      const request = {
        recommendationId: testRecommendationId,
        engagementId: testEngagementId,
        expiresAt: new Date(),
      };

      const validated = RecommendationLifecycleService.validateRequest(request);
      expect(validated.recommendationId).toBe(testRecommendationId);
    });

    it('throws on invalid lifecycle data', () => {
      const invalid = {
        recommendationId: 'not-a-uuid',
        status: 'invalid_status',
      };

      expect(() => RecommendationLifecycleService.validateLifecycle(invalid)).toThrow();
    });
  });

  describe('Behavior - Default Expiration', () => {
    it('calculates 90-day expiration for high confidence', () => {
      const today = new Date();
      const expiresAt = RecommendationLifecycleService.getDefaultExpirationDate('high', today);

      const daysUntilExpiry = Math.round(
        (expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysUntilExpiry).toBe(90);
    });

    it('calculates 30-day expiration for medium confidence', () => {
      const today = new Date();
      const expiresAt = RecommendationLifecycleService.getDefaultExpirationDate('medium', today);

      const daysUntilExpiry = Math.round(
        (expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysUntilExpiry).toBe(30);
    });

    it('calculates 7-day expiration for low confidence', () => {
      const today = new Date();
      const expiresAt = RecommendationLifecycleService.getDefaultExpirationDate('low', today);

      const daysUntilExpiry = Math.round(
        (expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysUntilExpiry).toBe(7);
    });
  });

  describe('Behavior - Expiration Detection', () => {
    it('detects active recommendation (not expired)', () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);

      const lifecycle = createTestLifecycle({ expiresAt: future });
      const isExpired = RecommendationLifecycleService.isExpired(lifecycle);

      expect(isExpired).toBe(false);
    });

    it('detects expired recommendation', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);

      const lifecycle = createTestLifecycle({ expiresAt: past });
      const isExpired = RecommendationLifecycleService.isExpired(lifecycle);

      expect(isExpired).toBe(true);
    });

    it('handles null expiration date', () => {
      const lifecycle = createTestLifecycle({ expiresAt: null });
      const isExpired = RecommendationLifecycleService.isExpired(lifecycle);

      expect(isExpired).toBe(false);
    });

    it('handles null lifecycle', () => {
      const isExpired = RecommendationLifecycleService.isExpired(null);
      expect(isExpired).toBe(false);
    });
  });

  describe('Behavior - Expiration Status', () => {
    it('shows days remaining for active recommendation', () => {
      const future = new Date();
      future.setDate(future.getDate() + 15);

      const lifecycle = createTestLifecycle({ expiresAt: future });
      const status = RecommendationLifecycleService.getExpirationStatus(lifecycle);

      expect(status.isExpired).toBe(false);
      expect(status.daysRemaining).toBeGreaterThanOrEqual(14);
      expect(status.daysRemaining).toBeLessThanOrEqual(15);
      expect(status.isExpiringSoon).toBe(false);
    });

    it('detects expiring soon (within 7 days)', () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 3);

      const lifecycle = createTestLifecycle({ expiresAt: soon });
      const status = RecommendationLifecycleService.getExpirationStatus(lifecycle);

      expect(status.isExpiringSoon).toBe(true);
      expect(status.daysRemaining).toBeGreaterThanOrEqual(2);
      expect(status.daysRemaining).toBeLessThanOrEqual(3);
    });

    it('reports null days remaining when expired', () => {
      const past = new Date();
      past.setDate(past.getDate() - 5);

      const lifecycle = createTestLifecycle({ expiresAt: past });
      const status = RecommendationLifecycleService.getExpirationStatus(lifecycle);

      expect(status.isExpired).toBe(true);
      expect(status.daysRemaining).toBeNull();
    });
  });

  describe('Behavior - Actionability', () => {
    it('is actionable when active and not expired', () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);

      const lifecycle = createTestLifecycle({
        status: 'approved',
        isActive: true,
        expiresAt: future,
      });
      const actionable = RecommendationLifecycleService.isActionable(lifecycle);

      expect(actionable).toBe(true);
    });

    it('is not actionable when expired', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);

      const lifecycle = createTestLifecycle({
        status: 'approved',
        isActive: true,
        expiresAt: past,
      });
      const actionable = RecommendationLifecycleService.isActionable(lifecycle);

      expect(actionable).toBe(false);
    });

    it('is not actionable when status is expired', () => {
      const lifecycle = createTestLifecycle({ status: 'expired', isActive: false });
      const actionable = RecommendationLifecycleService.isActionable(lifecycle);

      expect(actionable).toBe(false);
    });

    it('is not actionable when status is cancelled', () => {
      const lifecycle = createTestLifecycle({ status: 'cancelled', isActive: false });
      const actionable = RecommendationLifecycleService.isActionable(lifecycle);

      expect(actionable).toBe(false);
    });

    it('is not actionable when status is rejected', () => {
      const lifecycle = createTestLifecycle({ status: 'rejected' });
      const actionable = RecommendationLifecycleService.isActionable(lifecycle);

      expect(actionable).toBe(false);
    });

    it('is not actionable when isActive is false', () => {
      const lifecycle = createTestLifecycle({ isActive: false });
      const actionable = RecommendationLifecycleService.isActionable(lifecycle);

      expect(actionable).toBe(false);
    });
  });

  describe('Behavior - Freshness Score', () => {
    it('calculates 1.0 for newly created recommendation', () => {
      const now = new Date();
      const future = new Date(now);
      future.setDate(future.getDate() + 30);

      const lifecycle = createTestLifecycle({
        createdAt: now,
        expiresAt: future,
      });
      const freshness = RecommendationLifecycleService.calculateFreshnessScore(lifecycle);

      expect(freshness).toBeGreaterThan(0.95);
      expect(freshness).toBeLessThanOrEqual(1.0);
    });

    it('calculates 0.5 for halfway through lifecycle', () => {
      const now = new Date();
      const created = new Date(now);
      created.setDate(created.getDate() - 15);
      const future = new Date(now);
      future.setDate(future.getDate() + 15);

      const lifecycle = createTestLifecycle({
        createdAt: created,
        expiresAt: future,
      });
      const freshness = RecommendationLifecycleService.calculateFreshnessScore(lifecycle);

      expect(freshness).toBeGreaterThan(0.45);
      expect(freshness).toBeLessThan(0.55);
    });

    it('calculates ~0.0 for expired recommendation', () => {
      const now = new Date();
      const created = new Date(now);
      created.setDate(created.getDate() - 31);
      const past = new Date(now);
      past.setDate(past.getDate() - 1);

      const lifecycle = createTestLifecycle({
        createdAt: created,
        expiresAt: past,
      });
      const freshness = RecommendationLifecycleService.calculateFreshnessScore(lifecycle);

      expect(freshness).toBeLessThanOrEqual(0.0);
    });
  });

  describe('Behavior - Urgent Review', () => {
    it('flags recommendation expiring within 3 days for urgent review', () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 2);

      const lifecycle = createTestLifecycle({
        isActive: true,
        expiresAt: soon,
      });
      const needsReview = RecommendationLifecycleService.needsUrgentReview(lifecycle);

      expect(needsReview).toBe(true);
    });

    it('does not flag recommendation with 5+ days remaining', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);

      const lifecycle = createTestLifecycle({ expiresAt: future });
      const needsReview = RecommendationLifecycleService.needsUrgentReview(lifecycle);

      expect(needsReview).toBe(false);
    });

    it('does not flag inactive recommendation', () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 2);

      const lifecycle = createTestLifecycle({
        isActive: false,
        expiresAt: soon,
      });
      const needsReview = RecommendationLifecycleService.needsUrgentReview(lifecycle);

      expect(needsReview).toBe(false);
    });
  });

  describe('Acceptance Criteria #8', () => {
    it('criterion #8 satisfied: Recommendation expiration exists', () => {
      // Verify model captures expiration
      const lifecycle = createTestLifecycle();
      expect(lifecycle.expiresAt).toBeDefined();

      // Verify service implements expiration logic
      const defaultExpiry = RecommendationLifecycleService.getDefaultExpirationDate('medium');
      expect(defaultExpiry).toBeInstanceOf(Date);

      // Verify expiration is enforced
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const expiredLifecycle = createTestLifecycle({ expiresAt: past, isActive: true });
      expect(RecommendationLifecycleService.isActionable(expiredLifecycle)).toBe(false);

      // Verify expiration status can be determined
      const status = RecommendationLifecycleService.getExpirationStatus(lifecycle);
      expect(typeof status.isExpired).toBe('boolean');
      expect(status.daysRemaining === null || typeof status.daysRemaining === 'number').toBe(
        true
      );
    });
  });
});
