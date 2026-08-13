/**
 * Owner Finance (Module 2) — closed-loop learning domain contracts.
 *
 * Pure functions for computing action effectiveness from historical outcome
 * signals. No DB access; no side effects. Bayesian shrinkage with conservative
 * prior ensures cold-start safety (n < MIN_SAMPLE → zero modifier).
 *
 * Hard rule: critical-severity findings are never suppressed or amplified by
 * effectiveness learning. Only the confidence modifier for non-critical findings
 * is adjusted.
 */

/** Minimum verified outcomes required before effectiveness influences ranking. */
export const MIN_SAMPLE = 3;

/** Maximum absolute modifier applied to the confidence score (0.0–1.0 scale). */
export const MAX_MODIFIER = 0.10;

/** Bayesian prior: pseudo-count of observations at a neutral 50 % success rate. */
const PRIOR_N = 5;
const PRIOR_P = 0.50;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinanceEffectivenessSignal {
  findingCode: string;
  recommendationCode: string;
  reachedTarget: boolean;
}

export interface FinanceEffectivenessAggregate {
  findingCode: string;
  n: number;
  improvedCount: number;
  rawSuccessRate: number;
  shrunkSuccessRate: number;
  /** Confidence modifier to add. Zero when n < MIN_SAMPLE. Range: [-MAX_MODIFIER, MAX_MODIFIER]. */
  modifier: number;
}

export type FinanceEffectivenessMap = Map<string, FinanceEffectivenessAggregate>;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Compute the effectiveness aggregate for a set of signals with the same findingCode.
 * Bayesian shrinkage: observed rate is pulled toward the prior (0.5) proportionally
 * to how few samples we have. Zero modifier when n < MIN_SAMPLE (cold-start guard).
 */
export function computeEffectivenessAggregate(
  findingCode: string,
  signals: FinanceEffectivenessSignal[]
): FinanceEffectivenessAggregate {
  const n = signals.length;
  const improvedCount = signals.filter((s) => s.reachedTarget).length;
  const rawSuccessRate = n > 0 ? improvedCount / n : 0;

  // Bayesian shrinkage: (improved + PRIOR_N × PRIOR_P) / (n + PRIOR_N)
  const shrunkSuccessRate = (improvedCount + PRIOR_N * PRIOR_P) / (n + PRIOR_N);

  // Deviation from neutral prior. Positive → more effective than baseline.
  // Max deviation is ±0.5 (0% or 100% success); scale linearly to ±MAX_MODIFIER.
  let modifier = 0;
  if (n >= MIN_SAMPLE) {
    const deviation = shrunkSuccessRate - PRIOR_P;
    modifier = clamp(deviation * 2 * MAX_MODIFIER, -MAX_MODIFIER, MAX_MODIFIER);
  }

  return { findingCode, n, improvedCount, rawSuccessRate, shrunkSuccessRate, modifier };
}

/**
 * Build an effectiveness map keyed by findingCode from a flat list of signals.
 * Signals for the same findingCode are aggregated together.
 */
export function buildEffectivenessMap(
  signals: FinanceEffectivenessSignal[]
): FinanceEffectivenessMap {
  const byCode = new Map<string, FinanceEffectivenessSignal[]>();
  for (const s of signals) {
    const arr = byCode.get(s.findingCode) ?? [];
    arr.push(s);
    byCode.set(s.findingCode, arr);
  }

  const result: FinanceEffectivenessMap = new Map();
  for (const [code, codeSignals] of byCode) {
    result.set(code, computeEffectivenessAggregate(code, codeSignals));
  }
  return result;
}

/**
 * Determine whether a modifier should be applied for a given finding severity.
 * Critical findings are never adjusted — deterministic safety rule must stand.
 */
export function modifierAllowedForSeverity(severity: string): boolean {
  return severity !== "critical";
}

/**
 * Recompute `reachedTarget` from raw verification fields.
 * Used when only `status` + numeric fields are available (no stored boolean).
 * Disputed/inconclusive/unverified → false.
 */
export function extractReachedTargetFromVerification(v: {
  status: string;
  afterValue: number | null;
  targetValue: number | null;
  targetDirection: string;
}): boolean {
  if (v.status !== "verified_improved") return false;
  if (v.afterValue == null || v.targetValue == null) return false;
  return v.targetDirection === "up"
    ? v.afterValue >= v.targetValue
    : v.afterValue <= v.targetValue;
}
