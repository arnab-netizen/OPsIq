import { ForbiddenError } from "@/infra/errors";

/**
 * Minimal shape consumed by the invite authorization check. Only the two fields that drive the
 * decision are read, so callers should narrow their membership select to `{ role, isActive }`
 * (drift-safe: a bare/default select can 500 under production schema drift).
 */
export interface WorkspaceMembershipForInvite {
  role: string;
  isActive: boolean;
}

/**
 * Centralized policy: only an ACTIVE workspace `admin` may invite members or assign workspace roles.
 *
 * Fails closed — every one of the following is denied with a governed ForbiddenError (403), never a
 * raw 500 and never a silent allow:
 *   - no membership in the workspace (`null`/`undefined`),
 *   - an inactive membership (deactivated/removed member),
 *   - any non-admin role (approver/submitter/viewer).
 *
 * This replaces the prior inline guard whose boolean
 * `(!userRole || (userRole.role !== "admin" && userRole.isActive === false))` admitted an ACTIVE
 * non-admin member (role !== "admin" true, isActive === false false → not denied) to invite members
 * and assign roles — a privilege escalation on a governed multi-tenant action.
 */
export function assertCanInviteMembers(
  membership: WorkspaceMembershipForInvite | null | undefined
): void {
  if (!membership || membership.isActive !== true || membership.role !== "admin") {
    throw new ForbiddenError("Not authorized to invite members");
  }
}
