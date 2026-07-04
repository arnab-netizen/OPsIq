import type { UserRole } from "@/domain/auth/types";

export function canEdit(role: UserRole): boolean {
  return role === "admin" || role === "operator";
}

export function canView(role: UserRole): boolean {
  return true;
}

export function canApprove(role: UserRole): boolean {
  return role === "admin";
}

/**
 * Resolve whether a client-supplied high-impact approval flag may actually be
 * honored. A high-impact financial guardrail block must never be self-granted by
 * an unauthorized caller: the flag is honored ONLY when it is explicitly `true`
 * AND the server-verified role is authorized to approve. Any non-`true` value or
 * an unauthorized role yields `false` (fail-closed).
 */
export function resolveApprovalGrant(role: UserRole, requestedFlag: unknown): boolean {
  return requestedFlag === true && canApprove(role);
}
