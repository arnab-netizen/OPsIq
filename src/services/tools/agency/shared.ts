/**
 * Shared, pure building blocks for the free agency calculators.
 * No I/O, no storage, no network: every value stays in the visitor's browser.
 *
 * Rules that apply to every calculator built on this file:
 * - A blank or unreadable required field is an ERROR, never a silent 0.
 * - Out-of-range values are rejected with a message, never clamped.
 * - An undefined result (division by zero, no revenue, no hours) is `null` and is shown as "Not available".
 * - Money is rounded to whole cents only for display; arithmetic runs on plain numbers and is rounded once at the edge.
 * - No currency conversion: the visitor chooses a currency label and enters every amount in it.
 */
export {
  CURRENCIES,
  DEFAULT_CURRENCY,
  MAX_AMOUNT,
  formatMoney,
  formatPercent,
  normalizeCurrency,
  type CurrencyCode,
} from "@/services/tools/profit-cash";

export { MAX_TARGET_MARGIN } from "@/services/tools/profit-cash";

/** Largest hours figure accepted in any field (10 million hours is already far beyond any agency). */
export const MAX_HOURS = 10_000_000;

export type FieldKind = "money" | "hours" | "percent" | "count";

export type FieldRule = {
  kind: FieldKind;
  /** Required fields must be filled in; optional fields default to `defaultWhenBlank`. */
  required: boolean;
  /** Value used for an optional blank field. Ignored for required fields. */
  defaultWhenBlank?: number;
  /** Inclusive lower bound (default 0). */
  min?: number;
  /** Inclusive upper bound. Defaults by kind. */
  max?: number;
  /** When true the value must be strictly greater than `min` (for example a divisor). */
  exclusiveMin?: boolean;
};

export type ParsedField = { ok: true; value: number; /** true when an optional field was left blank (so its default was used, not a typed 0) */ blank: boolean } | { ok: false; reason: "missing" | "unreadable" | "out_of_range"; message: string };

const DEFAULT_MAX: Record<FieldKind, number> = {
  money: 1_000_000_000_000,
  hours: MAX_HOURS,
  percent: 99.9,
  count: 1_000_000,
};

const KIND_UNIT: Record<FieldKind, string> = { money: "an amount", hours: "a number of hours", percent: "a percentage", count: "a whole number" };

/** Parse one text field against its rule. Never throws; never clamps; never turns bad text into 0. */
export function parseField(raw: string, rule: FieldRule, label: string, unreadableByBrowser = false): ParsedField {
  const text = raw.trim();
  if (unreadableByBrowser) {
    return { ok: false, reason: "unreadable", message: `${label}: enter numbers only (no currency symbols, spaces or separators).` };
  }
  if (text === "") {
    if (!rule.required) return { ok: true, value: rule.defaultWhenBlank ?? 0, blank: true };
    return { ok: false, reason: "missing", message: `${label}: required.` };
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    return { ok: false, reason: "unreadable", message: `${label}: enter ${KIND_UNIT[rule.kind]} using numbers only.` };
  }
  const min = rule.min ?? 0;
  const max = rule.max ?? DEFAULT_MAX[rule.kind];
  if (n < min || (rule.exclusiveMin && n <= min) || n > max) {
    const lower = rule.exclusiveMin ? `more than ${min}` : `at least ${min}`;
    return { ok: false, reason: "out_of_range", message: `${label}: must be ${lower} and no more than ${max.toLocaleString("en-US")}.` };
  }
  if (rule.kind === "count" && !Number.isInteger(n)) {
    return { ok: false, reason: "out_of_range", message: `${label}: must be a whole number.` };
  }
  return { ok: true, value: n + 0, blank: false }; // "+ 0" turns -0 into 0
}

/**
 * Smallest positive value accepted wherever a field is used as a divisor (hours, staff, capacity, fees). Below this a result
 * would be dominated by the divisor and show absurd figures, so it is rejected with a message instead of computed.
 */
export const MIN_POSITIVE = 0.01;

/**
 * Money is exact to the cent only below about 9e13 in double precision (9e15 / 100). Anything larger, including a product of
 * two large inputs, is refused rather than shown with a wrong last digit.
 */
export const MAX_EXACT_MONEY = 9e13;

/** True when any value is non-finite or too large to be exact to the cent. */
export function tooLarge(...values: number[]): boolean {
  return values.some((v) => !Number.isFinite(v) || Math.abs(v) > MAX_EXACT_MONEY);
}

/** A money result, or null when it is non-finite or outside the exact range (shown as Not available). */
export function moneyOrNull(n: number | null): number | null {
  return n === null || tooLarge(n) ? null : n;
}

/** Tolerance for comparing unrounded ratios that should be equal but differ by floating-point error (about 1e-16 per operation). */
export const RATIO_TOLERANCE = 1e-9;

/**
 * 1 - margin, computed on a 12-decimal grid. The plain subtraction loses digits near 100% (1 - 0.9990000000000001 is
 * 0.0009999999999998899, off by 1e-13 relative), which would push a required fee up by a cent. The inputs have far fewer than
 * 12 decimals, so snapping the complement to that grid only removes floating-point noise.
 */
export function complement(margin: number): number {
  return Number((1 - margin).toFixed(12));
}

/**
 * Round UP to whole cents. Used for REQUIRED prices, fees and rates so the displayed figure is never below the true
 * requirement (nearest-cent rounding could leave a target margin missed by a fraction of a cent). The tolerance absorbs
 * floating-point noise (a few units in the 15th digit) such as 4166.666666666667 * 100 = 416666.66666666674.
 */
export function ceilCents(n: number): number {
  const cents = n * 100;
  const eps = Math.max(1e-6, Math.abs(cents) * 3e-15);
  const c = Math.ceil(cents - eps) / 100;
  return c === 0 ? 0 : c;
}

/** Round a money value to whole cents (half away from zero) so 0.1 + 0.2 style drift never reaches the screen. */
export function roundCents(n: number): number {
  const r = Math.round(Math.abs(n) * 100) / 100;
  return n < 0 && r !== 0 ? -r : r;
}

/** Round a percentage to one decimal place, never returning -0. */
export function roundPct(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

/** Divide, returning null instead of Infinity or NaN. */
export function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const q = numerator / denominator;
  return Number.isFinite(q) ? q : null;
}

/** Fee needed so that (fee - cost) / fee equals `targetMargin` (a fraction in [0, 1)). null when the target is 100% or more. */
export function feeForMargin(cost: number, targetMargin: number): number | null {
  if (!(targetMargin >= 0 && targetMargin < 1)) return null;
  const c = complement(targetMargin);
  if (!(c > 0)) return null;
  return cost / c;
}

export type CalcErrors = { ok: false; errors: string[] };
export type CalcOk<T> = { ok: true } & T;
export type CalcResult<T> = CalcOk<T> | CalcErrors;

/** Fixture-friendly helper: turn a percent (0-99.9) into a fraction. */
export const pctToFraction = (p: number): number => p / 100;
