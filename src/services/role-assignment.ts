import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { Prisma } from "@/generated/prisma/client";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
} from "@/infra/errors";
import { ROLES, ROLE_HIERARCHY, type RoleName } from "@/domain/constants/roles";
import { isPlatformRole } from "@/policies/capability-check";
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

/**
 * Tenant isolation for role management: an actor manages assignments only inside its own verified workspace.
 * A workspace-scoped assignment (the default) must target that workspace; an engagement-scoped one must name an
 * engagement of that workspace. Any other scope is refused. Without this, a caller-supplied scopeId let an admin of
 * one workspace grant or revoke roles that authorize access to ANOTHER workspace (auth resolves workspace-scoped
 * assignments by scopeId).
 */
async function assertScopeWithinWorkspace(
  input: { scope?: string; scopeId?: string },
  workspaceId: string
): Promise<void> {
  const scope = input.scope ?? "workspace";
  if (scope === "workspace") {
    if (input.scopeId !== undefined && input.scopeId !== workspaceId) {
      throw new ForbiddenError("Role assignments can only be managed within your own workspace");
    }
    return;
  }
  if (scope === "engagement") {
    if (!input.scopeId) {
      throw new ValidationError("scopeId is required for an engagement-scoped role");
    }
    const engagement = await db.engagement.findFirst({ where: { id: input.scopeId, workspaceId }, select: { id: true } });
    if (!engagement) {
      throw new NotFoundError("Engagement", input.scopeId);
    }
    return;
  }
  throw new ValidationError(`Unsupported role scope: ${scope}`);
}

/**
 * Platform roles (policies/capability-check isPlatformRole: any role carrying a PLATFORM_CAPABILITIES entry —
 * system_admin and the beta-request / administration / acceptance-fixture operators) are provisioned out of band
 * only (scripts/provision-*-operator.ts, docs/opsiq-governance/ACCEPTANCE_FIXTURE_AUTHORITY.md). The workspace
 * role API refuses to grant or revoke them for EVERY actor, system_admin included.
 */
function assertNotPlatformRole(role: RoleName): void {
  if (isPlatformRole(role)) {
    throw new ForbiddenError(
      `Role "${role}" is a platform role: it is provisioned out of band and cannot be granted or revoked here`
    );
  }
}

/**
 * The target must be an ACTIVE member of the caller's verified workspace. "No such user" and "not a member here"
 * answer the same 404, so a caller cannot probe which user ids exist.
 */
