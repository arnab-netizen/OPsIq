/**
 * Owner Marketing & Growth Intelligence (Module 6) — shared types for the
 * deterministic marketing engine.
 *
 * Pure types only: no DB, no I/O, no LLM. Every snapshot input is optional at the
 * type level; the engine treats missing/invalid numbers as `null` (missing) and
 * never invents a value. `null` on a derived metric means "not computable from the
 * provided data". Marketing is a GROWTH domain (spend efficiency, channel mix,
 * conversion, referral) — its opportunity feeds growthOpportunityScore, distinct
 * from the survival/execution lenses.
 */

export const MARKETING_BUSINESS_MODELS = ["service", "inventory", "hybrid"] as const;
export type MarketingBusinessModel = (typeof MARKETING_BUSINESS_MODELS)[number];

/** Marketing state, most compounding to most wasteful. */
export const MARKETING_STATES = ["COMPOUNDING", "GROWING", "FLAT", "LEAKING", "WASTING"] as const;
export type MarketingState = (typeof MARKETING_STATES)[number];

/** Action-class hierarchy for marketing work. */
export const MARKETING_TIERS = ["rescue", "recovery", "growth", "optimization"] as const;
export type MarketingTier = (typeof MARKETING_TIERS)[number];

/** Raw marketing snapshot entered by the owner for one reporting period. */
export interface MarketingSnapshotInput {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  currency: string;
  businessModel?: MarketingBusinessModel;
  industryTemplate?: string;

  // Spend + return
  marketingSpend?: number;
  revenue?: number; // marketing-attributed revenue this period

  // Funnel
  leads?: number;
  inquiries?: number;
  orders?: number; // marketing-attributed orders
  newCustomers?: number;

  // Channel mix
  paidLeads?: number;
  organicLeads?: number;

  // Activity / offers / advocacy
  campaignsRun?: number;
  campaignsWithFollowup?: number;
  contentPosted?: number;
  couponsRedeemed?: number;
  referrals?: number;
  walkIns?: number;

  notes?: string;
}

/**
 * Deterministic derived marketing metrics. Ratio/per-unit metrics are
 * `number | null` (`null` = not computable). Composite scores are always
 * `0..100`; their trustworthiness is carried by `dataConfidenceScore`.
 */
export interface MarketingDerivedMetrics {
  currency: string;
  currencyValid: boolean;

  costPerLead: number | null; // currency per lead
  costPerOrder: number | null; // currency per order
  campaignRoiPct: number | null; // can be negative
  leadConversionPct: number | null;
  inquiryConversionPct: number | null;
  referralRatePct: number | null;
  organicSharePct: number | null;
  campaignFollowupRatePct: number | null;

  marketingHealthScore: number; // 0..100
  marketingRiskScore: number; // 0..100
  marketingOpportunityScore: number; // 0..100
  dataConfidenceScore: number; // 0..100

  marketingState: MarketingState;
  marketingTier: MarketingTier;

  missingRequiredInputs: string[];
}
