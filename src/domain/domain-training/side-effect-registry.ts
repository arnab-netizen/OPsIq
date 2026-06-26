/**
 * F9 — Side-effect metric registry + verification (pure).
 *
 * Every domain must declare the side-effect metrics that an action's verification
 * must check — so a positive primary metric with a severe negative side effect is
 * never classified as success. Pure + deterministic.
 */

export interface SideEffectObservation {
  key: string;
  worsened: boolean;
  /** A worsening severe enough to negate success. */
  severe: boolean;
}

/** A domain is invalid if it declares no side-effect metrics. */
export function domainHasSideEffectMetrics(metrics: readonly string[]): boolean {
  return metrics.length > 0;
}

export interface SideEffectVerdict {
  success: boolean;
  severeRegressions: string[];
  reason: string;
}

/**
 * Verify an action's outcome against its side effects. Success requires the primary
 * metric to improve AND no severe side-effect regression.
 */
export function verifyWithSideEffects(
  primaryImproved: boolean,
  observations: readonly SideEffectObservation[]
): SideEffectVerdict {
  const severeRegressions = observations.filter((o) => o.worsened && o.severe).map((o) => o.key);
  if (!primaryImproved) {
    return { success: false, severeRegressions, reason: "primary metric did not improve" };
  }
  if (severeRegressions.length > 0) {
    return { success: false, severeRegressions, reason: `severe side-effect regression: ${severeRegressions.join(", ")}` };
  }
  return { success: true, severeRegressions: [], reason: "primary improved; no severe side-effect regression" };
}