async function assertTargetIsMember(userId: string, workspaceId: string): Promise<void> {
  const membership = await db.workspaceMembership.findFirst({
    where: { workspaceId, userId, isActive: true },
    select: { id: true },
  });
  if (!membership) {
    throw new NotFoundError("User", userId);
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function assignRole(
  input: AssignRoleInput,
  actorId: string,
  actorHighestLevel: number,
  workspaceId: string
): Promise<{ id: string; isNew: boolean }> {
  validateRoleName(input.role);
  assertNotPlatformRole(input.role);
  assertHierarchyAuthority(actorHighestLevel, input.role);
  await assertScopeWithinWorkspace(input, workspaceId);

  // Prevent self-assignment (privilege escalation vector)
  if (input.userId === actorId) {
    throw new ForbiddenError("Cannot assign roles to yourself");
  }

  await assertTargetIsMember(input.userId, workspaceId);

  const targetUser = await db.user.findUnique({
    where: { id: input.userId },
    select: { isActive: true },
  });
  if (!targetUser) {
    throw new NotFoundError("User", input.userId);
  }
  if (!targetUser.isActive) {
    throw new ValidationError("Cannot assign roles to a deactivated user");
  }

  const scope = input.scope ?? "workspace";
  const scopeId = input.scopeId ?? workspaceId;

  // Replay of a retried request is handled by the route's caller-bound idempotency-key check; there is no
  // second, global idempotency layer here (it replayed a stale result across revoke/re-assign and across
  // workspaces). Duplicate concurrent grants are stopped by the unique (userId, role, scope, scopeId) index.
  // The grant and its audit event commit together.
  let assignmentId: string;
  try {
    assignmentId = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.userRoleAssignment.findFirst({
        where: { userId: input.userId, role: input.role, scope, scopeId },
      });

      if (current && current.isActive && current.revokedAt === null) {
        throw new ConflictError(`Role "${input.role}" is already assigned to user ${input.userId}`);
      }

      let id: string;
      if (current) {
        // A previously revoked assignment is re-activated (the unique index allows one row per scope).
        const reactivated = await tx.userRoleAssignment.updateMany({
          where: { id: current.id, isActive: false },
          data: { isActive: true, revokedAt: null, grantedBy: actorId, grantedAt: new Date() },
        });
        if (reactivated.count !== 1) {
          throw new ConflictError(`Role "${input.role}" is already assigned to user ${input.userId}`);
        }
        id = current.id;
      } else {
        const created = await tx.userRoleAssignment.create({
          data: { id: randomUUID(), userId: input.userId, role: input.role, scope, scopeId, grantedBy: actorId },
        });
        id = created.id;
      }

      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.ROLE_ASSIGNED,
          actorId,
          workspaceId,
          entityType: "user_role_assignment",
          entityId: id,
          payload: {
            userId: input.userId,
            role: input.role,
            scope: input.scope ?? null,
            scopeId: input.scopeId ?? null,
          },
          visibility: "internal",
        },
        tx
      );
      return id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError(`Role "${input.role}" is already assigned to user ${input.userId}`);
    }
    throw error;
  }

  // V3 adaptive: engagement-scoped role changes trigger re-evaluation
  if (input.scope === "engagement" && input.scopeId) {
    const engagement = await db.engagement.findUnique({
      where: { id: input.scopeId },
      select: { workspaceId: true },
    });
    if (engagement) {
      await triggerReEvaluation({
        changeType: "scope_change",
        entityType: "user_role_assignment",
        entityId: assignmentId,
        engagementId: input.scopeId,
        workspaceId: engagement.workspaceId,
        severity: "medium",
        description: `Role "${input.role}" assigned to user ${input.userId} in engagement`,
        triggeredBy: actorId,
      });
    }
  }

  logger.info("Role assigned", {
    userId: input.userId,
    role: input.role,
    assignedBy: actorId,
  });

  return { id: assignmentId, isNew: true };
}

export async function revokeRole(
  input: RevokeRoleInput,
  actorId: string,
  actorHighestLevel: number,
  workspaceId: string
): Promise<void> {
  validateRoleName(input.role);
  assertNotPlatformRole(input.role);
  assertHierarchyAuthority(actorHighestLevel, input.role);
  await assertScopeWithinWorkspace(input, workspaceId);

  // Prevent self-revocation
  if (input.userId === actorId) {
    throw new ForbiddenError("Cannot revoke your own roles");
  }

  const assignment = await db.userRoleAssignment.findFirst({
    where: {
      userId: input.userId,
      role: input.role,
      scope: input.scope ?? "workspace",
      scopeId: input.scopeId ?? workspaceId,
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

  // The revocation and its audit event commit together; the conditional update refuses a concurrent double revoke.
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const revoked = await tx.userRoleAssignment.updateMany({
      where: { id: assignment.id, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });
    if (revoked.count !== 1) {
      throw new NotFoundError("UserRoleAssignment", `${input.userId}:${input.role}`);
    }
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.ROLE_REVOKED,
        actorId,
        workspaceId,
        entityType: "user_role_assignment",
        entityId: assignment.id,
        payload: {
          userId: input.userId,
          role: input.role,
          scope: input.scope ?? null,
          scopeId: input.scopeId ?? null,
        },
        visibility: "internal",
      },
      tx
    );
  });

  // V3 adaptive: engagement-scoped role changes trigger re-evaluation
  if (input.scope === "engagement" && input.scopeId) {
    const engagement = await db.engagement.findUnique({
      where: { id: input.scopeId },
      select: { workspaceId: true },
    });
    if (engagement) {
      await triggerReEvaluation({
        changeType: "scope_change",
        entityType: "user_role_assignment",
        entityId: assignment.id,
        engagementId: input.scopeId,
        workspaceId: engagement.workspaceId,
        severity: "medium",
        description: `Role "${input.role}" revoked from user ${input.userId} in engagement`,
        triggeredBy: actorId,
      });
    }
  }

  logger.info("Role revoked", {
    userId: input.userId,
    role: input.role,
    revokedBy: actorId,
  });
}

export async function getRolesForUser(userId: string, workspaceId: string) {
  const where = { userId, isActive: true, revokedAt: null, scope: "workspace", scopeId: workspaceId };

  return db.userRoleAssignment.findMany({
    where,
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
