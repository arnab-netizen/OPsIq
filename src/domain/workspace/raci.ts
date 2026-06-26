/**
 * Module 13 — Role Accountability / RACI (pure domain core).
 *
 * Guided execution already scopes tasks/permissions by role, but there is no
 * explicit accountability matrix per governed action. This adds RACI:
 * Responsible / Accountable / Consulted / Informed, with canonical validation —
 * every action needs exactly one Accountable and at least one Responsible — so an
 * action can never be promoted without clear ownership. Pure + deterministic.
 */

export enum RaciRole {
  RESPONSIBLE = "RESPONSIBLE",
  ACCOUNTABLE = "ACCOUNTABLE",
  CONSULTED = "CONSULTED",
  INFORMED = "INFORMED",
}

export interface RaciAssignment {
  userId: string;
  role: RaciRole;
}

export interface RaciValidationResult {
  ok: boolean;
  violations: string[];
  accountableUserId: string | null;
  responsibleUserIds: string[];
}

/**
 * Validate a set of RACI assignments for one action. Canonical rules:
 *  - exactly one ACCOUNTABLE (single point of ownership),
 *  - at least one RESPONSIBLE (someone does the work),
 *  - no duplicate (user, role) pairs,
 *  - every assignment has a non-empty userId.
 * A single person may hold multiple roles (e.g. both A and R).
 */
export function validateRaci(assignments: RaciAssignment[]): RaciValidationResult {
  const violations: string[] = [];
  const seen = new Set<string>();

  for (const a of assignments) {
    if (!a.userId || a.userId.trim().length === 0) {
      violations.push("An assignment has an empty userId.");
      continue;
    }
    const key = `${a.userId}:${a.role}`;
    if (seen.has(key)) violations.push(`Duplicate assignment: ${a.userId} as ${a.role}.`);
    seen.add(key);
  }

  const accountable = assignments.filter((a) => a.role === RaciRole.ACCOUNTABLE && a.userId);
  const responsible = assignments.filter((a) => a.role === RaciRole.RESPONSIBLE && a.userId);

  if (accountable.length === 0) violations.push("No ACCOUNTABLE assigned (exactly one required).");
  if (accountable.length > 1) violations.push(`Multiple ACCOUNTABLE assigned (${accountable.length}); exactly one required.`);
  if (responsible.length === 0) violations.push("No RESPONSIBLE assigned (at least one required).");

  return {
    ok: violations.length === 0,
    violations,
    accountableUserId: accountable.length === 1 ? accountable[0].userId : null,
    responsibleUserIds: [...new Set(responsible.map((r) => r.userId))],
  };
}

/** The single accountable user, or null if the matrix is invalid. */
export function accountableUser(assignments: RaciAssignment[]): string | null {
  return validateRaci(assignments).accountableUserId;
}

/** Thrown when a governed action lacks a valid RACI matrix. */
export class RaciValidationError extends Error {
  readonly code = "RACI_INVALID";
  readonly violations: string[];
  constructor(actionRef: string, violations: string[]) {
    super(`Action ${actionRef} has an invalid RACI matrix: ${violations.join(" ")}`);
    this.name = "RaciValidationError";
    this.violations = violations;
  }
}

/** Guard: throws RaciValidationError unless the action has a valid RACI matrix. */
export function assertValidRaci(assignments: RaciAssignment[], actionRef: string): void {
  const result = validateRaci(assignments);
  if (!result.ok) throw new RaciValidationError(actionRef, result.violations);
}
