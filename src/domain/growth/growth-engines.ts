/**
 * Phase 9: Growth Operating Engines - Domain Contracts
 *
 * Defines the core value drivers for business growth:
 * - Revenue model and pricing strategy
 * - Customer acquisition and retention metrics
 * - Sales pipeline and deal management
 * - Channel and offer configuration
 *
 * CRITICAL: These contracts are DOMAIN_CONTRACT_ONLY (types + validation).
 * No service implementation or production callers in this slice.
 * Provides foundation for Phase 10+ service layer implementation.
 */

/**
 * Revenue Engine: Core metrics and strategies
 */
export enum RevenueModel {
  SUBSCRIPTION = "SUBSCRIPTION",
  USAGE_BASED = "USAGE_BASED",
  HYBRID = "HYBRID",
  ONE_TIME = "ONE_TIME",
  TIERED = "TIERED",
}

export enum BillingCycle {
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
  ANNUAL = "ANNUAL",
  USAGE = "USAGE",
}

export interface RevenueStream {
  id: string;
  workspaceId: string;
  name: string;
  model: RevenueModel;
  billingCycle: BillingCycle;
  basePrice: number;
  currency: string;
  volume?: number;
  volumeUnit?: string;
  activationDate: Date;
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  createdAt: Date;
  updatedAt: Date;
}

export interface RevenueForecast {
  workspaceId: string;
  month: string; // YYYY-MM
  baselineRevenue: number;
  projectedRevenue: number;
  variance: number;
  variancePercent: number;
  confidence: number; // 0-1
  driversByStream: Record<string, number>;
}

/**
 * Pricing Engine: Price points and elasticity
 */
export enum PricingStrategy {
  COST_PLUS = "COST_PLUS",
  VALUE_BASED = "VALUE_BASED",
  COMPETITIVE = "COMPETITIVE",
  PENETRATION = "PENETRATION",
  SKIMMING = "SKIMMING",
}

export interface PriceTier {
  id: string;
  workspaceId: string;
  name: string;
  entryPrice: number;
  maxPrice: number;
  targetMargin: number; // 0-1
  features: string[];
  targetSegment: string;
  elasticity: number; // -0.5 to -3.0 typical
  activationDate: Date;
  status: "DRAFT" | "ACTIVE" | "SUNSET";
}

export interface PriceOptimization {
  workspaceId: string;
  tierId: string;
  currentPrice: number;
  recommendedPrice: number;
  priceDelta: number;
  expectedDemandChange: number; // -1 to 1
  expectedRevenueImpact: number; // -1 to 1
  confidence: number;
  rationale: string;
}

/**
 * Acquisition Engine: Customer acquisition metrics and channels
 */
export enum AcquisitionChannel {
  DIRECT_SALES = "DIRECT_SALES",
  SELF_SERVE = "SELF_SERVE",
  PARTNER = "PARTNER",
  AFFILIATE = "AFFILIATE",
  ORGANIC = "ORGANIC",
  PAID_SEARCH = "PAID_SEARCH",
  CONTENT = "CONTENT",
  EVENT = "EVENT",
  REFERRAL = "REFERRAL",
}

export interface AcquisitionMetrics {
  workspaceId: string;
  channel: AcquisitionChannel;
  month: string; // YYYY-MM
  leads: number;
  qualifiedLeads: number;
  conversions: number;
  costPerLead: number;
  costPerAcquisition: number;
  targetCPA: number;
  efficiency: number; // actual CPA / target CPA
}

export interface ChannelPerformance {
  workspaceId: string;
  channel: AcquisitionChannel;
  totalInvested: number;
  totalAcquisitions: number;
  avgLifetimeValue: number;
  roi: number;
  trend: "IMPROVING" | "STABLE" | "DECLINING";
  marketShare: number; // 0-1
}

/**
 * Retention Engine: Customer retention and churn metrics
 */
export interface RetentionMetrics {
  workspaceId: string;
  cohortMonth: string; // YYYY-MM (when customers joined)
  cohortSize: number;
  monthlyRetention: Record<number, number>; // 0-1 for each month (1 = January, 2 = February, etc.)
  avgMonthlyChurn: number; // 0-1
  nMonthRetention: Record<number, number>; // n-month retention rates
  segment?: string;
}

export enum ChurnReason {
  PRODUCT_UNFIT = "PRODUCT_UNFIT",
  PRICE_SENSITIVITY = "PRICE_SENSITIVITY",
  COMPETITION = "COMPETITION",
  USAGE_DECLINE = "USAGE_DECLINE",
  FEATURE_LACK = "FEATURE_LACK",
  SUPPORT_ISSUE = "SUPPORT_ISSUE",
  FINANCIAL_DIFFICULTY = "FINANCIAL_DIFFICULTY",
  OTHER = "OTHER",
}

export interface ChurnAnalysis {
  workspaceId: string;
  customerId: string;
  churnRisk: number; // 0-1 probability
  primaryReason: ChurnReason;
  confidenceFactors: string[];
  interventionRecommendations: string[];
}

/**
 * Sales Pipeline Engine: Deal tracking and forecasting
 */
