/**
 * Employee blocker / escalation service (Slice 9, IO).
 *
 * An employee raises a blocker; it is routed (owner/manager/supervisor) with a
 * severity + response SLA and persisted OPEN with an audit event. Resolution
 * requires a non-empty note + resolver and is applied with an audit write in one
 * transaction (a failed audit prevents the close). The Prisma Escalation table is
 * MIGRATION_LANE_PENDING; this service uses an injected store and is DI-proven.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { v4 as uuid } from "uuid";
import {
  BlockerType,
  EscalationContext,
  EscalationRoute,
  EscalationStatus,
  planEscalationResolution,
  routeEscalation,
} from "@/domain/execution/escalation";

interface QueryArgs {
  where: Record<string, unknown>;
  data?: Record<string, unknown>;
}
interface EscalationDelegate {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: QueryArgs): Promise<{ count: number }>;
}
interface AuditCreateDelegate {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
}
export interface EscalationTx {
  escalation: EscalationDelegate;
  auditEvent: AuditCreateDelegate;
}
export interface EscalationDb extends EscalationTx {
  $transaction<T>(fn: (tx: EscalationTx) => Promise<T>): Promise<T>;
}
export interface EscalationDeps {
  db: EscalationDb;
  now: () => Date;
}

async function resolveDefaultDeps(): Promise<EscalationDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as EscalationDb, now: () => new Date() };
}

export class EscalationResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscalationResolutionError";
  }
}
export class EscalationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscalationConflictError";
  }
}

export interface RaiseBlockerCommand {
  escalationId: string;
  workspaceId: string;
  taskId: string | null;
  blocker: BlockerType;
  context?: EscalationContext;
  createdByUserId: string;
}

export interface RaiseBlockerResult {
  escalationId: string;
  route: EscalationRoute;
  dueAt: Date | null;
}

/** An employee raises a blocker; it is routed + persisted OPEN + audited. */
export async function raiseBlocker(
  command: RaiseBlockerCommand,
  injected?: EscalationDeps
): Promise<RaiseBlockerResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  const route = routeEscalation(command.blocker, command.context ?? {});
  const now = deps.now();
  const dueAt =
    route.responseSlaMinutes != null
      ? new Date(now.getTime() + route.responseSlaMinutes * 60_000)
      : null;

  await deps.db.$transaction(async (tx) => {
    await tx.escalation.create({
      data: {
        id: command.escalationId,
        workspaceId: command.workspaceId,
        taskId: command.taskId,
        category: command.blocker,
        severity: route.severity,
        assignedTarget: route.target,
        status: EscalationStatus.OPEN,
        createdBy: command.createdByUserId,
        dueAt,
        createdAt: now,
      },
    });
    await tx.auditEvent.create({
      data: {
        id: uuid(),
        workspaceId: command.workspaceId,
        eventName: AUDIT_EVENTS.ESCALATION_RAISED,
        actorId: command.createdByUserId,
        actorType: "user",
        entityType: "escalation",
        entityId: command.escalationId,
        payload: {
          blocker: command.blocker,
          target: route.target,
          severity: route.severity,
          requiresOwner: route.requiresOwner,
        },
        visibility: "internal",
        occurredAt: now,
      },
    });
  });

  return { escalationId: command.escalationId, route, dueAt };
}

export interface ResolveEscalationCommand {
  escalationId: string;
  workspaceId: string;
  fromStatus: EscalationStatus;
  resolutionNote: string;
  resolvedBy: string;
}

/** Resolve an escalation: requires note + resolver; never silently closes. */
export async function resolveEscalation(
  command: ResolveEscalationCommand,
  injected?: EscalationDeps
): Promise<EscalationStatus> {
  const deps = injected ?? (await resolveDefaultDeps());
  const decision = planEscalationResolution(
    command.fromStatus,
    command.resolutionNote,
    command.resolvedBy
  );
  if (!decision.allowed) {
    throw new EscalationResolutionError(decision.reason);
  }

  const now = deps.now();
  await deps.db.$transaction(async (tx) => {
    const updated = await tx.escalation.updateMany({
      where: {
        id: command.escalationId,
        workspaceId: command.workspaceId,
        status: command.fromStatus,
      },
      data: {
        status: EscalationStatus.RESOLVED,
        resolutionNote: command.resolutionNote,
        resolvedBy: command.resolvedBy,
        resolvedAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new EscalationConflictError(
        `Escalation ${command.escalationId} not in expected state ${command.fromStatus}; not resolved.`
      );
    }
    await tx.auditEvent.create({
      data: {
        id: uuid(),
        workspaceId: command.workspaceId,
        eventName: AUDIT_EVENTS.ESCALATION_RESOLVED,
        actorId: command.resolvedBy,
        actorType: "user",
        entityType: "escalation",
        entityId: command.escalationId,
        payload: { fromStatus: command.fromStatus },
        visibility: "internal",
        occurredAt: now,
      },
    });
  });

  return EscalationStatus.RESOLVED;
}
