// Financial impact multipliers based on severity
// Maps severity levels to percentage of revenue at risk

const SEVERITY_MULTIPLIERS: Record<string, number> = {
  low: 0.01, // 1% of monthly revenue
  medium: 0.05, // 5% of monthly revenue
  high: 0.15, // 15% of monthly revenue
  critical: 0.30, // 30% of monthly revenue
  existential: 0.60, // 60% of monthly revenue
};

export interface FinancialImpactInput {
  severity: string;
  revenue?: number | null;
  timeFactor?: number; // days until failure / 30 (normalized to months)
}

export interface FinancialImpact {
  lossAmount: number | null; // in INR
  multiplier: number;
  basis: string;
}

export function getFinancialImpact(input: FinancialImpactInput): FinancialImpact {
  const { severity, revenue, timeFactor = 1 } = input;

  // Get multiplier for this severity level
  const multiplier = SEVERITY_MULTIPLIERS[severity.toLowerCase()] || SEVERITY_MULTIPLIERS.low;

  // If no revenue data, can't calculate financial impact
  if (!revenue || revenue <= 0) {
    return {
      lossAmount: null,
      multiplier,
      basis: "No revenue data available",
    };
  }

  // Calculate monthly loss amount
  // Formula: monthly_revenue * severity_multiplier * time_factor
  const monthlyRevenue = revenue;
  const lossAmount = Math.round(monthlyRevenue * multiplier * timeFactor);

  return {
    lossAmount,
    multiplier,
    basis: `${severity} severity: ${(multiplier * 100).toFixed(0)}% of ₹${monthlyRevenue.toLocaleString("en-IN")}`,
  };
}

export function getFinancialDelta(
  predictedSeverity: string,
  actualSeverity: string,
  revenue?: number | null,
  timeFactor?: number
): {
  predictedLoss: number | null;
  actualLoss: number | null;
  valueRecovered: number | null;
} {
  const predicted = getFinancialImpact({
    severity: predictedSeverity,
    revenue,
    timeFactor,
  });
  const actual = getFinancialImpact({
    severity: actualSeverity,
    revenue,
    timeFactor,
  });

  // Calculate value recovered
  let valueRecovered: number | null = null;
  if (predicted.lossAmount !== null && actual.lossAmount !== null) {
    valueRecovered = Math.max(0, predicted.lossAmount - actual.lossAmount);
  }

  return {
    predictedLoss: predicted.lossAmount,
    actualLoss: actual.lossAmount,
    valueRecovered,
  };
}
