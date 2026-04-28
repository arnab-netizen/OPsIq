import { getSession } from "@/services/auth";
import { db } from "@/lib/db";
import { highestRole } from "@/policies/capability-check";
import type { UserRole } from "@/domain/auth/types";
import type { RoleName } from "@/domain/constants/roles";

/**
 * Resolve the authenticated user's highest privilege role from the database.
 *
 * - Returns null if no valid session (fail-closed)
 * - Returns null if user has no role assignments (fail-closed)
 * - Returns highest role from user's active role assignments
 *
 * Never returns a hardcoded or client-provided role.
 */
export async function resolveServerRole(): Promise<UserRole | null> {
  // Get session from cookies — no client input
  const session = await getSession();
  if (!session) {
    return null; // No valid session, fail closed
  }

  // Fetch user's role assignments from database
  const roleAssignments = await db.userRoleAssignment.findMany({
    where: {
      userId: session.user.id,
      isActive: true,
      revokedAt: null,
    },
  });

  if (roleAssignments.length === 0) {
    return null; // No roles assigned, fail closed
  }

  // Get highest privilege role
  const highestRoleName = highestRole({
    userId: session.user.id,
    roles: roleAssignments.map((ra: typeof roleAssignments[number]) => ({
      role: ra.role as RoleName,
      scope: ra.scope,
      scopeId: ra.scopeId,
    })),
    engagementMemberships: [],
  });

  if (!highestRoleName) {
    return null; // No valid role found, fail closed
  }

  // Map RoleName to UserRole (if types differ)
  // For now, assuming they're compatible
  return highestRoleName as unknown as UserRole;
}
