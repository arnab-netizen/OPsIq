/**
 * Process-Correction Execution Bridge — persistence service (PASS 20).
 *
 * Persists the governed execution routes produced by the pure domain bridge as ProcessExecutionTask rows,
 * reads them back, and drives governed completion. This is the app-layer that closes the Level-3 loop: a
 * cockpit diagnosis becomes a tracked task with an owner, approval level, required evidence, a completion
 * state, and — on completion — a governed reassessment (did the correction actually work?).
 *
 * Governed + safe (enforced here, in code):
 *   - Idempotent: one row per (workspaceId, taskKey); re-persisting an unchanged route is a no-op.
 *   - Owner-approval tasks can NEVER be auto-completed or completed by a non-owner.
 *   - Evidence-required routes cannot COMPLETE without evidence; a fake-completion guard
 *     (verification-engine.detectFakeCompletion) blocks "done, no evidence, no notes".
 *   - MONITOR_ONLY / BLOCK routes cannot be completed.
 *   - AUDIT-01: every mutation writes its audit event in the same transaction.
 *   - Completing a correction/SOP/training/reassessment task opens a governed reassessment (idempotent).
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { detectFakeCompletion } from "@/services/execution/verification-engine";
import type { BridgedExecutionRoute, ProcessExecutionBridgeAnalysis, ExecutionRoute } from "@/domain/owner-mode/process-execution-bridge";

interface TaskRow {
  id: string; workspaceId: string; taskKey: string; sourceFamily: string; sourceFindingKey: string;
  executionRoute: string; actionOwner: string; approvalLevel: string; status: string;
  requiredEvidence: string[]; evidenceRefs: string[]; completionCriteria: string; reassessmentTrigger: string;
  riskIfIgnored: string; ownerVisibleSummary: string; severity: string; priorityRank: number;
  completedByUserId: string | null; completedByRole: string | null; completedAt: Date | null; reassessmentId: string | null;
}
interface PETDelegate {
  findFirst(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<TaskRow | null>;
  findMany(a: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<TaskRow[]>;
  create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
  updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
}
interface AuditDelegate { create(a: { data: Record<string, unknown> }): Promise<unknown> }
interface PETTx { processExecutionTask: Pick<PETDelegate, "create" | "updateMany" | "findFirst">; auditEvent: AuditDelegate }
export interface ProcessBridgeDb extends PETTx {
  processExecutionTask: PETDelegate;
  $transaction<T>(fn: (tx: PETTx) => Promise<T>): Promise<T>;
}
export interface ProcessBridgeDeps {
  db: ProcessBridgeDb;
  uuid: () => string;
  now: () => Date;
}

async function resolveDefaultDeps(): Promise<ProcessBridgeDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };
}

/** Routes whose COMPLETION requires evidence (a governed, evidence-backed close). */
const EVIDENCE_REQUIRED_ROUTES: ReadonlySet<ExecutionRoute> = new Set([
  "CREATE_CORRECTION_TASK", "CREATE_SOP_CHECKLIST_TASK", "CREATE_TRAINING_TASK", "CREATE_EVIDENCE_REQUEST",
  "CREATE_OWNER_APPROVAL_TASK", "CREATE_MANAGER_TASK", "CREATE_STAFF_TASK", "CREATE_REASSESSMENT_TASK",
]);
/** Routes that cannot be completed at all (nothing to close). */
const NON_COMPLETABLE_ROUTES: ReadonlySet<ExecutionRoute> = new Set(["MONITOR_ONLY", "BLOCK_UNSAFE_ACTION"]);
/** Routes that, once completed, open a governed reassessment (did the correction actually work?). */
const REASSESSMENT_ON_COMPLETE: ReadonlySet<ExecutionRoute> = new Set([
  "CREATE_CORRECTION_TASK", "CREATE_SOP_CHECKLIST_TASK", "CREATE_TRAINING_TASK", "CREATE_REASSESSMENT_TASK",
]);

