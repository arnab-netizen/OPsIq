import { ScenarioInput, ScenarioResult } from "@/domain/scenario/types";
import { createBaseline } from "@/services/onboarding/basic";
import { calculateImpact } from "@/services/finance/normalize";

export function runScenario(input: ScenarioInput): ScenarioResult {
  // Validate base values
  if (input.baseRevenue <= 0 || input.baseCost <= 0) {
    throw new Error("Base revenue and cost must be greater than 0");
  }

  // Build baseline
  const baseline = createBaseline(input.baseRevenue, input.baseCost);

  // Calculate impact with fixed confidence
  const impact = calculateImpact(
    baseline,
    input.deltaRevenue,
    input.deltaCost,
    0.8
  );

  // Return result
  return {
    impactExpected: impact.impactExpected,
    impactLow: impact.impactLow,
    impactHigh: impact.impactHigh,
  };
}
