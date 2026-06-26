/**
 * R5 — Pre-dispatch feasibility gate + dispatch veto matrix + freshness re-check
 * (§49, §50, §3.5). Pure.
 *
 * Feasibility runs at approval time AND again at dispatch time. If any critical condition
 * fails, dispatch is blocked. Owner Mode vetoes (from the collective arbitration packet)
 * are wired in directly — an action blocked by an active veto raises OWNER_MODE_VETO_ACTIVE.
 */

import type { CollectiveDecisionPacket } from "@/domain/collective-training/collective-types";
import { isHighRisk, type RiskLevel } from "@/domain/remote-operations/remote-types";

export type DispatchVeto =
  | "ACCESS_NOT_READY" | "APPROVAL_MISSING" | "STAFF_UNAVAILABLE" | "ROLE_UNAUTHORIZED" | "NO_VERIFIER"
  | "NO_CHECKLIST" | "NO_PROOF_REQUIREMENT" | "LOCATION_PAUSED" | "COMPLIANCE_RISK" | "SAFETY_RISK"
  | "CAPACITY_IMPOSSIBLE" | "SUPPLIES_MISSING" | "CUSTOMER_TIMING_UNKNOWN_FOR_CRITICAL_TASK"
  | "COST_APPROVAL_REQUIRED" | "TASK_OUTSIDE_ROLE_SCOPE" | "LOCATION_READY_BLOCKED"
  | "OWNER_APPROVAL_REQUIRED" | "OWNER_MODE_VETO_ACTIVE" | "PAIR_RISK_BLOCK_ACTIVE"
  | "FALSE_COMPLETION_BLOCK_ACTIVE" | "DISTRIBUTION_APPROVAL_STALE" | "DEPENDENCY_NOT_VERIFIED"
  | "VENDOR_NOT_PREQUALIFIED" | "WORKLOAD_DATA_INCOMPLETE_FOR_HIGH_RISK";

export interface FeasibilityContext {
  staffAvailable: boolean;
  roleSkillMatch: boolean;
  workloadCapacityOk: boolean;
  locationValid: boolean;
  accessReady: boolean;
  suppliesReady: boolean;
  checklistAttached: boolean;
  proofRequirementAttached: boolean;
  verifierAssigned: boolean;
  pairRiskBlockActive: boolean;
  falseCompletionBlockActive: boolean;
  deadlineFeasible: boolean;
  dependencyChainSatisfied: boolean;
  backupForCritical: boolean;
  locationPaused: boolean;
  locationReadyBlocked: boolean;
  approvalThresholdsSatisfied: boolean;
  complianceGatePassed: boolean;
  safetyGatePassed: boolean;
  customerTimingKnown: boolean;
  costApprovalSatisfied: boolean;
  ownerApprovalSatisfied: boolean;
  vendorPrequalified: boolean;
  workloadDataComplete: boolean;
  /** True only if the distribution approval is still within its freshness window. */
  approvalFresh: boolean;
  /** Owner Mode arbitration packet + the actions this task performs (wires R1/F6). */
  arbitration?: CollectiveDecisionPacket;
  performsActions?: string[];
  isVendorTask?: boolean;
}

export interface DispatchDecision {
  canDispatch: boolean;
  blocked: DispatchVeto[];
}

export function evaluateDispatch(ctx: FeasibilityContext, risk: RiskLevel): DispatchDecision {
  const blocked: DispatchVeto[] = [];
  if (!ctx.staffAvailable) blocked.push("STAFF_UNAVAILABLE");
  if (!ctx.roleSkillMatch) blocked.push("TASK_OUTSIDE_ROLE_SCOPE");
  if (!ctx.workloadCapacityOk) blocked.push("CAPACITY_IMPOSSIBLE");
  if (!ctx.locationValid) blocked.push("ROLE_UNAUTHORIZED");
  if (!ctx.accessReady) blocked.push("ACCESS_NOT_READY");
  if (!ctx.suppliesReady) blocked.push("SUPPLIES_MISSING");
  if (!ctx.checklistAttached) blocked.push("NO_CHECKLIST");
  if (!ctx.proofRequirementAttached) blocked.push("NO_PROOF_REQUIREMENT");
  if (!ctx.verifierAssigned) blocked.push("NO_VERIFIER");
  if (ctx.pairRiskBlockActive) blocked.push("PAIR_RISK_BLOCK_ACTIVE");
  if (ctx.falseCompletionBlockActive) blocked.push("FALSE_COMPLETION_BLOCK_ACTIVE");
  if (!ctx.dependencyChainSatisfied) blocked.push("DEPENDENCY_NOT_VERIFIED");
  if (risk === "CRITICAL" && !ctx.backupForCritical) blocked.push("OWNER_APPROVAL_REQUIRED");
  if (ctx.locationPaused) blocked.push("LOCATION_PAUSED");
  if (ctx.locationReadyBlocked) blocked.push("LOCATION_READY_BLOCKED");
  if (!ctx.approvalThresholdsSatisfied) blocked.push("APPROVAL_MISSING");
  if (!ctx.complianceGatePassed) blocked.push("COMPLIANCE_RISK");
  if (!ctx.safetyGatePassed) blocked.push("SAFETY_RISK");
  if (risk === "CRITICAL" && !ctx.customerTimingKnown) blocked.push("CUSTOMER_TIMING_UNKNOWN_FOR_CRITICAL_TASK");
  if (!ctx.costApprovalSatisfied) blocked.push("COST_APPROVAL_REQUIRED");
  if (!ctx.ownerApprovalSatisfied) blocked.push("OWNER_APPROVAL_REQUIRED");
  if (ctx.isVendorTask && !ctx.vendorPrequalified) blocked.push("VENDOR_NOT_PREQUALIFIED");
  if (isHighRisk(risk) && !ctx.workloadDataComplete) blocked.push("WORKLOAD_DATA_INCOMPLETE_FOR_HIGH_RISK");
  if (!ctx.approvalFresh) blocked.push("DISTRIBUTION_APPROVAL_STALE");

  // Owner Mode veto wiring: if this task performs an action blocked by an active veto.
  if (ctx.arbitration && ctx.performsActions) {
    const vetoed = new Set(ctx.arbitration.activeVetoes.flatMap((v) => v.blockedActions));
    if (ctx.performsActions.some((a) => vetoed.has(a as never))) blocked.push("OWNER_MODE_VETO_ACTIVE");
  }

  return { canDispatch: blocked.length === 0, blocked: [...new Set(blocked)] };
}

/** §3.5 freshness windows in ms. Recurring scheduled tasks always re-check at dispatch. */
export const FRESHNESS_WINDOW_MS: Record<RiskLevel, number> = {
  LOW: 4 * 60 * 60 * 1000,
  STANDARD: 4 * 60 * 60 * 1000,
  HIGH: 2 * 60 * 60 * 1000,
  CRITICAL: 30 * 60 * 1000,
};

export function isApprovalFresh(approvedAtMs: number, dispatchAtMs: number, risk: RiskLevel, recurring = false): boolean {
  if (recurring) return false; // recurring scheduled task: must re-check at dispatch time
  return dispatchAtMs - approvedAtMs <= FRESHNESS_WINDOW_MS[risk];
}
