/**
 * Owner Cashflow (Module 5) — deterministic thresholds.
 *
 * Generic defaults that work for any owner-operated business, with optional
 * per-industry-TEMPLATE overrides. Templates are generic business CATEGORIES
 * (e.g. "laundry_local_service"), never a specific named business — no hardcoded
 * business. Unknown templates fall back to the generic defaults. Cashflow
 * thresholds are tighter than profit thresholds because liquidity fails fast.
 */

export interface CashflowThresholds {
  // Cash runway (days of net burn the cash buffer covers)
  lowCashRunwayDays: number;
  criticalCashRunwayDays: number;
  insolventCashRunwayDays: number;
  // Near-term obligations vs cash (% of total cash)
  highUrgentPaymentRiskPct: number;
  criticalUrgentPaymentRiskPct: number;
  // Payables vs cash (% of total cash)
  highPayablesPressurePct: number;
  criticalPayablesPressurePct: number;
  // Debt / EMI payment vs cash (% of total cash)
  highDebtPaymentPressurePct: number;
  // Overdue receivables (% of receivables)
  highOverdueReceivablesPct: number;
  // Collection lag (days of sales outstanding)
  highCollectionGapDays: number;
  // Owner withdrawal vs cash (% of total cash)
  highOwnerWithdrawalPressurePct: number;
  // Data freshness
  staleSnapshotDays: number;
}

// Provenance: INTERNAL_HEURISTIC (generic defaults); template overrides below are INDUSTRY_TEMPLATE with no recorded
// source for the exact numbers — see docs/opsiq/architecture/OWNER_THRESHOLD_PROVENANCE.md. Values are unchanged.
export const GENERIC_CASHFLOW_THRESHOLDS: CashflowThresholds = {
  lowCashRunwayDays: 30,
  criticalCashRunwayDays: 14,
  insolventCashRunwayDays: 5,
  highUrgentPaymentRiskPct: 60,
  criticalUrgentPaymentRiskPct: 100,
  highPayablesPressurePct: 75,
  criticalPayablesPressurePct: 100,
  highDebtPaymentPressurePct: 40,
  highOverdueReceivablesPct: 30,
  highCollectionGapDays: 45,
  highOwnerWithdrawalPressurePct: 30,
  staleSnapshotDays: 30,
};

/**
 * Per-industry-template overrides (generic categories). Local cash-and-carry
 * service businesses (e.g. laundry) collect cash immediately and carry little
 * receivables, so the receivables/collection bars are tighter. This is a
 * category template, not a business.
 */
export const INDUSTRY_CASHFLOW_THRESHOLDS: Record<string, Partial<CashflowThresholds>> = {
  laundry_local_service: {
    highOverdueReceivablesPct: 20,
    highCollectionGapDays: 20,
  },
  generic_local_service: {
    highOverdueReceivablesPct: 25,
    highCollectionGapDays: 30,
  },
  retail_service_hybrid: {
    highOverdueReceivablesPct: 35,
    highCollectionGapDays: 60,
  },
};

/** Resolve thresholds for an industry template, falling back to generic defaults. */
export function resolveCashflowThresholds(industryTemplate?: string): CashflowThresholds {
  const overrides = industryTemplate ? INDUSTRY_CASHFLOW_THRESHOLDS[industryTemplate] : undefined;
  return { ...GENERIC_CASHFLOW_THRESHOLDS, ...(overrides ?? {}) };
}
