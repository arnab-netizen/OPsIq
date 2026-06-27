/**
 * Rolling Forecast & Scenario Engine (Section 28). Pure, deterministic.
 *
 * Produces 7/30/90-day cash views and a rolling 13-week cash projection under
 * base / downside / cash-stress scenarios from starting cash, expected weekly
 * inflow/outflow, and dated obligations. Budget should not wait until month-end to
 * fail — this surfaces the week a reserve breach would occur under each scenario.
 */

import type { CashObligation } from "@/domain/owner-budget/types";

export interface ForecastInput {
  cashOnHand: number;
  weeklyRevenue?: number;
  weeklyOutflow?: number;
  obligations?: CashObligation[];
  reserveRequired?: number;
}

export type ScenarioName = "base" | "downside" | "cash_stress";

export interface ScenarioProjection {
  name: ScenarioName;
  weeklyEndingCash: number[];
  endingCash: number;
  minCash: number;
  /** 1-based week index where cash first falls below the reserve (null = never). */
  reserveBreachWeek: number | null;
}

export interface ForecastResult {
  startingCash: number;
  reserveRequired: number;
  sevenDayCash: number;
  thirtyDayCash: number;
  ninetyDayCash: number;
  scenarios: ScenarioProjection[];
  nextCriticalDueInDays: number | null;
}

const WEEKS = 13;

function project(
  start: number,
  weeklyRevenue: number,
  weeklyOutflow: number,
  obligations: CashObligation[],
  reserve: number
): ScenarioProjection["weeklyEndingCash"] {
  const weekly: number[] = [];
  let cash = start;
  for (let w = 1; w <= WEEKS; w++) {
    cash += weeklyRevenue - weeklyOutflow;
    // Apply obligations falling within this week (7-day buckets).
    for (const o of obligations) {
      if (o.dueInDays > (w - 1) * 7 && o.dueInDays <= w * 7) cash -= Math.max(0, o.amount);
    }
    weekly.push(Math.round(cash));
  }
  return weekly;
}

function summarize(name: ScenarioName, weekly: number[], reserve: number): ScenarioProjection {
  const minCash = Math.min(...weekly);
  const breachIdx = weekly.findIndex((c) => c < reserve);
  return {
    name,
    weeklyEndingCash: weekly,
    endingCash: weekly[weekly.length - 1],
    minCash,
    reserveBreachWeek: breachIdx === -1 ? null : breachIdx + 1,
  };
}

/** Compute the rolling 13-week forecast across base/downside/cash-stress scenarios. */
export function computeCashForecast(i: ForecastInput): ForecastResult {
  const start = i.cashOnHand;
  const reserve = Math.max(0, i.reserveRequired ?? 0);
  const rev = Math.max(0, i.weeklyRevenue ?? 0);
  const out = Math.max(0, i.weeklyOutflow ?? 0);
  const obligations = i.obligations ?? [];

  const base = project(start, rev, out, obligations, reserve);
  const downside = project(start, rev * 0.7, out, obligations, reserve);
  const cashStress = project(start, rev * 0.5, out * 1.1, obligations, reserve);

  // Day views from the base weekly trajectory (week 1 ≈ 7 days, etc.).
  const sevenDayCash = base[0];
  const thirtyDayCash = base[Math.min(3, base.length - 1)]; // ~4 weeks
  const ninetyDayCash = base[Math.min(12, base.length - 1)]; // ~13 weeks

  const nextCriticalDueInDays = obligations.length ? Math.min(...obligations.map((o) => o.dueInDays)) : null;

  return {
    startingCash: start,
    reserveRequired: reserve,
    sevenDayCash,
    thirtyDayCash,
    ninetyDayCash,
    scenarios: [
      summarize("base", base, reserve),
      summarize("downside", downside, reserve),
      summarize("cash_stress", cashStress, reserve),
    ],
    nextCriticalDueInDays,
  };
}
