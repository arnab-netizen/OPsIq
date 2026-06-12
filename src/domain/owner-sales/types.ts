/**
 * Owner Sales (Module 3) — shared types for the deterministic sales engine.
 *
 * Pure types only: no DB, no I/O, no LLM. Monetary values are in the business
 * currency (never assumed USD). Every snapshot input is optional at the type
 * level; the engine treats missing/invalid numbers as `null` (missing) and never
 * invents a value. `null` on a derived metric means "not computable from the
 * provided data". Sales is a GROWTH domain (distinct from the survival lens).
 */

export const SALES_BUSINESS_MODELS = ["service", "inventory", "hybrid"] as const;
export type SalesBusinessModel = (typeof SALES_BUSINESS_MODELS)[number];

/** Sales momentum state, strongest to weakest (growth lens, not survival). */
export const SALES_STATES = ["STRONG", "STEADY", "SOFT", "WEAK", "CRITICAL"] as const;
export type SalesState = (typeof SALES_STATES)[number];

/** Action-class hierarchy for sales work. */
export const SALES_TIERS = ["rescue", "recovery", "growth", "optimization"] as const;
export type SalesTier = (typeof SALES_TIERS)[number];

/** Raw sales snapshot entered by the owner for one reporting period. */
export interface SalesSnapshotInput {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  currency: string;
  businessModel?: SalesBusinessModel;
  industryTemplate?: string;

  // Funnel
  leads?: number;
  qualifiedLeads?: number;
  orders?: number;
  revenue?: number;
  averageOrderValue?: number; // optional direct (else derived from revenue/orders)

  // Customers
  newCustomers?: number;
  repeatCustomers?: number;
  lostCustomers?: number;

  // B2B
  b2bProspects?: number;
  b2bPipelineValue?: number;
  b2bRevenue?: number;
  b2cRevenue?: number;

  // Quality / leakage
  complaints?: number;
  discountAmount?: number;
  refundAmount?: number;

  // Capacity
  staffCount?: number;

  notes?: string;
}

/**
 * Deterministic derived sales metrics. Ratio/per-unit metrics are
 * `number | null` (`null` = not computable). Composite scores are always
 * `0..100`; their trustworthiness is carried by `dataConfidenceScore`.
 */
export interface SalesDerivedMetrics {
  currency: string;
  currencyValid: boolean;

  leadToSaleConversionPct: number | null;
  qualifiedConversionPct: number | null;
  repeatRatePct: number | null;
  newCustomerSharePct: number | null;
  lostCustomerRatePct: number | null;
  acquisitionPerDay: number | null;
  averageOrderValue: number | null;
  salesPerDay: number | null;
  ordersPerDay: number | null;
  salesPerStaff: number | null;
  b2bSharePct: number | null;
  b2cSharePct: number | null;
  b2bPipelineCoveragePct: number | null;
  complaintToSaleRatioPct: number | null;
  discountDependencePct: number | null;
  refundRatePct: number | null;

  salesHealthScore: number; // 0..100
  salesRiskScore: number; // 0..100
  salesOpportunityScore: number; // 0..100
  dataConfidenceScore: number; // 0..100

  salesState: SalesState;
  salesTier: SalesTier;

  missingRequiredInputs: string[];
}