export enum DealStage {
  PROSPECT = "PROSPECT",
  QUALIFIED = "QUALIFIED",
  PROPOSAL = "PROPOSAL",
  NEGOTIATION = "NEGOTIATION",
  CLOSED_WON = "CLOSED_WON",
  CLOSED_LOST = "CLOSED_LOST",
}

export interface SalesDeal {
  id: string;
  workspaceId: string;
  companyName: string;
  contactName: string;
  stage: DealStage;
  value: number;
  currency: string;
  expectedCloseDate: Date;
  daysInStage: number;
  probability: number; // 0-1
  lastActivity: Date;
  owner: string;
  notes: string;
}

export interface SalesPipeline {
  workspaceId: string;
  month: string; // YYYY-MM
  stageBreakdown: Record<DealStage, { count: number; value: number }>;
  totalPipelineValue: number;
  weightedForecast: number; // sum(value * probability)
  avgDealSize: number;
  avgSalesVelocity: number; // days per stage
}

/**
 * Offer Engine: Bundling and packaging
 */
export interface Offer {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  basePrice: number;
  discountPercent: number; // 0-100
  effectivePrice: number;
  bundledFeatures: string[];
  targetSegment: string;
  validFrom: Date;
  validUntil: Date;
  maxUses?: number;
  usesRemaining?: number;
  status: "DRAFT" | "ACTIVE" | "EXPIRED";
}

export interface OfferPerformance {
  workspaceId: string;
  offerId: string;
  month: string; // YYYY-MM
  impressions: number;
  conversions: number;
  conversionRate: number;
  avgOrderValue: number;
  totalRevenue: number;
  grossMargin: number;
}

/**
 * Validators for Growth Operating Engines
 */

export function validateRevenueStream(stream: Partial<RevenueStream>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!stream.name || stream.name.trim().length === 0) {
    errors.push("Revenue stream name is required");
  }

  if (!stream.model || !Object.values(RevenueModel).includes(stream.model)) {
    errors.push("Valid revenue model is required");
  }

  if (!stream.basePrice || stream.basePrice < 0) {
    errors.push("Base price must be greater than 0");
  }

  if (!stream.currency || stream.currency.length !== 3) {
    errors.push("Valid 3-letter currency code is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validatePriceTier(tier: Partial<PriceTier>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!tier.name || tier.name.trim().length === 0) {
    errors.push("Tier name is required");
  }

  if (!tier.entryPrice || tier.entryPrice < 0) {
    errors.push("Entry price must be >= 0");
  }

  if (!tier.maxPrice || tier.maxPrice < tier.entryPrice!) {
    errors.push("Max price must be >= entry price");
  }

  if (tier.targetMargin === undefined || tier.targetMargin < 0 || tier.targetMargin > 1) {
    errors.push("Target margin must be between 0 and 1");
  }

  if (!tier.features || !Array.isArray(tier.features) || tier.features.length === 0) {
    errors.push("At least one feature is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateAcquisitionMetrics(metrics: Partial<AcquisitionMetrics>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!metrics.channel || !Object.values(AcquisitionChannel).includes(metrics.channel)) {
    errors.push("Valid acquisition channel is required");
  }

  if (!metrics.month || !/^\d{4}-\d{2}$/.test(metrics.month)) {
    errors.push("Month must be in YYYY-MM format");
  }

  if (metrics.leads === undefined || metrics.leads < 0) {
    errors.push("Leads must be >= 0");
  }

  if (metrics.costPerAcquisition === undefined || metrics.costPerAcquisition < 0) {
    errors.push("Cost per acquisition must be >= 0");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateRetentionMetrics(metrics: Partial<RetentionMetrics>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!metrics.cohortMonth || !/^\d{4}-\d{2}$/.test(metrics.cohortMonth)) {
    errors.push("Cohort month must be in YYYY-MM format");
  }

  if (!metrics.monthlyRetention || typeof metrics.monthlyRetention !== "object") {
    errors.push("Monthly retention data is required");
  }

  if (metrics.avgMonthlyChurn === undefined || metrics.avgMonthlyChurn < 0 || metrics.avgMonthlyChurn > 1) {
    errors.push("Average monthly churn must be between 0 and 1");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateSalesDeal(deal: Partial<SalesDeal>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!deal.companyName || deal.companyName.trim().length === 0) {
    errors.push("Company name is required");
  }

  if (!deal.stage || !Object.values(DealStage).includes(deal.stage)) {
    errors.push("Valid deal stage is required");
  }

  if (!deal.value || deal.value < 0) {
    errors.push("Deal value must be >= 0");
  }

  if (deal.probability === undefined || deal.probability < 0 || deal.probability > 1) {
    errors.push("Probability must be between 0 and 1");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateOffer(offer: Partial<Offer>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!offer.name || offer.name.trim().length === 0) {
    errors.push("Offer name is required");
  }

  if (!offer.basePrice || offer.basePrice < 0) {
    errors.push("Base price must be >= 0");
  }

  if (offer.discountPercent === undefined || offer.discountPercent < 0 || offer.discountPercent > 100) {
    errors.push("Discount percent must be between 0 and 100");
  }

  if (!offer.bundledFeatures || !Array.isArray(offer.bundledFeatures) || offer.bundledFeatures.length === 0) {
    errors.push("At least one bundled feature is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
