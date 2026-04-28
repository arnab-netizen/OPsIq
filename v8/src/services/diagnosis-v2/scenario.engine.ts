import type { DerivedMetricV2, ScenarioCaseV2 } from "@/domain/diagnosis-v2/types";
import { metricValue } from "./metrics.engine";
import { clampScore, round } from "./utils";

function rank(profit: number, revenue: number, cashRunway: number): number {
  const margin = revenue > 0 ? profit / revenue : profit >= 0 ? 0.2 : -0.8;
  return clampScore(50 + margin * 90 + Math.min(20, cashRunway * 4));
}

function scenario(caseKey: ScenarioCaseV2["caseKey"], label: string, revenue: number, costs: number, cash: number, revPct: number, costPct: number): ScenarioCaseV2 {
  const scenarioRevenue = revenue * (1 + revPct / 100);
  const scenarioCosts = costs * (1 + costPct / 100);
  const monthlyProfit = scenarioRevenue - scenarioCosts;
  const monthlyCashBurn = Math.max(0, scenarioCosts - scenarioRevenue);
  const cashRunwayMonths = monthlyCashBurn === 0 ? 999 : cash / Math.max(monthlyCashBurn, 1);
  return {
    caseKey,
    label,
    assumptions: { revenueChangePct: revPct, costChangePct: costPct },
    outputs: {
      scenarioRevenue: round(scenarioRevenue, 2),
      scenarioCosts: round(scenarioCosts, 2),
      monthlyProfit: round(monthlyProfit, 2),
      monthlyCashBurn: round(monthlyCashBurn, 2),
      cashRunwayMonths: round(cashRunwayMonths, 2),
    },
    robustnessRank: rank(monthlyProfit, scenarioRevenue, cashRunwayMonths),
  };
}

export function buildScenarioCases(metrics: DerivedMetricV2[]): ScenarioCaseV2[] {
  const revenue = metricValue(metrics, "monthly_revenue") ?? 0;
  const costs = metricValue(metrics, "monthly_costs") ?? 0;
  const cash = metricValue(metrics, "cash_on_hand") ?? 0;
  return [
    scenario("base", "Current trajectory", revenue, costs, cash, 0, 0),
    scenario("downside", "Revenue weakens 10%", revenue, costs, cash, -10, 0),
    scenario("severe_downside", "Revenue weakens 20% and costs rise 10%", revenue, costs, cash, -20, 10),
    scenario("upside", "Margin reset improves revenue 4% without cost increase", revenue, costs, cash, 4, 0),
  ];
}
