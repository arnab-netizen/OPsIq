import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  OptimisticLockError,
} from "@/infra/errors";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { requireServiceContext } from "@/lib/service-auth";

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

// `User` has NO `workspaceId` column (and no `email_workspaceId` compound unique — `email` is globally unique).
// A user belongs to a workspace via `WorkspaceMembership`, so every workspace-bound query is scoped through that
// relation (matching the working precedent in engagement-membership.ts). Prisma `update`/`findUnique` cannot take a
// relation filter, so reads use `findFirst` and version-checked writes use `updateMany` + a count assert (the
// Wave-1 `action.ts` pattern) instead of the previous — invalid — `{ id, workspaceId }` unique lookups.
const inWorkspace = (workspaceId: string) => ({
  workspaceMemberships: { some: { workspaceId, isActive: true } },
});

export async function createUser(
  input: CreateUserInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ id: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const idempotencyKey = `user-create:${input.email}:${validatedWorkspaceId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "user.create",
    async () => {
      // `email` is globally unique (no per-workspace compound). A created user is a global identity; associating
      // them with a workspace is a separate governed WorkspaceMembership grant (role-assignment decision — see the
      // Wave 8 decision memo), not a column on User.
      const existing = await db.user.findUnique({
        where: { email: input.email },
      });

      if (existing) {
        throw new ConflictError(`User with email ${input.email} already exists`);
      }

      const user = await db.user.create({
        data: {
          id: randomUUID(),
          email: input.email,
          name: input.name ?? null,
          hashedPassword: input.hashedPassword ?? null,
          updatedAt: new Date(),
        },
      });

      return { id: user.id, email: user.email, name: user.name };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.USER_CREATED,
    actorId: userId,
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
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const user = await db.user.findFirst({ where: { id: userId, ...inWorkspace(validatedWorkspaceId) } });

  if (!user) {
    throw new NotFoundError("User", userId);
  }

  if (!user.isActive) {
    throw new ValidationError("Cannot update a deactivated user");
  }

  if (input.email && input.email !== user.email) {
    const emailTaken = await db.user.findUnique({
      where: { email: input.email },
    });
    if (emailTaken) {
      throw new ConflictError(`Email ${input.email} is already in use`);
    }
  }

  // Relation-scoped optimistic update: workspace membership + version in the same guarded write. count===0 after
  // the membership+active pre-check means the version moved under us.
  const updateResult = await db.user.updateMany({
    where: { id: userId, ...inWorkspace(validatedWorkspaceId), version: input.version },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.email !== undefined && { email: input.email }),
      version: { increment: 1 },
    },
  });
  if (updateResult.count === 0) {
    throw new OptimisticLockError("user", userId);
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.USER_UPDATED,
    actorId,
    entityType: "user",
    entityId: userId,
    workspaceId: validatedWorkspaceId,
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
  version: number,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const user = await db.user.findFirst({ where: { id: userId, ...inWorkspace(validatedWorkspaceId) } });

  if (!user) {
    throw new NotFoundError("User", userId);
  }

  if (!user.isActive) {
    throw new ValidationError("User is already deactivated");
  }

  if (userId === authContext.session?.user.id) {
    throw new ValidationError("Cannot deactivate your own account");
  }

  const deactivateResult = await db.user.updateMany({
    where: { id: userId, ...inWorkspace(validatedWorkspaceId), version },
    data: { isActive: false, deactivatedAt: new Date(), version: { increment: 1 } },
  });
  if (deactivateResult.count === 0) {
    throw new OptimisticLockError("user", userId);
  }

  // Revoke all active sessions. Session has NO workspaceId column and is keyed by userId — a session is global to
  // the user, so revoking by userId (not a phantom workspace filter) is correct.
  const sessionResult = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // Revoke all active role assignments. UserRoleAssignment also has no workspaceId column; it is userId-scoped.
  const roleResult = await db.userRoleAssignment.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false, revokedAt: new Date() },
  });

  // Remove from active engagement memberships. EngagementMembership has no workspaceId column — scope to this
  // workspace via the engagement relation (the Wave-1 pattern) so only this workspace's memberships are removed.
  const membershipResult = await db.engagementMembership.updateMany({
    where: { userId, isActive: true, engagement: { workspaceId: validatedWorkspaceId } },
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
  version: number,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const user = await db.user.findFirst({ where: { id: userId, ...inWorkspace(validatedWorkspaceId) } });

  if (!user) {
    throw new NotFoundError("User", userId);
  }

  if (user.isActive) {
    throw new ValidationError("User is already active");
  }

  const reactivateResult = await db.user.updateMany({
    where: { id: userId, ...inWorkspace(validatedWorkspaceId), version },
    data: { isActive: true, deactivatedAt: null, version: { increment: 1 } },
  });
  if (reactivateResult.count === 0) {
    throw new OptimisticLockError("user", userId);
  }

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

  const user = await db.user.findFirst({
    where: { id: userId, ...inWorkspace(workspaceId) },
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
    ...inWorkspace(workspaceId),
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