export interface PersistResult { created: number; updated: number; deduped: number }

/**
 * Persist the bridge analysis. One ProcessExecutionTask per route, idempotent on (workspaceId, taskKey):
 * a new route is created; a changed route (route/owner/approval/evidence) is updated; an unchanged route is a
 * no-op. Never mutates a task already COMPLETED. Atomic audit on every write.
 */
export async function persistProcessExecutionRoutes(
  workspaceId: string,
  analysis: ProcessExecutionBridgeAnalysis,
  actorId: string | null,
  injected?: ProcessBridgeDeps,
): Promise<PersistResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  let created = 0, updated = 0, deduped = 0;
  for (const r of analysis.routes) {
    if (r.workspaceId !== workspaceId) continue; // isolation: never persist another workspace's route
    const existing = await deps.db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: r.taskKey } });
    if (existing && existing.status === "COMPLETED") { deduped++; continue; } // never disturb a completed task
    const changed = !existing
      || existing.executionRoute !== r.executionRoute || existing.actionOwner !== r.actionOwner
      || existing.approvalLevel !== r.approvalLevel || existing.ownerVisibleSummary !== r.ownerVisibleSummary
      || JSON.stringify(existing.requiredEvidence) !== JSON.stringify(r.requiredEvidence);
    if (existing && !changed) { deduped++; continue; }
    const now = deps.now();
    const id = existing?.id ?? deps.uuid();
    await deps.db.$transaction(async (tx) => {
      const data = routeToData(r, workspaceId, now);
      if (existing) {
        await tx.processExecutionTask.updateMany({ where: { workspaceId, taskKey: r.taskKey }, data });
      } else {
        await tx.processExecutionTask.create({ data: { id, createdAt: now, status: "PROPOSED", ...data } });
      }
      await tx.auditEvent.create({
        data: {
          id: deps.uuid(), workspaceId, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_TASK_UPSERTED,
          actorId: actorId ?? null, actorType: actorId ? "user" : "system",
          entityType: "process_execution_task", entityId: id,
          payload: { taskKey: r.taskKey, executionRoute: r.executionRoute, actionOwner: r.actionOwner, approvalLevel: r.approvalLevel, sourceFindingKey: r.sourceFindingKey },
          visibility: "internal", occurredAt: now,
        },
      });
    });
    if (existing) updated++; else created++;
  }
  return { created, updated, deduped };
}

function routeToData(r: BridgedExecutionRoute, workspaceId: string, now: Date): Record<string, unknown> {
  return {
    workspaceId, taskKey: r.taskKey, sourceFamily: r.sourceFamily, sourceFindingKey: r.sourceFindingKey,
    executionRoute: r.executionRoute, actionOwner: r.actionOwner, approvalLevel: r.approvalLevel,
    requiredEvidence: r.requiredEvidence, evidenceRefs: r.evidenceRefs, completionCriteria: r.completionCriteria,
    reassessmentTrigger: r.reassessmentTrigger, riskIfIgnored: r.riskIfIgnored, ownerVisibleSummary: r.ownerVisibleSummary,
    severity: r.severity, priorityRank: r.priorityRank, updatedAt: now,
  };
}

/** Read the workspace's persisted process-execution tasks (workspace-scoped). */
export async function getPersistedProcessTasks(workspaceId: string, injected?: ProcessBridgeDeps): Promise<TaskRow[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  try {
    return await deps.db.processExecutionTask.findMany({ where: { workspaceId }, orderBy: { priorityRank: "asc" }, take: 2000 });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return [];
    throw e;
  }
}

export interface CompleteTaskInput {
  workspaceId: string;
  businessId?: string | null;
  actorId: string | null;
  actorRole: string | null;
  taskKey: string;
  evidenceRefs: string[];
  outcomeNotes?: string | null;
}
export type CompleteTaskResult =
  | { ok: true; taskId: string; reassessmentId: string | null }
  | { ok: false; reason: string };

