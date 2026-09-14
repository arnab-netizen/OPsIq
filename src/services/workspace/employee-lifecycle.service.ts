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
 * AUDIT-01 (Administration V1 correction): the membership-status change, the
 * session revocation, AND the required audit event(s) now all commit or roll
 * back together in ONE transaction — previously the audit event was emitted
 * AFTER the transaction committed, so a mutation could succeed with no audit
 * record if emission failed. Fixed by passing the in-flight transaction
 * client through to `emit` (mirrors the identical fix already applied to
 * `markBetaRequestInvited` in `admin-operability.service.ts`). `emit`'s
 * second parameter is intentionally typed `unknown` rather than importing
 * `@/infra/audit`'s `AuditClient` type here, to preserve this file's existing
 * decoupling from generated Prisma types (see `resolveDefaultDeps` below) —
 * at runtime it is the real transaction client, which does carry `auditEvent`.
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
  ): Promise<{ isActive: boolean; removedAt: Date | null; role?: string } | null>;
  updateMany(args: QueryArgs): Promise<{ count: number }>;
  count(args: QueryArgs): Promise<number>;
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

export type AuditFn = (
  input: {
    eventName: string;
    workspaceId: string;
    actorId?: string;
    actorType?: string;
    entityType?: string;
    entityId?: string;
    payload?: Record<string, unknown>;
  },
  /** In-flight transaction client (AUDIT-01 atomicity). Untyped here to keep
   *  this file decoupled from generated Prisma types; at runtime this is the
   *  real transaction client passed through from `db.$transaction`. */
  client?: unknown
) => Promise<string>;

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

/**
 * Thrown when a lifecycle action would remove the last active owner of a
 * workspace (Administration V1 correction — a real, previously-unguarded gap:
 * `planLifecycleTransition` has no awareness of `role`/owner-count at all).
 * Server-side, fail-closed — never a UI-only disable.
 */
export class SoleActiveOwnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SoleActiveOwnerError";
  }
}

async function loadStatus(
  deps: LifecycleDeps,
  workspaceId: string,
  userId: string
): Promise<{ status: EmployeeAccessStatus; role: string | undefined }> {
  const membership = await deps.db.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { isActive: true, removedAt: true, role: true },
  });
  return { status: deriveAccessStatus(membership), role: membership?.role };
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

/** Literal role value marking a workspace owner (see OWNER_SCOPED_CAPABILITIES's identical check). */
const OWNER_ROLE = "owner";

async function applyTransition(
  command: LifecycleCommand,
  action: EmployeeLifecycleAction,
  injected?: LifecycleDeps
): Promise<EmployeeAccessStatus> {
  const deps = injected ?? (await resolveDefaultDeps());
  const { workspaceId, userId, actorId } = command;
  const { status: from, role } = await loadStatus(deps, workspaceId, userId);
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

  // Server-side, fail-closed sole-active-owner guard (Administration V1
  // correction — planLifecycleTransition has no role/owner-count awareness at
  // all). Applies to both SUSPEND and OFFBOARD: either would remove this
  // user's live access, and an orphaned workspace is the same failure either
  // way. Checked before the transaction opens so a doomed transition never
  // takes any lock; re-checked is unnecessary here since a workspace's set of
  // active owners changing during this same request is not a scenario any
  // other part of this mutation depends on for correctness (only this user's
  // own row is written).
  if (
    role === OWNER_ROLE &&
    (action === EmployeeLifecycleAction.SUSPEND || action === EmployeeLifecycleAction.OFFBOARD)
  ) {
    const activeOwnerCount = await deps.db.workspaceMembership.count({
      where: { workspaceId, role: OWNER_ROLE, isActive: true },
    });
    if (activeOwnerCount <= 1) {
      throw new SoleActiveOwnerError(
        `Cannot ${action.toLowerCase()} the last active owner of workspace ${workspaceId} — this would orphan it.`
      );
    }
  }

  // AUDIT-01: membership transition, session revocation, AND the required
  // audit event(s) all commit or roll back together — a thrown emit() aborts
  // the whole transaction, leaving the membership/session state unchanged.
  await deps.db.$transaction(async (tx) => {
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

    if (plan.auditEvent) {
      await deps.emit(
        {
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
            revokedSessionCount: revoked,
          },
        },
        tx
      );
      if (plan.revokeSessions && revoked > 0) {
        await deps.emit(
          {
            eventName: AUDIT_EVENTS.EMPLOYEE_SESSIONS_REVOKED,
            workspaceId,
            actorId,
            actorType: "user",
            entityType: "workspace_membership",
            entityId: userId,
            payload: { revokedSessionCount: revoked, dueTo: action },
          },
          tx
        );
      }
    }

    return revoked;
  });

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
  const { status } = await loadStatus(d, workspaceId, userId);
  return status;
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
  const { status } = await loadStatus(d, workspaceId, userId);
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
  const { status } = await loadStatus(d, workspaceId, userId);
  if (!isAssignable(status)) {
    throw new LifecycleNotAllowedError(
      `Member ${userId} is ${status} in workspace ${workspaceId} — cannot be assigned new work.`
    );
  }
}
