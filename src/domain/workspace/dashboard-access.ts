/**
 * Role-scoped dashboard access + owner-only field redaction (Slice 5, pure logic).
 *
 * Three dashboard scopes — OWNER, MANAGER, EMPLOYEE — with fail-closed access and
 * a redaction layer that strips owner-only (and manager-only) fields from payloads
 * before they can reach a lower-privileged client. UI hiding is NOT relied upon:
 * the API payload itself is sanitized here.
 *
 * Access decisions consume the Slice 3 lifecycle (only ACTIVE members have any
 * dashboard access) and the Slice 4 permission grants (manager scope requires an
 * explicit grant; owner scope requires the OWNER workspace role).
 */

import { EmployeeAccessStatus } from "@/domain/workspace/employee-lifecycle";

export enum DashboardScope {
  OWNER = "OWNER",
  MANAGER = "MANAGER",
  EMPLOYEE = "EMPLOYEE",
}

/**
 * Field keys that are owner-only and must NEVER appear in a manager or employee
 * payload (UI, API, export, notification). Matched case-sensitively by key name.
 */
export const OWNER_ONLY_FIELDS: ReadonlySet<string> = new Set([
  "ownerDiagnosis",
  "diagnosis",
  "cashRunway",
  "cashOnHand",
  "profitWeakness",
  "profitSummary",
  "grossMargin",
  "netProfit",
  "marginDetails",
  "pricingStrategy",
  "strategicFinancials",
  "businessStrategy",
  "privateOwnerNotes",
  "ownerNotes",
  "aiLearningInternals",
  "learningCandidates",
  "otherEmployeePerformance",
]);

/**
 * Field keys that only OWNER and MANAGER scopes may see (a plain EMPLOYEE may not).
 */
export const MANAGER_PLUS_FIELDS: ReadonlySet<string> = new Set([
  "teamTasks",
  "employeeBlockers",
  "customerComplaints",
  "proofReviewQueue",
  "reworkQueue",
  "shiftCoverage",
]);

export interface DashboardViewer {
  status: EmployeeAccessStatus;
  /** Workspace role is OWNER. */
  isOwner: boolean;
  /** Has an explicit manager-level grant (e.g. VIEW_TEAM_TASKS). */
  isManager: boolean;
}

/** The highest dashboard scope a viewer is entitled to, or null if no access. */
export function entitledScope(viewer: DashboardViewer): DashboardScope | null {
  if (viewer.status !== EmployeeAccessStatus.ACTIVE) return null;
  if (viewer.isOwner) return DashboardScope.OWNER;
  if (viewer.isManager) return DashboardScope.MANAGER;
  return DashboardScope.EMPLOYEE;
}

const SCOPE_RANK: Record<DashboardScope, number> = {
  [DashboardScope.EMPLOYEE]: 0,
  [DashboardScope.MANAGER]: 1,
  [DashboardScope.OWNER]: 2,
};

/**
 * Fail-closed: a viewer may access a dashboard scope only if their entitled scope
 * is at least that rank. A plain employee can never reach MANAGER/OWNER; a manager
 * can never reach OWNER; suspended/offboarded reach nothing.
 */
export function canAccessDashboard(
  viewer: DashboardViewer,
  scope: DashboardScope
): boolean {
  const entitled = entitledScope(viewer);
  if (entitled === null) return false;
  return SCOPE_RANK[entitled] >= SCOPE_RANK[scope];
}

/** The set of field keys forbidden for a given scope. */
export function forbiddenFieldsForScope(scope: DashboardScope): ReadonlySet<string> {
  if (scope === DashboardScope.OWNER) return new Set();
  if (scope === DashboardScope.MANAGER) return OWNER_ONLY_FIELDS;
  // EMPLOYEE: owner-only + manager-only
  return new Set([...OWNER_ONLY_FIELDS, ...MANAGER_PLUS_FIELDS]);
}

/**
 * Recursively strip every forbidden key from a payload for the target scope.
 * Returns a NEW value; does not mutate the input. Arrays and nested objects are
 * sanitized too, so an owner-only field cannot hide inside a nested structure.
 */
export function redactForScope<T>(payload: T, scope: DashboardScope): T {
  const forbidden = forbiddenFieldsForScope(scope);
  if (forbidden.size === 0) return payload;
  return deepRedact(payload, forbidden) as T;
}

function deepRedact(value: unknown, forbidden: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => deepRedact(v, forbidden));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (forbidden.has(k)) continue; // drop forbidden key entirely
      out[k] = deepRedact(v, forbidden);
    }
    return out;
  }
  return value;
}

/** True if a payload (recursively) still contains any forbidden key for a scope. */
export function payloadLeaksForbiddenField(
  payload: unknown,
  scope: DashboardScope
): boolean {
  const forbidden = forbiddenFieldsForScope(scope);
  if (forbidden.size === 0) return false;
  return scan(payload, forbidden);
}

function scan(value: unknown, forbidden: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.some((v) => scan(v, forbidden));
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (forbidden.has(k)) return true;
      if (scan(v, forbidden)) return true;
    }
  }
  return false;
}
