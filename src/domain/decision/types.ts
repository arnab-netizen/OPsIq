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

export interface Driver {
  type: "REVENUE" | "COST" | "NET";
  value: number;
  label?: string;
}

export interface CalculationTrace {
  baselineRevenue: number;
  baselineCost: number;
  revenueChange: number;
  costChange: number;
  netImpact: number;
  formula: string;
}

export interface DecisionExplanation {
  summary: string;
  drivers: Driver[];
  assumptions: string[];
  risks: string[];
  missingData: string[];
  calculationTrace: CalculationTrace;
}

export interface DecisionResult {
  decision: "APPROVED" | "BLOCKED";
  workspaceId?: string;
  ownerUserId?: string;
  createdBy?: string;
  lastUpdatedBy?: string | null;
  expectedImpact: number;
  confidence: number;
  explanation: DecisionExplanation;
  reason?: "LOW_CONFIDENCE" | "NON_POSITIVE_IMPACT" | "INVALID_INPUT";
  decisionHash?: string;
  signedHash?: string;
  signature?: string;
  signatureAlgo?: string;
  publicKeyId?: string;
  engineVersion?: string;
  inputsSnapshot?: Record<string, unknown>;
}
