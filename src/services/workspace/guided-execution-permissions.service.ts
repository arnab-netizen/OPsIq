/**
 * Explicit guided-execution permission grants — IO service (Slice 4).
 *
 * Stores grants in the EXISTING `UserRoleAssignment` table (workspace-scoped,
 * revocable, already part of the auth model) — no schema change. Each grant is a
 * row: { userId, role = <permission value>, scope = "workspace", scopeId =
 * workspaceId, isActive, revokedAt }.
 *
 * All checks are server-side and fail-closed, and integrate the Slice 3 lifecycle:
 * a SUSPENDED/OFFBOARDED member is denied BEFORE any permission is considered, so
 * a previously-granted permission cannot be used once the member loses access.
 *
 * Decision logic is the pure module `@/domain/workspace/guided-execution-permissions`.
 * DB/audit are injected; real bindings are resolved lazily so importing this
 * module does not pull in the generated Prisma client.
 */

import { v4 as uuid } from "uuid";
import { UnauthorizedError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  deriveAccessStatus,
  EmployeeAccessStatus,
} from "@/domain/workspace/employee-lifecycle";
import {
  GuidedExecutionPermission,
  PermissionContext,
  ALL_PERMISSION_VALUES,
  canGrantPermission,
  hasPermission,
} from "@/domain/workspace/guided-execution-permissions";

const OWNER_ROLE = "OWNER";
const WORKSPACE_SCOPE = "workspace";

// ── Injected structural interfaces (decoupled from generated Prisma types) ──

interface QueryArgs {
  where: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

interface MembershipDelegate {
  findUnique(args: QueryArgs): Promise<{
    isActive: boolean;
    removedAt: Date | null;
    role: string;
  } | null>;
}

interface RoleAssignmentDelegate {
  findMany(args: QueryArgs): Promise<Array<{ role: string }>>;
  findFirst(args: QueryArgs): Promise<{ id: string; isActive: boolean } | null>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: QueryArgs): Promise<{ count: number }>;
}

export interface PermissionsDb {
  workspaceMembership: MembershipDelegate;
  userRoleAssignment: RoleAssignmentDelegate;
}

export type AuditFn = (input: {
  eventName: string;
  workspaceId: string;
  actorId?: string;
  actorType?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
}) => Promise<string>;

export interface PermissionsDeps {
  db: PermissionsDb;
  emit: AuditFn;
  now: () => Date;
}

async function resolveDefaultDeps(): Promise<PermissionsDeps> {
  const [{ db }, { emitAuditEvent }] = await Promise.all([
    import("@/lib/db"),
    import("@/infra/audit"),
  ]);
  return {
    db: db as unknown as PermissionsDb,
    emit: emitAuditEvent as unknown as AuditFn,
    now: () => new Date(),
  };
}

export class PermissionGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionGrantError";
  }
}

interface MembershipFacts {
  status: EmployeeAccessStatus;
  isOwner: boolean;
}

async function loadMembership(
  deps: PermissionsDeps,
  workspaceId: string,
  userId: string
): Promise<MembershipFacts> {
  const m = await deps.db.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { isActive: true, removedAt: true, role: true },
  });
  return {
    status: deriveAccessStatus(m),
    isOwner: m?.role === OWNER_ROLE,
  };
}

async function loadActiveGrants(
  deps: PermissionsDeps,
  workspaceId: string,
  userId: string
): Promise<ReadonlySet<string>> {
  const rows = await deps.db.userRoleAssignment.findMany({
    where: {
      userId,
      scope: WORKSPACE_SCOPE,
      scopeId: workspaceId,
      isActive: true,
      revokedAt: null,
    },
    select: { role: true },
  });
  return new Set(
    rows.map((r) => r.role).filter((r) => ALL_PERMISSION_VALUES.has(r))
  );
}

/** Build a fail-closed permission context (empty/no-owner when not ACTIVE). */
export async function buildPermissionContext(
  workspaceId: string,
  userId: string,
  deps?: PermissionsDeps
): Promise<PermissionContext> {
  const d = deps ?? (await resolveDefaultDeps());
  const facts = await loadMembership(d, workspaceId, userId);
  if (facts.status !== EmployeeAccessStatus.ACTIVE) {
    return { isOwner: false, grants: new Set() };
  }
  const grants = await loadActiveGrants(d, workspaceId, userId);
  return { isOwner: facts.isOwner, grants };
}

/** Non-throwing server-side check. False if the member is not ACTIVE. */
export async function hasPermissionFor(
  workspaceId: string,
  userId: string,
  permission: GuidedExecutionPermission,
  deps?: PermissionsDeps
): Promise<boolean> {
  const ctx = await buildPermissionContext(workspaceId, userId, deps);
  return hasPermission(ctx, permission);
}

