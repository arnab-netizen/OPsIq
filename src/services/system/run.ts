import { DecisionInput, DecisionRule, DecisionOutput } from "@/domain/decision/types";
import { ImpactEstimate } from "@/domain/finance/types";
import { runDecisionEngine } from "@/services/decision/engine";
import { calculateImpact } from "@/services/finance/normalize";
import { AuditRecord } from "@/domain/audit/types";
import { logDecision } from "@/services/audit/log";
import { createBaseline } from "@/services/onboarding/basic";
import { compareScenarios, ScenarioComparison } from "@/services/control/scenario-comparison";
import { randomUUID } from "crypto";

export function runSystem(inputMetrics: Record<string, number>): {
  decisions: DecisionOutput[];
  impact: ImpactEstimate;
  scenarios: ScenarioComparison;
} {
  // SAFETY: Validate required inputs (fail-closed)
  if (!inputMetrics || typeof inputMetrics !== "object") {
    throw new Error("Invalid input: inputMetrics must be an object");
  }

  // SAFETY: Check for required financial inputs (no defaults)
  const baselineRevenue = inputMetrics["baselineRevenue"];
  const baselineCost = inputMetrics["baselineCost"];
  const deltaRevenue = inputMetrics["revenueChange"];
  const deltaCost = inputMetrics["costChange"];
  const confidence = inputMetrics["confidence"];

  if (baselineRevenue === undefined) {
    throw new Error("Missing required input: baselineRevenue");
  }
  if (baselineCost === undefined) {
    throw new Error("Missing required input: baselineCost");
  }
  if (deltaRevenue === undefined) {
    throw new Error("Missing required input: revenueChange");
  }
  if (deltaCost === undefined) {
    throw new Error("Missing required input: costChange");
  }
  if (confidence === undefined) {
    throw new Error("Missing required input: confidence");
  }

  // SAFETY: Validate raw confidence BEFORE any adjustment
  if (confidence < 0.5) {
    throw new Error("LOW_CONFIDENCE_BLOCKED");
  }
  if (confidence > 1.0) {
    throw new Error("Confidence cannot exceed 1.0");
  }

  // SAFETY: Validate impact is non-zero and non-negative
  const expectedImpact = deltaRevenue - deltaCost;
  if (expectedImpact <= 0) {
    throw new Error("NON_POSITIVE_IMPACT_BLOCKED");
  }

  // CONTROL PHASE: Generate scenarios BEFORE decisions (fail-closed)
  let scenarios: ScenarioComparison;
  try {
    scenarios = compareScenarios({
      baselineRevenue,
      baselineCost,
      revenueChange: deltaRevenue,
      costChange: deltaCost,
      confidence,
    });
  } catch (scenarioError) {
    const errorMsg = scenarioError instanceof Error ? scenarioError.message : "Unknown scenario error";
    throw new Error(`SCENARIO_GENERATION_FAILED: ${errorMsg}`);
  }

  // 1. Build DecisionInput
  const decisionInput: DecisionInput = {
    metrics: inputMetrics,
    flags: {
      isHighRisk: (inputMetrics["risk"] || 0) > 7,
      hasContext: Object.keys(inputMetrics).length > 0,
    },
  };

  // 2. Define dummy rules
  const rules: DecisionRule[] = [
    {
      id: "rule-1",
      description: "High risk flag set",
      condition: (input) => input.flags.isHighRisk,
      action: "ESCALATE",
      impactMultiplier: 1.5,
    },
    {
      id: "rule-2",
      description: "Context available",
      condition: (input) => input.flags.hasContext,
      action: "PROCEED",
      impactMultiplier: 1.0,
    },
  ];

  // 3. Run decision engine
  const decisions = runDecisionEngine(decisionInput, rules);

  // 4. Create FinancialBaseline (from input, not hardcoded)
  const baseline = createBaseline(baselineRevenue, baselineCost);

  const impact = calculateImpact(baseline, deltaRevenue, deltaCost, confidence);

  // 6. Log audit record
  const auditRecord: AuditRecord = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    inputSnapshot: JSON.stringify(decisionInput),
    outputSnapshot: JSON.stringify({ decisions, impact, scenarios }),
    ruleId: decisions.length > 0 ? decisions[0].ruleId : "none",
  };

  logDecision(auditRecord);

  return {
    decisions,
    impact,
    scenarios,
  };
}
