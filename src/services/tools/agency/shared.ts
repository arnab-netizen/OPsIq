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

export type ParsedField = { ok: true; value: number } | { ok: false; reason: "missing" | "unreadable" | "out_of_range"; message: string };

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
    if (!rule.required) return { ok: true, value: rule.defaultWhenBlank ?? 0 };
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
  return { ok: true, value: n + 0 }; // "+ 0" turns -0 into 0
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
  return cost / (1 - targetMargin);
}

export type CalcErrors = { ok: false; errors: string[] };
export type CalcOk<T> = { ok: true } & T;
export type CalcResult<T> = CalcOk<T> | CalcErrors;

/** Fixture-friendly helper: turn a percent (0-99.9) into a fraction. */
export const pctToFraction = (p: number): number => p / 100;
