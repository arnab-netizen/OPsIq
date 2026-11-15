/**
 * Owner Strategy (Module 8) — missing-input contract.
 *
 * Pure. Every money input the decision depends on is classified as exactly one of
 * missing / zero / negative / positive, so "not entered" is never confused with a
 * known zero. A known zero is a fact (cash = 0 means nothing is available and the whole
 * investment is a funding gap); a missing value is an unknown that must be surfaced,
 * never filled in. Negative investment or cash is rejected by the write-path schema; the
 * domain still classifies it (fail closed) so no reader has to guess.
 */
import { num } from "./metrics";
import { STRATEGY_RISK_LEVELS, type StrategyRiskLevel, type StrategySnapshotInput } from "./types";

export type StrategyAmountStatus = "missing" | "zero" | "negative" | "positive";

export function amountStatus(x: number | undefined | null): StrategyAmountStatus {
  const v = num(x);
  if (v === null) return "missing";
  if (v === 0) return "zero";
  return v < 0 ? "negative" : "positive";
}

export interface StrategyInputStatus {
  expectedRevenueChange: StrategyAmountStatus;
  costChange: StrategyAmountStatus;
  investmentRequired: StrategyAmountStatus;
  cashAvailable: StrategyAmountStatus;
  /** The owner-rated execution risk, or null when not chosen (downside is then unknown). */
  riskLevel: StrategyRiskLevel | null;
  /** Revenue change or cost change missing: the profit effect cannot be calculated. */
  coreEconomicsMissing: boolean;
  /**
   * Cash is missing while a positive investment is required: affordability and the funding gap
   * are unknown. With no (or zero) investment, missing cash blocks nothing.
   */
  cashNeededButMissing: boolean;
}

function riskLevelOf(x: string | undefined | null): StrategyRiskLevel | null {
  return typeof x === "string" && (STRATEGY_RISK_LEVELS as readonly string[]).includes(x)
    ? (x as StrategyRiskLevel)
    : null;
}

export function classifyStrategyInputs(input: StrategySnapshotInput): StrategyInputStatus {
  const expectedRevenueChange = amountStatus(input.expectedRevenueChange);
  const costChange = amountStatus(input.costChange);
  const investmentRequired = amountStatus(input.investmentRequired);
  const cashAvailable = amountStatus(input.cashAvailable);
  return {
    expectedRevenueChange,
    costChange,
    investmentRequired,
    cashAvailable,
    riskLevel: riskLevelOf(input.riskLevel),
    coreEconomicsMissing: expectedRevenueChange === "missing" || costChange === "missing",
    cashNeededButMissing: investmentRequired === "positive" && cashAvailable === "missing",
  };
}
