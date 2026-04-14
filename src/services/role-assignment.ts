import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
} from "@/infra/errors";
import { ROLES, ROLE_HIERARCHY, type RoleName } from "@/domain/constants/roles";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AssignRoleInput {
  userId: string;
  role: RoleName;
  scope?: string;
  scopeId?: string;
}

export interface RevokeRoleInput {
  userId: string;
  role: RoleName;
  scope?: string;
  scopeId?: string;
}

// ─── Validation ────────────────────────────────────────────────────────────

function validateRoleName(role: string): asserts role is RoleName {
  const validRoles = Object.values(ROLES) as string[];
  if (!validRoles.includes(role)) {
    throw new ValidationError(`Invalid role: ${role}`);
  }
}

/**
 * Ensures the actor has authority to assign/revoke the target role.
 * Rule: you can only manage roles strictly below your own hierarchy level.
 */
function assertHierarchyAuthority(
  actorHighestLevel: number,
  targetRole: RoleName
): void {
  const targetLevel = ROLE_HIERARCHY[targetRole] ?? 0;
  if (targetLevel >= actorHighestLevel) {
    throw new ForbiddenError(
      `Cannot manage role "${targetRole}" — requires higher hierarchy level`
    );
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function assignRole(
  input: AssignRoleInput,
  actorId: string,
  actorHighestLevel: number
): Promise<{ id: string; isNew: boolean }> {
  validateRoleName(input.role);
  assertHierarchyAuthority(actorHighestLevel, input.role);

  // Prevent self-assignment (privilege escalation vector)
  if (input.userId === actorId) {
    throw new ForbiddenError("Cannot assign roles to yourself");
  }

  // Verify target user exists and is active
  const targetUser = await db.user.findUnique({
    where: { id: input.userId },
  });

  if (!targetUser) {
    throw new NotFoundError("User", input.userId);
  }

  if (!targetUser.isActive) {
    throw new ValidationError("Cannot assign roles to a deactivated user");
  }

  const idempotencyKey = `role-assign:${input.userId}:${input.role}:${input.scope ?? "global"}:${input.scopeId ?? "none"}`;

  const result = await withIdempotency(
    idempotencyKey,
    "role.assign",
    async () => {
      // Check if the exact assignment already exists and is active
      const existing = await db.userRoleAssignment.findFirst({
        where: {
          userId: input.userId,
          role: input.role,
          scope: input.scope ?? null,
          scopeId: input.scopeId ?? null,
          isActive: true,
          revokedAt: null,
        },
      });

      if (existing) {
        throw new ConflictError(
          `Role "${input.role}" is already assigned to user ${input.userId}`
        );
      }

      // Check if assignment was previously revoked — reactivate it
      const revoked = await db.userRoleAssignment.findFirst({
        where: {
          userId: input.userId,
          role: input.role,
          scope: input.scope ?? null,
          scopeId: input.scopeId ?? null,
          isActive: false,
        },
      });

      if (revoked) {
        const updated = await db.userRoleAssignment.update({
          where: { id: revoked.id },
          data: {
            isActive: true,
            revokedAt: null,
            grantedBy: actorId,
            grantedAt: new Date(),
          },
        });
        return { id: updated.id };
      }

      const assignment = await db.userRoleAssignment.create({
        data: {
          userId: input.userId,
          role: input.role,
          scope: input.scope ?? null,
          scopeId: input.scopeId ?? null,
          grantedBy: actorId,
        },
      });

      return { id: assignment.id };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ROLE_ASSIGNED,
    actorId,
    entityType: "user_role_assignment",
    entityId: result.result.id,
    payload: {
      userId: input.userId,
      role: input.role,
      scope: input.scope ?? null,
      scopeId: input.scopeId ?? null,
    },
    visibility: "internal",
  });

  // V3 adaptive: engagement-scoped role changes trigger re-evaluation
  if (input.scope === "engagement" && input.scopeId) {
    await triggerReEvaluation({
      changeType: "scope_change",
      entityType: "user_role_assignment",
      entityId: result.result.id,
      engagementId: input.scopeId,
      severity: "medium",
      description: `Role "${input.role}" assigned to user ${input.userId} in engagement`,
      triggeredBy: actorId,
    });
  }

  logger.info("Role assigned", {
    userId: input.userId,
    role: input.role,
    assignedBy: actorId,
  });

  return { id: result.result.id, isNew: result.isNew };
}

export async function revokeRole(
  input: RevokeRoleInput,
  actorId: string,
  actorHighestLevel: number
): Promise<void> {
  validateRoleName(input.role);
  assertHierarchyAuthority(actorHighestLevel, input.role);

  // Prevent self-revocation
  if (input.userId === actorId) {
    throw new ForbiddenError("Cannot revoke your own roles");
  }

  const assignment = await db.userRoleAssignment.findFirst({
    where: {
      userId: input.userId,
      role: input.role,
      scope: input.scope ?? null,
      scopeId: input.scopeId ?? null,
      isActive: true,
      revokedAt: null,
    },
  });

  if (!assignment) {
    throw new NotFoundError(
      "UserRoleAssignment",
      `${input.userId}:${input.role}`
    );
  }

  await db.userRoleAssignment.update({
    where: { id: assignment.id },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ROLE_REVOKED,
    actorId,
    entityType: "user_role_assignment",
    entityId: assignment.id,
    payload: {
      userId: input.userId,
      role: input.role,
      scope: input.scope ?? null,
      scopeId: input.scopeId ?? null,
    },
    visibility: "internal",
  });

  // V3 adaptive: engagement-scoped role changes trigger re-evaluation
  if (input.scope === "engagement" && input.scopeId) {
    await triggerReEvaluation({
      changeType: "scope_change",
      entityType: "user_role_assignment",
      entityId: assignment.id,
      engagementId: input.scopeId,
      severity: "medium",
      description: `Role "${input.role}" revoked from user ${input.userId} in engagement`,
      triggeredBy: actorId,
    });
  }

  logger.info("Role revoked", {
    userId: input.userId,
    role: input.role,
    revokedBy: actorId,
  });
}

export async function getRolesForUser(userId: string) {
  return db.userRoleAssignment.findMany({
    where: { userId, isActive: true, revokedAt: null },
    select: {
      id: true,
      role: true,
      scope: true,
      scopeId: true,
      grantedAt: true,
      grantedBy: true,
    },
    orderBy: { grantedAt: "desc" },
  });
}
