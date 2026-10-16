/**
 * Owner Finance — the owner-facing PROFIT POSITION of one snapshot (pure; no formula of its own).
 *
 * Net profit and margin are derived by the one finance cost model (metrics.ts netProfit / totalCosts): revenue minus
 * fixed + variable costs (+ marketing when entered), and ONLY when revenue and both cost halves are known. Anything
 * less is UNKNOWN with the reason — never a partial figure and never zero. An explicit 0 is a known value.
 * Margin is shown to two decimals (the exact ratio: 25,000 / 80,000 = 31.25%); metrics.ts keeps its own one-decimal
 * rounding for internal thresholds, the two are the same quantity.
 */
import type { FinancialSnapshotInput } from "./types";
import { netProfit, totalCosts, num } from "./metrics";
import { unsupportedConclusions } from "./unsupported-conclusions";

export type ProfitPosition =
  | { status: "KNOWN"; netProfit: number; marginPct: number | null; currency: string; headline: string; marginText: string | null }
  | { status: "UNKNOWN"; reason: string };

function money(n: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(Math.abs(n))}`;
}

export function profitPosition(input: FinancialSnapshotInput, currency: string): ProfitPosition {
  const revenue = num(input.revenue);
  if (revenue === null) {
    return { status: "UNKNOWN", reason: "Revenue is not entered, so OpsIQ cannot calculate profit or margin yet." };
  }
  const profit = netProfit(input);
  if (profit === null || totalCosts(input) === null) {
    const why = unsupportedConclusions(input).find((c) => c.code === "COSTS_INCOMPLETE");
    return { status: "UNKNOWN", reason: why?.text ?? "Cost information is missing, so OpsIQ cannot calculate total profit or margin yet." };
  }
  const marginPct = revenue === 0 ? null : Number(((profit / revenue) * 100).toFixed(2));
  const headline = profit < 0 ? `Net loss of ${money(profit, currency)}` : profit === 0 ? `Break-even (profit of ${money(0, currency)})` : `Net profit of ${money(profit, currency)}`;
  return { status: "KNOWN", netProfit: profit, marginPct, currency, headline, marginText: marginPct === null ? null : `Net margin ${marginPct}%` };
}
