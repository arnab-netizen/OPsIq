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
  riskIfIgnored: string; ownerVisibleSummary: string; severity: string; priorityRank: number; notes: string | null;
  completedByUserId: string | null; completedByRole: string | null; completedAt: Date | null; reassessmentId: string | null;
}
interface PETDelegate {
  findFirst(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<TaskRow | null>;
  findMany(a: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<TaskRow[]>;
  create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
  updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
}
interface AuditDelegate { create(a: { data: Record<string, unknown> }): Promise<unknown> }
interface OwnerBusinessDelegate {
  findFirst(a: { where: { id: string; workspaceId: string }; select?: { id: true } }): Promise<{ id: string } | null>;
}
interface PETTx { processExecutionTask: Pick<PETDelegate, "create" | "updateMany" | "findFirst">; auditEvent: AuditDelegate }
export interface ProcessBridgeDb extends PETTx {
  processExecutionTask: PETDelegate;
  /** Workspace-scoped business lookup — validates a supplied businessId belongs to the workspace (PASS 25). */
  ownerBusiness: OwnerBusinessDelegate;
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
    // Never disturb a task the owner has already advanced: once it leaves PROPOSED (started, approved, rejected,
    // delegated, blocked, parked for data, or completed) the persisted row is authoritative. Re-materialising the
    // recomputed bridge over it would silently clobber an owner-driven transition (e.g. reset a delegate's owner).
    if (existing && existing.status !== "PROPOSED") { deduped++; continue; }
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
/** Owner-visible, non-leaky failure codes for governed execution actions (PASS 25). */
export type ProcessActionCode =
  | "WRONG_WORKSPACE" | "OWNER_APPROVAL_REQUIRED" | "EVIDENCE_REQUIRED" | "INVALID_TRANSITION"
  | "NEVER_AUTO" | "NOT_FOUND_OR_FORBIDDEN" | "UNAUTHORIZED" | "MISSING_INPUT";

export type CompleteTaskResult =
  | { ok: true; taskId: string; reassessmentId: string | null }
  | { ok: false; reason: string; code: ProcessActionCode };

/**
 * Validate that a supplied businessId belongs to the workspace before it is used for a governed write
 * (reassessment linkage). Server-authoritative: a business from another workspace returns null → false.
 * Rejecting here closes the cross-workspace reassessment-linkage gap (PASS 25).
 */
async function businessInWorkspace(deps: ProcessBridgeDeps, workspaceId: string, businessId: string): Promise<boolean> {
  const found = await deps.db.ownerBusiness.findFirst({ where: { id: businessId, workspaceId }, select: { id: true } });
  return found != null;
}

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
  // Cross-workspace linkage guard: a supplied businessId must belong to this workspace before it can be
  // written onto a reassessment (a foreign businessId is rejected, never persisted). (PASS 25)
  if (input.businessId && input.businessId.trim() && !(await businessInWorkspace(deps, input.workspaceId, input.businessId.trim()))) {
    return { ok: false, reason: "That business is not in this workspace.", code: "WRONG_WORKSPACE" };
  }
  const task = await deps.db.processExecutionTask.findFirst({ where: { workspaceId: input.workspaceId, taskKey: input.taskKey } });
  if (!task) return { ok: false, reason: "Task not found in this workspace.", code: "NOT_FOUND_OR_FORBIDDEN" };
  if (task.status === "COMPLETED") return { ok: false, reason: "Task is already completed.", code: "INVALID_TRANSITION" };
  const route = task.executionRoute as ExecutionRoute;
  if (NON_COMPLETABLE_ROUTES.has(route)) return { ok: false, reason: `A ${route} route cannot be completed — it is not an actionable task.`, code: "NEVER_AUTO" };
  if (task.approvalLevel === "OWNER_APPROVAL_REQUIRED" && input.actorRole !== "owner") {
    return { ok: false, reason: "This task requires owner approval — only the owner can complete it.", code: "OWNER_APPROVAL_REQUIRED" };
  }
  const evidenceRefs = (input.evidenceRefs ?? []).map((e) => e.trim()).filter(Boolean);
  const notesEmpty = !input.outcomeNotes || !input.outcomeNotes.trim();
  if (EVIDENCE_REQUIRED_ROUTES.has(route) && evidenceRefs.length === 0) {
    return { ok: false, reason: "This task requires completion evidence — it cannot be completed without it.", code: "EVIDENCE_REQUIRED" };
  }
  // Fake-completion guard (verification-engine): claimed complete but no evidence and no notes (kpi unknown here).
  if (detectFakeCompletion(true, evidenceRefs.length > 0, false, notesEmpty) && EVIDENCE_REQUIRED_ROUTES.has(route)) {
    return { ok: false, reason: "Completion looks unverifiable (no evidence and no outcome note) — rejected.", code: "EVIDENCE_REQUIRED" };
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

// ── Interactive execution affordances (PASS 22) ────────────────────────────────────────────────────────

export type ProcessExecutionAction =
  | "START" | "APPROVE" | "REJECT" | "DELEGATE" | "SUBMIT_EVIDENCE" | "COMPLETE"
  | "REQUEST_REASSESSMENT" | "MARK_BLOCKED" | "REQUEST_MISSING_DATA";

/** Terminal statuses — no further transition is allowed. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["COMPLETED", "REJECTED"]);
/** Routes that can never be started/approved/completed/delegated (they are display/blocked, not tasks). */
const NON_ACTIONABLE_ROUTES: ReadonlySet<ExecutionRoute> = new Set(["MONITOR_ONLY", "BLOCK_UNSAFE_ACTION"]);

export interface ProcessActionInput {
  workspaceId: string;
  businessId?: string | null;
  actorId: string | null;
  actorRole: string | null;
  taskKey: string;
  action: ProcessExecutionAction;
  evidenceRefs?: string[];
  reason?: string | null;
  delegateToRole?: "MANAGER" | "STAFF" | null;
  outcomeNotes?: string | null;
}
export type ProcessActionResult =
  | { ok: true; taskId: string; status: string; reassessmentId?: string | null }
  | { ok: false; reason: string; code: ProcessActionCode };

/** True when this task's material decision is owner-only (owner-approval or an unsafe/never-auto action). */
function isOwnerOnly(task: TaskRow): boolean {
  return task.approvalLevel === "OWNER_APPROVAL_REQUIRED" || task.approvalLevel === "NEVER_AUTO";
}

/**
 * Apply a governed interactive action to a ProcessExecutionTask (PASS 22). Fail-closed on every guardrail:
 * unknown/foreign task, terminal task, impossible transition, owner-only action by a non-owner, unsafe delegate,
 * or evidence-less completion. Every transition writes an audit event in the same transaction. COMPLETE reuses
 * the evidence-gated completeProcessTask (which also opens the reassessment). No external side effect ever.
 */
export async function applyProcessExecutionAction(
  input: ProcessActionInput,
  injected?: ProcessBridgeDeps,
  reassessInjected?: import("@/services/owner-mode/reassessment-event.service").ReassessmentDeps,
): Promise<ProcessActionResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  // Cross-workspace linkage guard: any supplied businessId must belong to this workspace before it is used
  // for a governed write (reassessment). A foreign businessId fails closed and is never persisted. (PASS 25)
  if (input.businessId && input.businessId.trim() && !(await businessInWorkspace(deps, input.workspaceId, input.businessId.trim()))) {
    return { ok: false, reason: "That business is not in this workspace.", code: "WRONG_WORKSPACE" };
  }
  const task = await deps.db.processExecutionTask.findFirst({ where: { workspaceId: input.workspaceId, taskKey: input.taskKey } });
  if (!task) return { ok: false, reason: "Task not found in this workspace.", code: "NOT_FOUND_OR_FORBIDDEN" };
  const route = task.executionRoute as ExecutionRoute;

  // COMPLETE reuses the evidence-gated completion path (owner-only + fake-completion guard + reassessment).
  if (input.action === "COMPLETE") {
    const r = await completeProcessTask(
      { workspaceId: input.workspaceId, businessId: input.businessId, actorId: input.actorId, actorRole: input.actorRole, taskKey: input.taskKey, evidenceRefs: input.evidenceRefs ?? [], outcomeNotes: input.outcomeNotes },
      deps, reassessInjected,
    );
    return r.ok ? { ok: true, taskId: r.taskId, status: "COMPLETED", reassessmentId: r.reassessmentId } : r;
  }

  // REQUEST_REASSESSMENT is allowed even on a completed task (re-open the question), and needs a businessId.
  if (input.action === "REQUEST_REASSESSMENT") {
    if (!input.businessId || !input.businessId.trim()) return { ok: false, reason: "businessId is required to open a reassessment.", code: "MISSING_INPUT" };
    const { createReassessmentEvent } = await import("@/services/owner-mode/reassessment-event.service");
    const re = await createReassessmentEvent(
      { workspaceId: input.workspaceId, businessId: input.businessId, trigger: "owner_dispute", triggerDescription: `Owner requested a reassessment of process-execution task ${input.taskKey} (${task.sourceFindingKey}).`, actorId: input.actorId },
      reassessInjected,
    );
    await deps.db.processExecutionTask.updateMany({ where: { workspaceId: input.workspaceId, taskKey: input.taskKey }, data: { reassessmentId: re.id, updatedAt: deps.now() } });
    return { ok: true, taskId: task.id, status: task.status, reassessmentId: re.id };
  }

  if (TERMINAL_STATUSES.has(task.status)) return { ok: false, reason: `Task is ${task.status.toLowerCase()} — no further action is allowed.`, code: "INVALID_TRANSITION" };
  if (NON_ACTIONABLE_ROUTES.has(route)) return { ok: false, reason: `A ${route} route has no interactive action — it is monitor-only or blocked.`, code: "NEVER_AUTO" };

  let nextStatus = task.status;
  const data: Record<string, unknown> = {};

  switch (input.action) {
    case "START":
      if (!["PROPOSED", "NEEDS_DATA", "BLOCKED"].includes(task.status)) return { ok: false, reason: `Cannot start a task that is ${task.status.toLowerCase()}.`, code: "INVALID_TRANSITION" };
      nextStatus = "IN_PROGRESS"; break;
    case "APPROVE":
      if (task.approvalLevel !== "OWNER_APPROVAL_REQUIRED") return { ok: false, reason: "Only an owner-approval task can be approved.", code: "INVALID_TRANSITION" };
      if (input.actorRole !== "owner") return { ok: false, reason: "This action cannot be automated — only the owner can approve it.", code: "OWNER_APPROVAL_REQUIRED" };
      if (!["PROPOSED", "IN_PROGRESS"].includes(task.status)) return { ok: false, reason: `Cannot approve a task that is ${task.status.toLowerCase()}.`, code: "INVALID_TRANSITION" };
      nextStatus = "APPROVED"; break;
    case "REJECT":
      if (isOwnerOnly(task) && input.actorRole !== "owner") return { ok: false, reason: "Only the owner can reject this owner-controlled task.", code: "OWNER_APPROVAL_REQUIRED" };
      if (!input.reason || !input.reason.trim()) return { ok: false, reason: "A reason is required to reject a task.", code: "MISSING_INPUT" };
      nextStatus = "REJECTED"; data.notes = input.reason.trim(); break;
    case "DELEGATE":
      if (isOwnerOnly(task)) return { ok: false, reason: "An owner-controlled (owner-approval / never-auto) task cannot be delegated.", code: "OWNER_APPROVAL_REQUIRED" };
      if (input.delegateToRole !== "MANAGER" && input.delegateToRole !== "STAFF") return { ok: false, reason: "Delegate target must be MANAGER or STAFF.", code: "MISSING_INPUT" };
      if (!["PROPOSED", "IN_PROGRESS"].includes(task.status)) return { ok: false, reason: `Cannot delegate a task that is ${task.status.toLowerCase()}.`, code: "INVALID_TRANSITION" };
      nextStatus = "IN_PROGRESS"; data.actionOwner = input.delegateToRole; break;
    case "SUBMIT_EVIDENCE": {
      const refs = (input.evidenceRefs ?? []).map((e) => e.trim()).filter(Boolean);
      if (refs.length === 0) return { ok: false, reason: "No evidence supplied.", code: "EVIDENCE_REQUIRED" };
      data.evidenceRefs = [...task.evidenceRefs, ...refs];
      if (task.status === "PROPOSED") nextStatus = "IN_PROGRESS";
      break;
    }
    case "MARK_BLOCKED":
      if (!input.reason || !input.reason.trim()) return { ok: false, reason: "A reason is required to block a task.", code: "MISSING_INPUT" };
      nextStatus = "BLOCKED"; data.notes = input.reason.trim(); break;
    case "REQUEST_MISSING_DATA":
      nextStatus = "NEEDS_DATA"; break;
  }

  const now = deps.now();
  data.status = nextStatus;
  data.updatedAt = now;
  await deps.db.$transaction(async (tx) => {
    await tx.processExecutionTask.updateMany({ where: { workspaceId: input.workspaceId, taskKey: input.taskKey }, data });
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_TASK_TRANSITIONED,
        actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system",
        entityType: "process_execution_task", entityId: task.id,
        payload: { taskKey: input.taskKey, action: input.action, fromStatus: task.status, toStatus: nextStatus, actorRole: input.actorRole ?? null, delegateToRole: input.delegateToRole ?? null },
        visibility: "internal", occurredAt: now,
      },
    });
  });
  return { ok: true, taskId: task.id, status: nextStatus };
}