/** Throwing server-side guard. Fail-closed; denies non-ACTIVE members first. */
export async function requirePermission(
  workspaceId: string,
  userId: string,
  permission: GuidedExecutionPermission,
  deps?: PermissionsDeps
): Promise<void> {
  const d = deps ?? (await resolveDefaultDeps());
  const facts = await loadMembership(d, workspaceId, userId);
  if (facts.status !== EmployeeAccessStatus.ACTIVE) {
    throw new UnauthorizedError(
      `Member ${userId} is ${facts.status} in workspace ${workspaceId} — permission denied.`
    );
  }
  const grants =
    facts.isOwner
      ? new Set<string>()
      : await loadActiveGrants(d, workspaceId, userId);
  if (!hasPermission({ isOwner: facts.isOwner, grants }, permission)) {
    throw new UnauthorizedError(
      `Member ${userId} lacks permission ${permission} in workspace ${workspaceId}.`
    );
  }
}

export interface GrantCommand {
  workspaceId: string;
  /** The member receiving the grant. */
  userId: string;
  permission: GuidedExecutionPermission;
  /** The actor performing the grant (must be the workspace owner). */
  actorId: string;
}

/** Grant a permission. Owner-only action; cannot delegate owner-only permissions. */
export async function grantPermission(
  command: GrantCommand,
  deps?: PermissionsDeps
): Promise<void> {
  const d = deps ?? (await resolveDefaultDeps());
  const { workspaceId, userId, permission, actorId } = command;

  const actor = await loadMembership(d, workspaceId, actorId);
  const actorIsActiveOwner =
    actor.isOwner && actor.status === EmployeeAccessStatus.ACTIVE;

  const decision = canGrantPermission(actorIsActiveOwner, permission);
  if (!decision.allowed) {
    throw new PermissionGrantError(decision.reason);
  }

  const target = await loadMembership(d, workspaceId, userId);
  if (target.status !== EmployeeAccessStatus.ACTIVE) {
    throw new PermissionGrantError(
      `Cannot grant to ${userId}: member is ${target.status} (must be ACTIVE).`
    );
  }

  const where = {
    userId,
    role: permission,
    scope: WORKSPACE_SCOPE,
    scopeId: workspaceId,
  };
  const existing = await d.db.userRoleAssignment.findFirst({ where });
  if (existing && existing.isActive) {
    return; // idempotent: already granted
  }
  if (existing && !existing.isActive) {
    await d.db.userRoleAssignment.updateMany({
      where,
      data: { isActive: true, revokedAt: null, grantedBy: actorId },
    });
  } else {
    await d.db.userRoleAssignment.create({
      data: {
        id: uuid(),
        userId,
        role: permission,
        scope: WORKSPACE_SCOPE,
        scopeId: workspaceId,
        grantedBy: actorId,
        isActive: true,
      },
    });
  }

  await d.emit({
    eventName: AUDIT_EVENTS.PERMISSION_GRANTED,
    workspaceId,
    actorId,
    actorType: "user",
    entityType: "user_role_assignment",
    entityId: userId,
    payload: { permission },
  });
}

/** Revoke a permission. Owner-only action. Idempotent. */
export async function revokePermission(
  command: GrantCommand,
  deps?: PermissionsDeps
): Promise<void> {
  const d = deps ?? (await resolveDefaultDeps());
  const { workspaceId, userId, permission, actorId } = command;

  const actor = await loadMembership(d, workspaceId, actorId);
  if (!(actor.isOwner && actor.status === EmployeeAccessStatus.ACTIVE)) {
    throw new PermissionGrantError(
      "Only the workspace owner may revoke guided-execution permissions."
    );
  }

  const res = await d.db.userRoleAssignment.updateMany({
    where: {
      userId,
      role: permission,
      scope: WORKSPACE_SCOPE,
      scopeId: workspaceId,
      isActive: true,
    },
    data: { isActive: false, revokedAt: d.now() },
  });

  if (res.count > 0) {
    await d.emit({
      eventName: AUDIT_EVENTS.PERMISSION_REVOKED,
      workspaceId,
      actorId,
      actorType: "user",
      entityType: "user_role_assignment",
      entityId: userId,
      payload: { permission, revokedCount: res.count },
    });
  }
}

/** List a member's active grantable permissions in a workspace. */
export async function getActivePermissions(
  workspaceId: string,
  userId: string,
  deps?: PermissionsDeps
): Promise<string[]> {
  const d = deps ?? (await resolveDefaultDeps());
  return Array.from(await loadActiveGrants(d, workspaceId, userId));
}
