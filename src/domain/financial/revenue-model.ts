/**
 * Revenue Model Definition (Phase 5 Slice 1)
 *
 * Defines revenue stream taxonomy, pricing models, and revenue component structure.
 * Non-DB foundation: pure TypeScript types and enums for financial normalization.
 *
 * Tenant-scoped: all revenue models bound to workspaceId.
 */

/**
 * Revenue stream types (how money comes in)
 */
export enum RevenueStreamType {
  // Recurring
  SUBSCRIPTION = "SUBSCRIPTION",
  RECURRING_SERVICE = "RECURRING_SERVICE",

  // One-time
  PRODUCT_SALE = "PRODUCT_SALE",
  LICENSE = "LICENSE",
  PROFESSIONAL_SERVICES = "PROFESSIONAL_SERVICES",
  IMPLEMENTATION = "IMPLEMENTATION",

  // Variable/Usage-based
  USAGE_BASED = "USAGE_BASED",
  TRANSACTION_FEE = "TRANSACTION_FEE",
  COMMISSION = "COMMISSION",

  // Marketplace
  MARKETPLACE_LISTING = "MARKETPLACE_LISTING",
  MARKETPLACE_REVENUE_SHARE = "MARKETPLACE_REVENUE_SHARE",

  // Other
  PARTNERSHIPS = "PARTNERSHIPS",
  OTHER = "OTHER",
}

/**
 * Pricing model structure
 */
export enum PricingModelType {
  FLAT_RATE = "FLAT_RATE",
  TIERED = "TIERED",
  USAGE_BASED = "USAGE_BASED",
  VALUE_BASED = "VALUE_BASED",
  FREEMIUM = "FREEMIUM",
  HYBRID = "HYBRID",
}

/**
 * Billing frequency
 */
export enum BillingFrequency {
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
  ANNUAL = "ANNUAL",
  ONE_TIME = "ONE_TIME",
  USAGE_BASED = "USAGE_BASED",
}

/**
 * Revenue component metric types
 */
export enum RevenueMetricType {
  MONTHLY_RECURRING_REVENUE = "MONTHLY_RECURRING_REVENUE",
  ANNUAL_RECURRING_REVENUE = "ANNUAL_RECURRING_REVENUE",
  TOTAL_CONTRACT_VALUE = "TOTAL_CONTRACT_VALUE",
  CUSTOMER_COUNT = "CUSTOMER_COUNT",
  AVERAGE_REVENUE_PER_ACCOUNT = "AVERAGE_REVENUE_PER_ACCOUNT",
  UNITS_SOLD = "UNITS_SOLD",
  GROSS_REVENUE = "GROSS_REVENUE",
  NET_REVENUE = "NET_REVENUE",
  OTHER = "OTHER",
}

/**
 * Pricing tier (for tiered pricing models)
 */
export interface PricingTier {
  name: string;
  min_units?: number;
  max_units?: number;
  price_per_unit: number;
  annual_discount_percent?: number;
}

/**
 * Pricing model definition
 */
export interface PricingModel {
  id: string;
  type: PricingModelType;
  base_price?: number;
  unit_metric?: string; // e.g., "seats", "API calls", "GB stored"
  tiers?: PricingTier[];
  free_tier_units?: number;
  trial_period_days?: number;
  setup_fee?: number;
  description?: string;
}

/**
 * Revenue component (per-stream metric)
 */
export interface RevenueComponent {
  id: string;
  stream: RevenueStreamType;
  metric: RevenueMetricType;
  metric_name: string; // Custom name, e.g., "Enterprise Seats MRR"
  current_value: number;
  currency: string; // ISO 4217, e.g., "USD"
  frequency: BillingFrequency;
  growth_rate_percent?: number; // Month-over-month or year-over-year
  churn_rate_percent?: number; // For recurring revenue
  customer_count?: number; // If applicable
  last_measured_at: Date;
  measurement_confidence: "high" | "medium" | "low" | "estimated";
  workspaceId: string;
}

/**
 * Complete revenue model
 */
export interface RevenueModel {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  model_as_of: Date;
  last_updated_at: Date;
  updated_by: string;

  // Revenue streams and components
  streams: RevenueStreamType[];
  components: RevenueComponent[];

  // Pricing models (one per stream type)
  pricing_models: Record<RevenueStreamType, PricingModel>;

  // Key metrics summaries
  metrics: {
    total_mrr: number;
    total_arr: number;
    currency: string;
    avg_customer_value: number;
    active_customer_count: number;
    blended_growth_rate_percent: number;
    blended_churn_rate_percent: number;
  };

  // Revenue projections
  projections?: {
    next_month_estimated_revenue: number;
    next_quarter_estimated_revenue: number;
    next_year_estimated_revenue: number;
    confidence_level: "high" | "medium" | "low";
  };

  // Audit/versioning
  version: number;
  is_approved: boolean;
  approved_by?: string;
  approved_at?: Date;
  notes?: string;
}

/**
 * Revenue model summary for dashboards
 */
