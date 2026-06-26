/**
 * F15 — Regression lock (pure).
 *
 * Protects passed cases: a registry of regression cases across categories runs
 * deterministically, and a failed CRITICAL regression blocks promotion / marking a
 * domain trained. Pure + deterministic (the case runner is injected). The vitest
 * suite is the live regression harness; this enforces the promotion rule.
 */

export type RegressionCategory =
  | "golden_normal" | "adversarial" | "previous_failure" | "harmful"
  | "missing_data" | "archetype" | "unsafe_output";

export interface RegressionCase {
  id: string;
  category: RegressionCategory;
  /** Critical regressions block promotion if they fail. */
  critical: boolean;
}

export interface RegressionResult {
  id: string;
  category: RegressionCategory;
  critical: boolean;
  passed: boolean;
}

/** Run every case through the injected runner. Deterministic ordering (by id). */
export function runRegression(
  cases: readonly RegressionCase[],
  runner: (c: RegressionCase) => boolean
): RegressionResult[] {
  return [...cases]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => ({ id: c.id, category: c.category, critical: c.critical, passed: runner(c) === true }));
}

/** True when any critical regression failed. */
export function failedCritical(results: readonly RegressionResult[]): boolean {
  return results.some((r) => r.critical && !r.passed);
}

/** A domain may be marked trained only when no critical regression failed. */
export function canMarkTrained(results: readonly RegressionResult[]): boolean {
  return results.length > 0 && !failedCritical(results);
}

/** Categories a complete regression set must include. */
export const REQUIRED_REGRESSION_CATEGORIES: readonly RegressionCategory[] = [
  "golden_normal", "adversarial", "previous_failure", "harmful", "missing_data", "archetype", "unsafe_output",
];

export function regressionSetIsComplete(cases: readonly RegressionCase[]): boolean {
  const present = new Set(cases.map((c) => c.category));
  return REQUIRED_REGRESSION_CATEGORIES.every((cat) => present.has(cat));
}
