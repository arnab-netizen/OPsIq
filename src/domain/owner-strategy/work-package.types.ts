/**
 * Owner Strategy — Workload Execution + Work Package types (execution.md Phase 7,
 * GAP-005 + GAP-006). Pure type definitions.
 *
 * A Work Package turns a recommendation into prepared, assignable, proof-backed
 * work so OpsIQ carries as much of the owner's workload as is safe — not advice.
 */

/** Safe workload-transfer ladder. Levels 0,1,2,5 are active; 3,4 are future (integrations). */
export const WORKLOAD_TRANSFER_LEVELS = [
  "LEVEL_0_ADVICE_ONLY",
  "LEVEL_1_PREPARED_WORK",
  "LEVEL_2_STRUCTURED_TASK_EXECUTION",
  "LEVEL_3_SEMI_AUTOMATED_EXECUTION",
  "LEVEL_4_APPROVED_AUTONOMOUS_ROUTINE_EXECUTION",
  "LEVEL_5_BLOCKED",
] as const;
export type WorkloadTransferLevel = (typeof WORKLOAD_TRANSFER_LEVELS)[number];

export const WORK_PACKAGE_ACTION_KINDS = [
  "customer_reactivation",
  "complaint_recovery",
  "referral_request",
  "review_request",
  "b2b_outreach",
  "pricing_change",
  "staff_training",
  "sop_creation",
  "marketing_campaign",
  "daily_ops",
  "vendor_negotiation",
  "startup_validation",
  "startup_launch",
  "generic",
] as const;
export type WorkPackageActionKind = (typeof WORK_PACKAGE_ACTION_KINDS)[number];

export const ARTIFACT_KINDS = [
  "customer_script",
  "message_draft",
  "staff_instruction",
  "sop",
  "checklist",
  "tracker",
  "call_list",
  "vendor_script",
  "pricing_calculator",
  "campaign_plan",
  "review_request",
  "complaint_recovery",
  "training_plan",
  "daily_task_board",
  "launch_checklist",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export type AssigneeRole = "owner" | "staff" | "manager" | "system" | "vendor";

export type FinancialDecision = "APPROVED" | "NEEDS_OWNER_APPROVAL" | "BLOCKED" | "NEEDS_MORE_DATA";

export interface PreparedArtifact {
  kind: ArtifactKind;
  title: string;
  /** Ready-to-use content. Fill-in slots are marked with [square brackets]. */
  content: string;
}

export interface WorkPackageInput {
  title: string;
  problem: string;
  actionKind: WorkPackageActionKind;
  evidence?: string[] | null;
  playbookRef?: string | null;
  financialDecision?: FinancialDecision | null;
  riskLevel?: "low" | "medium" | "high" | "critical" | null;
  assigneeRole?: AssigneeRole | null;
  deadlineDays?: number | null;
  isSafe?: boolean | null; // default true
  isLegal?: boolean | null; // default true
  withinAuthority?: boolean | null; // default true
  ownerApprovalRequired?: boolean | null;
  expectedOutcome?: string | null;
  measurementWindowDays?: number | null;
  businessName?: string | null; // template slot default
}

export interface OwnerWorkloadEstimate {
  ownerTaskAvoided: string;
  estimatedMinutesBefore: number;
  estimatedMinutesAfter: number;
  burdenChange: "decreased" | "shifted" | "increased" | "unchanged";
  decisionStillRequired: string;
}

export interface WorkPackage {
  title: string;
  problem: string;
  actionKind: WorkPackageActionKind;
  evidence: string[];
  playbookRef: string | null;
  financialDecision: FinancialDecision;
  riskLevel: "low" | "medium" | "high" | "critical";
  ownerApprovalRequired: boolean;
  maxTransferLevel: WorkloadTransferLevel;
  transferLevelReason: string;
  steps: string[];
  preparedArtifacts: PreparedArtifact[];
  assignee: AssigneeRole;
  deadlineDays: number;
  requiredProof: string;
  completionCriteria: string;
  rejectionCriteria: string;
  expectedOutcome: string;
  measurementWindowDays: number;
  ownerWorkload: OwnerWorkloadEstimate;
  escalationRule: string;
  learningUpdateRule: string;
  blocked: boolean;
  warnings: string[];
}
