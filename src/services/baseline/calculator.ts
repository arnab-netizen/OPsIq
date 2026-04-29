export interface BaselineInput {
  baselineRevenue: number;
  baselineCost: number;
  revenueChange: number;
  costChange: number;
  expectedImpact: number;
}

export interface BaselineMetrics {
  baselineValue: number;
  projectedWithoutAction: number;
}

export function calculateBaselineMetrics(input: BaselineInput): BaselineMetrics {
  const {
    baselineRevenue,
    baselineCost,
    revenueChange,
    costChange,
    expectedImpact,
  } = input;

  // Baseline value: Net of baseline revenue and cost
  const baselineValue = baselineRevenue - baselineCost;

  // Projected without action: What would happen if no action is taken
  // Assume trends continue - revenue decreases, cost increases
  // Without action, we lose the positive revenue change and incur the cost change
  const trendedRevenue = baselineRevenue - Math.abs(revenueChange);
  const trendedCost = baselineCost + costChange;
  const projectedWithoutAction = trendedRevenue - trendedCost;

  return {
    baselineValue,
    projectedWithoutAction,
  };
}

export function calculateDeltaFromBaseline(
  baselineValue: number,
  actualValue: number
): number {
  return actualValue - baselineValue;
}
