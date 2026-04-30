import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "@/infra/errors";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateUserInput {
  email: string;
  name?: string;
  hashedPassword?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  version: number;
}

export interface ListUsersParams {
  limit?: number;
  offset?: number;
  isActive?: boolean;
  search?: string;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createUser(
  input: CreateUserInput,
  actorId: string,
  workspaceId: string
): Promise<{ id: string }> {
  enforceWorkspaceId(workspaceId, "createUser", "user");

  const idempotencyKey = `user-create:${input.email}:${workspaceId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "user.create",
    async () => {
      const existing = await db.user.findUnique({
        where: { email_workspaceId: { email: input.email, workspaceId } },
      });

      if (existing) {
        throw new ConflictError(`User with email ${input.email} already exists`);
      }

      const user = await db.user.create({
        data: {
          email: input.email,
          name: input.name ?? null,
          hashedPassword: input.hashedPassword ?? null,
          workspaceId,
        },
      });

      return { id: user.id, email: user.email, name: user.name };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.USER_CREATED,
    actorId,
    entityType: "user",
    entityId: result.result.id,
    payload: { email: result.result.email, name: result.result.name },
    visibility: "internal",
  });

  logger.info("User created", {
    userId: result.result.id,
    email: result.result.email,
  });

  return { id: result.result.id };
}

export async function updateUser(
  userId: string,
  input: UpdateUserInput,
  actorId: string,
  workspaceId: string
): Promise<void> {
  enforceWorkspaceId(workspaceId, "updateUser", "user");

  const user = await db.user.findUnique({ where: { id: userId, workspaceId } });

  if (!user) {
    throw new NotFoundError("User", userId);
  }

  if (!user.isActive) {
    throw new ValidationError("Cannot update a deactivated user");
  }

  if (input.email && input.email !== user.email) {
    const emailTaken = await db.user.findUnique({
      where: { email_workspaceId: { email: input.email, workspaceId } },
    });
    if (emailTaken) {
      throw new ConflictError(`Email ${input.email} is already in use`);
    }
  }

  await optimisticUpdate("user", userId, input.version, () =>
    db.user.update({
      where: withVersionCheck({ id: userId, workspaceId }, input.version),
      data: withVersionIncrement({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email }),
      }),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.USER_UPDATED,
    actorId,
    entityType: "user",
    entityId: userId,
    payload: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.email !== undefined && { email: input.email }),
    },
    visibility: "internal",
  });

  logger.info("User updated", { userId });
}

export async function deactivateUser(
  userId: string,
  actorId: string,
  version: number,
  workspaceId: string
): Promise<void> {
  enforceWorkspaceId(workspaceId, "deactivateUser", "user");

  const user = await db.user.findUnique({ where: { id: userId, workspaceId } });

  if (!user) {
    throw new NotFoundError("User", userId);
  }

  if (!user.isActive) {
    throw new ValidationError("User is already deactivated");
  }

  if (userId === actorId) {
    throw new ValidationError("Cannot deactivate your own account");
  }

  await optimisticUpdate("user", userId, version, () =>
    db.user.update({
      where: withVersionCheck({ id: userId, workspaceId }, version),
      data: withVersionIncrement({
        isActive: false,
        deactivatedAt: new Date(),
      }),
    })
  );

  // Revoke all active sessions
  const sessionResult = await db.session.updateMany({
    where: { userId, workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // Revoke all active role assignments
  const roleResult = await db.userRoleAssignment.updateMany({
    where: { userId, workspaceId, isActive: true },
    data: { isActive: false, revokedAt: new Date() },
  });

  // Remove from active engagement memberships
  const membershipResult = await db.engagementMembership.updateMany({
    where: { userId, workspaceId, isActive: true },
    data: { isActive: false, removedAt: new Date() },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.USER_DEACTIVATED,
    actorId,
    entityType: "user",
    entityId: userId,
    payload: {
      deactivatedBy: actorId,
      sessionsRevoked: sessionResult.count,
      rolesRevoked: roleResult.count,
      membershipsRemoved: membershipResult.count,
    },
    visibility: "internal",
  });

  logger.info("User deactivated", {
    userId,
    deactivatedBy: actorId,
    sessionsRevoked: sessionResult.count,
    rolesRevoked: roleResult.count,
    membershipsRemoved: membershipResult.count,
  });
}

export async function reactivateUser(
  userId: string,
  actorId: string,
  version: number,
  workspaceId: string
): Promise<void> {
  enforceWorkspaceId(workspaceId, "reactivateUser", "user");

  const user = await db.user.findUnique({ where: { id: userId, workspaceId } });

  if (!user) {
    throw new NotFoundError("User", userId);
  }

  if (user.isActive) {
    throw new ValidationError("User is already active");
  }

  await optimisticUpdate("user", userId, version, () =>
    db.user.update({
      where: withVersionCheck({ id: userId, workspaceId }, version),
      data: withVersionIncrement({
        isActive: true,
        deactivatedAt: null,
      }),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.USER_REACTIVATED,
    actorId,
    entityType: "user",
    entityId: userId,
    payload: { reactivatedBy: actorId },
    visibility: "internal",
  });

  logger.info("User reactivated", { userId, reactivatedBy: actorId });
}

export async function getUserById(userId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getUserById", "user");

  const user = await db.user.findUnique({
    where: { id: userId, workspaceId },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      deactivatedAt: true,
    },
  });

  if (!user) {
    throw new NotFoundError("User", userId);
  }

  return user;
}

export async function listUsers(workspaceId: string, params: ListUsersParams = {}) {
  enforceWorkspaceId(workspaceId, "listUsers", "user");

  const { limit = 25, offset = 0, isActive, search } = params;

  const where = {
    workspaceId,
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { email: { contains: search, mode: "insensitive" as const } },
        { name: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.user.count({ where }),
  ]);

  return { users, total, limit, offset };
}
