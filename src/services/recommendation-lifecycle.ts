// Service for managing recommendation lifecycle and expiration
// Phase 2 Acceptance Criterion #8: "Recommendation expiration exists"

import {
  CreateRecommendationLifecycleRequest,
  CreateRecommendationLifecycleRequestSchema,
  RecommendationLifecycle,
  RecommendationLifecycleSchema,
  RecommendationStatus,
  EXPIRATION_DEFAULTS,
} from '../domain/recommendation-lifecycle';

export class RecommendationLifecycleService {
  /**
   * Determine default expiration date based on confidence level
   */
  static getDefaultExpirationDate(
    confidenceLevel: 'high' | 'medium' | 'low',
    createdAt: Date = new Date()
  ): Date {
    const days =
      confidenceLevel === 'high'
        ? EXPIRATION_DEFAULTS.HIGH_CONFIDENCE_STABLE
        : confidenceLevel === 'medium'
          ? EXPIRATION_DEFAULTS.MEDIUM_CONFIDENCE
          : EXPIRATION_DEFAULTS.LOW_CONFIDENCE;

    const expiresAt = new Date(createdAt);
    expiresAt.setDate(expiresAt.getDate() + days);
    return expiresAt;
  }

  /**
   * Check if recommendation is expired (based on expiresAt date)
   */
  static isExpired(lifecycle: RecommendationLifecycle | null): boolean {
    if (!lifecycle) return false;
    if (!lifecycle.expiresAt) return false;
    return new Date() > new Date(lifecycle.expiresAt);
  }

  /**
   * Get expiration status: days remaining, expired, or null if no expiration set
   */
  static getExpirationStatus(
    lifecycle: RecommendationLifecycle | null
  ): {
    isExpired: boolean;
    daysRemaining: number | null;
    isExpiringSoon: boolean; // Within 7 days
  } {
    if (!lifecycle || !lifecycle.expiresAt) {
      return { isExpired: false, daysRemaining: null, isExpiringSoon: false };
    }

    const expiryDate = new Date(lifecycle.expiresAt);
    const now = new Date();
    const daysRemaining = Math.ceil(
      (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      isExpired: daysRemaining < 0,
      daysRemaining: daysRemaining >= 0 ? daysRemaining : null,
      isExpiringSoon: daysRemaining >= 0 && daysRemaining <= 7,
    };
  }

  /**
   * Check if recommendation can be actionable
   * Expired recommendations are not actionable
   */
  static isActionable(lifecycle: RecommendationLifecycle | null): boolean {
    if (!lifecycle) return false;
    if (!lifecycle.isActive) return false;
    if (lifecycle.status === 'expired' || lifecycle.status === 'cancelled') return false;
    if (lifecycle.status === 'rejected') return false;
    if (this.isExpired(lifecycle)) return false;
    return true;
  }

  /**
   * Expire a recommendation with reason
   */
  static expireRecommendation(
    lifecycle: RecommendationLifecycle,
    reason: 'explicit_expiration' | 'stale_evidence' | 'assumption_changed' | 'context_changed'
  ): Partial<RecommendationLifecycle> {
    return {
      status: 'expired' as const,
      isActive: false,
      expiredAt: new Date(),
      expiryReason: reason,
    };
  }

  /**
   * Calculate freshness score (0.0 = expired, 1.0 = just created)
   * Useful for ranking multiple recommendations
   */
  static calculateFreshnessScore(
    lifecycle: RecommendationLifecycle | null
  ): number {
    if (!lifecycle || !lifecycle.expiresAt) return 0.5; // Unknown freshness

    const expiryDate = new Date(lifecycle.expiresAt);
    const createdDate = new Date(lifecycle.createdAt);
    const now = new Date();

    const totalDays =
      (expiryDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
    const daysElapsed =
      (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysElapsed < 0) return 1.0; // Created in future? full freshness
    if (daysElapsed >= totalDays) return 0.0; // Expired
    if (totalDays === 0) return 0.5; // Created today

    // Linear decay from 1.0 to 0.0 as we approach expiration
    return Math.max(0.0, 1.0 - daysElapsed / totalDays);
  }

  /**
   * Assess if recommendation needs urgent review
   */
  static needsUrgentReview(lifecycle: RecommendationLifecycle | null): boolean {
    if (!lifecycle) return false;
    if (!lifecycle.isActive) return false;

    const status = this.getExpirationStatus(lifecycle);
    // Urgent if expiring within 3 days and still actionable
    return status.isExpiringSoon && status.daysRemaining !== null && status.daysRemaining <= 3;
  }

  static validateRequest(request: unknown): CreateRecommendationLifecycleRequest {
    return CreateRecommendationLifecycleRequestSchema.parse(request);
  }

  static validateLifecycle(lifecycle: unknown): RecommendationLifecycle {
    return RecommendationLifecycleSchema.parse(lifecycle);
  }
}
