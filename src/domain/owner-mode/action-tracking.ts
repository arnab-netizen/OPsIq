import { assertWorkspaceScopedQuery } from "./security-rules";

export type ActionStatus =
  | "pending" | "in_progress" | "completed" | "blocked" | "cancelled" | "overdue";

export type ExecutionComplianceScore =
  | "not_executed" | "materially_deviated" | "partially_executed"
  | "mostly_executed" | "fully_executed" | "over_executed";

export type DeviationSeverity = "none" | "minor" | "moderate" | "material";

export const ACTION_STATUS_TRANSITIONS: Readonly<Record<ActionStatus, ReadonlyArray<ActionStatus>>> = {
  pending: ["in_progress", "blocked", "cancelled"],
  in_progress: ["completed", "blocked", "overdue", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  overdue: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const COMPLIANCE_SCORE_ALLOWS_LEARNING: Readonly<Record<ExecutionComplianceScore, boolean>> = {
  not_executed: false,
  materially_deviated: false,
  partially_executed: false,
  mostly_executed: true,
  fully_executed: true,
  over_executed: true,
};

export interface ActionInput {
  workspaceId: string;
  businessId: string;
  recommendationId?: string;
  ownerDecisionId?: string;
  actionTitle: string;
  actionSteps: string[];
  dueAt?: Date;
  assignedToRole?: string;
}

export interface ExecutionLogInput {
  workspaceId: string;
  businessId: string;
  actionId: string;
  executedByRole?: string;
  plannedStepsCompletedCount: number;
  plannedStepsTotalCount: number;
  sampleSizeActual?: number;
  deadlineMet: boolean;
  proofText?: string;
  deviationSummary?: string;
  deviationSeverity?: DeviationSeverity;
  blockerReason?: string;
  executionComplianceScore: ExecutionComplianceScore;
}

export interface ActionValidationResult {
  valid: boolean;
  violations: string[];
}

export interface ExecutionLogValidationResult {
  valid: boolean;
  violations: string[];
  allowsLearning: boolean;
  downgradedConfidence: boolean;
  downgradeReasons: string[];
}

export function isActionStatusTransitionAllowed(
  from: ActionStatus,
  to: ActionStatus
): boolean {
  return (ACTION_STATUS_TRANSITIONS[from] as ReadonlyArray<string>).includes(to);
}

export function validateAction(input: ActionInput): ActionValidationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  if (!input.actionTitle || input.actionTitle.trim().length < 5) {
    violations.push("actionTitle must be at least 5 characters (ACT-RULE-1)");
  }

  if (!input.actionSteps || input.actionSteps.length < 1) {
    violations.push("actionSteps must contain at least 1 step (ACT-RULE-2)");
  }

  return { valid: violations.length === 0, violations };
}

export function validateExecutionLog(input: ExecutionLogInput): ExecutionLogValidationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];
  const downgradeReasons: string[] = [];

  if (
    input.executionComplianceScore === "materially_deviated" &&
    (!input.deviationSummary || input.deviationSummary.trim().length < 10)
  ) {
    violations.push("Material deviation requires deviationSummary (EXEC-RULE-1)");
  }

  if (
    input.executionComplianceScore === "not_executed" &&
    (!input.blockerReason || input.blockerReason.trim().length < 5)
  ) {
    violations.push("Not-executed action requires blockerReason (EXEC-RULE-2)");
  }

  if (input.proofText !== undefined && input.proofText.trim().length < 5) {
    violations.push("proofText too short (EXEC-RULE-3)");
  }

  const allowsLearning = COMPLIANCE_SCORE_ALLOWS_LEARNING[input.executionComplianceScore];

  if (input.executionComplianceScore === "not_executed") {
    downgradeReasons.push("Action not executed — cannot attribute outcome to recommendation");
  }
  if (input.executionComplianceScore === "materially_deviated") {
    downgradeReasons.push("Material deviation blocks high-confidence learning");
  }
  if (input.sampleSizeActual !== undefined && input.sampleSizeActual < 5) {
    downgradeReasons.push("Small sample size (< 5) downgrades outcome confidence");
  }
  if (!input.deadlineMet) {
    downgradeReasons.push("Late execution — deadline not met");
  }

  return {
    valid: violations.length === 0,
    violations,
    allowsLearning,
    downgradedConfidence: downgradeReasons.length > 0,
    downgradeReasons,
  };
}

export function computeCompletionRate(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}
