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
  id: string; workspaceId: string; businessId: string | null; taskKey: string; sourceFamily: string; sourceFindingKey: string;
  executionRoute: string; actionOwner: string; approvalLevel: string; status: string;
  requiredEvidence: string[]; evidenceRefs: string[]; completionCriteria: string; reassessmentTrigger: string;
  riskIfIgnored: string; ownerVisibleSummary: string; severity: string; priorityRank: number; notes: string | null;
  completedByUserId: string | null; completedByRole: string | null; completedAt: Date | null; reassessmentId: string | null;
  // Phase 3 fields
  outcomeId: string | null;
  outcomeRecordedAt: Date | null;
  acknowledgedAt: Date | null;
  workStartedAt: Date | null;
  // G3: Startup link fields
  linkedStartupSessionId: string | null;
  linkedStartupBlueprintId: string | null;
  linkedStartupPlanId: string | null;
}
interface ProgressDelegate {
  create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
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
/**
 * Minimal delegate for in-transaction approval fingerprint verification.
 * Exposes updateMany (Pattern A: acquires exclusive row lock) rather than findFirst (read-only).
 * The WHERE fields are the only fields needed to close the concurrency race.
 */
interface StartupDecisionFingerprintDelegate {
  updateMany(a: {
    where: {
      id: string;
      workspaceId: string;
      supersededById: null;
      packageHashSha256?: string;
    };
    data: { workspaceId: string };
  }): Promise<{ count: number }>;
}
interface PETTx {
  processExecutionTask: Pick<PETDelegate, "create" | "updateMany" | "findFirst">;
  processExecutionTaskProgress: ProgressDelegate;
  auditEvent: AuditDelegate;
  /**
   * Used only by the startup execution fingerprint guard inside the mutation transaction.
   * Provided by the Prisma tx client at runtime; test mocks should stub this when testing
   * the STARTUP_MODE START/DELEGATE paths with full concurrency coverage.
   */
  startupOwnerDecision: StartupDecisionFingerprintDelegate;
}
export interface ProcessBridgeDb extends PETTx {
  processExecutionTask: PETDelegate;
  processExecutionTaskProgress: ProgressDelegate;
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
      || JSON.stringify(existing.requiredEvidence) !== JSON.stringify(r.requiredEvidence)
      // D1 fix: a row created before businessId-threading existed (or whose owning business
      // changed) must be recognised as changed so the re-sync below actually persists the correct
      // businessId. Without this comparison a NULL/stale businessId sticks forever — the exact
      // mechanism behind the confirmed cross-business leak for legacy PROCESS_CORRECTION /
      // SOP_CHECKLIST / TRAINING rows.
      || existing.businessId !== r.businessId;
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

/**
 * Generated CASH_PROFIT data-request findings. Each one asks the owner for data; once the authoritative bridge
 * stops emitting it, the request has been satisfied (or no longer applies) and the persisted task is obsolete.
 */
const RETIRABLE_DATA_GAP_FINDING_KEYS = ["PROFIT_DATA_INSUFFICIENT", "MISSING_UNIT_ECONOMICS"] as const;
/** Only a task the owner has not touched. NEEDS_DATA / IN_PROGRESS / APPROVED / etc. are owner-driven and never auto-retired. */
const RETIRABLE_STATUS = "PROPOSED";
export const DATA_GAP_RETIRED_REASON = "SOURCE_FINDING_NO_LONGER_ACTIVE";

export interface RetireResult { cancelled: number }

/**
 * Lifecycle reconciliation for generated data-gap tasks. persistProcessExecutionRoutes only ever visits routes
 * that are CURRENT, so a task created for a route that has since disappeared is never touched and would stay in
 * the owner's lifecycle forever. This retires such a task to the existing terminal status CANCELLED (row and
 * history preserved, never deleted) when ALL hold: it is a CASH_PROFIT data-gap route of THIS business, it is
 * still PROPOSED (the owner has not acted on it), and the authoritative current analysis no longer emits its
 * taskKey. The persistence layer never judges whether data is sufficient — it only asks whether the current
 * bridge still emits the task. `cashProfitEvaluated` must be true only when the caller actually computed the
 * cash/profit layer for this business (otherwise absence proves nothing and nothing is retired).
 * Compare-and-set on status + atomic system audit event; a repeat run finds nothing to do.
 */
export async function retireResolvedDataGapTasks(
  workspaceId: string,
  businessId: string,
  analysis: ProcessExecutionBridgeAnalysis | null,
  opts: { cashProfitEvaluated: boolean; triggeredByUserId?: string | null },
  injected?: ProcessBridgeDeps,
): Promise<RetireResult> {
  if (!opts.cashProfitEvaluated || !analysis || !businessId) return { cancelled: 0 };
  const deps = injected ?? (await resolveDefaultDeps());
  const activeKeys = new Set(analysis.routes.filter((r) => r.workspaceId === workspaceId).map((r) => r.taskKey));
  let candidates: TaskRow[];
  try {
    candidates = await deps.db.processExecutionTask.findMany({
      where: {
        workspaceId, businessId, isFixtureRecord: false,
        sourceFamily: "CASH_PROFIT", executionRoute: "CREATE_MISSING_DATA_TASK",
        sourceFindingKey: { in: [...RETIRABLE_DATA_GAP_FINDING_KEYS] },
        status: RETIRABLE_STATUS,
      },
      take: 200,
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return { cancelled: 0 };
    throw e;
  }
  let cancelled = 0;
  for (const t of candidates) {
    if (activeKeys.has(t.taskKey)) continue;
    const now = deps.now();
    const applied = await deps.db.$transaction(async (tx) => {
      const res = await tx.processExecutionTask.updateMany({
        where: { id: t.id, workspaceId, businessId, status: RETIRABLE_STATUS },
        data: { status: "CANCELLED", updatedAt: now },
      });
      if (res.count !== 1) return false; // lost a race to an owner action: never override it
      await tx.auditEvent.create({
        data: {
          id: deps.uuid(), workspaceId, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_TASK_TRANSITIONED,
          // System reconciliation — never attributed to the owner as a rejection or any other owner action.
          actorId: null, actorType: "system",
          entityType: "process_execution_task", entityId: t.id,
          payload: {
            taskKey: t.taskKey, sourceFindingKey: t.sourceFindingKey, businessId,
            action: "SYSTEM_RETIRE_RESOLVED_DATA_GAP", fromStatus: t.status, toStatus: "CANCELLED",
            reason: DATA_GAP_RETIRED_REASON,
            note: "The authoritative source finding is no longer active; the requested data is now sufficient or no longer applies.",
            triggeredByUserId: opts.triggeredByUserId ?? null,
          },
          visibility: "internal", occurredAt: now,
        },
      });
      return true;
    });
    if (applied) cancelled++;
  }
  return { cancelled };
}

/**
 * Post-diagnosis re-evaluation (adaptive rule): after a Finance diagnosis changes the evidence, recompute the
 * authoritative bridge for that business and retire generated data-gap tasks it no longer emits. Best-effort —
 * a failure here never fails the diagnosis that triggered it.
 */
export async function reconcileDataGapTasksAfterDiagnosis(workspaceId: string, businessId: string, actorId: string | null): Promise<RetireResult> {
  try {
    const { getOwnerNowView } = await import("@/services/owner-guidance/owner-now-view.service");
    const view = await getOwnerNowView(workspaceId, businessId);
    return await retireResolvedDataGapTasks(workspaceId, businessId, view.processExecution, { cashProfitEvaluated: view.cashProfitProtection !== null, triggeredByUserId: actorId });
  } catch (e) {
    console.error("[process-execution] post-diagnosis data-gap reconciliation failed", e);
    return { cancelled: 0 };
  }
}

function routeToData(r: BridgedExecutionRoute, workspaceId: string, now: Date): Record<string, unknown> {
  return {
    workspaceId, businessId: r.businessId, taskKey: r.taskKey, sourceFamily: r.sourceFamily, sourceFindingKey: r.sourceFindingKey,
    executionRoute: r.executionRoute, actionOwner: r.actionOwner, approvalLevel: r.approvalLevel,
    requiredEvidence: r.requiredEvidence,
    // Root cause (regression on completeProcessTask's evidence-count gate — see the comment there): the
    // persisted task's `evidenceRefs` column must hold ONLY genuine completion evidence -- supplied inline
    // on COMPLETE, or via an earlier SUBMIT_EVIDENCE/RECORD_PROGRESS call -- never `r.evidenceRefs`. The
    // route's `evidenceRefs` (supportingProofIds/supportingAdjudicationIds/supportingOperationalEventIds/
    // supportingEscalationIds, concatenated by the domain bridge — see process-execution-bridge.ts and
    // process-execution-bridge-expansion.ts) is supporting proof for why the underlying FINDING was raised,
    // not proof the corrective TASK was completed. Persisting it into `evidenceRefs` at create/re-sync time
    // let that unrelated context data silently satisfy (often fully, per the CREATE_CORRECTION_TASK/
    // CREATE_SOP_CHECKLIST_TASK/WORKLOAD_REDUCTION fixtures) `requiredEvidence.length` the instant a task was
    // created — before the owner ever submitted a single piece of real evidence — defeating
    // completeProcessTask's cumulative evidence-count gate and its detectFakeCompletion signal entirely.
    // Always persist [] here: a task this function creates or re-syncs is always still PROPOSED (see the
    // `existing.status !== "PROPOSED"` guard above), and no genuine-evidence action (SUBMIT_EVIDENCE,
    // RECORD_PROGRESS) can ever run against a PROPOSED task, so this never discards real evidence.
    evidenceRefs: [], completionCriteria: r.completionCriteria,
    reassessmentTrigger: r.reassessmentTrigger, riskIfIgnored: r.riskIfIgnored, ownerVisibleSummary: r.ownerVisibleSummary,
    severity: r.severity, priorityRank: r.priorityRank, updatedAt: now,
  };
}

/**
 * Source families that are genuinely workspace-level BY DESIGN (see BridgedExecutionRoute's
 * businessId doc comment and process-execution-bridge-expansion.ts, which hardcodes
 * `businessId: null` for every route these families produce). A null businessId in one of these
 * families means "workspace-level," never "not yet attributed."
 *
 * STARTUP_MODE is deliberately EXCLUDED from this set even though legacy rows exist with a null
 * businessId — createBlueprint() (startup-execution-blueprint.service.ts) always stamps
 * `session.businessId` on every task it creates, and the only STARTUP_MODE rows with a null
 * businessId are pre-D1-fix legacy rows. Their true owning business is always recoverable via
 * `linkedStartupSessionId -> OwnerStartupSession.businessId` (never ambiguous — see
 * PROCESS_EXECUTION_BUSINESS_ISOLATION docs) and treating them as workspace-level would show a
 * STARTUP_MODE task to every business in the workspace regardless of which one it actually
 * belongs to — the exact D1 launch-blocker leak. PROCESS_CORRECTION and CASH_PROFIT are also
 * excluded: they are business-scoped by design (businessId embedded directly in taskKey) and the
 * rare row with neither a businessId nor a session link is a workspace-level "insufficient data"
 * placeholder with no business signal at all — safest treated as workspace-level via the OR-null
 * fallback below, same as today, since there is nothing to attribute it to.
 */
const WORKSPACE_LEVEL_SOURCE_FAMILIES = ["WORKLOAD_REDUCTION", "CAPABILITY_GAP", "SOP_CHECKLIST", "TRAINING", "EFFECTIVENESS_RECHECK"] as const;

/**
 * Read the workspace's persisted process-execution tasks. Workspace-scoped always; ADDITIONALLY
 * business-scoped when `businessId` is supplied (D1 fix — a business-scoped cockpit read must
 * never surface a task belonging to a DIFFERENT business in the same workspace).
 *
 * `businessId` is appended as a third parameter (after `injected`) rather than inserted before it
 * so every pre-existing positional call site (`getPersistedProcessTasks(ws, deps)`, of which there
 * are many across this repo's DB test suites) keeps compiling and keeps its prior, unscoped
 * behavior unchanged — only call sites that explicitly opt in by passing a third argument get
 * business scoping.
 *
 * When a businessId IS supplied, a row is returned when EITHER:
 *   - businessId === the supplied business (the row genuinely belongs to it), OR
 *   - businessId is NULL *and* the row's sourceFamily is one of WORKSPACE_LEVEL_SOURCE_FAMILIES
 *     above — the only families that are BY DESIGN workspace-level and never carry a businessId.
 *     A null-businessId row in any OTHER family (in practice, legacy STARTUP_MODE rows) is
 *     excluded here, never treated as "workspace-level by default": null there means legacy/
 *     unattributed data, not an intentional design choice, and the launch-blocker fix is to close
 *     that gap by narrowing the fallback, not to keep guessing at read time (see the module doc
 *     comment above and the D1 controlled-beta closure PR report).
 */
export async function getPersistedProcessTasks(
  workspaceId: string,
  injected?: ProcessBridgeDeps,
  businessId?: string | null,
): Promise<TaskRow[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  try {
    // isFixtureRecord: false excludes acceptance/QA fixture tasks (see
    // ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md) — an ordinary owner's task list must never include a
    // task a QA blueprint run created.
    return await deps.db.processExecutionTask.findMany({
      where: {
        workspaceId,
        isFixtureRecord: false,
        ...(businessId
          ? { OR: [{ businessId }, { businessId: null, sourceFamily: { in: WORKSPACE_LEVEL_SOURCE_FAMILIES } }] }
          : {}),
      },
      orderBy: { priorityRank: "asc" },
      take: 2000,
    });
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
  | "NEVER_AUTO" | "NOT_FOUND_OR_FORBIDDEN" | "UNAUTHORIZED" | "MISSING_INPUT"
  | "STARTUP_EXECUTION_LINKAGE_INVALID";

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
 * Public wrapper around the same workspace-membership check this file already uses internally for
 * governed writes (completeProcessTask / applyProcessExecutionAction). Reused by
 * POST /api/owner/process-execution's pre-materialisation guard (hostile safety correction) so a
 * businessId — whether taken from the client or recovered from a pc:/cp: taskKey via
 * parseBusinessIdFromTaskKey — is confirmed to belong to THIS workspace before it can drive
 * getOwnerNowView/persistProcessExecutionRoutes. Without this, a taskKey crafted with a genuinely
 * foreign (different-workspace, or nonexistent) business UUID would still reach materialisation and
 * could persist a dangling ProcessExecutionTask row stamped with a businessId that has no
 * corresponding OwnerBusiness in this workspace. Same fail-closed semantics as the internal check;
 * not a new trust boundary.
 */
export async function isBusinessInWorkspace(
  workspaceId: string,
  businessId: string,
  injected?: ProcessBridgeDeps,
): Promise<boolean> {
  const deps = injected ?? (await resolveDefaultDeps());
  return businessInWorkspace(deps, workspaceId, businessId);
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
  if (isApprovalFirst(task) && task.status !== "IN_PROGRESS") {
    return { ok: false, reason: "An owner-approval task must be approved and started before it can be completed.", code: "INVALID_TRANSITION" };
  }
  const route = task.executionRoute as ExecutionRoute;
  if (NON_COMPLETABLE_ROUTES.has(route)) return { ok: false, reason: `A ${route} route cannot be completed — it is not an actionable task.`, code: "NEVER_AUTO" };
  if (task.approvalLevel === "OWNER_APPROVAL_REQUIRED" && input.actorRole !== "owner") {
    return { ok: false, reason: "This task requires owner approval — only the owner can complete it.", code: "OWNER_APPROVAL_REQUIRED" };
  }
  const evidenceRefs = (input.evidenceRefs ?? []).map((e) => e.trim()).filter(Boolean);
  const notesEmpty = !input.outcomeNotes || !input.outcomeNotes.trim();
  // Evidence gate + fake-completion check must both count everything the task already holds (e.g. from an
  // earlier SUBMIT_EVIDENCE / RECORD_PROGRESS call) PLUS whatever this call adds -- not just this call's own
  // evidenceRefs. Using only the fresh, per-request evidenceRefs (as before this fix) silently breaks
  // completion for any route requiring more than one distinct evidence item (e.g. CREATE_SOP_CHECKLIST_TASK,
  // which requires both "the drafted SOP/checklist change" and "evidence of adoption before it is marked
  // done" -- see evidenceForRoute in process-execution-bridge-expansion.ts): a single inline evidence entry
  // on COMPLETE was rejected even though it was valid evidence, and evidence already submitted via the
  // separate SUBMIT_EVIDENCE workflow never counted toward completion at all.
  //
  // This union is safe (does not weaken the gate to zero) ONLY because task.evidenceRefs, as persisted, is
  // guaranteed to hold nothing but genuine completion evidence: routeToData() (persistProcessExecutionRoutes,
  // above) always writes evidenceRefs: [] when a task is created or re-synced, deliberately NOT seeding it
  // from the route's own `evidenceRefs` (supportingProofIds/etc. -- proof the underlying FINDING is real,
  // not proof the corrective TASK was done). An earlier version of this fix unioned task.evidenceRefs
  // straight from the route seed and was a confirmed regression: that seed is non-empty for essentially
  // every real finding, so it alone satisfied (or nearly satisfied) requiredEvidence.length before the owner
  // ever submitted anything, letting COMPLETE succeed with zero genuine evidence. Do not reintroduce that
  // seed into evidenceRefs without also reworking this gate. Deduplicated so the same evidence string is
  // never persisted twice.
  const combinedEvidenceRefs = Array.from(new Set([...task.evidenceRefs, ...evidenceRefs]));
  if (EVIDENCE_REQUIRED_ROUTES.has(route)) {
    const minRequired = task.requiredEvidence.length > 0 ? task.requiredEvidence.length : 1;
    if (combinedEvidenceRefs.length < minRequired) {
      return { ok: false, reason: "This task requires completion evidence — it cannot be completed without it.", code: "EVIDENCE_REQUIRED" };
    }
  }
  // Fake-completion guard (verification-engine): claimed complete but no evidence and no notes (kpi unknown here).
  if (detectFakeCompletion(true, combinedEvidenceRefs.length > 0, false, notesEmpty) && EVIDENCE_REQUIRED_ROUTES.has(route)) {
    return { ok: false, reason: "Completion looks unverifiable (no evidence and no outcome note) — rejected.", code: "EVIDENCE_REQUIRED" };
  }

  const now = deps.now();
  await deps.db.$transaction(async (tx) => {
    await tx.processExecutionTask.updateMany({
      where: { workspaceId: input.workspaceId, taskKey: input.taskKey },
      data: {
        status: "COMPLETED", evidenceRefs: combinedEvidenceRefs,
        completedByUserId: input.actorId ?? null, completedByRole: input.actorRole ?? null, completedAt: now, updatedAt: now,
      },
    });
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_TASK_COMPLETED,
        actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system",
        entityType: "process_execution_task", entityId: task.id,
        payload: { taskKey: input.taskKey, executionRoute: route, evidenceCount: combinedEvidenceRefs.length, newEvidenceCount: evidenceRefs.length, completedByRole: input.actorRole ?? null },
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
  | "REQUEST_REASSESSMENT" | "MARK_BLOCKED" | "REQUEST_MISSING_DATA"
  // Phase 3
  | "ACKNOWLEDGE" | "RECORD_PROGRESS" | "RECORD_OUTCOME" | "VERIFY_OUTCOME";

/** Terminal statuses — no further transition is allowed (except via early-exit paths). */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["REJECTED", "OUTCOME_VERIFIED", "CANCELLED"]);
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
  // Phase 3 fields
  progressPct?: number | null;
  stage?: string | null;
  outcomeStatus?: string | null;
}
export type ProcessActionResult =
  | { ok: true; taskId: string; status: string; reassessmentId?: string | null; outcomeId?: string | null; progressRecordId?: string | null; verificationClassification?: string | null; selfVerified?: boolean }
  | { ok: false; reason: string; code: ProcessActionCode };

/** Owner-approval work is approval-first: it may only start, progress, pause or complete after the owner approved it. */
function isApprovalFirst(task: TaskRow): boolean {
  return task.approvalLevel === "OWNER_APPROVAL_REQUIRED";
}

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
  // Defense-in-depth business isolation: taskKey already embeds businessId for PROCESS_CORRECTION/
  // CASH_PROFIT routes (see process-execution-bridge.ts), so a caller cannot normally reach another
  // business's task through a bare taskKey collision -- but a caller could still supply a taskKey it
  // read from Business A's view alongside a businessId claiming Business B. Refuse identically to
  // "not found" (never reveal that the task belongs to a different business).
  if (task.businessId && input.businessId && input.businessId.trim() && task.businessId !== input.businessId.trim()) {
    return { ok: false, reason: "Task not found in this workspace.", code: "NOT_FOUND_OR_FORBIDDEN" };
  }
  const route = task.executionRoute as ExecutionRoute;

  // ── Phase 3: ACKNOWLEDGE ──────────────────────────────────────────────────
  if (input.action === "ACKNOWLEDGE") {
    // Idempotent: if already ACKNOWLEDGED or further along, succeed without mutation
    const PAST_ACKNOWLEDGE: ReadonlySet<string> = new Set(["ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "NEEDS_DATA", "COMPLETED", "OUTCOME_RECORDED", "OUTCOME_DISPUTED", "OUTCOME_VERIFIED", "APPROVED", "DELEGATED"]);
    if (PAST_ACKNOWLEDGE.has(task.status)) {
      return { ok: true, taskId: task.id, status: task.status };
    }
    if (task.status !== "PROPOSED") {
      return { ok: false, reason: `Cannot acknowledge a task with status ${task.status}.`, code: "INVALID_TRANSITION" };
    }
    const now = deps.now();
    await deps.db.$transaction(async (tx) => {
      await tx.processExecutionTask.updateMany({
        where: { workspaceId: input.workspaceId, taskKey: input.taskKey, status: "PROPOSED" },
        data: { status: "ACKNOWLEDGED", acknowledgedAt: now, acknowledgedByUserId: input.actorId ?? null, updatedAt: now },
      });
      await tx.auditEvent.create({
        data: {
          id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_TASK_ACKNOWLEDGED,
          actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system",
          entityType: "process_execution_task", entityId: task.id,
          payload: { taskKey: input.taskKey, fromStatus: "PROPOSED", toStatus: "ACKNOWLEDGED" },
          visibility: "internal", occurredAt: now,
        },
      });
    });
    return { ok: true, taskId: task.id, status: "ACKNOWLEDGED" };
  }

  // ── Phase 3: RECORD_PROGRESS ─────────────────────────────────────────────
  if (input.action === "RECORD_PROGRESS") {
    const NON_PROGRESS_STATUSES: ReadonlySet<string> = new Set(["PROPOSED", "REJECTED", "OUTCOME_VERIFIED", "CANCELLED"]);
    if (NON_PROGRESS_STATUSES.has(task.status) || (isApprovalFirst(task) && task.status !== "IN_PROGRESS")) {
      return { ok: false, reason: `Cannot record progress on a task with status ${task.status}.`, code: "INVALID_TRANSITION" };
    }
    const refs = (input.evidenceRefs ?? []).map((e) => e.trim()).filter(Boolean);
    const now = deps.now();
    let progressRecordId = "";
    await deps.db.$transaction(async (tx) => {
      const prog = await tx.processExecutionTaskProgress.create({
        data: {
          workspaceId: input.workspaceId,
          taskId: task.id,
          actorId: input.actorId ?? "system",
          progressPct: input.progressPct ?? null,
          stage: input.stage ?? null,
          note: input.reason ?? null,
          blockerActive: false,
          createdAt: now,
        },
      });
      progressRecordId = prog.id;
      // Merge any new evidence refs into task
      if (refs.length > 0) {
        await tx.processExecutionTask.updateMany({
          where: { workspaceId: input.workspaceId, taskKey: input.taskKey },
          data: { evidenceRefs: [...task.evidenceRefs, ...refs], updatedAt: now },
        });
      }
      await tx.auditEvent.create({
        data: {
          id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_TASK_PROGRESS_RECORDED,
          actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system",
          entityType: "process_execution_task", entityId: task.id,
          payload: { taskKey: input.taskKey, progressPct: input.progressPct ?? null, stage: input.stage ?? null, progressRecordId },
          visibility: "internal", occurredAt: now,
        },
      });
    });
    return { ok: true, taskId: task.id, status: task.status, progressRecordId };
  }

  // ── Phase 3: RECORD_OUTCOME ──────────────────────────────────────────────
  if (input.action === "RECORD_OUTCOME") {
    if (task.status !== "COMPLETED") {
      return { ok: false, reason: "RECORD_OUTCOME requires task status COMPLETED.", code: "INVALID_TRANSITION" };
    }
    // Idempotent: if outcome already recorded, return the existing outcomeId
    if (task.outcomeId) {
      return { ok: true, taskId: task.id, status: task.status, outcomeId: task.outcomeId };
    }
    if (!input.businessId || !input.businessId.trim()) {
      return { ok: false, reason: "businessId is required to record an outcome.", code: "MISSING_INPUT" };
    }
    if (!(await businessInWorkspace(deps, input.workspaceId, input.businessId.trim()))) {
      return { ok: false, reason: "That business is not in this workspace.", code: "WRONG_WORKSPACE" };
    }
    if (!input.outcomeStatus) {
      return { ok: false, reason: "outcomeStatus is required for RECORD_OUTCOME — specify the actual outcome (e.g. 'worked', 'partially_worked', 'did_not_work').", code: "MISSING_INPUT" };
    }
    const { recordOwnerActionOutcome } = await import("@/services/owner-mode/owner-action-outcome.service");
    const outcomeStatusInput = input.outcomeStatus as import("@/services/owner-mode/owner-action-outcome.service").OutcomeStatus;
    const outcome = await recordOwnerActionOutcome(input.workspaceId, input.actorId ?? "system", {
      businessId: input.businessId.trim(),
      outcomeStatus: outcomeStatusInput,
      ownerReportedResult: input.outcomeNotes ?? undefined,
      evidenceQuality: (input.evidenceRefs ?? []).length > 0 ? "moderate" : "weak",
      taskKey: input.taskKey,
      taskType: "process_execution",
    });
    const now = deps.now();
    await deps.db.$transaction(async (tx) => {
      await tx.processExecutionTask.updateMany({
        where: { workspaceId: input.workspaceId, taskKey: input.taskKey, outcomeId: null },
        data: { status: "OUTCOME_RECORDED", outcomeId: outcome.id, outcomeRecordedAt: now, updatedAt: now },
      });
      await tx.auditEvent.create({
        data: {
          id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_OUTCOME_RECORDED,
          actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system",
          entityType: "process_execution_task", entityId: task.id,
          payload: { taskKey: input.taskKey, outcomeId: outcome.id, outcomeStatus: outcomeStatusInput, businessId: (input.businessId ?? "").trim() },
          visibility: "internal", occurredAt: now,
        },
      });
    });
    return { ok: true, taskId: task.id, status: "OUTCOME_RECORDED", outcomeId: outcome.id };
  }

  // ── Phase 3: VERIFY_OUTCOME ──────────────────────────────────────────────
  if (input.action === "VERIFY_OUTCOME") {
    if (!["OUTCOME_RECORDED", "OUTCOME_DISPUTED"].includes(task.status)) {
      return { ok: false, reason: "VERIFY_OUTCOME requires task status OUTCOME_RECORDED or OUTCOME_DISPUTED.", code: "INVALID_TRANSITION" };
    }
    if (!task.outcomeId) {
      return { ok: false, reason: "No outcome has been recorded for this task. Use RECORD_OUTCOME first.", code: "MISSING_INPUT" };
    }
    const { verifyOwnerActionOutcome, triggerPostVerificationSideEffects } = await import("@/services/owner-mode/owner-outcome-verification.service");
    let verificationClassification: string;
    let selfVerified = false;
    try {
      const result = await verifyOwnerActionOutcome(input.workspaceId, task.outcomeId, input.actorId ?? "system", input.reason ?? null);
      verificationClassification = result.verificationClassification;
      selfVerified = result.selfVerified ?? false;
    } catch (err: unknown) {
      if (err && typeof err === "object" && "statusCode" in err) {
        const e = err as { statusCode: number; message: string; code: string };
        if (e.statusCode === 404) {
          return { ok: false, reason: e.message, code: "NOT_FOUND_OR_FORBIDDEN" };
        }
        if (e.statusCode === 409 && e.code === "OUTCOME_ALREADY_VERIFIED") {
          return { ok: false, reason: e.message, code: "INVALID_TRANSITION" };
        }
        if (e.statusCode === 403) {
          return { ok: false, reason: e.message, code: "UNAUTHORIZED" };
        }
        if (e.statusCode === 409 && e.code === "OBSERVATION_WINDOW_OPEN") {
          return { ok: false, reason: e.message, code: "INVALID_TRANSITION" };
        }
        if (e.statusCode === 409 && e.code === "INSUFFICIENT_EVIDENCE") {
          return { ok: false, reason: e.message, code: "INVALID_TRANSITION" };
        }
      }
      throw err;
    }
    const now = deps.now();
    await deps.db.$transaction(async (tx) => {
      await tx.processExecutionTask.updateMany({
        where: { workspaceId: input.workspaceId, taskKey: input.taskKey },
        data: { status: "OUTCOME_VERIFIED", updatedAt: now },
      });
      await tx.auditEvent.create({
        data: {
          id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_OUTCOME_VERIFIED,
          actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system",
          entityType: "process_execution_task", entityId: task.id,
          // PR G: selfVerified carries the same truthful self-vs-independent distinction
          // that owner-outcome-verification.service.ts already wrote on the
          // owner_action_outcome audit event — mirrored here on the task-lifecycle
          // audit event so both records agree. Never true for an ordinary
          // independent verification.
          payload: { taskKey: input.taskKey, outcomeId: task.outcomeId, verificationClassification, selfVerified },
          visibility: "internal", occurredAt: now,
        },
      });
    });
    // Best-effort post-verification side effects (reassessment + learning)
    const businessId = input.businessId?.trim() ?? task.sourceFindingKey;
    setImmediate(() => {
      triggerPostVerificationSideEffects(
        input.workspaceId, businessId, task.outcomeId!, input.taskKey,
        verificationClassification as import("@/services/owner-mode/owner-outcome-verification.service").OwnerOutcomeVerificationClass,
        input.actorId ?? "system"
      ).catch((err) => console.error("[phase3] post-verification side effects failed", err));
    });
    return { ok: true, taskId: task.id, status: "OUTCOME_VERIFIED", verificationClassification, selfVerified };
  }

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

  // Fingerprint fields captured from the outer auth check for in-transaction re-verification.
  // The outer check (G2-1..G2-20) provides the primary authorization gate. The fingerprint
  // guard inside the mutation transaction closes the specific race where the GO decision is
  // superseded or its approval package hash changes between the outer check and the DB write.
  let startupFingerprintDecisionId: string | null = null;
  let startupFingerprintHash: string | null = null;
  let startupFingerprintSessionId: string | null = null;
  let startupFingerprintAction: string | null = null;

  switch (input.action) {
    case "START": {
      // Owner-approval work is approved BEFORE it starts (PROPOSED → APPROVED → IN_PROGRESS); START
      // from any pre-approval status would let work begin without the owner's approval.
      if (task.approvalLevel === "OWNER_APPROVAL_REQUIRED") {
        if (task.status !== "APPROVED") return { ok: false, reason: "This task requires owner approval before it can be started.", code: "OWNER_APPROVAL_REQUIRED" };
      } else if (!["PROPOSED", "ACKNOWLEDGED", "NEEDS_DATA", "BLOCKED"].includes(task.status)) return { ok: false, reason: `Cannot start a task that is ${task.status.toLowerCase()}.`, code: "INVALID_TRANSITION" };
      // G3: Startup execution gate — every STARTUP_MODE task must have all three link fields populated.
      // Missing links fail CLOSED — they indicate a misconfigured or bypassed blueprint creation.
      if (task.sourceFamily === "STARTUP_MODE") {
        if (!task.linkedStartupSessionId || !task.linkedStartupBlueprintId || !task.linkedStartupPlanId) {
          return { ok: false, reason: "Startup task is missing required session, blueprint, or plan link — execution blocked.", code: "STARTUP_EXECUTION_LINKAGE_INVALID" };
        }
        const { assertStartupExecutionAuthorization, emitStartupAuthorizationDenied } = await import("@/services/owner-strategy/startup-session.service");
        const planLookup = await (async () => {
          const { db: rawDb } = await import("@/lib/db");
          return rawDb.startupExecutionPlan.findFirst({
            where: { id: task.linkedStartupPlanId!, workspaceId: input.workspaceId },
            select: { ownerDecisionId: true, ideaId: true },
          });
        })();
        if (!planLookup?.ownerDecisionId) {
          return { ok: false, reason: "Startup execution plan not found — cannot authorize task start.", code: "NOT_FOUND_OR_FORBIDDEN" };
        }
        const authResult = await assertStartupExecutionAuthorization(input.workspaceId, {
          sessionId: task.linkedStartupSessionId,
          blueprintId: task.linkedStartupBlueprintId,
          planId: task.linkedStartupPlanId,
          ownerDecisionId: planLookup.ownerDecisionId,
          ideaId: planLookup.ideaId,
          actionType: "START_TASK",
        });
        if (!authResult.authorized) {
          await emitStartupAuthorizationDenied(input.workspaceId, task.linkedStartupSessionId, input.actorId ?? null, "START_TASK", authResult.violations);
          return { ok: false, reason: `Startup execution gate: ${authResult.violations.join("; ")}`, code: "UNAUTHORIZED" };
        }
        // Capture fingerprint for in-transaction re-verification (closes the concurrency race).
        startupFingerprintDecisionId = planLookup.ownerDecisionId;
        startupFingerprintHash = authResult.approvalPackageHash;
        startupFingerprintSessionId = task.linkedStartupSessionId;
        startupFingerprintAction = "START_TASK";
      }
      nextStatus = "IN_PROGRESS";
      if (!task.workStartedAt) data.workStartedAt = deps.now();
      break;
    }
    case "APPROVE":
      if (task.approvalLevel !== "OWNER_APPROVAL_REQUIRED") return { ok: false, reason: "Only an owner-approval task can be approved.", code: "INVALID_TRANSITION" };
      if (input.actorRole !== "owner") return { ok: false, reason: "This action cannot be automated — only the owner can approve it.", code: "OWNER_APPROVAL_REQUIRED" };
      if (!["PROPOSED", "ACKNOWLEDGED", "BLOCKED", "NEEDS_DATA"].includes(task.status)) return { ok: false, reason: `Cannot approve a task that is ${task.status.toLowerCase()}.`, code: "INVALID_TRANSITION" };
      nextStatus = "APPROVED"; break;
    case "REJECT":
      if (isOwnerOnly(task) && input.actorRole !== "owner") return { ok: false, reason: "Only the owner can reject this owner-controlled task.", code: "OWNER_APPROVAL_REQUIRED" };
      if (!input.reason || !input.reason.trim()) return { ok: false, reason: "A reason is required to reject a task.", code: "MISSING_INPUT" };
      nextStatus = "REJECTED"; data.notes = input.reason.trim(); break;
    case "DELEGATE": {
      if (isOwnerOnly(task)) return { ok: false, reason: "An owner-controlled (owner-approval / never-auto) task cannot be delegated.", code: "OWNER_APPROVAL_REQUIRED" };
      if (input.delegateToRole !== "MANAGER" && input.delegateToRole !== "STAFF") return { ok: false, reason: "Delegate target must be MANAGER or STAFF.", code: "MISSING_INPUT" };
      if (!["PROPOSED", "IN_PROGRESS"].includes(task.status)) return { ok: false, reason: `Cannot delegate a task that is ${task.status.toLowerCase()}.`, code: "INVALID_TRANSITION" };
      // Startup execution gate at DELEGATE boundary — same linkage and authorization check as START
      if (task.sourceFamily === "STARTUP_MODE") {
        if (!task.linkedStartupSessionId || !task.linkedStartupBlueprintId || !task.linkedStartupPlanId) {
          return { ok: false, reason: "Startup task is missing required session, blueprint, or plan link — delegation blocked.", code: "STARTUP_EXECUTION_LINKAGE_INVALID" };
        }
        const { assertStartupExecutionAuthorization, emitStartupAuthorizationDenied } = await import("@/services/owner-strategy/startup-session.service");
        const { db: rawDb } = await import("@/lib/db");
        const planLookup = await rawDb.startupExecutionPlan.findFirst({
          where: { id: task.linkedStartupPlanId!, workspaceId: input.workspaceId },
          select: { ownerDecisionId: true, ideaId: true },
        });
        if (!planLookup?.ownerDecisionId) {
          return { ok: false, reason: "Startup execution plan not found — cannot authorize delegation.", code: "NOT_FOUND_OR_FORBIDDEN" };
        }
        const authResult = await assertStartupExecutionAuthorization(input.workspaceId, {
          sessionId: task.linkedStartupSessionId,
          blueprintId: task.linkedStartupBlueprintId,
          planId: task.linkedStartupPlanId,
          ownerDecisionId: planLookup.ownerDecisionId,
          ideaId: planLookup.ideaId,
          actionType: "DELEGATE_TASK",
        });
        if (!authResult.authorized) {
          await emitStartupAuthorizationDenied(input.workspaceId, task.linkedStartupSessionId, input.actorId ?? null, "DELEGATE_TASK", authResult.violations);
          return { ok: false, reason: `Startup execution gate: ${authResult.violations.join("; ")}`, code: "UNAUTHORIZED" };
        }
        // Capture fingerprint for in-transaction re-verification (closes the concurrency race).
        startupFingerprintDecisionId = planLookup.ownerDecisionId;
        startupFingerprintHash = authResult.approvalPackageHash;
        startupFingerprintSessionId = task.linkedStartupSessionId;
        startupFingerprintAction = "DELEGATE_TASK";
      }
      nextStatus = "IN_PROGRESS"; data.actionOwner = input.delegateToRole; break;
    }
    case "SUBMIT_EVIDENCE": {
      const refs = (input.evidenceRefs ?? []).map((e) => e.trim()).filter(Boolean);
      if (refs.length === 0) return { ok: false, reason: "No evidence supplied.", code: "EVIDENCE_REQUIRED" };
      data.evidenceRefs = [...task.evidenceRefs, ...refs];
      // Evidence never starts owner-approval work; it only appends. Other tasks keep PROPOSED → IN_PROGRESS.
      if (task.status === "PROPOSED" && !isApprovalFirst(task)) nextStatus = "IN_PROGRESS";
      break;
    }
    case "MARK_BLOCKED":
      if (isApprovalFirst(task) && task.status !== "IN_PROGRESS") return { ok: false, reason: "An owner-approval task can only be paused once work is in progress.", code: "INVALID_TRANSITION" };
      if (!input.reason || !input.reason.trim()) return { ok: false, reason: "A reason is required to block a task.", code: "MISSING_INPUT" };
      nextStatus = "BLOCKED"; data.notes = input.reason.trim(); break;
    case "REQUEST_MISSING_DATA":
      if (isApprovalFirst(task) && task.status !== "IN_PROGRESS") return { ok: false, reason: "An owner-approval task can only be paused once work is in progress.", code: "INVALID_TRANSITION" };
      nextStatus = "NEEDS_DATA"; break;
  }

  const now = deps.now();
  data.status = nextStatus;
  data.updatedAt = now;

  // In-transaction fingerprint guard: re-checks the GO decision inside the same transaction
  // as the task write. If the decision was superseded or its hash changed between the outer
  // auth check and this transaction, the transaction returns a denial result (no mutations
  // committed). Using a typed return value avoids outer-let mutation that TypeScript's CFA
  // cannot track through async callbacks.
  type TxResult =
    | { denied: true; violations: string[]; sessionId: string; actionType: string }
    | { denied: false };

  const txResult = await deps.db.$transaction(async (tx) => {
    if (startupFingerprintDecisionId !== null && startupFingerprintSessionId !== null) {
      // Pattern A: UPDATE (not SELECT) acquires exclusive row lock on the GO decision inside
      // the task-mutation transaction. A concurrent supersession or hash change between the
      // outer auth check and this transaction would cause count=0 → deny. A read-only findFirst
      // cannot close this race; the UPDATE makes the check-and-lock atomic.
      const decisionGuard = await tx.startupOwnerDecision.updateMany({
        where: {
          id: startupFingerprintDecisionId,
          workspaceId: input.workspaceId,
          supersededById: null,
          ...(startupFingerprintHash !== null ? { packageHashSha256: startupFingerprintHash } : {}),
        },
        data: { workspaceId: input.workspaceId }, // no-op: acquires exclusive row lock
      });
      if (decisionGuard.count === 0) {
        return {
          denied: true as const,
          violations: ["Startup authorization invalidated: GO decision was superseded or approval package changed concurrently — retry after reapproval"],
          sessionId: startupFingerprintSessionId,
          actionType: startupFingerprintAction ?? "UNKNOWN",
        } satisfies TxResult;
      }
    }
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
    return { denied: false as const } satisfies TxResult;
  });

  if (txResult.denied) {
    // Denial event emitted outside the transaction so it always persists.
    const { emitStartupAuthorizationDenied } = await import("@/services/owner-strategy/startup-session.service");
    await emitStartupAuthorizationDenied(
      input.workspaceId,
      txResult.sessionId,
      input.actorId ?? null,
      txResult.actionType,
      txResult.violations,
    );
    return { ok: false, reason: `Startup execution gate: ${txResult.violations.join("; ")}`, code: "UNAUTHORIZED" };
  }
  return { ok: true, taskId: task.id, status: nextStatus };
}
