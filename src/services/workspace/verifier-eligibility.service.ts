/**
 * Independent-verifier eligibility — read-only helper (PR G).
 *
 * Answers exactly one question, honestly: "does another ACTIVE workspace member
 * exist who could actually invoke VERIFY_OUTCOME independently of this actor?"
 *
 * Zero schema changes. Derived entirely from tables and logic that already govern
 * production authorization:
 *   - WorkspaceMembership (isActive) — the same table/column employee-lifecycle
 *     .service.ts already queries for its "sole active owner" guard.
 *   - UserRoleAssignment (workspace-scoped, isActive, revokedAt) — the same table
 *     getPolicyContext() (services/auth.ts) reads to build a caller's PolicyContext.
 *   - getCapabilitiesForRole / hasCapability (policies/capability-check.ts) — the
 *     SAME capability-resolution logic the canonical route wrapper uses to decide
 *     who may call POST /api/owner/process-execution at all.
 *
 * A workspace member who is active but holds no capability that would let them
 * reach the VERIFY_OUTCOME endpoint (CAPABILITIES.OWNER_MANAGE — the capability
 * that route requires) is NOT an eligible independent verifier: counting them
 * as one would wrongly keep a genuine solo operator deadlocked. This module is
 * the single place that answers the question, so no other caller re-derives it
 * with different (and possibly looser or stricter) criteria.
 */
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { hasCapability, type PolicyContext } from "@/policies/capability-check";
import type { RoleName } from "@/domain/constants/roles";

export interface VerifierEligibilityMembershipRow {
  userId: string;
  role: string;
}

export interface VerifierEligibilityRoleAssignmentRow {
  userId: string;
  role: string;
  scope: string | null;
  scopeId: string | null;
}

/** Minimal delegate surface — satisfied by `db` and by any Prisma `$transaction` tx client. */
export interface VerifierEligibilityDb {
  workspaceMembership: {
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
    }): Promise<VerifierEligibilityMembershipRow[]>;
  };
  userRoleAssignment: {
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
    }): Promise<VerifierEligibilityRoleAssignmentRow[]>;
  };
}

/**
 * True when at least one OTHER active workspace member (excluding `excludeUserId`,
 * normally the actor who recorded/completed the outcome under review) holds a
 * workspace-scoped capability grant that includes CAPABILITIES.OWNER_MANAGE —
 * the capability POST /api/owner/process-execution requires for every action,
 * including VERIFY_OUTCOME.
 *
 * Fails closed toward the STRICT (separation-of-duty-preserving) outcome: any
 * DB error propagates rather than being swallowed into "no eligible verifier",
 * since silently loosening the guard would be the unsafe direction.
 */
export async function hasEligibleIndependentVerifier(
  db: VerifierEligibilityDb,
  workspaceId: string,
  excludeUserId: string
): Promise<boolean> {
  const otherMembers = await db.workspaceMembership.findMany({
    where: { workspaceId, isActive: true, userId: { not: excludeUserId } },
    select: { userId: true, role: true },
  });
  if (otherMembers.length === 0) return false;

  const otherUserIds = otherMembers.map((m) => m.userId);
  const roleAssignments = await db.userRoleAssignment.findMany({
    where: {
      userId: { in: otherUserIds },
      isActive: true,
      revokedAt: null,
      scope: "workspace",
      scopeId: workspaceId,
    },
    select: { userId: true, role: true, scope: true, scopeId: true },
  });

  const assignmentsByUser = new Map<string, VerifierEligibilityRoleAssignmentRow[]>();
  for (const ra of roleAssignments) {
    const list = assignmentsByUser.get(ra.userId) ?? [];
    list.push(ra);
    assignmentsByUser.set(ra.userId, list);
  }

  for (const member of otherMembers) {
    const assignments = assignmentsByUser.get(member.userId);
    if (!assignments || assignments.length === 0) continue;
    const ctx: PolicyContext = {
      userId: member.userId,
      roles: assignments.map((a) => ({
        role: a.role as RoleName,
        scope: a.scope,
        scopeId: a.scopeId,
      })),
      workspaceRole: member.role,
    };
    if (hasCapability(ctx, CAPABILITIES.OWNER_MANAGE, { type: "workspace", id: workspaceId })) {
      return true;
    }
  }
  return false;
}
