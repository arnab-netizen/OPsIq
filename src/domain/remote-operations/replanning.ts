/**
 * R19 — Dynamic replanning + dispatch rollback (§63). Pure.
 *
 * A critical change after dispatch must not be silently ignored. Triggers map to a
 * deterministic replan/rollback action and the affected roles are notified (audit trail
 * preserved). An Owner Mode veto triggered after dispatch recalls the dispatch.
 */

export type ReplanTrigger =
  | "NO_SHOW" | "ACCESS_FAILURE" | "SAFETY_ISSUE" | "CUSTOMER_DISPUTE" | "MAINTENANCE_BLOCK"
  | "SUPPLIES_MISSING" | "IMPOSSIBLE_DELAY" | "LOCATION_BLOCKED" | "OWNER_OR_MANAGER_CANCEL"
  | "DUPLICATE_DISCOVERED" | "OWNER_MODE_VETO_AFTER_DISPATCH" | "UPSTREAM_DEPENDENCY_FAILED";

export type ReplanAction =
  | "TASK_PLAN_INVALIDATED" | "REPLAN_REQUIRED" | "DISPATCH_SUSPENDED" | "BACKUP_PLAN_ACTIVATED"
  | "DISPATCH_CANCELLED" | "DISPATCH_RECALLED" | "TASK_REASSIGNED" | "TASK_RESCHEDULED"
  | "TASK_INVALIDATED" | "TASK_DUPLICATE_CANCELLED";

const TRIGGER_ACTION: Record<ReplanTrigger, ReplanAction> = {
  NO_SHOW: "BACKUP_PLAN_ACTIVATED",
  ACCESS_FAILURE: "DISPATCH_SUSPENDED",
  SAFETY_ISSUE: "DISPATCH_RECALLED",
  CUSTOMER_DISPUTE: "REPLAN_REQUIRED",
  MAINTENANCE_BLOCK: "DISPATCH_SUSPENDED",
  SUPPLIES_MISSING: "DISPATCH_SUSPENDED",
  IMPOSSIBLE_DELAY: "TASK_RESCHEDULED",
  LOCATION_BLOCKED: "DISPATCH_CANCELLED",
  OWNER_OR_MANAGER_CANCEL: "DISPATCH_CANCELLED",
  DUPLICATE_DISCOVERED: "TASK_DUPLICATE_CANCELLED",
  OWNER_MODE_VETO_AFTER_DISPATCH: "DISPATCH_RECALLED",
  UPSTREAM_DEPENDENCY_FAILED: "TASK_INVALIDATED",
};

export interface ReplanResult {
  action: ReplanAction;
  notifyRoles: string[];
  auditEvent: string;
}

export function evaluateReplan(trigger: ReplanTrigger, affectedRoles: string[]): ReplanResult {
  return {
    action: TRIGGER_ACTION[trigger],
    notifyRoles: [...new Set(["MANAGER", ...affectedRoles])],
    auditEvent: `REPLAN:${trigger}->${TRIGGER_ACTION[trigger]}`,
  };
}

/** §54 dependency chain: a downstream task may not start until its upstream is verified. */
export function dependencyClears(upstreamStatus: string): boolean {
  return upstreamStatus === "COMPLETED_VERIFIED" || upstreamStatus === "COMPLETED_VERIFIED_OUTCOME_CONFIRMED";
}
