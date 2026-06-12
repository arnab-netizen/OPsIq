/**
 * Owner Finance (Module 2) — deterministic thresholds.
 *
 * Generic defaults that work for any owner-operated business, with optional
 * per-industry-TEMPLATE overrides. Templates are generic business CATEGORIES
 * (e.g. "laundry_local_service"), never a specific named business — no Tumbledry
 * hardcoding. Unknown templates fall back to the generic defaults.
 */

export interface FinanceThresholds {
  // Cash runway (days)
  lowCashRunwayDays: number;
  criticalCashRunwayDays: number;
  insolventCashRunwayDays: number;
  // Cost structure (% of revenue)
  highFixedCostBurdenPct: number;
  highPayrollBurdenPct: number;
  // Debt service (% of revenue)
  highDebtServicePressurePct: number;
  criticalDebtServicePressurePct: number;
  // Working capital (% of revenue)
  highReceivablesPressurePct: number;
  highPayablesPressurePct: number;
  // Leakage (% of revenue)
  highDiscountLeakagePct: number;
  highCostLeakageRatioPct: number;
  // Margin (% )
  thinNetMarginPct: number;
  healthyNetMarginPct: number;
  // Owner withdrawals (% of net profit)
  highOwnerWithdrawalPressurePct: number;
  // Data freshness
  staleSnapshotDays: number;
}

export const GENERIC_FINANCE_THRESHOLDS: FinanceThresholds = {
  lowCashRunwayDays: 45,
  criticalCashRunwayDays: 30,
  insolventCashRunwayDays: 7,
  highFixedCostBurdenPct: 50,
  highPayrollBurdenPct: 40,
  highDebtServicePressurePct: 25,
  criticalDebtServicePressurePct: 50,
  highReceivablesPressurePct: 30,
  highPayablesPressurePct: 40,
  highDiscountLeakagePct: 10,
  highCostLeakageRatioPct: 15,
  thinNetMarginPct: 5,
  healthyNetMarginPct: 15,
  highOwnerWithdrawalPressurePct: 50,
  staleSnapshotDays: 45,
};

/**
 * Per-industry-template overrides (generic categories). Local service businesses
 * (e.g. laundry) carry high fixed/payroll burden and little receivables, so the
 * burden bars are a little higher. This is a category template, not a business.
 */
export const INDUSTRY_FINANCE_THRESHOLDS: Record<string, Partial<FinanceThresholds>> = {
  laundry_local_service: {
    highFixedCostBurdenPct: 55,
    highPayrollBurdenPct: 45,
    highReceivablesPressurePct: 20,
  },
  generic_local_service: {
    highFixedCostBurdenPct: 55,
    highPayrollBurdenPct: 45,
  },
  retail_service_hybrid: {
    highReceivablesPressurePct: 35,
  },
};

/** Resolve thresholds for an industry template, falling back to generic defaults. */
export function resolveFinanceThresholds(industryTemplate?: string): FinanceThresholds {
  const overrides = industryTemplate ? INDUSTRY_FINANCE_THRESHOLDS[industryTemplate] : undefined;
  return { ...GENERIC_FINANCE_THRESHOLDS, ...(overrides ?? {}) };
}
