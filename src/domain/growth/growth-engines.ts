/**
 * Phase 9: Growth Operating Engines Domain Contracts
 *
 * Defines enums, types, and validators for:
 * - Revenue streams and forecasting
 * - Pricing tiers and strategy
 * - Customer acquisition channels
 * - Retention and churn analysis
 * - Sales pipeline and deals
 * - Promotional offers
 *
 * All growth engines operate on workspace-scoped data.
 * Validators enforce business rules before service processing.
 */

// Revenue Engine Enums
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

// Revenue Stream Interfaces
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
  month: string; // YYYY-MM format
  baselineRevenue: number;
  projectedRevenue: number;
  variance: number;
  variancePercent: number;
  confidence: number; // 0-1
  driversByStream: Record<string, number>;
}

// Pricing Engine Enums
export enum PricingStrategy {
  COST_PLUS = "COST_PLUS",
  VALUE_BASED = "VALUE_BASED",
  COMPETITIVE = "COMPETITIVE",
  PENETRATION = "PENETRATION",
  SKIMMING = "SKIMMING",
}

// Pricing Tier Interfaces
export interface PriceTier {
  id?: string;
  workspaceId?: string;
  name: string;
  entryPrice: number;
  maxPrice: number;
  targetMargin: number; // 0-1
  features: string[];
  activationDate?: Date;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

export interface PriceOptimization {
  tierId: string;
  currentPrice: number;
  recommendedPrice: number;
  elasticity: number; // -1 to 0
  projectedRevenueLift: number; // percent
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

// Acquisition Engine Enums
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

// Acquisition Metrics Interfaces
export interface AcquisitionMetrics {
  channel: AcquisitionChannel;
  month: string; // YYYY-MM format
  leads: number;
  qualifiedLeads?: number;
  conversions: number;
  costPerLead: number;
  costPerAcquisition: number;
  targetCPA: number;
}

export interface ChannelPerformance {
  channel: AcquisitionChannel;
  roi: number; // percent
  efficiency: number; // conversions per 100 leads
  trend: "UP" | "DOWN" | "STABLE";
  recommendation: "INCREASE_SPEND" | "MAINTAIN" | "REDUCE_SPEND" | "PAUSE";
}

// Retention Engine Enums
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

// Retention Metrics Interfaces
export interface RetentionMetrics {
  cohortMonth: string; // YYYY-MM format
  cohortSize?: number;
  monthlyRetention: Record<number, number>; // month -> retention rate (0-1)
  avgMonthlyChurn: number; // 0-1
}

export interface ChurnAnalysis {
  predictedChurnRate: number; // 0-1
  topReasons: Array<{ reason: ChurnReason; weight: number }>;
  riskSegments: string[]; // customer segments at risk
  interventions: string[]; // recommended actions
}

// Sales Pipeline Enums
export enum DealStage {
  PROSPECT = "PROSPECT",
  QUALIFIED = "QUALIFIED",
  PROPOSAL = "PROPOSAL",
  NEGOTIATION = "NEGOTIATION",
  CLOSED_WON = "CLOSED_WON",
  CLOSED_LOST = "CLOSED_LOST",
}

// Sales Pipeline Interfaces
export interface SalesDeal {
  id?: string;
  workspaceId?: string;
  companyName: string;
  stage: DealStage;
  value: number;
  currency: string;
  probability: number; // 0-1
  expectedCloseDate: Date;
  owner?: string;
  notes?: string;
}

export interface SalesPipeline {
  workspaceId: string;
  month: string; // YYYY-MM format
  totalPipeline: number;
  dealsByStage: Record<DealStage, number>;
  winRate: number; // 0-1
  avgDealSize: number;
  salesCycle: number; // days
}

// Offer Engine Interfaces
export interface Offer {
  id?: string;
  workspaceId?: string;
  name: string;
  basePrice: number;
  discountPercent: number; // 0-100
  bundledFeatures: string[];
  validFrom?: Date;
  validUntil?: Date;
  status?: "DRAFT" | "ACTIVE" | "EXPIRED";
  maxUses?: number;
  usedCount?: number;
}

export interface OfferPerformance {
  offerId: string;
  conversionLift: number; // percent
  revenueImpact: number; // absolute
  profitMargin: number; // 0-1
  recommendation: "EXTEND" | "MODIFY_TERMS" | "RETIRE";
}

// VALIDATORS

/**
 * Validate revenue stream with business rules
 */
export function validateRevenueStream(
  stream: Partial<RevenueStream>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!stream.name || stream.name.trim().length === 0) {
    errors.push("Revenue stream name is required");
  }

