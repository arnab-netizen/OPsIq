/**
 * Employee/manager account lifecycle — IO service (Slice 3).
 *
 * Applies lifecycle transitions against the REAL membership/auth model:
 *   - `WorkspaceMembership.isActive` / `removedAt` carry the status.
 *   - On SUSPEND and OFFBOARD the user's active `Session` rows are REVOKED
 *     (`revokedAt` stamped) so EXISTING sessions/tokens stop working immediately —
 *     true revocation, not a passive flag. The runtime auth path (`getSession`)
 *     re-reads `session.revokedAt` and `membership.isActive` on every request, so
 *     a suspended/offboarded employee is denied server-side on the next call.
 *
 * The membership-status change and the session revocation are performed in a
 * single interactive transaction (atomic security pair). The audit event is
 * emitted after commit via the shared, hash-chained `emitAuditEvent` helper
 * (which is not transaction-aware repo-wide; see closeout).
 *
 * Pure decision rules live in `@/domain/workspace/employee-lifecycle`; this layer
 * is only wiring + concurrency-safe conditional writes. The DB/audit are injected
 * so the security behaviour is unit-testable without a live database.
 */

import { UnauthorizedError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  EmployeeAccessStatus,
  EmployeeLifecycleAction,
  deriveAccessStatus,
  hasLiveAccess,
  isAssignable,
  planLifecycleTransition,
} from "@/domain/workspace/employee-lifecycle";

// ── Injected structural interfaces (decoupled from the generated Prisma types) ──

interface QueryArgs {
  where: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

interface MembershipDelegate {
  findUnique(
    args: QueryArgs
  ): Promise<{ isActive: boolean; removedAt: Date | null } | null>;
  updateMany(args: QueryArgs): Promise<{ count: number }>;
}

interface SessionDelegate {
  updateMany(args: QueryArgs): Promise<{ count: number }>;
}

export interface LifecycleTx {
  workspaceMembership: MembershipDelegate;
  session: SessionDelegate;
}

export interface LifecycleDb extends LifecycleTx {
  $transaction<T>(fn: (tx: LifecycleTx) => Promise<T>): Promise<T>;
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

export interface LifecycleDeps {
  db: LifecycleDb;
  emit: AuditFn;
  now: () => Date;
}

/**
 * Resolve the real DB + audit bindings lazily, so importing this module does NOT
 * pull in the generated Prisma client at load time. Unit tests inject their own
 * deps and never reach this path; only the live runtime does.
 */
async function resolveDefaultDeps(): Promise<LifecycleDeps> {
  const [{ db }, { emitAuditEvent }] = await Promise.all([
    import("@/lib/db"),
    import("@/infra/audit"),
  ]);
  return {
    db: db as unknown as LifecycleDb,
    emit: emitAuditEvent as unknown as AuditFn,
    now: () => new Date(),
  };
}

export interface LifecycleCommand {
  workspaceId: string;
  /** The employee/member being acted upon. */
  userId: string;
  /** The owner/manager performing the action (for audit). */
  actorId: string;
  reason?: string;
}

export class LifecycleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LifecycleConflictError";
  }
}

export class LifecycleNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LifecycleNotAllowedError";
  }
}

async function loadStatus(
  deps: LifecycleDeps,
  workspaceId: string,
  userId: string
): Promise<EmployeeAccessStatus> {
  const membership = await deps.db.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { isActive: true, removedAt: true },
  });
  return deriveAccessStatus(membership);
}

/**
 * Build the concurrency-safe state-guard `where` for a transition so two
 * concurrent transitions cannot both succeed (Addendum I concurrency safety).
 */
function stateGuard(
  workspaceId: string,
  userId: string,
  action: EmployeeLifecycleAction
): Record<string, unknown> {
  const base = { workspaceId, userId };
  switch (action) {
    case EmployeeLifecycleAction.SUSPEND:
      return { ...base, isActive: true, removedAt: null };
    case EmployeeLifecycleAction.REACTIVATE:
      return { ...base, isActive: false, removedAt: null };
    case EmployeeLifecycleAction.OFFBOARD:
      return { ...base, removedAt: null };
    default:
      return base;
  }
}

