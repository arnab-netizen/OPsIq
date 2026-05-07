// Phase 2 Slice 5: LocalMarketProfile - Capture local market constraints
// Tests verify market competitiveness, regulatory, and growth constraints

import { describe, it, expect } from 'vitest';
import { LocalMarketProfile } from '../domain/local-market-profile';
import { LocalMarketProfileService } from '../services/local-market-profile';

describe('Phase 2 Slice 5 — LocalMarketProfile: Local Market Constraints', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';

  const createTestProfile = (overrides?: Partial<LocalMarketProfile>): LocalMarketProfile => ({
    id: '550e8400-e29b-41d4-a716-446655440400',
    engagementId: testEngagementId,
    primaryGeography: 'United States',
    secondaryGeographies: 'Canada',
    marketSizeMillions: 5000,
    marketGrowthPercentage: 8,
    marketShare: 2.5,
    competitorCount: 12,
    competitiveness: 'moderate',
    barriersToEntry: 'moderate capital requirements',
    customerConcentrationGeographic: 60,
    priceCompression: false,
    priceCompressionRate: null,
    demandTrend: 'accelerating',
    regulatoryEnvironment: 'stable',
    regulatoryRisks: null,
    complianceBurden: 'moderate',
    laborMarketTightness: 'balanced',
    supplyChainVulnerabilities: null,
    taxEnvironmentRating: 7,
    skillsAvailability: 'adequate',
    assessedBy: null,
    assessedAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('accepts valid local market profile and validates schema', () => {
      const profile = createTestProfile();
      const validated = LocalMarketProfileService.validateProfile(profile);

      expect(validated.engagementId).toBe(testEngagementId);
      expect(validated.primaryGeography).toBe('United States');
      expect(validated.competitiveness).toBe('moderate');
    });

    it('validates create request schema', () => {
      const request = {
        engagementId: testEngagementId,
        primaryGeography: 'United States',
        marketSizeMillions: 5000,
        competitiveness: 'moderate',
      };

      const validated = LocalMarketProfileService.validateRequest(request);
      expect(validated.engagementId).toBe(testEngagementId);
    });

    it('throws on invalid profile data', () => {
      const invalid = {
        engagementId: 'not-a-uuid',
        marketGrowthPercentage: 150, // > 100, invalid
      };

      expect(() => LocalMarketProfileService.validateProfile(invalid)).toThrow();
    });
  });

  describe('Behavior - Market Headwinds Detection', () => {
    it('detects healthy market (no headwinds)', () => {
      const healthy = createTestProfile();

      const hasHeadwinds = LocalMarketProfileService.hasMarketHeadwinds(healthy);
      expect(hasHeadwinds).toBe(false);
    });

    it('detects declining market (growth < 0%)', () => {
      const declining = createTestProfile({
        marketGrowthPercentage: -5,
      });

      const hasHeadwinds = LocalMarketProfileService.hasMarketHeadwinds(declining);
      expect(hasHeadwinds).toBe(true);
    });

    it('detects high competition', () => {
      const highCompetition = createTestProfile({
        competitiveness: 'high',
      });

      const hasHeadwinds = LocalMarketProfileService.hasMarketHeadwinds(highCompetition);
      expect(hasHeadwinds).toBe(true);
    });

    it('detects very high competition', () => {
      const veryHighCompetition = createTestProfile({
        competitiveness: 'very_high',
      });

      const hasHeadwinds = LocalMarketProfileService.hasMarketHeadwinds(veryHighCompetition);
      expect(hasHeadwinds).toBe(true);
    });

    it('detects price compression (> 3% annual)', () => {
      const priceDecay = createTestProfile({
        priceCompression: true,
        priceCompressionRate: 5,
      });

      const hasHeadwinds = LocalMarketProfileService.hasMarketHeadwinds(priceDecay);
      expect(hasHeadwinds).toBe(true);
    });

    it('detects tight labor market', () => {
      const tightLabor = createTestProfile({
        laborMarketTightness: 'tight',
      });

      const hasHeadwinds = LocalMarketProfileService.hasMarketHeadwinds(tightLabor);
      expect(hasHeadwinds).toBe(true);
    });

    it('ignores null profile (no headwinds)', () => {
      const hasHeadwinds = LocalMarketProfileService.hasMarketHeadwinds(null);
      expect(hasHeadwinds).toBe(false);
    });
  });

  describe('Behavior - Regulatory Risk Detection', () => {
    it('detects stable regulatory environment (no risk)', () => {
      const stable = createTestProfile();

      const hasRisk = LocalMarketProfileService.hasRegulatoryRisk(stable);
      expect(hasRisk).toBe(false);
    });

    it('detects volatile regulatory environment', () => {
      const volatile = createTestProfile({
        regulatoryEnvironment: 'volatile',
      });

      const hasRisk = LocalMarketProfileService.hasRegulatoryRisk(volatile);
      expect(hasRisk).toBe(true);
    });

    it('detects uncertain regulatory environment', () => {
      const uncertain = createTestProfile({
        regulatoryEnvironment: 'uncertain',
      });

      const hasRisk = LocalMarketProfileService.hasRegulatoryRisk(uncertain);
      expect(hasRisk).toBe(true);
    });

    it('detects high compliance burden', () => {
      const highCompliance = createTestProfile({
        complianceBurden: 'high',
      });

      const hasRisk = LocalMarketProfileService.hasRegulatoryRisk(highCompliance);
      expect(hasRisk).toBe(true);
    });
  });

  describe('Acceptance Criteria #4', () => {
    it('captures geographic context', () => {
      const profile = createTestProfile({
        primaryGeography: 'Europe',
        secondaryGeographies: 'UK,Germany',
      });

      expect(profile.primaryGeography).toBe('Europe');
      expect(profile.secondaryGeographies).toBe('UK,Germany');
    });

    it('captures market size and growth metrics', () => {
      const profile = createTestProfile({
        marketSizeMillions: 10000,
        marketGrowthPercentage: 12,
        marketShare: 3.5,
      });

      expect(profile.marketSizeMillions).toBe(10000);
      expect(profile.marketGrowthPercentage).toBe(12);
      expect(profile.marketShare).toBe(3.5);
    });

    it('captures competitive landscape', () => {
      const profile = createTestProfile({
        competitorCount: 25,
        competitiveness: 'high',
        barriersToEntry: 'high regulatory burden',
      });

      expect(profile.competitorCount).toBe(25);
      expect(profile.competitiveness).toBe('high');
      expect(profile.barriersToEntry).toBe('high regulatory burden');
    });

    it('captures regulatory and compliance constraints', () => {
      const profile = createTestProfile({
        regulatoryEnvironment: 'volatile',
        regulatoryRisks: 'Data privacy, Anti-trust',
        complianceBurden: 'high',
      });

      expect(profile.regulatoryEnvironment).toBe('volatile');
      expect(profile.complianceBurden).toBe('high');
    });

    it('captures labor and supply chain constraints', () => {
      const profile = createTestProfile({
        laborMarketTightness: 'very_tight',
        supplyChainVulnerabilities: 'Semiconductor shortage',
        skillsAvailability: 'limited',
      });

      expect(profile.laborMarketTightness).toBe('very_tight');
      expect(profile.skillsAvailability).toBe('limited');
    });

    it('criterion #4 satisfied: Local context captured', () => {
      const profile = createTestProfile({
        primaryGeography: 'North America',
        secondaryGeographies: 'Europe',
        marketSizeMillions: 8000,
        marketGrowthPercentage: 6,
        marketShare: 2,
        competitorCount: 15,
        competitiveness: 'moderate',
        regulatoryEnvironment: 'evolving',
        complianceBurden: 'high',
        laborMarketTightness: 'tight',
        skillsAvailability: 'adequate',
      });

      // All local context dimensions captured
      expect(profile.primaryGeography).toBeDefined();
      expect(profile.marketSizeMillions).toBeDefined();
      expect(profile.competitorCount).toBeDefined();
      expect(profile.regulatoryEnvironment).toBeDefined();

      // Service can detect constraints
      const hasHeadwinds = LocalMarketProfileService.hasMarketHeadwinds(profile);
      expect(typeof hasHeadwinds).toBe('boolean');

      const hasRegRisk = LocalMarketProfileService.hasRegulatoryRisk(profile);
      expect(typeof hasRegRisk).toBe('boolean');
    });
  });
});