/**
 * Complete a process-execution task with governed guards. Fail-closed: unknown/foreign task, non-completable
 * route, owner-approval by a non-owner, or missing/void evidence all reject. On success, opens a governed
 * reassessment for correction/SOP/training/reassessment routes and records its id.
 */
export async function completeProcessTask(
  input: CompleteTaskInput,
  injected?: ProcessBridgeDeps,
  reassessInjected?: import("@/services/owner-mode/reassessment-event.service").ReassessmentDeps,
): Promise<CompleteTaskResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  const task = await deps.db.processExecutionTask.findFirst({ where: { workspaceId: input.workspaceId, taskKey: input.taskKey } });
  if (!task) return { ok: false, reason: "Task not found in this workspace." };
  if (task.status === "COMPLETED") return { ok: false, reason: "Task is already completed." };
  const route = task.executionRoute as ExecutionRoute;
  if (NON_COMPLETABLE_ROUTES.has(route)) return { ok: false, reason: `A ${route} route cannot be completed — it is not an actionable task.` };
  if (task.approvalLevel === "OWNER_APPROVAL_REQUIRED" && input.actorRole !== "owner") {
    return { ok: false, reason: "This task requires owner approval — only the owner can complete it." };
  }
  const evidenceRefs = (input.evidenceRefs ?? []).map((e) => e.trim()).filter(Boolean);
  const notesEmpty = !input.outcomeNotes || !input.outcomeNotes.trim();
  if (EVIDENCE_REQUIRED_ROUTES.has(route) && evidenceRefs.length === 0) {
    return { ok: false, reason: "This task requires completion evidence — it cannot be completed without it." };
  }
  // Fake-completion guard (verification-engine): claimed complete but no evidence and no notes (kpi unknown here).
  if (detectFakeCompletion(true, evidenceRefs.length > 0, false, notesEmpty) && EVIDENCE_REQUIRED_ROUTES.has(route)) {
    return { ok: false, reason: "Completion looks unverifiable (no evidence and no outcome note) — rejected." };
  }

  const now = deps.now();
  await deps.db.$transaction(async (tx) => {
    await tx.processExecutionTask.updateMany({
      where: { workspaceId: input.workspaceId, taskKey: input.taskKey },
      data: {
        status: "COMPLETED", evidenceRefs: [...task.evidenceRefs, ...evidenceRefs],
        completedByUserId: input.actorId ?? null, completedByRole: input.actorRole ?? null, completedAt: now, updatedAt: now,
      },
    });
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_TASK_COMPLETED,
        actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system",
        entityType: "process_execution_task", entityId: task.id,
        payload: { taskKey: input.taskKey, executionRoute: route, evidenceCount: evidenceRefs.length, completedByRole: input.actorRole ?? null },
        visibility: "internal", occurredAt: now,
      },
    });
  });

  // Completing a correction opens a governed reassessment (did the fix actually work?).
  let reassessmentId: string | null = null;
  if (REASSESSMENT_ON_COMPLETE.has(route) && input.businessId && input.businessId.trim()) {
    const { createReassessmentEvent } = await import("@/services/owner-mode/reassessment-event.service");
    const re = await createReassessmentEvent(
      {
        workspaceId: input.workspaceId, businessId: input.businessId, trigger: "execution_invalidation",
        triggerDescription: `Process-execution task ${input.taskKey} was completed — verify the correction actually resolved the ${task.sourceFindingKey} finding.`,
        actorId: input.actorId,
      },
      reassessInjected,
    );
    reassessmentId = re.id;
    await deps.db.processExecutionTask.updateMany({ where: { workspaceId: input.workspaceId, taskKey: input.taskKey }, data: { reassessmentId, updatedAt: deps.now() } });
  }
  return { ok: true, taskId: task.id, reassessmentId };
}
