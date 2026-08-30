/**
 * Founder / Owner-Only Recovery Mode — shared types.
 *
 * These types describe the real-business metric snapshot, derived metrics,
 * findings, recovery actions, and verification outcomes. All logic that
 * consumes them is pure and unit-tested (no DB, no hardcoded currency).
 */

export const BUSINESS_TYPES = [
  "laundry_local_service",
  "generic_local_service",
  "retail_service_hybrid",
  "retail_storefront",
  "field_mobile_service",
  "appointment_capacity_service",
  "hospitality_food_service",
  "b2b_project_contract_service",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export type Severity = "low" | "medium" | "high" | "critical";

/**
 * Raw metric snapshot as entered by the owner for one reporting period.
 * Every field is optional at the type level; required-field and validity
 * enforcement happens in the validation layer. Monetary values are in the
 * business currency (never assumed USD).
 */
export interface MetricSnapshotInput {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  currency: string;

  revenue?: number;
  totalCosts?: number;
  grossProfit?: number;
  netProfit?: number;
  orderCount?: number;
  kgProcessed?: number;
  piecesProcessed?: number;
  b2cRevenue?: number;
  b2bRevenue?: number;
  newCustomers?: number;
  repeatCustomers?: number;
  dormantContacted?: number;
  averageOrderValue?: number;
  discountAmount?: number;
  refundAmount?: number;
  rewashCount?: number;
  complaintCount?: number;
  receivables?: number;
  staffCost?: number;
  rentCost?: number;
  utilitiesCost?: number;
  materialCost?: number;
  deliveryCost?: number;
  marketingSpend?: number;
  campaignConversions?: number;
  averageTurnaroundHours?: number;
  staffProductivity?: number;
  notes?: string;
}

/**
 * Derived metrics calculated from a snapshot (and optionally the prior
 * snapshot for trend). `null` means "not computable from provided data".
 */
export interface DerivedMetrics {
  currency: string;

  revenueTrendPct: number | null;
  costTrendPct: number | null;
  grossMarginPct: number | null;
  netMarginPct: number | null;
  orderTrendPct: number | null;
  averageOrderValue: number | null;
  repeatCustomerRatePct: number | null;
  b2bSharePct: number | null;
  b2cSharePct: number | null;
  complaintRatePct: number | null;
  refundRatePct: number | null;
  rewashRatePct: number | null;
  receivablesExposurePct: number | null; // receivables / revenue
  deliveryCostRatioPct: number | null; // delivery / revenue
  marketingConversionEfficiency: number | null; // conversions per currency-unit of spend
  staffProductivity: number | null;
  turnaroundHours: number | null;
  discountLeakagePct: number | null; // discount / gross revenue
  cashPressureIndicator: "low" | "medium" | "high" | null;
}

export interface Finding {
  code: string;
  title: string;
  sourceMetric: string;
  currentValue: number | null;
  comparisonValue: number | null;
  threshold: number | null;
  severity: Severity;
  evidence: string;
  whyItMatters: string;
  impactEstimate: number | null; // in business currency where applicable
  impactCurrency: string | null;
  confidence: number; // 0..1
  recommendedAction: string;
  verificationMetric: string;
}

export type ActionEffort = "low" | "medium" | "high";
export type ActionPriority = "low" | "medium" | "high" | "critical";

export interface ActionSpec {
  findingCode: string;
  title: string;
  description: string;
  assignedToRole: string;
  priority: ActionPriority;
  dueInDays: number;
  expectedOutcome: string;
  metricToMove: string;
  baselineValue: number | null;
  targetValue: number | null;
  verificationWindowDays: number;
  effort: ActionEffort;
  confidence: number;
  completionCriteria: string;
  /** Direction the metric should move for success. */
  direction: "up" | "down";
}

export type VerificationStatus =
  | "unverified"
  | "verified_improved"
  | "verified_not_improved"
  | "inconclusive"
  | "disputed";

export interface VerificationResult {
  status: VerificationStatus;
  actualMovement: number | null;
  reachedTarget: boolean;
  reason: string;
}
