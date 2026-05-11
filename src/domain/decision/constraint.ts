export type GateName = "data_sufficient" | "contradiction_free" | "capacity_available" | "cash_runway_safe" | "legal_compliance_ok";

export interface GateResult {
  name: GateName;
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface ConstraintCheckResult {
  allPassed: boolean;
  passedGates: GateName[];
  failedGates: GateName[];
  gateResults: GateResult[];
  firstFailure?: GateName;
}

export interface CapacityCheckInput {
  availableCapacity: number;
  requiredCapacity: number;
  bufferPercentage?: number;
}

export interface CashCheckInput {
  monthlyBurn: number;
  currentCash: number;
  minRunwayMonths?: number;
}

export interface ComplianceCheckInput {
  riskLevel?: "low" | "medium" | "high" | "critical";
  requiresApproval?: boolean;
  approvalStatus?: "pending" | "approved" | "denied";
}
