/**
 * Explicit permission-grant policy for Owner Mode guided execution (Slice 4).
 *
 * Sensitive actions require an EXPLICIT, workspace-scoped permission grant — never
 * designation or workspace role alone. Pure decision logic (no IO): the service
 * layer reads grants from the existing `UserRoleAssignment` store and calls these
 * functions. Fail-closed by construction.
 *
 * Authority model (strict):
 *  - Workspace OWNER implicitly holds every GRANTABLE permission AND every
 *    OWNER_ONLY permission. Owner authority is final.
 *  - Every non-owner (ADMIN / OPERATOR / VIEWER / employee) holds ONLY the
 *    grantable permissions explicitly granted to them; they can NEVER hold an
 *    OWNER_ONLY permission, and it can never be delegated to them.
 */

/** Permission values are namespaced (`gep:`) so they never collide with the
 *  role strings stored in the same `user_role_assignments.role` column. */
export enum GuidedExecutionPermission {
  // ── Grantable (owner may delegate to a manager/employee) ──
  TASK_ASSIGN_LOW_RISK = "gep:task_assign_low_risk",
  TASK_ASSIGN_HIGH_RISK = "gep:task_assign_high_risk",
  PROOF_REVIEW_LOW_RISK = "gep:proof_review_low_risk",
  PROOF_REVIEW_PAYMENT = "gep:proof_review_payment",
  PROOF_REVIEW_COMPLAINT = "gep:proof_review_complaint",
  VIEW_TEAM_TASKS = "gep:view_team_tasks",
  VIEW_EMPLOYEE_BLOCKERS = "gep:view_employee_blockers",
  VIEW_CUSTOMER_COMPLAINTS = "gep:view_customer_complaints",
  VIEW_PROFIT_SUMMARY = "gep:view_profit_summary",
  APPROVE_ROUTINE_COMPLETION = "gep:approve_routine_completion",
  ESCALATE_TO_OWNER = "gep:escalate_to_owner",

  // ── Owner-only (never delegable) ──
  APPROVE_RECOMMENDATION = "gep:approve_recommendation",
  CHANGE_EXECUTION_BOUNDARY = "gep:change_execution_boundary",
  APPROVE_HIGH_RISK_DISCOUNT = "gep:approve_high_risk_discount",
  APPROVE_REFUND = "gep:approve_refund",
  VERIFY_FINAL_OUTCOME = "gep:verify_final_outcome",
  APPROVE_LEARNING = "gep:approve_learning",
  VIEW_OWNER_DIAGNOSIS = "gep:view_owner_diagnosis",
  VIEW_CASH_RUNWAY = "gep:view_cash_runway",
  VIEW_STRATEGIC_FINANCIALS = "gep:view_strategic_financials",
}

export const OWNER_ONLY_PERMISSIONS: ReadonlySet<GuidedExecutionPermission> =
  new Set([
    GuidedExecutionPermission.APPROVE_RECOMMENDATION,
    GuidedExecutionPermission.CHANGE_EXECUTION_BOUNDARY,
    GuidedExecutionPermission.APPROVE_HIGH_RISK_DISCOUNT,
    GuidedExecutionPermission.APPROVE_REFUND,
    GuidedExecutionPermission.VERIFY_FINAL_OUTCOME,
    GuidedExecutionPermission.APPROVE_LEARNING,
    GuidedExecutionPermission.VIEW_OWNER_DIAGNOSIS,
    GuidedExecutionPermission.VIEW_CASH_RUNWAY,
    GuidedExecutionPermission.VIEW_STRATEGIC_FINANCIALS,
  ]);

export const GRANTABLE_PERMISSIONS: ReadonlySet<GuidedExecutionPermission> =
  new Set(
    Object.values(GuidedExecutionPermission).filter(
      (p) => !OWNER_ONLY_PERMISSIONS.has(p)
    )
  );

/** Set of all valid permission string values (for fail-closed input validation). */
export const ALL_PERMISSION_VALUES: ReadonlySet<string> = new Set(
  Object.values(GuidedExecutionPermission)
);

export function isOwnerOnly(p: GuidedExecutionPermission): boolean {
  return OWNER_ONLY_PERMISSIONS.has(p);
}

export function isGrantable(p: GuidedExecutionPermission): boolean {
  return !OWNER_ONLY_PERMISSIONS.has(p);
}

/** Parse a raw string into a known permission, fail-closed (null if unknown). */
export function parsePermission(
  raw: string
): GuidedExecutionPermission | null {
  return ALL_PERMISSION_VALUES.has(raw)
    ? (raw as GuidedExecutionPermission)
    : null;
}

export interface PermissionContext {
  /** True only for workspace role OWNER. */
  isOwner: boolean;
  /** Explicitly-granted, currently-active grantable permission values. */
  grants: ReadonlySet<string>;
}

/**
 * Fail-closed permission check.
 *  - OWNER_ONLY permissions: only the owner. A grant row can never confer them.
 *  - Grantable permissions: the owner implicitly has them, otherwise an explicit
 *    active grant is required. Role/designation alone never suffices.
 */
export function hasPermission(
  ctx: PermissionContext,
  permission: GuidedExecutionPermission
): boolean {
  if (OWNER_ONLY_PERMISSIONS.has(permission)) {
    return ctx.isOwner === true;
  }
  if (ctx.isOwner === true) return true;
  return ctx.grants.has(permission);
}

export interface GrantDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Whether `actor` may grant `permission` to someone else. Only the owner may
 * grant, and OWNER_ONLY permissions can never be delegated.
 */
export function canGrantPermission(
  actorIsOwner: boolean,
  permission: GuidedExecutionPermission
): GrantDecision {
  if (!actorIsOwner) {
    return {
      allowed: false,
      reason: "Only the workspace owner may grant guided-execution permissions.",
    };
  }
  if (OWNER_ONLY_PERMISSIONS.has(permission)) {
    return {
      allowed: false,
      reason: `${permission} is owner-only and cannot be delegated.`,
    };
  }
  return { allowed: true, reason: "Owner may grant this grantable permission." };
}
