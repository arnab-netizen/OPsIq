/**
 * R22 — Reliability/performance scoring safety + sample gates (§3.10, §35). Pure.
 *
 * Reliability scores are operational risk signals, NOT automatic disciplinary conclusions.
 * Below the minimum sample size a metric shows INSUFFICIENT_DATA and may NOT be used as a
 * dispatch-blocking signal (unless a separate active critical flag exists). Operational
 * labels only — no character/intent inference.
 */

export type ReliabilityMetric =
  | "attendance_reliability" | "proof_acceptance_rate" | "rework_rate" | "complaint_linkage_rate"
  | "supervisor_verification_reliability" | "vendor_reliability" | "manager_exception_handling"
  | "location_reliability";

export const RELIABILITY_MIN_SAMPLES: Record<ReliabilityMetric, number> = {
  attendance_reliability: 5,
  proof_acceptance_rate: 10,
  rework_rate: 10,
  complaint_linkage_rate: 10,
  supervisor_verification_reliability: 10,
  vendor_reliability: 5,
  manager_exception_handling: 10,
  location_reliability: 10,
};

export type ReliabilityLabel =
  | `INSUFFICIENT_DATA_${ReliabilityMetric}` | "LOW_CONFIDENCE" | "MEDIUM_CONFIDENCE" | "HIGH_CONFIDENCE"
  | "NEEDS_HUMAN_REVIEW" | "NOT_FOR_DISCIPLINARY_USE_WITHOUT_REVIEW";

export interface ReliabilityResult {
  label: ReliabilityLabel;
  sampleSize: number;
  sufficient: boolean;
  /** Raw counts may always be shown; only blocking use is gated. */
  usableAsBlockingSignal: boolean;
}

/** Compute the gated reliability label for a metric. */
export function reliabilityLabel(metric: ReliabilityMetric, sampleSize: number, confidence: "LOW" | "MEDIUM" | "HIGH"): ReliabilityResult {
  const min = RELIABILITY_MIN_SAMPLES[metric];
  if (sampleSize < min) {
    return { label: `INSUFFICIENT_DATA_${metric}` as ReliabilityLabel, sampleSize, sufficient: false, usableAsBlockingSignal: false };
  }
  const label: ReliabilityLabel = confidence === "HIGH" ? "HIGH_CONFIDENCE" : confidence === "MEDIUM" ? "MEDIUM_CONFIDENCE" : "LOW_CONFIDENCE";
  return { label, sampleSize, sufficient: true, usableAsBlockingSignal: confidence !== "LOW" };
}

/**
 * A reliability score may block dispatch / trigger escalation only when the sample gate is
 * met — OR when a separate active critical flag (e.g. an active false-completion block) exists.
 */
export function canBlockDispatchByScore(metric: ReliabilityMetric, sampleSize: number, hasActiveCriticalFlag: boolean): boolean {
  if (hasActiveCriticalFlag) return true;
  return sampleSize >= RELIABILITY_MIN_SAMPLES[metric];
}

/** Forbidden character/intent labels — only operational language is allowed (§35, §98). */
const FORBIDDEN_LABELS = ["lazy", "dishonest", "bad person", "fraud", "intent to deceive"];
export function isForbiddenLabel(label: string): boolean {
  return FORBIDDEN_LABELS.some((f) => label.toLowerCase().includes(f));
}
