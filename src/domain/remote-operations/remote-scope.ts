/**
 * R2 — Location + role + terminal scoping (pure).
 *
 * Extends Owner Mode workspace isolation with location scope and terminal scope. Reuses
 * the existing infra auth errors (UnauthorizedError / ForbiddenError). Cross-workspace
 * and cross-location leakage are blocked; aggregated multi-location view is allowed only
 * for OWNER / OPERATIONS_MANAGER. Terminals are role-scoped Owner Mode surfaces, not
 * separate products.
 */

import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import type { LocationScope, RemoteRole, TerminalType } from "@/domain/remote-operations/remote-types";

export interface RemoteSession {
  userId: string;
  workspaceId: string;
  role: RemoteRole;
  /** Owner Mode must be the active surface. */
  ownerMode: boolean;
  /** Locations this session may access (ignored for aggregated-view roles). */
  authorizedLocationIds: string[];
}

/** Roles that may see an aggregated multi-location view. */
const AGGREGATED_VIEW_ROLES: ReadonlySet<RemoteRole> = new Set(["OWNER", "OPERATIONS_MANAGER", "ADMIN"]);

/** The single terminal each role lands on (§11). */
export const ROLE_TERMINAL: Record<RemoteRole, TerminalType | "VENDOR_PROJECTION" | "EXTERNAL_TOKEN" | "NONE"> = {
  OWNER: "OWNER",
  OPERATIONS_MANAGER: "MANAGER",
  ADMIN: "MANAGER",
  SITE_SUPERVISOR: "SUPERVISOR",
  STAFF_MEMBER: "EMPLOYEE",
  CLEANER: "EMPLOYEE",
  RUNNER: "EMPLOYEE",
  ACCOUNTANT: "MANAGER",
  MAINTENANCE_VENDOR: "VENDOR_PROJECTION",
  CUSTOMER_CONTACT: "EXTERNAL_TOKEN",
  TENANT_CONTACT: "EXTERNAL_TOKEN",
  GUEST_CONTACT: "EXTERNAL_TOKEN",
};

/** Terminal access ladder — a role may use its own terminal only (no upward access). */
const TERMINAL_RANK: Record<TerminalType, number> = { EMPLOYEE: 1, SUPERVISOR: 2, MANAGER: 3, OWNER: 4 };

/** Throws if the session is unauthenticated, not Owner Mode, or scope leaks workspace/location. */
export function assertLocationScope(session: RemoteSession | null | undefined, scope: LocationScope): void {
  if (!session || typeof session.userId !== "string" || session.userId.trim().length === 0) {
    throw new UnauthorizedError("AUTH_INVALID", "Remote operations require an authenticated Owner-Mode session.");
  }
  if (session.ownerMode !== true) {
    throw new ForbiddenError("WORKSPACE_DENIED", "Remote operations are an Owner-Mode capability.");
  }
  if (typeof scope.workspaceId !== "string" || scope.workspaceId !== session.workspaceId) {
    throw new ForbiddenError("WORKSPACE_DENIED", "Cross-workspace access is blocked.");
  }
  if (!AGGREGATED_VIEW_ROLES.has(session.role)) {
    if (typeof scope.locationId !== "string" || !session.authorizedLocationIds.includes(scope.locationId)) {
      throw new ForbiddenError("WORKSPACE_DENIED", "Cross-location access is blocked for this role.");
    }
  }
}

export function canAccessTerminal(role: RemoteRole, terminal: TerminalType): boolean {
  const own = ROLE_TERMINAL[role];
  if (own === "VENDOR_PROJECTION" || own === "EXTERNAL_TOKEN" || own === "NONE") return false;
  // A role may use only its own terminal tier (no upward access). OWNER may use any tier ≤ OWNER.
  if (role === "OWNER") return true;
  return TERMINAL_RANK[own] === TERMINAL_RANK[terminal];
}

export function assertTerminalAccess(session: RemoteSession, terminal: TerminalType): void {
  if (!canAccessTerminal(session.role, terminal)) {
    throw new ForbiddenError("WORKSPACE_DENIED", `Role ${session.role} cannot access the ${terminal} terminal.`);
  }
}

/** External customer/tenant/guest contacts must use time-limited tokens, never workspace login. */
export function requiresExternalToken(role: RemoteRole): boolean {
  return ROLE_TERMINAL[role] === "EXTERNAL_TOKEN";
}
