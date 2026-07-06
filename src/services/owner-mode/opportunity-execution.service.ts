/**
 * Opportunity Execution service — the governed write path that records progress on a derived opportunity
 * execution task (assign / start / complete / block / cancel) with completion evidence, so delegated work is
 * trackable and feeds back into opportunity readiness.
 *
 * Server-authoritative + fail-closed: validated in the pure domain layer (owner-approval tasks can't
 * auto-complete; evidence-required tasks can't COMPLETE without evidence; forbidden language rejected);
 * workspace + actor from the verified session; row + atomic audit in one transaction; idempotent on
 * (workspaceId, taskKey). OpsIQ never submits/contacts/spends — this only records human/OpsIQ-draft progress.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  planTaskUpdate,
  type TaskUpdateSubmission,
  type PersistedTaskStatus,
  type ExecutionTaskStatus,
} from "@/domain/owner-mode/opportunity-execution";

interface TaskRow {
  id: string; workspaceId: string; taskKey: string; opportunityKey: string; sourceType: string; sourceKey: string;
  taskType: string; nextActionOwner: string; status: string; approvalLevel: string; evidenceRefs: string[];
  linkedProofIds: string[]; blockingReason: string | null; outcomeSummary: string | null;
  completedByUserId: string | null; completedByRole: string | null; completedAt: Date | null; createdAt: Date; updatedAt: Date;
}
interface TaskTx {
  opportunityExecutionTask: {
    create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  auditEvent: { create(a: { data: Record<string, unknown> }): Promise<unknown> };
}
export interface ExecutionDb {
  opportunityExecutionTask: {
    findFirst(a: { where: Record<string, unknown> }): Promise<TaskRow | null>;
    findMany(a: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<TaskRow[]>;
  };
  $transaction<T>(fn: (tx: TaskTx) => Promise<T>): Promise<T>;
}
export interface ExecutionDeps {
  db: ExecutionDb;
  uuid: () => string;
  now: () => Date;
}

async function resolveDefaultDeps(): Promise<ExecutionDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as ExecutionDb, uuid: () => randomUUID(), now: () => new Date() };
}

export interface RecordTaskInput {
  workspaceId: string;
  actorId: string | null;
  actorRole?: string | null;
  submission: TaskUpdateSubmission & { sourceType: string; sourceKey: string; nextActionOwner: string; approvalLevel: string };
}
export type RecordTaskResult =
  | { ok: true; taskId: string; status: ExecutionTaskStatus; updatesOpportunity: boolean; deduped: boolean }
  | { ok: false; reason: string };

/** Record (or idempotently update) an execution-task update. */
export async function recordExecutionTaskUpdate(input: RecordTaskInput, injected?: ExecutionDeps): Promise<RecordTaskResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  const sub = { ...input.submission, actorRole: input.submission.actorRole ?? input.actorRole ?? null };
  const planned = planTaskUpdate(sub);
  if (!planned.ok) return { ok: false, reason: planned.reason };
  const plan = planned.plan;
  const now = deps.now();
  const taskKey = input.submission.taskKey.trim();

  const existing = await deps.db.opportunityExecutionTask.findFirst({ where: { workspaceId: input.workspaceId, taskKey } });
  if (existing && existing.status === plan.status && existing.outcomeSummary === (plan.outcomeSummary ?? null) &&
      JSON.stringify(existing.evidenceRefs) === JSON.stringify(plan.evidenceRefs)) {
    return { ok: true, taskId: existing.id, status: existing.status as ExecutionTaskStatus, updatesOpportunity: false, deduped: true };
  }

  const id = existing?.id ?? deps.uuid();
  const completed = plan.status === "COMPLETED";
  await deps.db.$transaction(async (tx) => {
    const data = {
      workspaceId: input.workspaceId, taskKey, opportunityKey: input.submission.opportunityKey, sourceType: input.submission.sourceType,
      sourceKey: input.submission.sourceKey, taskType: input.submission.taskType, nextActionOwner: input.submission.nextActionOwner,
      status: plan.status, approvalLevel: input.submission.approvalLevel, evidenceRefs: plan.evidenceRefs, linkedProofIds: plan.linkedProofIds,
      blockingReason: plan.blockingReason, outcomeSummary: plan.outcomeSummary,
      completedByUserId: completed ? (input.actorId ?? null) : (existing?.completedByUserId ?? null),
      completedByRole: completed ? (input.submission.actorRole ?? input.actorRole ?? null) : (existing?.completedByRole ?? null),
      completedAt: completed ? now : (existing?.completedAt ?? null), updatedAt: now,
    };
    if (existing) {
      await tx.opportunityExecutionTask.updateMany({ where: { workspaceId: input.workspaceId, taskKey }, data });
    } else {
      await tx.opportunityExecutionTask.create({ data: { id, createdAt: now, ...data } });
    }
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OWNER_OPPORTUNITY_EXECUTION_TASK_UPDATED,
        actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system",
        entityType: "opportunity_execution_task", entityId: id,
        payload: { taskKey, opportunityKey: input.submission.opportunityKey, taskType: input.submission.taskType, action: input.submission.action, status: plan.status, updatesOpportunity: plan.updatesOpportunity },
        visibility: "internal", occurredAt: now,
      },
    });
  });

  return { ok: true, taskId: id, status: plan.status, updatesOpportunity: plan.updatesOpportunity, deduped: false };
}

/** Read the workspace's persisted execution-task statuses as a taskKey→status map (workspace-scoped). */
export async function getPersistedExecutionTasks(workspaceId: string, injected?: ExecutionDeps): Promise<Map<string, PersistedTaskStatus>> {
  const deps = injected ?? (await resolveDefaultDeps());
  let rows: TaskRow[] = [];
  try {
    rows = await deps.db.opportunityExecutionTask.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 2000 });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return new Map();
    throw e;
  }
  const map = new Map<string, PersistedTaskStatus>();
  for (const r of rows) {
    if (map.has(r.taskKey)) continue;
    map.set(r.taskKey, {
      status: r.status as ExecutionTaskStatus, completedBy: r.completedByUserId, completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      outcomeSummary: r.outcomeSummary, evidenceRefs: r.evidenceRefs, linkedProofIds: r.linkedProofIds, blockingReason: r.blockingReason,
    });
  }
  return map;
}
