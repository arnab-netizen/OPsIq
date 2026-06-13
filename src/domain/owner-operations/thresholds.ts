/**
 * Owner Operations (Module 4) — deterministic thresholds.
 *
 * Generic defaults that work for any owner-operated business, with optional
 * per-industry-TEMPLATE overrides. Templates are generic business CATEGORIES
 * (e.g. "laundry_local_service"), never a specific named business. Unknown
 * templates fall back to the generic defaults.
 */

export interface OperationsThresholds {
  // Completion (% of received orders completed)
  lowCompletionRatePct: number;
  criticalCompletionRatePct: number;
  healthyCompletionRatePct: number;
  // Delay (% of received orders delayed)
  highDelayRatePct: number;
  criticalDelayRatePct: number;
  // Rework (% of completed orders reworked)
  highReworkRatePct: number;
  criticalReworkRatePct: number;
  // Complaints (% of completed orders)
  highComplaintRatePct: number;
  // Capacity utilization (received ÷ capacity, % )
  highCapacityUtilizationPct: number;
  criticalCapacityUtilizationPct: number;
  // Delivery success (% )
  lowDeliverySuccessRatePct: number;
  criticalDeliverySuccessRatePct: number;
  // SOP compliance (% )
  lowSopCompliancePct: number;
  criticalSopCompliancePct: number;
  // Idle (% of staff hours)
  highIdleRatePct: number;
  // Data freshness
  staleSnapshotDays: number;
}

export const GENERIC_OPERATIONS_THRESHOLDS: OperationsThresholds = {
  lowCompletionRatePct: 85,
  criticalCompletionRatePct: 70,
  healthyCompletionRatePct: 95,
  highDelayRatePct: 15,
  criticalDelayRatePct: 30,
  highReworkRatePct: 5,
  criticalReworkRatePct: 12,
  highComplaintRatePct: 5,
  highCapacityUtilizationPct: 90,
  criticalCapacityUtilizationPct: 100,
  lowDeliverySuccessRatePct: 90,
  criticalDeliverySuccessRatePct: 80,
  lowSopCompliancePct: 80,
  criticalSopCompliancePct: 60,
  highIdleRatePct: 20,
  staleSnapshotDays: 45,
};

/**
 * Per-industry-template overrides (generic categories). Local same-day service
 * businesses (e.g. laundry) are turnaround-sensitive, so delay/rework bars are
 * tighter and the healthy completion bar is higher.
 */
export const INDUSTRY_OPERATIONS_THRESHOLDS: Record<string, Partial<OperationsThresholds>> = {
  laundry_local_service: {
    highDelayRatePct: 10,
    criticalDelayRatePct: 20,
    highReworkRatePct: 4,
    healthyCompletionRatePct: 97,
  },
  generic_local_service: {
    highDelayRatePct: 12,
    healthyCompletionRatePct: 96,
  },
  retail_service_hybrid: {
    highCapacityUtilizationPct: 85,
  },
};

/** Resolve thresholds for an industry template, falling back to generic defaults. */
export function resolveOperationsThresholds(industryTemplate?: string): OperationsThresholds {
  const overrides = industryTemplate ? INDUSTRY_OPERATIONS_THRESHOLDS[industryTemplate] : undefined;
  return { ...GENERIC_OPERATIONS_THRESHOLDS, ...(overrides ?? {}) };
}
