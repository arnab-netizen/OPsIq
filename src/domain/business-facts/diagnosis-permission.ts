/**
 * Owner Mode Decision OS — Diagnosis Permission Gate (Decision-OS §15/§16).
 *
 * Pure, deterministic. Derives the canonical diagnosis-permission STATUS from an
 * already-computed {@link DataQualityScore} (from `scoreDataQuality`) plus a few
 * explicit blocking signals. It does NOT recompute data quality and does NOT
 * mutate any record — it is the single place that turns a quality score into a
 * named permission state and the §16 enforcement flags.
 *
 * Why this exists: the repo already scores data quality (`data-quality.ts`) and
 * has a boolean presentability gate (`canPresentDiagnosis`), but no canonical
 * five-state permission vocabulary as §15 requires. This closes that gap with
 * one pure helper rather than a new table/route/engine.
 */
import type { DataQualityScore } from "./data-quality";

/** Canonical diagnosis-permission states (Decision-OS §15). */
export const DIAGNOSIS_PERMISSIONS = [
  "SAFE_TO_DIAGNOSE",
  "PARTIAL_DIAGNOSIS_ONLY",
  "REQUIRES_OWNER_INPUT",
  "INSUFFICIENT_DATA",
  "UNSAFE_TO_CONCLUDE",
] as const;

export type DiagnosisPermission = (typeof DIAGNOSIS_PERMISSIONS)[number];

export interface DiagnosisPermissionSignals {
  /** Count of blocking (critical) missing-data gaps from the facts contract. */
  blockingMissingCount?: number;
  /** True when material contradictory evidence is present (§16 contradiction cap). */
  hasContradictoryEvidence?: boolean;
  /** True when a required financial input for survival/growth reasoning is absent. */
  criticalFinancialMissing?: boolean;
}

export interface DiagnosisPermissionResult {
  permission: DiagnosisPermission;
  /** 0..1 cap inherited from data quality, further reduced by blocking signals. */
  confidenceCap: number;
  /** §16: INSUFFICIENT_DATA / UNSAFE_TO_CONCLUDE block any final ranked recommendation. */
  blocksFinalRecommendation: boolean;
  /** §16: missing required financial data ⇒ no HIGH-confidence (growth) recommendation. */
  blocksHighConfidence: boolean;
  /** Owner-readable reasons; never empty unless SAFE_TO_DIAGNOSE with a clean score. */
  reasons: string[];
}

const FINAL_RECOMMENDATION_BLOCKERS: ReadonlySet<DiagnosisPermission> = new Set([
  "INSUFFICIENT_DATA",
  "UNSAFE_TO_CONCLUDE",
]);

/**
 * Map a data-quality score + blocking signals onto the canonical permission state.
 *
 * Deterministic precedence (worst-first, fail-closed — never optimistic):
 * 1. Contradictory evidence on a weak score ⇒ UNSAFE_TO_CONCLUDE.
 * 2. Quality below the high-confidence floor with a blocking gap ⇒ INSUFFICIENT_DATA.
 * 3. A blocking gap or missing critical financial input ⇒ REQUIRES_OWNER_INPUT.
 * 4. Moderate quality (no blockers) ⇒ PARTIAL_DIAGNOSIS_ONLY.
 * 5. High quality, no blockers, no contradictions ⇒ SAFE_TO_DIAGNOSE.
 */
export function assessDiagnosisPermission(
  score: DataQualityScore,
  signals: DiagnosisPermissionSignals = {}
): DiagnosisPermissionResult {
  const blockingMissingCount = Math.max(0, signals.blockingMissingCount ?? 0);
  const hasContradictoryEvidence = signals.hasContradictoryEvidence ?? false;
  const criticalFinancialMissing = signals.criticalFinancialMissing ?? false;

  const reasons: string[] = [];
  let confidenceCap = score.recommendation_confidence_cap;

  // §16: contradictions and critical-financial gaps cap confidence regardless of tier.
  if (hasContradictoryEvidence) {
    confidenceCap = Math.min(confidenceCap, 0.5);
    reasons.push("Contradictory evidence present — confidence capped");
  }
  if (criticalFinancialMissing) {
    confidenceCap = Math.min(confidenceCap, 0.5);
    reasons.push("Required financial data missing — high-confidence growth blocked");
  }
  if (blockingMissingCount > 0) {
    reasons.push(`${blockingMissingCount} blocking data gap(s) outstanding`);
  }
  if (score.high_confidence_blocked) {
    reasons.push("Data quality below 50 — high-confidence recommendations blocked");
  }

  let permission: DiagnosisPermission;
  if (hasContradictoryEvidence && score.recommendation_confidence_tier !== "high") {
    permission = "UNSAFE_TO_CONCLUDE";
  } else if (score.high_confidence_blocked && blockingMissingCount > 0) {
    permission = "INSUFFICIENT_DATA";
  } else if (blockingMissingCount > 0 || criticalFinancialMissing) {
    permission = "REQUIRES_OWNER_INPUT";
  } else if (score.recommendation_confidence_tier !== "high") {
    permission = "PARTIAL_DIAGNOSIS_ONLY";
  } else {
    permission = "SAFE_TO_DIAGNOSE";
  }

  if (reasons.length === 0) {
    reasons.push(
      permission === "SAFE_TO_DIAGNOSE"
        ? "Data quality sufficient for confident diagnosis"
        : "Data quality only sufficient for a partial diagnosis"
    );
  }

  const blocksHighConfidence = score.high_confidence_blocked || criticalFinancialMissing;
  if (blocksHighConfidence) confidenceCap = Math.min(confidenceCap, 0.75);

  return {
    permission,
    confidenceCap,
    blocksFinalRecommendation: FINAL_RECOMMENDATION_BLOCKERS.has(permission),
    blocksHighConfidence,
    reasons,
  };
}
