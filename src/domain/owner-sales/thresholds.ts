/**
 * Owner Sales (Module 3) — deterministic thresholds.
 *
 * Generic defaults that work for any owner-operated business, with optional
 * per-industry-TEMPLATE overrides. Templates are generic business CATEGORIES
 * (e.g. "laundry_local_service"), never a specific named business. Unknown
 * templates fall back to the generic defaults.
 */

export interface SalesThresholds {
  // Funnel conversion (% of leads → orders)
  lowConversionPct: number;
  criticalConversionPct: number;
  healthyConversionPct: number;
  // Retention (% repeat of active customers)
  weakRepeatRatePct: number;
  criticalRepeatRatePct: number;
  healthyRepeatRatePct: number;
  // Churn (% lost of active+lost)
  highLostCustomerRatePct: number;
  criticalLostCustomerRatePct: number;
  // Quality / leakage (% )
  highComplaintToSalePct: number;
  highDiscountDependencePct: number;
  highRefundRatePct: number;
  // B2B pipeline coverage (pipeline ÷ revenue, % )
  weakB2bPipelineCoveragePct: number;
  // Data freshness
  staleSnapshotDays: number;
}

export const GENERIC_SALES_THRESHOLDS: SalesThresholds = {
  lowConversionPct: 15,
  criticalConversionPct: 5,
  healthyConversionPct: 30,
  weakRepeatRatePct: 25,
  criticalRepeatRatePct: 10,
  healthyRepeatRatePct: 50,
  highLostCustomerRatePct: 20,
  criticalLostCustomerRatePct: 35,
  highComplaintToSalePct: 5,
  highDiscountDependencePct: 15,
  highRefundRatePct: 5,
  weakB2bPipelineCoveragePct: 50,
  staleSnapshotDays: 45,
};

/**
 * Per-industry-template overrides (generic categories). Local cash-and-carry
 * service businesses (e.g. laundry) are walk-in and repeat-driven, so lead
 * conversion matters less and repeat rate matters more (higher repeat bar).
 */
export const INDUSTRY_SALES_THRESHOLDS: Record<string, Partial<SalesThresholds>> = {
  laundry_local_service: {
    lowConversionPct: 10,
    criticalConversionPct: 3,
    weakRepeatRatePct: 35,
    criticalRepeatRatePct: 15,
    healthyRepeatRatePct: 60,
  },
  generic_local_service: {
    lowConversionPct: 12,
    weakRepeatRatePct: 30,
    healthyRepeatRatePct: 55,
  },
  retail_service_hybrid: {
    weakRepeatRatePct: 30,
  },
};

/** Resolve thresholds for an industry template, falling back to generic defaults. */
export function resolveSalesThresholds(industryTemplate?: string): SalesThresholds {
  const overrides = industryTemplate ? INDUSTRY_SALES_THRESHOLDS[industryTemplate] : undefined;
  return { ...GENERIC_SALES_THRESHOLDS, ...(overrides ?? {}) };
}
