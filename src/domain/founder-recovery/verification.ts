/**
 * Founder Recovery — outcome verification engine.
 *
 * Pure function. Unlike the legacy `outcome/verification.ts` (hardcoded to
 * confidence 0 / customer-reported), this compares a real BEFORE (baseline),
 * a TARGET, and an AFTER metric value and decides whether the action actually
 * moved the business. It is direction-aware (some metrics should go up, some
 * down) and never asserts success without an after-metric.
 */
import type { VerificationResult, VerificationStatus } from "./types";

export interface VerifyInput {
  baselineValue: number | null;
  targetValue: number | null;
  afterValue: number | null;
  /** "up" = higher is better; "down" = lower is better. */
  direction: "up" | "down";
  /** Set true when the owner disputes the recorded after-value. */
  disputed?: boolean;
}

/**
 * Compare before/target/after to produce a verification status.
 *
 * Rules:
 * - disputed flag overrides everything → "disputed".
 * - missing after value → "inconclusive" (cannot prove anything).
 * - reached target in the correct direction → "verified_improved".
 * - moved in the correct direction but missed target → "verified_improved"
 *   only if it crossed the target; otherwise if it improved vs baseline but
 *   not to target → "verified_not_improved" when target was the bar.
 * - no movement or wrong-direction movement → "verified_not_improved".
 */
export function verifyOutcome(input: VerifyInput): VerificationResult {
  const { baselineValue, targetValue, afterValue, direction, disputed } = input;

  if (disputed) {
    return {
      status: "disputed",
      actualMovement: movement(baselineValue, afterValue),
      reachedTarget: false,
      reason: "Outcome disputed by owner; requires re-measurement.",
    };
  }

  if (afterValue === null) {
    return {
      status: "inconclusive",
      actualMovement: null,
      reachedTarget: false,
      reason: "No after-metric recorded yet; cannot verify improvement.",
    };
  }

  if (baselineValue === null) {
    return {
      status: "inconclusive",
      actualMovement: null,
      reachedTarget: false,
      reason: "No baseline metric recorded; cannot compare before/after.",
    };
  }

  const move = movement(baselineValue, afterValue)!;
  const improvedVsBaseline = direction === "up" ? afterValue > baselineValue : afterValue < baselineValue;
  const reachedTarget =
    targetValue === null
      ? false
      : direction === "up"
        ? afterValue >= targetValue
        : afterValue <= targetValue;

  let status: VerificationStatus;
  let reason: string;

  if (reachedTarget) {
    status = "verified_improved";
    reason = `After value ${afterValue} reached target ${targetValue} (direction ${direction}).`;
  } else if (targetValue !== null && improvedVsBaseline) {
    // Moved the right way but did not hit the bar that was set.
    status = "verified_not_improved";
    reason = `After value ${afterValue} improved vs baseline ${baselineValue} but missed target ${targetValue}.`;
  } else if (targetValue === null && improvedVsBaseline) {
    status = "verified_improved";
    reason = `After value ${afterValue} improved vs baseline ${baselineValue} (no explicit target).`;
  } else {
    status = "verified_not_improved";
    reason = `After value ${afterValue} did not improve vs baseline ${baselineValue} (direction ${direction}).`;
  }

  return { status, actualMovement: move, reachedTarget, reason };
}

function movement(baseline: number | null, after: number | null): number | null {
  if (baseline === null || after === null) return null;
  return Math.round((after - baseline) * 100) / 100;
}
