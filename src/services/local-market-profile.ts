// Service for managing local market constraints
// Phase 2 Acceptance Criterion #4: "Local context is captured"

import {
  CreateLocalMarketProfileRequest,
  CreateLocalMarketProfileRequestSchema,
  LocalMarketProfile,
  LocalMarketProfileSchema,
} from '../domain/local-market-profile';

export class LocalMarketProfileService {
  // Pure function: detect market headwinds
  static hasMarketHeadwinds(profile: LocalMarketProfile | null): boolean {
    if (!profile) return false;

    const decliningMarket =
      profile.marketGrowthPercentage !== null &&
      profile.marketGrowthPercentage !== undefined &&
      profile.marketGrowthPercentage < 0;

    const highCompetition =
      profile.competitiveness === 'high' || profile.competitiveness === 'very_high';

    const priceDecay =
      profile.priceCompression === true &&
      profile.priceCompressionRate !== null &&
      profile.priceCompressionRate !== undefined &&
      profile.priceCompressionRate > 3;

    const risingCosts =
      profile.laborMarketTightness === 'tight' || profile.laborMarketTightness === 'very_tight';

    return decliningMarket || highCompetition || priceDecay || risingCosts;
  }

  // Pure function: detect regulatory challenges
  static hasRegulatoryRisk(profile: LocalMarketProfile | null): boolean {
    if (!profile) return false;

    const volatileRegulatory =
      profile.regulatoryEnvironment === 'volatile' ||
      profile.regulatoryEnvironment === 'uncertain';

    const highCompliance = profile.complianceBurden === 'high';

    return volatileRegulatory || highCompliance;
  }

  static validateRequest(request: unknown): CreateLocalMarketProfileRequest {
    return CreateLocalMarketProfileRequestSchema.parse(request);
  }

  static validateProfile(profile: unknown): LocalMarketProfile {
    return LocalMarketProfileSchema.parse(profile);
  }
}
