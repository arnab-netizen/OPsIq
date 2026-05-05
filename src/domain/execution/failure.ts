export enum ExecutionFailureType {
  ACTION_FAILED = "ACTION_FAILED",
  TIMEOUT = "TIMEOUT",
  DEPENDENCY_FAILURE = "DEPENDENCY_FAILURE",
  RESOURCE_EXHAUSTED = "RESOURCE_EXHAUSTED",
  STATE_VIOLATION = "STATE_VIOLATION",
  UNKNOWN = "UNKNOWN",
}

export enum FailureSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export interface ExecutionFailure {
  id: string;
  executionId: string;
  failureType: ExecutionFailureType;
  severity: FailureSeverity;
  message: string;
  context: Record<string, unknown>;
  timestamp: Date;
  rootCause?: string;
}

export interface Containment {
  failureId: string;
  strategy: "ISOLATE" | "ROLLBACK" | "ESCALATE";
  affectedActions: string[];
  isolatedScope: string;
  cascadePrevented: boolean;
  timestamp: Date;
}

export interface ContainmentResult {
  success: boolean;
  failure: ExecutionFailure;
  containment: Containment;
  recommendations: string[];
}

export interface RollbackResult {
  decisionId: string;
  previousState: string;
  newState: string;
  affectedActions: number;
  timestamp: Date;
  success: boolean;
  reason: string;
}
