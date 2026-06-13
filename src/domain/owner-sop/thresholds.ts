/**
 * Owner SOP & Execution Accountability (Module 7) — deterministic thresholds.
 *
 * Generic defaults that work for any owner-operated business, with optional
 * per-industry-TEMPLATE overrides. Templates are generic business CATEGORIES
 * (e.g. "laundry_local_service"), never a specific named business. Unknown
 * templates fall back to the generic defaults.
 */

export interface SopThresholds {
  // Completion (% of assigned actions completed)
  lowCompletionRatePct: number;
  criticalCompletionRatePct: number;
  healthyCompletionRatePct: number;
  // Verification (% of completed actions verified)
  lowVerificationRatePct: number;
  criticalVerificationRatePct: number;
  // Overdue (% of assigned actions overdue)
  highOverdueRatePct: number;
  criticalOverdueRatePct: number;
  // Dispute (% of completed actions disputed)
  highDisputeRatePct: number;
  // Reassignment (% of assigned actions reassigned)
  highReassignmentRatePct: number;
  // Repeated failures (% of assigned actions that failed again)
  highRepeatedFailureRatePct: number;
  criticalRepeatedFailureRatePct: number;
  // Proof compliance (% of proof-required actions with proof)
  lowProofCompliancePct: number;
  // SOP coverage (% of recurring processes documented)
  lowSopCoveragePct: number;
  criticalSopCoveragePct: number;
  // Data freshness
  staleSnapshotDays: number;
}

export const GENERIC_SOP_THRESHOLDS: SopThresholds = {
  lowCompletionRatePct: 85,
  criticalCompletionRatePct: 65,
  healthyCompletionRatePct: 95,
  lowVerificationRatePct: 70,
  criticalVerificationRatePct: 50,
  highOverdueRatePct: 15,
  criticalOverdueRatePct: 30,
  highDisputeRatePct: 10,
  highReassignmentRatePct: 20,
  highRepeatedFailureRatePct: 10,
  criticalRepeatedFailureRatePct: 25,
  lowProofCompliancePct: 80,
  lowSopCoveragePct: 70,
  criticalSopCoveragePct: 40,
  staleSnapshotDays: 45,
};

/**
 * Per-industry-template overrides (generic categories). Local same-day service
 * businesses (e.g. laundry) live or die on repeatable daily execution, so the
 * completion/verification bars are tighter and SOP coverage matters more.
 */
export const INDUSTRY_SOP_THRESHOLDS: Record<string, Partial<SopThresholds>> = {
  laundry_local_service: {
    lowCompletionRatePct: 90,
    healthyCompletionRatePct: 97,
    lowSopCoveragePct: 80,
  },
  generic_local_service: {
    healthyCompletionRatePct: 96,
  },
  retail_service_hybrid: {
    lowVerificationRatePct: 75,
  },
};

/** Resolve thresholds for an industry template, falling back to generic defaults. */
export function resolveSopThresholds(industryTemplate?: string): SopThresholds {
  const overrides = industryTemplate ? INDUSTRY_SOP_THRESHOLDS[industryTemplate] : undefined;
  return { ...GENERIC_SOP_THRESHOLDS, ...(overrides ?? {}) };
}
