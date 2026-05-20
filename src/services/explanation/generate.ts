import { DecisionExplanation, DecisionResult, Driver, CalculationTrace } from "@/domain/decision/types";

export interface ExplanationInput {
  baselineRevenue: number;
  baselineCost: number;
  deltaRevenue: number;
  deltaCost: number;
  confidence: number;
  expectedImpact: number;
  rules?: Array<{ description: string }>;
}

export function generateCalculationTrace(
  input: ExplanationInput
): CalculationTrace {
  return {
    baselineRevenue: input.baselineRevenue,
    baselineCost: input.baselineCost,
    revenueChange: input.deltaRevenue,
    costChange: input.deltaCost,
    netImpact: input.expectedImpact,
    formula: "netImpact = revenueChange - costChange",
  };
}

export function generateApprovedExplanation(
  input: ExplanationInput
): DecisionExplanation {
  const drivers: Driver[] = [];
  const assumptions: string[] = [];
  const risks: string[] = [];
  const missingData: string[] = [];

  // Structured drivers
  if (input.deltaRevenue > 0) {
    drivers.push({
      type: "REVENUE",
      value: input.deltaRevenue,
      label: `Revenue increase of $${input.deltaRevenue.toFixed(0)}`,
    });
  }
  if (input.deltaRevenue < 0) {
    drivers.push({
      type: "REVENUE",
      value: input.deltaRevenue,
      label: `Revenue decrease of $${Math.abs(input.deltaRevenue).toFixed(0)}`,
    });
  }
  if (input.deltaCost !== 0) {
    drivers.push({
      type: "COST",
      value: input.deltaCost,
      label:
        input.deltaCost < 0
          ? `Cost reduction of $${Math.abs(input.deltaCost).toFixed(0)}`
          : `Cost increase of $${input.deltaCost.toFixed(0)}`,
    });
  }
  if (input.expectedImpact > 0) {
    drivers.push({
      type: "NET",
      value: input.expectedImpact,
      label: `Net positive impact of $${input.expectedImpact.toFixed(0)}`,
    });
  }

  // Assumptions
  assumptions.push(
    `Baseline revenue: $${input.baselineRevenue.toFixed(0)} monthly`
  );
  assumptions.push(`Baseline costs: $${input.baselineCost.toFixed(0)} monthly`);
  assumptions.push(`Confidence level: ${(input.confidence * 100).toFixed(0)}%`);
  if (input.deltaRevenue > 0) {
    assumptions.push(
      `Revenue change is achievable and sustainable for the specified period`
    );
  }
  if (input.deltaCost !== 0) {
    assumptions.push(`Cost adjustments are feasible without service disruption`);
  }

  // Risks
  risks.push(
    `Impact variability: actual results could range ±${(input.expectedImpact * 0.3).toFixed(0)} based on market conditions`
  );
  risks.push("Execution risk: dependent on timely implementation");
  risks.push("Market risk: external factors may affect revenue projections");
  if (input.confidence < 0.8) {
    risks.push(
      `Confidence level at ${(input.confidence * 100).toFixed(0)}% indicates material uncertainty`
    );
  }

  const summary = `Decision APPROVED: Estimated impact of $${input.expectedImpact.toFixed(0)} monthly with ${(input.confidence * 100).toFixed(0)}% confidence. Revenue impact of $${input.deltaRevenue.toFixed(0)} with cost adjustment of $${input.deltaCost.toFixed(0)}.`;

  return {
    summary,
    drivers,
    assumptions,
    risks,
    missingData,
    calculationTrace: generateCalculationTrace(input),
  };
}

export function generateBlockedExplanation(
  reason: "LOW_CONFIDENCE" | "NON_POSITIVE_IMPACT" | "INVALID_INPUT",
  input?: ExplanationInput
): DecisionExplanation {
  const missingData: string[] = [];

  let summary = "";
  const risks: string[] = [];

  switch (reason) {
    case "LOW_CONFIDENCE":
      summary = `Decision BLOCKED: Confidence level (${input ? (input.confidence * 100).toFixed(0) : "N/A"}%) is below minimum required threshold of 50%.`;
      risks.push("Insufficient data for reliable decision-making");
      missingData.push("Additional evidence needed to increase confidence");
      break;

    case "NON_POSITIVE_IMPACT":
      if (input) {
        summary = `Decision BLOCKED: Expected impact of $${input.expectedImpact.toFixed(0)} is non-positive. Revenue change ($${input.deltaRevenue.toFixed(0)}) does not exceed cost adjustment ($${input.deltaCost.toFixed(0)}).`;
        if (input.deltaRevenue <= 0) {
          missingData.push("Revenue improvement strategy needed");
        }
        if (input.deltaCost > 0) {
          missingData.push(
            "Cost reduction plan required to achieve positive impact"
          );
        }
      } else {
        summary =
          "Decision BLOCKED: Expected financial impact is non-positive.";
        missingData.push("Revenue or cost adjustment data needed");
      }
      break;

    case "INVALID_INPUT":
      summary =
        "Decision BLOCKED: Required input parameters are missing or invalid.";
      missingData.push("Baseline revenue required");
      missingData.push("Baseline costs required");
      missingData.push("Revenue change required");
      missingData.push("Cost adjustment required");
      missingData.push("Confidence level required");
      break;
  }

  return {
    summary,
    drivers: [],
    assumptions: [],
    risks,
    missingData,
    calculationTrace: input
      ? generateCalculationTrace(input)
      : {
          baselineRevenue: 0,
          baselineCost: 0,
          revenueChange: 0,
          costChange: 0,
          netImpact: 0,
          formula: "netImpact = revenueChange - costChange",
        },
  };
}

export function createDecisionResult(
  input: ExplanationInput,
  isApproved: boolean,
  blockReason?: "LOW_CONFIDENCE" | "NON_POSITIVE_IMPACT" | "INVALID_INPUT"
): DecisionResult {
  const explanation = isApproved
    ? generateApprovedExplanation(input)
    : generateBlockedExplanation(blockReason || "INVALID_INPUT", input);

  return {
    expectedImpact: input.expectedImpact,
    confidence: input.confidence,
    explanation,
    reason: isApproved ? undefined : blockReason,
  };
}
