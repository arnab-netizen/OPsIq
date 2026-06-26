/**
 * Employee/manager account lifecycle — pure decision logic (no IO).
 *
 * Slice 3 of the Owner Mode guided-execution build. This module derives an
 * employee's access status and plans lifecycle transitions WITHOUT touching the
 * database, so the security-critical rules (who may be reactivated, when an
 * existing session must be revoked, who may be assigned work) are fully
 * unit-testable and fail-closed by construction.
 *
 * It is implemented on the EXISTING real membership columns
 * (`WorkspaceMembership.isActive`, `WorkspaceMembership.removedAt`) so no schema
 * migration is required:
 *   - ACTIVE     = isActive === true  && removedAt == null
 *   - SUSPENDED  = isActive === false && removedAt == null   (reversible)
 *   - OFFBOARDED = removedAt != null                          (terminal)
 *   - NONE       = no membership row (fail-closed default)
 *
 * Existing-session denial is enforced by REVOKING the user's sessions on suspend
 * and offboard (see the service layer), combined with the runtime auth path that
 * re-reads `session.revokedAt` and `membership.isActive` on every request.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export enum EmployeeAccessStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  OFFBOARDED = "OFFBOARDED",
  /** No membership row exists in this workspace. */
  NONE = "NONE",
}

export enum EmployeeLifecycleAction {
  SUSPEND = "SUSPEND",
  REACTIVATE = "REACTIVATE",
  OFFBOARD = "OFFBOARD",
}

/** The minimal membership shape the pure logic needs. */
export interface MembershipState {
  isActive: boolean;
  removedAt: Date | null;
}

/** Instruction for the IO layer describing exactly how to apply a transition. */
export interface LifecycleTransitionPlan {
  allowed: boolean;
  reason: string;
  /** Resulting status if applied (equal to `from` when not allowed). */
  to: EmployeeAccessStatus;
  /** Column targets for the membership update (only meaningful when allowed). */
  nextIsActive: boolean;
  /** "set" → stamp removedAt now; "clear" → null it; "keep" → leave as-is. */
  removedAt: "set" | "clear" | "keep";
  /** Whether the user's active sessions MUST be revoked (existing-session denial). */
  revokeSessions: boolean;
  /** Audit event to emit, or null when not allowed. */
  auditEvent: string | null;
}

/** Derive access status fail-closed: an absent membership is NONE (no access). */
export function deriveAccessStatus(
  membership: MembershipState | null | undefined
): EmployeeAccessStatus {
  if (!membership) return EmployeeAccessStatus.NONE;
  if (membership.removedAt != null) return EmployeeAccessStatus.OFFBOARDED;
  if (!membership.isActive) return EmployeeAccessStatus.SUSPENDED;
  return EmployeeAccessStatus.ACTIVE;
}

/** Only ACTIVE members may be assigned new work (offboarded/suspended cannot). */
export function isAssignable(status: EmployeeAccessStatus): boolean {
  return status === EmployeeAccessStatus.ACTIVE;
}

/** Only ACTIVE members have live dashboard/API access. */
export function hasLiveAccess(status: EmployeeAccessStatus): boolean {
  return status === EmployeeAccessStatus.ACTIVE;
}

function blocked(
  from: EmployeeAccessStatus,
  reason: string
): LifecycleTransitionPlan {
  return {
    allowed: false,
    reason,
    to: from,
    nextIsActive: from === EmployeeAccessStatus.ACTIVE,
    removedAt: "keep",
    revokeSessions: false,
    auditEvent: null,
  };
}

/**
 * Plan a lifecycle transition fail-closed. Rejects every transition that is not
 * explicitly permitted (terminal OFFBOARDED can never be reactivated; only
 * ACTIVE members can be suspended; etc.).
 */
export function planLifecycleTransition(
  from: EmployeeAccessStatus,
  action: EmployeeLifecycleAction
): LifecycleTransitionPlan {
  switch (action) {
    case EmployeeLifecycleAction.SUSPEND:
      if (from !== EmployeeAccessStatus.ACTIVE) {
        return blocked(
          from,
          `Cannot suspend a member that is ${from}; only ACTIVE members can be suspended.`
        );
      }
      return {
        allowed: true,
        reason: "Suspend active member and revoke existing sessions.",
        to: EmployeeAccessStatus.SUSPENDED,
        nextIsActive: false,
        removedAt: "keep",
        revokeSessions: true,
        auditEvent: AUDIT_EVENTS.EMPLOYEE_SUSPENDED,
      };

    case EmployeeLifecycleAction.REACTIVATE:
      if (from === EmployeeAccessStatus.OFFBOARDED) {
        return blocked(
          from,
          "Cannot reactivate an OFFBOARDED member; offboarding is terminal — re-invite instead."
        );
      }
      if (from !== EmployeeAccessStatus.SUSPENDED) {
        return blocked(
          from,
          `Cannot reactivate a member that is ${from}; only SUSPENDED members can be reactivated.`
        );
      }
      return {
        allowed: true,
        reason: "Reactivate suspended member.",
        to: EmployeeAccessStatus.ACTIVE,
        nextIsActive: true,
        removedAt: "keep",
        revokeSessions: false,
        auditEvent: AUDIT_EVENTS.EMPLOYEE_REACTIVATED,
      };

    case EmployeeLifecycleAction.OFFBOARD:
      if (
        from !== EmployeeAccessStatus.ACTIVE &&
        from !== EmployeeAccessStatus.SUSPENDED
      ) {
        return blocked(
          from,
          `Cannot offboard a member that is ${from}.`
        );
      }
      return {
        allowed: true,
        reason: "Offboard member (terminal) and revoke existing sessions.",
        to: EmployeeAccessStatus.OFFBOARDED,
        nextIsActive: false,
        removedAt: "set",
        revokeSessions: true,
        auditEvent: AUDIT_EVENTS.EMPLOYEE_OFFBOARDED,
      };

    default:
      return blocked(from, "Unknown lifecycle action.");
  }
}
