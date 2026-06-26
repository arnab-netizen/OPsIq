/**
 * R3 / R7 — Task distribution plan, versioning, immutable approval, idempotency
 * (§3.7, §51, §52, §53). Pure.
 *
 * A distribution plan groups tasks for a location. Its approval record (§3.7) must be
 * complete before dispatch and is immutable once dispatched — any change creates a new
 * version. Duplicate-task detection (§53) runs before approval and before dispatch. AI
 * plans are classified (§3.6) and bulk approval is gated in `plan-approval.ts` (R6).
 */

import type { RemoteRole, RemoteTaskType, RiskLevel } from "@/domain/remote-operations/remote-types";

export type PlanSourceType = "HUMAN_CREATED" | "AI_GENERATED_PENDING_REVIEW" | "AI_GENERATED_HUMAN_REVIEWED";
export type PlanStatus = "DRAFT" | "APPROVAL_REQUIRED" | "APPROVED" | "DISPATCHED" | "PAUSED" | "CANCELLED" | "COMPLETED";

export interface PlanItem {
  taskTemplateType: RemoteTaskType;
  locationId: string;
  unitId?: string;
  scheduledAtMs: number;
  assignee: string;
  supervisor?: string;
  riskLevel: RiskLevel;
}

export interface ApprovalRecord {
  approver: string;
  approverRole: RemoteRole;
  authorityLevel: string;
  timestampMs: number;
  workspaceId: string;
  businessId: string;
  locationId: string;
  distributionPlanId: string;
  distributionPlanVersion: number;
  taskList: PlanItem[];
  assignedStaff: string[];
  assignedSupervisor: string[];
  assignedManagerOversight?: string;
  proofRequirements: string;
  escalationRules: string;
  costApprovalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED";
  ownerModeVetoClearance: boolean;
  complianceSafetyClearance: boolean;
  duplicateCheckResult: "CLEAN" | "DUPLICATES_FOUND";
  feasibilityCheckResult: "PASS" | "BLOCKED";
  contingencyPlan?: string;
  missingData: string[];
  approvalConfidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface DistributionPlan {
  distributionPlanId: string;
  workspaceId: string;
  businessId: string;
  locationId: string;
  unitScope?: string;
  version: number;
  createdAtMs: number;
  createdBy: string;
  sourceType: PlanSourceType;
  status: PlanStatus;
  items: PlanItem[];
  idempotencyKey: string;
  approval?: ApprovalRecord;
  /** Set true once dispatched — approval becomes immutable. */
  dispatched: boolean;
  changeLog: { atMs: number; by: string; reason: string; fromVersion: number }[];
}

function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/** Validate the §3.7 approval record completeness; returns missing fields (empty = complete). */
export function validateApprovalRecord(r: ApprovalRecord): string[] {
  const v: string[] = [];
  if (blank(r.approver)) v.push("missing_approver");
  if (blank(r.approverRole)) v.push("missing_approver_role");
  if (blank(r.authorityLevel)) v.push("missing_authority_level");
  if (!(r.timestampMs > 0)) v.push("missing_timestamp");
  if (blank(r.workspaceId)) v.push("missing_workspace_id");
  if (blank(r.businessId)) v.push("missing_business_id");
  if (blank(r.locationId)) v.push("missing_location_id");
  if (blank(r.distributionPlanId)) v.push("missing_distribution_plan_id");
  if (!(r.distributionPlanVersion >= 1)) v.push("missing_distribution_plan_version");
  if (!Array.isArray(r.taskList) || r.taskList.length === 0) v.push("missing_task_list");
  if (blank(r.proofRequirements)) v.push("missing_proof_requirements");
  if (blank(r.escalationRules)) v.push("missing_escalation_rules");
  if (!r.ownerModeVetoClearance) v.push("missing_owner_mode_veto_clearance");
  if (!r.complianceSafetyClearance) v.push("missing_compliance_safety_clearance");
  if (r.duplicateCheckResult !== "CLEAN") v.push("duplicate_check_not_clean");
  if (r.feasibilityCheckResult !== "PASS") v.push("feasibility_not_passed");
  // Contingency plan required when any CRITICAL task is in the plan.
  if (r.taskList.some((t) => t.riskLevel === "CRITICAL") && blank(r.contingencyPlan)) v.push("missing_contingency_for_critical");
  return v;
}

/** §53 duplicate-task detection. Returns the duplicate group keys (empty = clean). */
export function detectDuplicateTasks(items: readonly PlanItem[]): string[] {
  const seen = new Map<string, number>();
  for (const it of items) {
    const key = `${it.locationId}|${it.unitId ?? "-"}|${it.taskTemplateType}|${it.scheduledAtMs}|${it.assignee}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

export class PlanApprovalError extends Error {
  readonly code = "PLAN_APPROVAL_BLOCKED";
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(`Distribution plan approval blocked: ${reasons.join(", ")}.`);
    this.name = "PlanApprovalError";
    this.reasons = reasons;
  }
}

/** Approve a plan: blocks on duplicates or an incomplete/invalid approval record. */
export function approvePlan(plan: DistributionPlan, approval: ApprovalRecord): DistributionPlan {
  if (plan.dispatched) throw new PlanApprovalError(["plan_already_dispatched_immutable"]);
  const dupes = detectDuplicateTasks(plan.items);
  const reasons: string[] = [];
  if (dupes.length > 0) reasons.push("duplicate_tasks_present");
  reasons.push(...validateApprovalRecord(approval));
  if (reasons.length > 0) throw new PlanApprovalError(reasons);
  return { ...plan, status: "APPROVED", approval: { ...approval } };
}

/** Mark a plan dispatched — its approval record becomes immutable. */
export function markDispatched(plan: DistributionPlan): DistributionPlan {
  if (plan.status !== "APPROVED" || !plan.approval) throw new PlanApprovalError(["cannot_dispatch_unapproved_plan"]);
  return { ...plan, status: "DISPATCHED", dispatched: true };
}

/** Any change after approval/dispatch creates a NEW version; the old version is immutable. */
export function amendPlan(plan: DistributionPlan, changes: Partial<Pick<DistributionPlan, "items" | "unitScope">>, by: string, reason: string, atMs: number): DistributionPlan {
  return {
    ...plan,
    ...changes,
    version: plan.version + 1,
    status: "APPROVAL_REQUIRED",
    approval: undefined,
    dispatched: false,
    changeLog: [...plan.changeLog, { atMs, by, reason, fromVersion: plan.version }],
  };
}
