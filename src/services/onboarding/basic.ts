import {
  FinancialBaseline,
  RevenueStream,
  CostCategory,
} from "@/domain/finance/types";

export function createBaseline(
  revenue: number,
  cost: number
): FinancialBaseline {
  if (revenue <= 0 || cost <= 0) {
    throw new Error("Revenue and cost must be greater than 0");
  }

  const revenueStream: RevenueStream = {
    id: "initial-revenue",
    name: "Initial Revenue",
    monthlyValue: revenue,
  };

  const costCategory: CostCategory = {
    id: "initial-cost",
    name: "Initial Cost",
    monthlyCost: cost,
    type: "fixed",
  };

  return {
    revenue: [revenueStream],
    costs: [costCategory],
    period: "monthly",
  };
}
