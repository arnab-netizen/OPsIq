import type { ProblemType } from "@/domain/decision/types";

export interface ClassificationInput {
  baselineRevenue: number;
  baselineCost: number;
  revenueChange: number;
  costChange: number;
  expectedImpact: number;
}

export function classifyProblem(input: ClassificationInput): ProblemType {
  const {
    baselineRevenue,
    baselineCost,
    revenueChange,
    costChange,
    expectedImpact,
  } = input;

  // Rule 1: Revenue Leak - negative revenue change with positive baseline
  if (revenueChange < 0 && baselineRevenue > 0) {
    const revenueLossRate = Math.abs(revenueChange) / baselineRevenue;
    if (revenueLossRate >= 0.05) {
      // 5%+ revenue loss
      return "revenue_leak";
    }
  }

  // Rule 2: Cost Overrun - positive cost change (cost increases)
  if (costChange > 0) {
    const costIncreaseRate = costChange / (baselineCost || 1);
    if (costIncreaseRate >= 0.1) {
      // 10%+ cost increase
      return "cost_overrun";
    }
  }

  // Rule 3: Growth Block - negative expected impact with positive baseline revenue
  if (expectedImpact < 0 && baselineRevenue > 0) {
    return "growth_block";
  }

  // Rule 4: Inefficiency - net negative impact (cost increase > revenue increase)
  if (costChange > 0 && revenueChange < costChange) {
    return "inefficiency";
  }

  // Default: Inefficiency (fallback for unclear cases)
  return "inefficiency";
}