export interface RevenueModelSummary {
  workspaceId: string;
  total_mrr: number;
  total_arr: number;
  currency: string;
  active_streams: RevenueStreamType[];
  avg_customer_value: number;
  top_revenue_stream: RevenueStreamType;
  top_stream_percentage: number; // % of total revenue
  last_updated_at: Date;
  as_of_date: Date;
}

/**
 * Revenue model request
 */
export interface RevenueModelRequest {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string;
  components: RevenueComponent[];
  pricing_models: Record<RevenueStreamType, PricingModel>;
}

/**
 * Revenue component assessment
 */
export interface RevenueComponentAssessment {
  component: RevenueComponent;
  health: "healthy" | "warning" | "critical";
  trend: "growing" | "stable" | "declining";
  risk_factors?: string[];
  recommendations?: string[];
}

/**
 * Revenue model validation rules
 */
export const REVENUE_MODEL_REQUIREMENTS = {
  minComponentsRequired: 1,
  minCustomersForReliability: 10,
  staleComponentThreshold: 90 * 24 * 60 * 60 * 1000, // 90 days
  minConfidenceLevelForProjections: "medium" as const,
};

/**
 * Revenue stream categorization
 */
export const REVENUE_STREAM_CATEGORIES: Record<RevenueStreamType, "recurring" | "one_time" | "variable"> = {
  [RevenueStreamType.SUBSCRIPTION]: "recurring",
  [RevenueStreamType.RECURRING_SERVICE]: "recurring",
  [RevenueStreamType.PRODUCT_SALE]: "one_time",
  [RevenueStreamType.LICENSE]: "one_time",
  [RevenueStreamType.PROFESSIONAL_SERVICES]: "one_time",
  [RevenueStreamType.IMPLEMENTATION]: "one_time",
  [RevenueStreamType.USAGE_BASED]: "variable",
  [RevenueStreamType.TRANSACTION_FEE]: "variable",
  [RevenueStreamType.COMMISSION]: "variable",
  [RevenueStreamType.MARKETPLACE_LISTING]: "recurring",
  [RevenueStreamType.MARKETPLACE_REVENUE_SHARE]: "variable",
  [RevenueStreamType.PARTNERSHIPS]: "variable",
  [RevenueStreamType.OTHER]: "variable",
};

/**
 * Calculate annual recurring revenue (ARR) from monthly recurring revenue (MRR)
 */
export function calculateARRFromMRR(mrr: number): number {
  return mrr * 12;
}

/**
 * Calculate monthly recurring revenue (MRR) from annual recurring revenue (ARR)
 */
export function calculateMRRFromARR(arr: number): number {
  return arr / 12;
}

/**
 * Validate revenue component health
 */
export function validateComponentHealth(component: RevenueComponent): "healthy" | "warning" | "critical" {
  // CRITICAL: zero revenue, missing data, extremely stale
  if (component.current_value <= 0) return "critical";
  if (component.measurement_confidence === "low") return "warning";

  const age = Date.now() - component.last_measured_at.getTime();
  if (age > REVENUE_MODEL_REQUIREMENTS.staleComponentThreshold) return "critical";

  // WARNING: churn >10% or negative growth for recurring streams
  if (REVENUE_STREAM_CATEGORIES[component.stream] === "recurring") {
    if ((component.churn_rate_percent ?? 0) > 10) return "warning";
    if ((component.growth_rate_percent ?? 0) < -5) return "warning";
  }

  return "healthy";
}

/**
 * Validate revenue model has required data
 */
export function validateRevenueModel(model: RevenueModel): boolean {
  // Must have at least one component
  if (!model.components || model.components.length === 0) return false;

  // Must have total metrics
  if (model.metrics.total_mrr < 0 || model.metrics.total_arr < 0) return false;

  // All components must have valid current values
  if (model.components.some((c) => c.current_value < 0)) return false;

  // Must have workspace context
  if (!model.workspaceId) return false;

  return true;
}

/**
 * Revenue model result for API responses (DTO)
 * Redacts sensitive/internal fields
 */
export interface RevenueModelDTO {
  id: string;
  workspaceId: string;
  name: string;
  total_mrr: number;
  total_arr: number;
  currency: string;
  active_streams: RevenueStreamType[];
  average_customer_value: number;
  blended_growth_rate_percent: number;
  last_updated_at: Date;
  is_approved: boolean;
  projections?: {
    next_month_estimated_revenue: number;
    next_quarter_estimated_revenue: number;
    next_year_estimated_revenue: number;
  };
}

/**
 * Convert revenue model to DTO for API response
 */
export function revenueModelToDTO(model: RevenueModel): RevenueModelDTO {
  return {
    id: model.id,
    workspaceId: model.workspaceId,
    name: model.name,
    total_mrr: model.metrics.total_mrr,
    total_arr: model.metrics.total_arr,
    currency: model.metrics.currency,
    active_streams: model.streams,
    average_customer_value: model.metrics.avg_customer_value,
    blended_growth_rate_percent: model.metrics.blended_growth_rate_percent,
    last_updated_at: model.last_updated_at,
    is_approved: model.is_approved,
    projections: model.projections,
  };
}
