/**
 * Role-scoped dashboard + task access — IO service (Slice 5).
 *
 * Fail-closed, server-side guards that resolve a viewer from the REAL membership
 * (Slice 3) and permission-grant (Slice 4) model and enforce:
 *  - which dashboard scope (OWNER/MANAGER/EMPLOYEE) a viewer may access,
 *  - that response payloads are redacted of owner-only (and manager-only) fields,
 *  - that an employee can only access their own task (minimal Slice 7 pull-forward).
 *
 * Suspended/offboarded members are denied everywhere (non-ACTIVE status). DB/audit
 * deps are injected; real bindings resolve lazily (no generated-client import at load).
 */

import { UnauthorizedError } from "@/infra/errors";
import {
  deriveAccessStatus,
  EmployeeAccessStatus,
} from "@/domain/workspace/employee-lifecycle";
import { GuidedExecutionPermission } from "@/domain/workspace/guided-execution-permissions";
import {
  DashboardScope,
  DashboardViewer,
  canAccessDashboard,
  entitledScope,
  redactForScope,
} from "@/domain/workspace/dashboard-access";
import {
  TaskAccessSubject,
  TaskViewer,
  canViewTask,
} from "@/domain/workspace/task-access";

const OWNER_ROLE = "OWNER";
const WORKSPACE_SCOPE = "workspace";

interface QueryArgs {
  where: Record<string, unknown>;
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
}

export interface DashboardDb {
  workspaceMembership: MembershipDelegate;
  userRoleAssignment: RoleAssignmentDelegate;
}

export interface DashboardDeps {
  db: DashboardDb;
}

async function resolveDefaultDeps(): Promise<DashboardDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as DashboardDb };
}

interface ViewerFacts {
  status: EmployeeAccessStatus;
  isOwner: boolean;
  canViewTeamTasks: boolean;
}

async function loadViewer(
  deps: DashboardDeps,
  workspaceId: string,
  userId: string
): Promise<ViewerFacts> {
  const m = await deps.db.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { isActive: true, removedAt: true, role: true },
  });
  const status = deriveAccessStatus(m);
  const isOwner = m?.role === OWNER_ROLE;

  let canViewTeamTasks = isOwner;
  if (!isOwner && status === EmployeeAccessStatus.ACTIVE) {
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
    canViewTeamTasks = rows.some(
      (r) => r.role === GuidedExecutionPermission.VIEW_TEAM_TASKS
    );
  }
  return { status, isOwner, canViewTeamTasks };
}

function toDashboardViewer(f: ViewerFacts): DashboardViewer {
  return { status: f.status, isOwner: f.isOwner, isManager: f.canViewTeamTasks };
}

/** The highest dashboard scope this viewer may use, or null if denied. */
export async function resolveDashboardScope(
  workspaceId: string,
  userId: string,
  deps?: DashboardDeps
): Promise<DashboardScope | null> {
  const d = deps ?? (await resolveDefaultDeps());
  return entitledScope(toDashboardViewer(await loadViewer(d, workspaceId, userId)));
}

/** Fail-closed guard: throws unless the viewer may access `scope`. */
export async function requireDashboardAccess(
  workspaceId: string,
  userId: string,
  scope: DashboardScope,
  deps?: DashboardDeps
): Promise<void> {
  const d = deps ?? (await resolveDefaultDeps());
  const viewer = toDashboardViewer(await loadViewer(d, workspaceId, userId));
  if (!canAccessDashboard(viewer, scope)) {
    throw new UnauthorizedError(
      `User ${userId} may not access the ${scope} dashboard in workspace ${workspaceId}.`
    );
  }
}

/**
 * Redact a payload to the viewer's ENTITLED scope (not a requested scope), so an
 * employee/manager response can never carry owner-only fields even if the caller
 * forgets. Denies non-ACTIVE members.
 */
export async function scopedResponse<T>(
  workspaceId: string,
  userId: string,
  payload: T,
  deps?: DashboardDeps
): Promise<T> {
  const d = deps ?? (await resolveDefaultDeps());
  const scope = entitledScope(
    toDashboardViewer(await loadViewer(d, workspaceId, userId))
  );
  if (scope === null) {
    throw new UnauthorizedError(
      `User ${userId} has no dashboard access in workspace ${workspaceId}.`
    );
  }
  return redactForScope(payload, scope);
}

/** Fail-closed guard: throws unless the viewer may access the given task. */
export async function requireTaskAccess(
  workspaceId: string,
  userId: string,
  task: TaskAccessSubject,
  deps?: DashboardDeps
): Promise<void> {
  const d = deps ?? (await resolveDefaultDeps());
  const f = await loadViewer(d, workspaceId, userId);
  const viewer: TaskViewer = {
    userId,
    workspaceId,
    status: f.status,
    isOwner: f.isOwner,
    canViewTeamTasks: f.canViewTeamTasks,
  };
  if (!canViewTask(viewer, task)) {
    throw new UnauthorizedError(
      `User ${userId} may not access task assigned to ${task.assignedUserId} in workspace ${workspaceId}.`
    );
  }
}