  if (!stream.model || !Object.values(RevenueModel).includes(stream.model)) {
    errors.push("Valid revenue model is required");
  }

  if (stream.basePrice === undefined || stream.basePrice === null) {
    errors.push("Base price is required");
  } else if (stream.basePrice < 0) {
    errors.push("Base price must be non-negative");
  }

  if (!stream.currency) {
    errors.push("Currency is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate price tier with business rules
 */
export function validatePriceTier(tier: Partial<PriceTier>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!tier.name) {
    errors.push("Tier name is required");
  }

  if (tier.entryPrice === undefined || tier.entryPrice === null) {
    errors.push("Entry price is required");
  }

  if (tier.maxPrice === undefined || tier.maxPrice === null) {
    errors.push("Max price is required");
  }

  if (tier.entryPrice !== undefined && tier.maxPrice !== undefined && tier.maxPrice < tier.entryPrice) {
    errors.push("Max price must be greater than or equal to entry price");
  }

  if (tier.targetMargin === undefined || tier.targetMargin === null) {
    errors.push("Target margin is required");
  } else if (tier.targetMargin < 0 || tier.targetMargin > 1) {
    errors.push("Target margin must be between 0 and 1");
  }

  if (!tier.features || tier.features.length === 0) {
    errors.push("At least one feature is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate acquisition metrics with business rules
 */
export function validateAcquisitionMetrics(
  metrics: Partial<AcquisitionMetrics>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!metrics.channel) {
    errors.push("Acquisition channel is required");
  }

  if (!metrics.month || !/^\d{4}-\d{2}$/.test(metrics.month)) {
    errors.push("Month must be in YYYY-MM format");
  }

  if (metrics.leads === undefined || metrics.leads === null) {
    errors.push("Leads count is required");
  }

  if (metrics.conversions === undefined || metrics.conversions === null) {
    errors.push("Conversions count is required");
  }

  if (metrics.costPerAcquisition !== undefined && metrics.costPerAcquisition < 0) {
    errors.push("Cost per acquisition must be non-negative");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate retention metrics with business rules
 */
export function validateRetentionMetrics(
  metrics: Partial<RetentionMetrics>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!metrics.cohortMonth || !/^\d{4}-\d{2}$/.test(metrics.cohortMonth)) {
    errors.push("Cohort month must be in YYYY-MM format");
  }

  if (metrics.avgMonthlyChurn !== undefined) {
    if (metrics.avgMonthlyChurn < 0 || metrics.avgMonthlyChurn > 1) {
      errors.push("Average monthly churn must be between 0 and 1");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate sales deal with business rules
 */
export function validateSalesDeal(deal: Partial<SalesDeal>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!deal.companyName) {
    errors.push("Company name is required");
  }

  if (!deal.stage) {
    errors.push("Deal stage is required");
  }

  if (deal.value === undefined || deal.value === null) {
    errors.push("Deal value is required");
  } else if (deal.value < 0) {
    errors.push("Deal value must be non-negative");
  }

  if (deal.probability !== undefined) {
    if (deal.probability < 0 || deal.probability > 1) {
      errors.push("Probability must be between 0 and 1");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate offer with business rules
 */
export function validateOffer(offer: Partial<Offer>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!offer.name) {
    errors.push("Offer name is required");
  }

  if (offer.basePrice === undefined || offer.basePrice === null) {
    errors.push("Base price is required");
  } else if (offer.basePrice < 0) {
    errors.push("Base price must be non-negative");
  }

  if (offer.discountPercent === undefined || offer.discountPercent === null) {
    errors.push("Discount percent is required");
  } else if (offer.discountPercent < 0 || offer.discountPercent > 100) {
    errors.push("Discount percent must be between 0 and 100");
  }

  if (!offer.bundledFeatures || offer.bundledFeatures.length === 0) {
    errors.push("At least one bundled feature is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
