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
  grossMarginPercent: number;
  markupPercent: number | null; // null when there are no direct costs
  operatingProfit: number;
  marginPercent: number;
  liquidity: number; // cash + expected collections - bills due in 30 days
  overdueSharePercent: number;
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

/** Parse a text field: blank is 0; negative or non-numeric is flagged and counted as 0. */
export function parseAmount(raw: string): { value: number; invalid: boolean } {
  if (raw.trim() === "") return { value: 0, invalid: false };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { value: 0, invalid: true };
  return { value: n, invalid: false };
}

export function calculateProfitCash(input: ProfitCashInputs, hadInvalid = false): ProfitCashResult {
  const notes: string[] = [];
  if (hadInvalid) notes.push("Negative or invalid entries were counted as 0. Enter positive amounts only.");

  let overdue = input.overdueReceivables;
  if (overdue > input.receivables) {
    overdue = input.receivables;
    notes.push("Overdue amount is larger than total owed, so it was capped at the total owed.");
  }

  const grossProfit = input.revenue - input.directCosts;
  const grossMarginPercent = input.revenue > 0 ? (grossProfit / input.revenue) * 100 : 0;
  const markupPercent = input.directCosts > 0 ? (grossProfit / input.directCosts) * 100 : null;
  const operatingProfit = grossProfit - input.operatingExpenses;
  const marginPercent = input.revenue > 0 ? (operatingProfit / input.revenue) * 100 : 0;
  const available = input.cash + input.expectedCollections;
  const liquidity = available - input.billsDue;
  const overdueSharePercent = input.receivables > 0 ? (overdue / input.receivables) * 100 : 0;
  const coverRatio = input.billsDue > 0 ? available / input.billsDue : null;

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
  return { grossProfit, grossMarginPercent, markupPercent, operatingProfit, marginPercent, liquidity, overdueSharePercent, coverRatio, quadrant, isBlank, notes };
}

/**
 * Selling price needed to earn a target gross margin on a given cost.
 * price = cost / (1 - margin). Returns null for a margin of 100% or more, or invalid input.
 */
export function priceForTargetMargin(cost: number, targetMarginPercent: number): number | null {
  if (!Number.isFinite(cost) || cost < 0) return null;
  if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent >= 100) return null;
  return cost / (1 - targetMarginPercent / 100);
}
