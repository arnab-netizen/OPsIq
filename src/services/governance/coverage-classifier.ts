/**
 * E0 — honest abstention-reason relabel (reporting only).
 *
 * The engine reports a single `INSUFFICIENT_EVIDENCE` status for two very
 * different situations:
 *   1. the case genuinely lacks evidence (or it is too weak), vs
 *   2. the case HAS evidence, but only in business domains the engine has no
 *      diagnosis archetype for (financial_health, market_position, etc.).
 *
 * This classifier distinguishes them as an ADDITIVE annotation. It does NOT
 * change any decision, status, threshold, or safety-gate behavior — it only
 * produces a more honest reason string for reporting/output artifacts.
 *
 * Deterministic and pure. No answer keys, no benchmark labels.
 */

/** Dimensions the three current operational archetypes can actually diagnose. */
const ARCHETYPE_DIMENSIONS = new Set([
  "operational_efficiency",
  "quality_delivery",
  "customer_retention",
]);

export type AbstentionCoverageReason =
  | "INSUFFICIENT_MODEL_COVERAGE"
  | "INSUFFICIENT_EVIDENCE"
  | "NOT_APPLICABLE";

export interface CoverageClassifierInput {
  /** Engine status from the frozen output. */
  engineStatus: string;
  /** Whether the engine committed to a diagnosis (status !== INSUFFICIENT_EVIDENCE). */
  committed: boolean;
  /** Case evidence dimensions + criticality (production-available). */
  evidence: { dimension: string; isCritical?: boolean }[];
}

/**
 * Classify WHY an engine-level abstention happened.
 * Applies only to `INSUFFICIENT_EVIDENCE` (engine-stage) abstentions; for
 * committed outputs or gate-driven abstentions it returns NOT_APPLICABLE.
 */
export function classifyAbstentionCoverage(
  input: CoverageClassifierInput
): AbstentionCoverageReason {
  if (input.committed || input.engineStatus !== "INSUFFICIENT_EVIDENCE") {
    return "NOT_APPLICABLE";
  }
  const ev = input.evidence ?? [];
  if (ev.length === 0) {
    return "INSUFFICIENT_EVIDENCE"; // truly no evidence
  }
  const hasSupportedCritical = ev.some(
    (e) => e.isCritical && ARCHETYPE_DIMENSIONS.has(e.dimension)
  );
  const hasUnsupportedEvidence = ev.some(
    (e) => !ARCHETYPE_DIMENSIONS.has(e.dimension)
  );
  // Evidence present, none of it critical in a domain the engine can diagnose,
  // and at least some of it sits in an unsupported domain → model-coverage gap.
  if (!hasSupportedCritical && hasUnsupportedEvidence) {
    return "INSUFFICIENT_MODEL_COVERAGE";
  }
  // Supported domain present (engine could in principle diagnose) but it still
  // abstained → genuinely weak/ambiguous evidence within a supported domain.
  return "INSUFFICIENT_EVIDENCE";
}
