/**
 * Owner Finance — what OpsIQ CANNOT conclude yet, and why (pure).
 *
 * UNKNOWN is a state, not a number: when cash or a cost half is unknown, OpsIQ abstains from the conclusions that need
 * it (metrics.ts / liquidity.ts return null) and says so in plain words instead of leaving a silent gap or inventing
 * a figure. This is the ONE place those sentences are decided, derived from the same cost/liquidity primitives the
 * metrics use, so the explanation can never disagree with what the engine actually withheld.
 */
import type { FinancialSnapshotInput } from "./types";
import { isCashUnknown } from "./data-confidence";
import { fixedCostsTotal, knownFixedCosts, knownVariableCosts, totalCosts, variableCostsTotal } from "./metrics";

export type UnsupportedConclusionCode = "CASH_UNKNOWN" | "COSTS_INCOMPLETE";

export interface UnsupportedConclusion {
  code: UnsupportedConclusionCode;
  /** Owner-facing sentence. */
  text: string;
}

type Facts = Pick<
  FinancialSnapshotInput,
  | "cashOnHand" | "fixedCosts" | "variableCosts" | "rent" | "salaryPayroll" | "utilities"
  | "costOfGoodsOrServices" | "deliveryFulfilmentCost" | "marketingSpend"
>;

export function unsupportedConclusions(facts: Facts): UnsupportedConclusion[] {
  const input = facts as FinancialSnapshotInput;
  const out: UnsupportedConclusion[] = [];

  if (totalCosts(input) === null) {
    const anyCost = knownFixedCosts(input) !== null || knownVariableCosts(input) !== null;
    const gaps = [
      fixedCostsTotal(input) === null ? "fixed costs" : null,
      variableCostsTotal(input) === null ? "variable costs" : null,
    ].filter((g): g is string => g !== null);
    out.push({
      code: "COSTS_INCOMPLETE",
      text: anyCost
        ? `Some cost information is missing (${gaps.join(" and ")}), so OpsIQ cannot calculate total profit or margin yet. Enter 0 only if there really were none.`
        : "Cost information is missing, so OpsIQ cannot calculate total profit or margin yet.",
    });
  }

  if (isCashUnknown(facts)) {
    out.push({
      code: "CASH_UNKNOWN",
      text: "OpsIQ doesn't know your cash, so it can't say how long your cash will last. You don't need to estimate it: this is a missing figure, not a sign that you have none.",
    });
  }

  return out;
}
