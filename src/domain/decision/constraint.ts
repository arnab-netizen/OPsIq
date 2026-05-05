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
  effort_hours: number;
  available_hours?: number;
  engagement_id: string;
  workspace_id: string;
}

export interface CashCheckInput {
  capital_required: number;
  payback_days: number;
  engagement_id: string;
  workspace_id: string;
}

export interface ComplianceCheckInput {
  strategy_type?: string;
  engagement_id: string;
  workspace_id: string;
}
