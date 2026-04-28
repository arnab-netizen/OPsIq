import { FinancialBaseline, ImpactEstimate } from "@/domain/finance/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateImpact(
  baseline: FinancialBaseline,
  deltaRevenue: number,
  deltaCost: number,
  confidence: number
): ImpactEstimate {
  // Validate baseline is not empty
  if (baseline.revenue.length === 0 && baseline.costs.length === 0) {
    throw new Error("Baseline cannot be empty");
  }

  // Validate no NaN values
  if (isNaN(deltaRevenue) || isNaN(deltaCost) || isNaN(confidence)) {
    throw new Error("Invalid numeric values: NaN detected");
  }

  const expected = deltaRevenue - deltaCost;
  const impactLow = expected * 0.7;
  const impactHigh = expected * 1.3;
  const confidenceWeight = clamp(confidence, 0, 1);

  return {
    impactLow,
    impactExpected: expected,
    impactHigh,
    confidenceWeight,
  };
}
