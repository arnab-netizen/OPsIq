/**
 * Owner Strategy — shared qualitative/quantitative scale helpers. Pure.
 *
 * Extracted so the Wealth Path (Phase 2) and Risk-Adjusted Wealth / Opportunity
 * Cost (Phase 3) scorers share one deterministic mapping instead of duplicating
 * it. No I/O.
 */
import type { QualLevel, LmhLevel } from "./wealth-path.types";

/** A finite, present number (missing/NaN/Infinity → undefined). */
export function num(x: number | undefined | null): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

export function bool(x: boolean | undefined | null): boolean | undefined {
  return typeof x === "boolean" ? x : undefined;
}

export function qual(x: QualLevel | undefined | null): QualLevel | undefined {
  return x === "none" || x === "weak" || x === "moderate" || x === "strong" ? x : undefined;
}

export function lmh(x: LmhLevel | undefined | null): LmhLevel | undefined {
  return x === "low" || x === "medium" || x === "high" ? x : undefined;
}

/** none=0 weak=33 moderate=67 strong=100 */
export function qualTo100(q: QualLevel): number {
  return { none: 0, weak: 33, moderate: 67, strong: 100 }[q];
}

/** none=0 weak=1 moderate=2 strong=3 (−1 when absent). */
export function qualRank(q: QualLevel | undefined): number {
  return q === undefined ? -1 : { none: 0, weak: 1, moderate: 2, strong: 3 }[q];
}

/** Safety score for a "lower is safer" risk level (low=90 medium=55 high=20). */
export function lmhSafety(l: LmhLevel): number {
  return { low: 90, medium: 55, high: 20 }[l];
}

/** Value score for a "higher is better" signal (low=20 medium=55 high=90). */
export function lmhValue(l: LmhLevel): number {
  return { low: 20, medium: 55, high: 90 }[l];
}

/** low=0 medium=1 high=2 (−1 when absent). */
export function lmhRank(l: LmhLevel | undefined): number {
  return l === undefined ? -1 : { low: 0, medium: 1, high: 2 }[l];
}
