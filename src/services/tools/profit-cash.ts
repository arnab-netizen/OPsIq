/**
 * Pure calculation for the public Profit vs Cash Flow calculator.
 * No I/O, no storage: inputs never leave the visitor's browser.
 */

export type ProfitCashInputs = {
  revenue: number;
  directCosts: number;
  operatingExpenses: number;
  cash: number;
  receivables: number;
  overdueReceivables: number;
  expectedCollections: number;
  billsDue: number;
};

export type ProfitCashQuadrant =
  | "profitable-healthy"
  | "profitable-squeezed"
  | "unprofitable-healthy"
  | "unprofitable-squeezed";

export type ProfitCashResult = {
  grossProfit: number;
  grossMarginPercent: number | null; // null when there is no revenue (margin is undefined, not 0%)
  markupPercent: number | null; // null when there are no direct costs
  operatingProfit: number;
  marginPercent: number | null; // null when there is no revenue
  liquidity: number; // cash + expected collections - bills due in 30 days
  overdueSharePercent: number | null; // null when nothing is owed
  coverRatio: number | null; // null when nothing is due
  quadrant: ProfitCashQuadrant;
  isBlank: boolean;
  notes: string[];
};

export const EMPTY_INPUTS: ProfitCashInputs = {
  revenue: 0,
  directCosts: 0,
  operatingExpenses: 0,
  cash: 0,
  receivables: 0,
  overdueReceivables: 0,
  expectedCollections: 0,
  billsDue: 0,
};

/** The worked example from /resources/profitable-but-short-on-cash. */
export const SAMPLE_INPUTS: ProfitCashInputs = {
  revenue: 28000,
  directCosts: 9000,
  operatingExpenses: 14500,
  cash: 2000,
  receivables: 6500,
  overdueReceivables: 6500,
  expectedCollections: 0,
  billsDue: 7000,
};

/** Largest amount accepted in any field (one trillion). Anything above is flagged, not silently computed. */
export const MAX_AMOUNT = 1_000_000_000_000;

/** Highest target gross margin the price tool accepts; 100% would need an infinite price. */
export const MAX_TARGET_MARGIN = 99.9;

/** Parse a text field: blank is 0; negative, non-numeric or over-limit is flagged and counted as 0. */
export function parseAmount(raw: string): { value: number; invalid: boolean } {
  if (raw.trim() === "") return { value: 0, invalid: false };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { value: 0, invalid: true };
  return { value: n + 0, invalid: false }; // "+ 0" turns -0 into 0
}

/** Money is calculated in whole cents so decimals like 0.7 + 0.1 vs 0.8 compare exactly. */
const toCents = (dollars: number): number => Math.round(dollars * 100);

export function calculateProfitCash(input: ProfitCashInputs, hadInvalid = false): ProfitCashResult {
  const notes: string[] = [];
  if (hadInvalid) {
    notes.push("Negative, invalid or over-limit entries were counted as 0. Use amounts from 0 to 1,000,000,000,000.");
  }

  const revenue = toCents(input.revenue);
  const directCosts = toCents(input.directCosts);
  const operatingExpenses = toCents(input.operatingExpenses);
  const cash = toCents(input.cash);
  const receivables = toCents(input.receivables);
  const expectedCollections = toCents(input.expectedCollections);
  const billsDue = toCents(input.billsDue);

  let overdue = toCents(input.overdueReceivables);
  if (overdue > receivables) {
    overdue = receivables;
    notes.push("Overdue amount is larger than total owed, so it was capped at the total owed.");
  }
  if (expectedCollections > receivables && expectedCollections > 0) {
    notes.push("Expected cash is larger than the total owed to you, so it relies on new sales. Only count money you would bet on.");
  }

  const grossProfit = revenue - directCosts;
  const operatingProfit = grossProfit - operatingExpenses;
  const available = cash + expectedCollections;
  const liquidity = available - billsDue;

  const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : null;
  const markupPercent = directCosts > 0 ? (grossProfit / directCosts) * 100 : null;
  const marginPercent = revenue > 0 ? (operatingProfit / revenue) * 100 : null;
  const overdueSharePercent = receivables > 0 ? (overdue / receivables) * 100 : null;
  const coverRatio = billsDue > 0 ? available / billsDue : null;

  const profitable = operatingProfit > 0;
  const healthy = liquidity >= 0;
  const quadrant: ProfitCashQuadrant = profitable
    ? healthy
      ? "profitable-healthy"
      : "profitable-squeezed"
    : healthy
      ? "unprofitable-healthy"
      : "unprofitable-squeezed";

  const isBlank = Object.values(input).every((v) => v === 0);
  return {
    grossProfit: grossProfit / 100,
    grossMarginPercent,
    markupPercent,
    operatingProfit: operatingProfit / 100,
    marginPercent,
    liquidity: liquidity / 100,
    overdueSharePercent,
    coverRatio,
    quadrant,
    isBlank,
    notes,
  };
}

/** Whole dollars, with cents only for non-zero amounts under $1 so a small gap never shows as "-$0". */
export function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const cents = Math.round(abs * 100);
  const digits = cents > 0 && cents < 100 ? 2 : 0;
  const text = abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const shownAsZero = Number(abs.toFixed(digits)) === 0;
  return `${n < 0 && !shownAsZero ? "-" : ""}$${text}`;
}

/** Percent text. null is "n/a"; absurd magnitudes are bounded; never "-0.0%". */
export function formatPercent(p: number | null, digits = 1): string {
  if (p === null) return "n/a";
  if (p >= 1_000_000) return "> 1,000,000%";
  if (p <= -1_000_000) return "< -1,000,000%";
  const rounded = Number(p.toFixed(digits));
  const text = (rounded === 0 ? 0 : rounded).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${text}%`;
}

/** Cover ratio text. A ratio below 1 never displays as "1.00x", so it cannot contradict a shortfall. */
export function formatCoverRatio(ratio: number | null): string {
  if (ratio === null) return "n/a";
  if (ratio >= 1000) return "> 1,000x";
  const text = ratio.toFixed(2);
  if (ratio < 1 && text === "1.00") return "0.99x";
  if (ratio > 0 && text === "0.00") return "< 0.01x";
  return `${text}x`;
}

/** Price text with thousands separators, consistent with the other figures. */
export function formatPrice(price: number): string {
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Selling price needed to earn a target gross margin on a given cost.
 * price = cost / (1 - margin). Returns null for a margin above MAX_TARGET_MARGIN, a cost above MAX_AMOUNT, or invalid input.
 */
export function priceForTargetMargin(cost: number, targetMarginPercent: number): number | null {
  if (!Number.isFinite(cost) || cost < 0 || cost > MAX_AMOUNT) return null;
  if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent > MAX_TARGET_MARGIN) return null;
  return cost / (1 - targetMarginPercent / 100);
}
