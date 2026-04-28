export interface DecisionInput {
  metrics: Record<string, number>;
  flags: Record<string, boolean>;
}

export interface DecisionRule {
  id: string;
  description: string;
  condition: (input: DecisionInput) => boolean;
  action: string;
  impactMultiplier: number;
}

export interface DecisionOutput {
  problem: string;
  action: string;
  impactMultiplier: number;
  confidence: number;
  ruleId: string;
}

export interface DecisionExplanation {
  summary: string;
  drivers: string[];
  assumptions: string[];
  risks: string[];
  missingData: string[];
}

export interface DecisionResult {
  decision: "APPROVED" | "BLOCKED";
  expectedImpact: number;
  confidence: number;
  explanation: DecisionExplanation;
  reason?: "LOW_CONFIDENCE" | "NON_POSITIVE_IMPACT" | "INVALID_INPUT";
}
