// Service for managing hybrid business model profiles
// Phase 2 Acceptance Criterion #1: "Hybrid business models are supported"

import {
  CreateBusinessModelRequest,
  CreateBusinessModelRequestSchema,
  BusinessModelProfile,
  BusinessModelProfileSchema,
  BusinessModelType,
} from '../domain/business-model-profile';

export class BusinessModelProfileService {
  /**
   * Verify revenue mix percentages sum to valid range (90-100%)
   */
  static isValidRevenueMix(profile: BusinessModelProfile): boolean {
    const total =
      (profile.revenueMix.subscription || 0) +
      (profile.revenueMix.oneTime || 0) +
      (profile.revenueMix.services || 0) +
      (profile.revenueMix.other || 0);

    return total >= 90 && total <= 100;
  }

  /**
   * Calculate dominant revenue stream
   */
  static getDominantRevenueStream(
    profile: BusinessModelProfile
  ): 'subscription' | 'oneTime' | 'services' | 'other' {
    const mix = profile.revenueMix;
    const streams = [
      { stream: 'subscription' as const, value: mix.subscription || 0 },
      { stream: 'oneTime' as const, value: mix.oneTime || 0 },
      { stream: 'services' as const, value: mix.services || 0 },
      { stream: 'other' as const, value: mix.other || 0 },
    ];

    return streams.reduce((max, current) =>
      current.value > max.value ? current : max
    ).stream;
  }

  /**
   * Assess business model diversity (single vs hybrid)
   */
  static isDiversifiedModel(profile: BusinessModelProfile): boolean {
    // Has secondary models OR revenue from multiple streams
    if (profile.secondaryModels.length > 0) return true;

    const revStreamsActive = [
      profile.revenueMix.subscription > 0,
      profile.revenueMix.oneTime > 0,
      profile.revenueMix.services > 0,
      profile.revenueMix.other > 0,
    ].filter(Boolean).length;

    return revStreamsActive >= 2;
  }

  /**
   * Get business model complexity description
   */
  static getComplexityDescription(
    score: number
  ): 'simple' | 'moderate' | 'complex' | 'very_complex' {
    if (score <= 3) return 'simple';
    if (score <= 6) return 'moderate';
    if (score <= 8) return 'complex';
    return 'very_complex';
  }

  /**
   * Assess if model is primarily recurring (subscription-heavy)
   */
  static isPrimarilyRecurring(profile: BusinessModelProfile): boolean {
    if (profile.recurringVsOneTimePercentage !== null) {
      return profile.recurringVsOneTimePercentage >= 60;
    }

    // Estimate from revenue mix
    const subscriptionRatio = (profile.revenueMix.subscription || 0) / 100;
    return subscriptionRatio >= 0.6;
  }

  /**
   * Get profile completeness score (0-100)
   * Higher = more complete/detailed profile
   */
  static getCompletenessScore(profile: BusinessModelProfile): number {
    let score = 0;

    // Primary model: 20 points
    if (profile.primaryModel) score += 20;

    // Secondary models: 10 points
    if (profile.secondaryModels.length > 0) score += 10;

    // Revenue mix defined: 20 points
    if (this.isValidRevenueMix(profile)) score += 20;

    // Margin mix defined: 15 points
    if (profile.marginMix.subscription !== null || profile.marginMix.oneTime !== null) {
      score += 15;
    }

    // Delivery modes: 10 points
    if (profile.deliveryModes.length > 0) score += 10;

    // Recurring percentage: 10 points
    if (profile.recurringVsOneTimePercentage !== null) score += 10;

    // Maturity state: 5 points
    if (profile.maturityState) score += 5;

    return Math.min(100, score);
  }

  /**
   * Get model summary for operator visibility
   */
  static getModelSummary(profile: BusinessModelProfile): {
    primary: BusinessModelType;
    isDiversified: boolean;
    dominantRevenue: string;
    complexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
    maturity: string;
    completeness: number;
  } {
    return {
      primary: profile.primaryModel,
      isDiversified: this.isDiversifiedModel(profile),
      dominantRevenue: this.getDominantRevenueStream(profile),
      complexity: this.getComplexityDescription(profile.operationalComplexityScore),
      maturity: profile.maturityState,
      completeness: this.getCompletenessScore(profile),
    };
  }

  static validateRequest(request: unknown): CreateBusinessModelRequest {
    return CreateBusinessModelRequestSchema.parse(request);
  }

  static validateProfile(profile: unknown): BusinessModelProfile {
    return BusinessModelProfileSchema.parse(profile);
  }
}
