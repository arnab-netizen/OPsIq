import { createHash } from "crypto";
import { DecisionResult } from "@/domain/decision/types";

const ENGINE_VERSION = "v1.0.0";

export function generateDecisionHash(result: DecisionResult): string {
  const trace = result.explanation.calculationTrace;

  const hashInput = {
    inputs: {
      baselineRevenue: trace.baselineRevenue,
      baselineCost: trace.baselineCost,
      revenueChange: trace.revenueChange,
      costChange: trace.costChange,
    },
    calculation: {
      formula: trace.formula,
      netImpact: trace.netImpact,
    },
    decision: result.decision,
    version: ENGINE_VERSION,
  };

  const inputString = JSON.stringify(hashInput);
  const hash = createHash("sha256").update(inputString).digest("hex");

  return hash;
}

export function getEngineVersion(): string {
  return ENGINE_VERSION;
}

export interface IntegrityPayload {
  decisionHash: string;
  engineVersion: string;
}

export function createIntegrityPayload(result: DecisionResult): IntegrityPayload {
  return {
    decisionHash: generateDecisionHash(result),
    engineVersion: ENGINE_VERSION,
  };
}
