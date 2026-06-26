/**
 * R6 — AI-generated plan approval control (§3.6). Pure.
 *
 * AI plans must be human-reviewed before approval. Bulk approval is allowed only for
 * LOW/STANDARD tasks; every HIGH/CRITICAL task inside a plan needs individual owner/
 * authorised-manager acknowledgement. Duplicate detection runs before approval.
 */

import { isHighRisk } from "@/domain/remote-operations/remote-types";
import { detectDuplicateTasks, type DistributionPlan, type PlanItem } from "@/domain/remote-operations/distribution-plan";

export interface BulkApprovalCheck {
  allowed: boolean;
  reason?: string;
}

/** Bulk approval is allowed only when every item is LOW/STANDARD risk. */
export function canBulkApprove(items: readonly PlanItem[]): BulkApprovalCheck {
  const highRisk = items.filter((i) => isHighRisk(i.riskLevel));
  if (highRisk.length > 0) return { allowed: false, reason: `bulk_approval_blocked_high_risk_count:${highRisk.length}` };
  return { allowed: true };
}

/** The HIGH/CRITICAL items that each need individual acknowledgement. */
export function itemsRequiringIndividualAck(items: readonly PlanItem[]): PlanItem[] {
  return items.filter((i) => isHighRisk(i.riskLevel));
}

export class AiPlanApprovalError extends Error {
  readonly code = "AI_PLAN_APPROVAL_BLOCKED";
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(`AI plan approval blocked: ${reasons.join(", ")}.`);
    this.name = "AiPlanApprovalError";
    this.reasons = reasons;
  }
}

export interface AiApprovalRequest {
  /** "bulk" approval, or per-item acknowledgements (item index → acknowledged). */
  mode: "bulk" | "individual";
  /** For individual mode: the set of plan-item indexes that were individually acknowledged. */
  acknowledgedItemIndexes?: number[];
}

/** Returns blocking reasons (empty = the AI plan may be approved). */
export function checkAiPlanApproval(plan: DistributionPlan, req: AiApprovalRequest): string[] {
  const reasons: string[] = [];
  // 1. AI plans must be human-reviewed before approval.
  if (plan.sourceType === "AI_GENERATED_PENDING_REVIEW") reasons.push("ai_plan_not_human_reviewed");
  // 2. Duplicate tasks must be cleared before approval.
  if (detectDuplicateTasks(plan.items).length > 0) reasons.push("duplicate_tasks_present");
  // 3. Bulk approval only for all-LOW/STANDARD plans.
  if (req.mode === "bulk") {
    const bulk = canBulkApprove(plan.items);
    if (!bulk.allowed) reasons.push(bulk.reason!);
  } else {
    // 4. Every HIGH/CRITICAL item must be individually acknowledged.
    const acked = new Set(req.acknowledgedItemIndexes ?? []);
    plan.items.forEach((it, idx) => {
      if (isHighRisk(it.riskLevel) && !acked.has(idx)) reasons.push(`high_risk_item_not_acknowledged:${idx}`);
    });
  }
  return reasons;
}

export function assertAiPlanApprovable(plan: DistributionPlan, req: AiApprovalRequest): void {
  const reasons = checkAiPlanApproval(plan, req);
  if (reasons.length > 0) throw new AiPlanApprovalError(reasons);
}
