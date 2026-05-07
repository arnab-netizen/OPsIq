// Domain model for engagement-level local market context
// Phase 2: Captures geographic, competitive, and regulatory market constraints

import { z } from 'zod';

export const MarketCompetitiveness = z.enum(['low', 'moderate', 'high', 'very_high']);
export type MarketCompetitiveness = z.infer<typeof MarketCompetitiveness>;

export const RegulatoryEnvironment = z.enum(['stable', 'evolving', 'volatile', 'uncertain']);
export type RegulatoryEnvironment = z.infer<typeof RegulatoryEnvironment>;

export const LocalMarketProfileSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  primaryGeography: z.string().nullable().optional(), // e.g., "United States", "Northeast"
  secondaryGeographies: z.string().nullable().optional(), // CSV list
  marketSizeMillions: z.number().int().nonnegative().nullable().optional(),
  marketGrowthPercentage: z.number().min(-100).max(100).nullable().optional(),
  marketShare: z.number().min(0).max(100).nullable().optional(),
  competitorCount: z.number().int().nonnegative().nullable().optional(),
  competitiveness: MarketCompetitiveness.default('moderate'),
  barriersToEntry: z.string().nullable().optional(), // e.g., "high capital requirements", "regulatory"
  customerConcentrationGeographic: z.number().min(0).max(100).nullable().optional(), // % in primary geography
  priceCompression: z.boolean().default(false),
  priceCompressionRate: z.number().min(0).max(100).nullable().optional(), // % annual decline
  demandTrend: z.enum(['accelerating', 'stable', 'declining', 'cyclical']).nullable().optional(),
  seasonalityByGeography: z.string().nullable().optional(), // JSON object
  regulatoryEnvironment: RegulatoryEnvironment.default('stable'),
  regulatoryRisks: z.string().nullable().optional(), // CSV list
  complianceBurden: z.enum(['low', 'moderate', 'high']).default('moderate'),
  keyRegulatoryChanges: z.string().nullable().optional(),
  laborMarketTightness: z.enum(['loose', 'balanced', 'tight', 'very_tight']).nullable().optional(),
  supplyChainVulnerabilities: z.string().nullable().optional(), // CSV list
  transportationCosts: z.enum(['low', 'moderate', 'high']).nullable().optional(),
  taxEnvironmentRating: z.number().min(1).max(10).nullable().optional(), // 1=worst, 10=best
  infrastructureQuality: z.enum(['poor', 'adequate', 'good', 'excellent']).nullable().optional(),
  skillsAvailability: z.enum(['limited', 'adequate', 'strong']).nullable().optional(),
  assessedBy: z.string().uuid().nullable().optional(),
  assessedAt: z.date().nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type LocalMarketProfile = z.infer<typeof LocalMarketProfileSchema>;

export const CreateLocalMarketProfileRequestSchema = z.object({
  engagementId: z.string().uuid(),
  primaryGeography: z.string().optional(),
  secondaryGeographies: z.string().optional(),
  marketSizeMillions: z.number().int().nonnegative().optional(),
  marketGrowthPercentage: z.number().min(-100).max(100).optional(),
  marketShare: z.number().min(0).max(100).optional(),
  competitorCount: z.number().int().nonnegative().optional(),
  competitiveness: MarketCompetitiveness.optional().default('moderate'),
  barriersToEntry: z.string().optional(),
  customerConcentrationGeographic: z.number().min(0).max(100).optional(),
  priceCompression: z.boolean().optional(),
  priceCompressionRate: z.number().min(0).max(100).optional(),
  demandTrend: z.enum(['accelerating', 'stable', 'declining', 'cyclical']).optional(),
  seasonalityByGeography: z.string().optional(),
  regulatoryEnvironment: RegulatoryEnvironment.optional().default('stable'),
  regulatoryRisks: z.string().optional(),
  complianceBurden: z.enum(['low', 'moderate', 'high']).optional(),
  keyRegulatoryChanges: z.string().optional(),
  laborMarketTightness: z.enum(['loose', 'balanced', 'tight', 'very_tight']).optional(),
  supplyChainVulnerabilities: z.string().optional(),
  transportationCosts: z.enum(['low', 'moderate', 'high']).optional(),
  taxEnvironmentRating: z.number().min(1).max(10).optional(),
  infrastructureQuality: z.enum(['poor', 'adequate', 'good', 'excellent']).optional(),
  skillsAvailability: z.enum(['limited', 'adequate', 'strong']).optional(),
  assessedBy: z.string().uuid().optional(),
});

export type CreateLocalMarketProfileRequest = z.infer<typeof CreateLocalMarketProfileRequestSchema>;