async function applyTransition(
  command: LifecycleCommand,
  action: EmployeeLifecycleAction,
  injected?: LifecycleDeps
): Promise<EmployeeAccessStatus> {
  const deps = injected ?? (await resolveDefaultDeps());
  const { workspaceId, userId, actorId } = command;
  const from = await loadStatus(deps, workspaceId, userId);
  const plan = planLifecycleTransition(from, action);

  if (!plan.allowed) {
    throw new LifecycleNotAllowedError(plan.reason);
  }

  const now = deps.now();
  const membershipData: Record<string, unknown> = {
    isActive: plan.nextIsActive,
  };
  if (plan.removedAt === "set") membershipData.removedAt = now;
  else if (plan.removedAt === "clear") membershipData.removedAt = null;
  // Slice 3B lifecycle timestamps (additive columns).
  if (action === EmployeeLifecycleAction.SUSPEND) membershipData.suspendedAt = now;
  if (action === EmployeeLifecycleAction.OFFBOARD) membershipData.offboardedAt = now;

  // Atomic security pair: status change + (conditional) session revocation.
  const revokedSessionCount = await deps.db.$transaction(async (tx) => {
    const updated = await tx.workspaceMembership.updateMany({
      where: stateGuard(workspaceId, userId, action),
      data: membershipData,
    });
    if (updated.count !== 1) {
      // Status changed concurrently (or member vanished) → fail closed, roll back.
      throw new LifecycleConflictError(
        `Membership state changed concurrently during ${action}; no transition applied.`
      );
    }

    let revoked = 0;
    if (plan.revokeSessions) {
      const res = await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      revoked = res.count;
    }
    return revoked;
  });

  // Audit after commit (shared hash-chained helper; not tx-aware repo-wide).
  if (plan.auditEvent) {
    await deps.emit({
      eventName: plan.auditEvent,
      workspaceId,
      actorId,
      actorType: "user",
      entityType: "workspace_membership",
      entityId: userId,
      payload: {
        fromStatus: from,
        toStatus: plan.to,
        reason: command.reason ?? null,
        revokedSessionCount,
      },
    });
    if (plan.revokeSessions && revokedSessionCount > 0) {
      await deps.emit({
        eventName: AUDIT_EVENTS.EMPLOYEE_SESSIONS_REVOKED,
        workspaceId,
        actorId,
        actorType: "user",
        entityType: "workspace_membership",
        entityId: userId,
        payload: { revokedSessionCount, dueTo: action },
      });
    }
  }

  return plan.to;
}

export function suspendEmployee(
  command: LifecycleCommand,
  deps?: LifecycleDeps
): Promise<EmployeeAccessStatus> {
  return applyTransition(command, EmployeeLifecycleAction.SUSPEND, deps);
}

export function reactivateEmployee(
  command: LifecycleCommand,
  deps?: LifecycleDeps
): Promise<EmployeeAccessStatus> {
  return applyTransition(command, EmployeeLifecycleAction.REACTIVATE, deps);
}

export function offboardEmployee(
  command: LifecycleCommand,
  deps?: LifecycleDeps
): Promise<EmployeeAccessStatus> {
  return applyTransition(command, EmployeeLifecycleAction.OFFBOARD, deps);
}

/** Read-only fail-closed status lookup. */
export async function getEmployeeAccessStatus(
  workspaceId: string,
  userId: string,
  deps?: LifecycleDeps
): Promise<EmployeeAccessStatus> {
  const d = deps ?? (await resolveDefaultDeps());
  return loadStatus(d, workspaceId, userId);
}

/**
 * Fail-closed runtime guard for employee-facing routes/APIs: throws unless the
 * member is ACTIVE in this workspace. Re-reads status server-side on every call,
 * so a suspended/offboarded employee with an existing session is denied even if
 * their session cookie is still otherwise valid.
 */
export async function requireActiveMembership(
  workspaceId: string,
  userId: string,
  deps?: LifecycleDeps
): Promise<void> {
  const d = deps ?? (await resolveDefaultDeps());
  const status = await loadStatus(d, workspaceId, userId);
  if (!hasLiveAccess(status)) {
    throw new UnauthorizedError(
      `Member ${userId} is ${status} in workspace ${workspaceId} — access denied.`
    );
  }
}

/**
 * Fail-closed assignability guard for task assignment (Slice 7): throws unless
 * the member is ACTIVE. Offboarded/suspended members can never be assigned work.
 */
export async function assertEmployeeAssignable(
  workspaceId: string,
  userId: string,
  deps?: LifecycleDeps
): Promise<void> {
  const d = deps ?? (await resolveDefaultDeps());
  const status = await loadStatus(d, workspaceId, userId);
  if (!isAssignable(status)) {
    throw new LifecycleNotAllowedError(
      `Member ${userId} is ${status} in workspace ${workspaceId} — cannot be assigned new work.`
    );
  }
}
