/**
 * Diagnosis thresholds for laundry / local-service businesses.
 *
 * These are explicit, documented operating thresholds — not fabricated
 * reliability scores. They are used by the diagnosis layer to decide when a
 * real metric crosses into a finding. Kept in one place so they are auditable
 * and adjustable without touching diagnosis logic.
 */
export const RECOVERY_THRESHOLDS = {
  /** Gross margin below this (%) is a concern for local service. */
  grossMarginPct: { medium: 35, high: 25, critical: 15 },
  /** Net margin below this (%) is a concern. */
  netMarginPct: { medium: 10, high: 5, critical: 0 },
  /** Repeat-customer rate below this (%) signals weak retention. */
  repeatCustomerRatePct: { medium: 40, high: 30, critical: 20 },
  /** Discount leakage above this (% of gross revenue). */
  discountLeakagePct: { medium: 8, high: 12, critical: 18 },
  /** Combined complaint+rewash rate above this (% of orders). */
  qualityFailureRatePct: { medium: 4, high: 8, critical: 12 },
  /** Delivery cost above this (% of revenue). */
  deliveryCostRatioPct: { medium: 8, high: 12, critical: 18 },
  /** B2B share above this (%) is a concentration risk. */
  b2bSharePct: { medium: 50, high: 65, critical: 80 },
  /** Receivables above this (% of revenue) is cash pressure. */
  receivablesExposurePct: { medium: 15, high: 25, critical: 40 },
  /** Average turnaround above this (hours) is slow for local laundry. */
  turnaroundHours: { medium: 48, high: 72, critical: 96 },
  /** Campaign conversion efficiency (conversions per 1000 currency units of spend) below this. */
  marketingConversionPer1000: { medium: 2, high: 1, critical: 0.5 },
  /** Revenue decline (negative trend %) worse than this. */
  revenueDeclinePct: { medium: -5, high: -12, critical: -20 },
} as const;

/** Cash-pressure scoring thresholds (receivables exposure %). */
export const CASH_PRESSURE = {
  highReceivablesExposurePct: 30,
  mediumReceivablesExposurePct: 15,
  /** Net margin below this contributes to cash pressure. */
  lowNetMarginPct: 5,
} as const;
