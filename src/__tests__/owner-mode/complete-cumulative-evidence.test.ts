/**
 * completeProcessTask — cumulative evidence contract (regression).
 *
 * ROOT CAUSE this proves fixed: the evidence-required completion gate in
 * process-execution-bridge.service.ts (`completeProcessTask`) counted ONLY the evidenceRefs supplied on
 * the CURRENT request against `task.requiredEvidence.length`, ignoring evidence already persisted on the
 * task (e.g. from an earlier SUBMIT_EVIDENCE call, or attached when the route was created). This is
 * inconsistent with how "is evidence complete" is computed everywhere else it's displayed
 * (owner-now-view.service.ts's `evidenceComplete`: cumulative `task.evidenceRefs.length >=
 * task.requiredEvidence.length`), and it broke completion for any route requiring more than one distinct
 * evidence item (e.g. CREATE_SOP_CHECKLIST_TASK, which requires both "the drafted SOP/checklist change"
 * and "evidence of adoption before it is marked done" — see evidenceForRoute in
 * process-execution-bridge-expansion.ts):
 *   - A single, valid, inline evidence entry on Complete was rejected with EVIDENCE_REQUIRED even though
 *     the owner genuinely entered evidence in the Complete UI (the live production report this fixes).
 *   - Evidence already submitted through the separate Submit evidence workflow never counted toward
 *     completion at all, forcing the owner to re-supply it (or enough of it) inline on every Complete
 *     attempt.
 *
 * This is NOT the PR #491 detectFakeCompletion OR/AND bug — that guard (verification-engine.ts) is
 * unchanged and confirmed fixed (AND, not OR); these tests exercise the evidence-COUNT gate that sits
 * before it.
 *
 * CI-CONFIRMED REGRESSION IN THE FIRST VERSION OF THIS FIX (LANE_B / Local Postgres, 4 files / 8 tests
 * red) and its correction: the first cut of the cumulative-evidence gate above unioned
 * `task.evidenceRefs` straight from the persisted row without checking what was IN that row for a
 * freshly-created (still-PROPOSED) task. In real, DB-persisted tasks (never in this file's mocks, which
 * is exactly why these mocks did not catch it), `task.evidenceRefs` is NOT `[]` from birth — it used to
 * be seeded, at route-creation time, from the route's OWN `evidenceRefs` field: the finding's
 * supportingProofIds/supportingAdjudicationIds/supportingOperationalEventIds/supportingEscalationIds,
 * concatenated (see bridgeCorrection/bridgeWorkloadFinding/etc. in process-execution-bridge.ts and
 * process-execution-bridge-expansion.ts). That is supporting proof for why the FINDING was raised —
 * never proof the corrective TASK itself was completed — but it is non-empty for essentially every real
 * finding (every DB test fixture in this repo sets at least one supportingProofIds entry). Unioning it
 * into the completion-evidence count meant a route requiring only 1–2 evidence items was frequently
 * already "satisfied" by that seed alone, the instant the task was created, before the owner ever
 * submitted a single real piece of evidence:
 *   - `completeProcessTask` with `evidenceRefs: []` on a brand-new task WRONGLY SUCCEEDED (should reject).
 *   - Once one such task was wrongly auto-completed, a later test asserting it was still open failed too
 *     (state pollution — not a second, independent bug).
 *   - The one true accumulation-success case (SUBMIT_EVIDENCE, then COMPLETE with the remaining item)
 *     then wrongly FAILED, because the earlier wrongful completion had already consumed the task.
 *
 * THE FIX: `routeToData()` (persistProcessExecutionRoutes, in process-execution-bridge.service.ts) now
 * always persists `evidenceRefs: []` for a task it creates or re-syncs — it never seeds it from the
 * route's own `evidenceRefs` — so the union in `completeProcessTask` below only ever combines genuine
 * completion evidence (this request's, plus whatever SUBMIT_EVIDENCE/RECORD_PROGRESS already added). The
 * "persistProcessExecutionRoutes never seeds evidenceRefs from the route" describe block below proves
 * that directly (mocked, no DB), and reproduces the exact CI failure shape end-to-end: a route carrying
 * non-empty `evidenceRefs` (the old seed) that would, uncorrected, have already met `requiredEvidence`.
 */
import { describe, it, expect, vi } from "vitest";
import {
  completeProcessTask, persistProcessExecutionRoutes,
  type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import type { BridgedExecutionRoute, ProcessExecutionBridgeAnalysis } from "@/domain/owner-mode/process-execution-bridge";

function baseTask(over: Record<string, unknown> = {}) {
  return {
    id: "task-uuid-1",
    workspaceId: "ws-1",
    taskKey: "sop:c-checklist",
    status: "PROPOSED",
    executionRoute: "CREATE_SOP_CHECKLIST_TASK",
    approvalLevel: "MANAGER_APPROVAL_REQUIRED",
    requiredEvidence: ["the drafted SOP/checklist change", "evidence of adoption before it is marked done"],
    evidenceRefs: [] as string[],
    ...over,
  };
}

function makeDeps(task: Record<string, unknown>): { deps: ProcessBridgeDeps; updateManyTask: ReturnType<typeof vi.fn> } {
  const findFirstTask = vi.fn(async () => task);
  const updateManyTask = vi.fn(async () => ({ count: 1 }));
  const createAudit = vi.fn(async () => ({ id: "audit-1" }));
  const db = {
    processExecutionTask: { findFirst: findFirstTask, updateMany: updateManyTask },
    auditEvent: { create: createAudit },
    ownerBusiness: { findFirst: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        processExecutionTask: { findFirst: findFirstTask, updateMany: updateManyTask },
        auditEvent: { create: createAudit },
      }),
    ),
  } as unknown as ProcessBridgeDb;
  return { deps: { db, uuid: () => "uuid-1", now: () => new Date("2026-09-17T00:00:00.000Z") }, updateManyTask };
}

describe("completeProcessTask — cumulative evidence gate (Complete + evidence UX/API contract fix)", () => {
  it("COMPLETE with sufficient inline evidence in a single request succeeds (one-step Complete, PR #491's contract)", async () => {
    const task = baseTask();
    const { deps, updateManyTask } = makeDeps(task);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", actorId: "mgr-1", actorRole: "manager", taskKey: "sop:c-checklist",
        evidenceRefs: ["drafted checklist v2", "adoption confirmed by 3 staff"] },
      deps,
    );
    expect(res.ok).toBe(true);
    const writeData = updateManyTask.mock.calls[0][0].data;
    expect(writeData.status).toBe("COMPLETED");
    expect(writeData.evidenceRefs).toEqual(["drafted checklist v2", "adoption confirmed by 3 staff"]);
  });

  it("COMPLETE with fewer inline evidence items than the route requires, and NOTHING already on file, is still rejected (requirement not weakened)", async () => {
    const task = baseTask({ evidenceRefs: [] });
    const { deps, updateManyTask } = makeDeps(task);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", actorId: "mgr-1", actorRole: "manager", taskKey: "sop:c-checklist",
        evidenceRefs: ["only one item"] },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("EVIDENCE_REQUIRED");
    expect(updateManyTask).not.toHaveBeenCalled();
  });

  it("evidence already submitted via a separate step (persisted on the task) counts toward completion — Complete with no new evidence now succeeds", async () => {
    const task = baseTask({ evidenceRefs: ["drafted checklist v2", "adoption confirmed by 3 staff"] });
    const { deps, updateManyTask } = makeDeps(task);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", actorId: "mgr-1", actorRole: "manager", taskKey: "sop:c-checklist", evidenceRefs: [] },
      deps,
    );
    expect(res.ok).toBe(true);
    const writeData = updateManyTask.mock.calls[0][0].data;
    expect(writeData.evidenceRefs).toEqual(["drafted checklist v2", "adoption confirmed by 3 staff"]);
  });

  it("evidence already submitted separately PLUS one new inline item together satisfy a 2-item route", async () => {
    const task = baseTask({ evidenceRefs: ["drafted checklist v2"] });
    const { deps, updateManyTask } = makeDeps(task);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", actorId: "mgr-1", actorRole: "manager", taskKey: "sop:c-checklist",
        evidenceRefs: ["adoption confirmed by 3 staff"] },
      deps,
    );
    expect(res.ok).toBe(true);
    const writeData = updateManyTask.mock.calls[0][0].data;
    expect(writeData.evidenceRefs).toEqual(["drafted checklist v2", "adoption confirmed by 3 staff"]);
  });

  it("evidence persists exactly once — resubmitting the same evidence reference inline does not duplicate it", async () => {
    const task = baseTask({ evidenceRefs: ["drafted checklist v2", "adoption confirmed by 3 staff"] });
    const { deps, updateManyTask } = makeDeps(task);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", actorId: "mgr-1", actorRole: "manager", taskKey: "sop:c-checklist",
        evidenceRefs: ["drafted checklist v2"] }, // same ref already on file, resent
      deps,
    );
    expect(res.ok).toBe(true);
    const writeData = updateManyTask.mock.calls[0][0].data;
    expect(writeData.evidenceRefs).toEqual(["drafted checklist v2", "adoption confirmed by 3 staff"]);
    expect(writeData.evidenceRefs.filter((r: string) => r === "drafted checklist v2")).toHaveLength(1);
  });

  it("COMPLETE with no evidence at all (none on file, none supplied) is still a governed rejection", async () => {
    const task = baseTask({ evidenceRefs: [] });
    const { deps, updateManyTask } = makeDeps(task);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", actorId: "mgr-1", actorRole: "manager", taskKey: "sop:c-checklist", evidenceRefs: [] },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("EVIDENCE_REQUIRED");
    expect(updateManyTask).not.toHaveBeenCalled();
  });

  it("duplicate COMPLETE on an already-completed task is rejected as an invalid transition, unchanged", async () => {
    const task = baseTask({ status: "COMPLETED", evidenceRefs: ["drafted checklist v2", "adoption confirmed by 3 staff"] });
    const { deps, updateManyTask } = makeDeps(task);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", actorId: "mgr-1", actorRole: "manager", taskKey: "sop:c-checklist", evidenceRefs: ["new evidence"] },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INVALID_TRANSITION");
    expect(updateManyTask).not.toHaveBeenCalled();
  });

  it("a businessId from another workspace is rejected before any evidence check runs, unchanged", async () => {
    const task = baseTask({ evidenceRefs: ["drafted checklist v2", "adoption confirmed by 3 staff"] });
    const { deps, updateManyTask } = makeDeps(task);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", businessId: "foreign-biz", actorId: "mgr-1", actorRole: "manager", taskKey: "sop:c-checklist", evidenceRefs: [] },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WRONG_WORKSPACE");
    expect(updateManyTask).not.toHaveBeenCalled();
  });

  it("single-evidence-item routes (e.g. a plain correction task) are unaffected — one inline item still completes it", async () => {
    const task = baseTask({
      taskKey: "pc:c-review", executionRoute: "CREATE_CORRECTION_TASK",
      requiredEvidence: ["evidence the correction was carried out"], evidenceRefs: [],
    });
    const { deps, updateManyTask } = makeDeps(task);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", actorId: "mgr-1", actorRole: "manager", taskKey: "pc:c-review", evidenceRefs: ["fixed the press step"] },
      deps,
    );
    expect(res.ok).toBe(true);
    expect(updateManyTask.mock.calls[0][0].data.evidenceRefs).toEqual(["fixed the press step"]);
  });
});

// ── Regression root cause: routeToData() must never seed the persisted evidenceRefs from the route's own
// evidenceRefs (supporting-proof IDs for the underlying finding). See the header comment above for the
// full CI-confirmed-regression story. These tests are DB-free (mocked Prisma delegates) and directly
// prove the fix that closes the gap the mocked tests above could not see on their own, since none of them
// model a task the way persistProcessExecutionRoutes actually creates one. ──────────────────────────────

function makeRoute(over: Partial<BridgedExecutionRoute> & { taskKey: string }): BridgedExecutionRoute {
  return {
    workspaceId: "ws-1", businessId: null, sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-review",
    executionRoute: "CREATE_CORRECTION_TASK", actionOwner: "MANAGER", approvalLevel: "MANAGER_APPROVAL_REQUIRED",
    requiredEvidence: ["evidence the correction was carried out"], completionCriteria: "done",
    reassessmentTrigger: "re-check", riskIfIgnored: "risk", ownerVisibleSummary: "Fix it",
    notActionableReason: null, evidenceRefs: [], severity: "HIGH", priorityRank: 1, status: "PROPOSED", canStart: true,
    ...over,
  };
}

function analysisOf(route: BridgedExecutionRoute): ProcessExecutionBridgeAnalysis {
  return {
    workspaceId: route.workspaceId, routes: [route], topRoute: route,
    summary: { total: 1, ownerApproval: 0, managerStaff: 1, dataTasks: 0, monitorOnly: 0 },
    evaluatedAt: "2026-09-17T00:00:00.000Z",
  };
}

function makePersistDeps(existingTask: Record<string, unknown> | null): {
  deps: ProcessBridgeDeps; createTask: ReturnType<typeof vi.fn>; updateManyTask: ReturnType<typeof vi.fn>;
} {
  const findFirstTask = vi.fn(async () => existingTask);
  const createTask = vi.fn(async () => ({ id: "task-uuid-new" }));
  const updateManyTask = vi.fn(async () => ({ count: 1 }));
  const createAudit = vi.fn(async () => ({ id: "audit-1" }));
  const db = {
    processExecutionTask: { findFirst: findFirstTask, create: createTask, updateMany: updateManyTask },
    auditEvent: { create: createAudit },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        processExecutionTask: { findFirst: findFirstTask, create: createTask, updateMany: updateManyTask },
        auditEvent: { create: createAudit },
      }),
    ),
  } as unknown as ProcessBridgeDb;
  return { deps: { db, uuid: () => "uuid-persist-1", now: () => new Date("2026-09-17T00:00:00.000Z") }, createTask, updateManyTask };
}

describe("persistProcessExecutionRoutes — evidenceRefs seeding (regression root cause)", () => {
  it("CREATE: never seeds the persisted evidenceRefs from the route's own evidenceRefs, even when the route carries supporting-proof IDs", async () => {
    // Exactly the shape every real DB test fixture in this repo uses: supportingProofIds/etc. concatenated
    // into the route's evidenceRefs by the domain bridge, 2 items, against a 1-item requirement.
    const route = makeRoute({ taskKey: "pc:c-review", evidenceRefs: ["p1", "e1"] });
    const { deps, createTask } = makePersistDeps(null);
    const result = await persistProcessExecutionRoutes("ws-1", analysisOf(route), "actor-1", deps);
    expect(result.created).toBe(1);
    expect(createTask).toHaveBeenCalledTimes(1);
    const writtenData = createTask.mock.calls[0][0].data as Record<string, unknown>;
    expect(writtenData.evidenceRefs).toEqual([]);
    // Only evidenceRefs (the seed) is stripped -- requiredEvidence (what completion actually needs) is untouched.
    expect(writtenData.requiredEvidence).toEqual(["evidence the correction was carried out"]);
  });

  it("UPDATE (re-sync of a still-PROPOSED task whose route changed): also never reseeds evidenceRefs from the route", async () => {
    const existing = {
      id: "task-uuid-1", workspaceId: "ws-1", taskKey: "pc:c-review", status: "PROPOSED",
      executionRoute: "CREATE_CORRECTION_TASK", actionOwner: "MANAGER", approvalLevel: "MANAGER_APPROVAL_REQUIRED",
      ownerVisibleSummary: "Fix it (old)", requiredEvidence: ["old requirement"], businessId: null,
    };
    // requiredEvidence differs from `existing` -> `changed` is true -> the update path actually runs.
    const route = makeRoute({ taskKey: "pc:c-review", evidenceRefs: ["p1"], requiredEvidence: ["new requirement"] });
    const { deps, updateManyTask } = makePersistDeps(existing);
    const result = await persistProcessExecutionRoutes("ws-1", analysisOf(route), "actor-1", deps);
    expect(result.updated).toBe(1);
    const writtenData = updateManyTask.mock.calls[0][0].data as Record<string, unknown>;
    expect(writtenData.evidenceRefs).toEqual([]);
  });

  it("END-TO-END REGRESSION PROOF: a route whose own evidenceRefs alone would already meet requiredEvidence.length still persists a task that correctly rejects completion with zero evidence", async () => {
    // Reproduces the exact CI failure shape from process-correction-execution-bridge.db.test.ts's
    // "a task cannot complete without required evidence": 2 seed items (supportingProofIds +
    // supportingOperationalEventIds), 1-item requirement. Under the regressed union
    // (`[...task.evidenceRefs, ...evidenceRefs]` seeded from the route), this seed ALONE already meets
    // requiredEvidence.length -- completeProcessTask would wrongly succeed with evidenceRefs: [].
    const route = makeRoute({
      taskKey: "pc:c-review", evidenceRefs: ["p1", "e1"],
      requiredEvidence: ["evidence the correction was carried out"],
    });
    const { deps: persistDeps, createTask } = makePersistDeps(null);
    await persistProcessExecutionRoutes("ws-1", analysisOf(route), "actor-1", persistDeps);
    const persistedData = createTask.mock.calls[0][0].data as Record<string, unknown>;

    // Read back exactly what was persisted (not hand-picked) and feed it into completeProcessTask, the
    // same way a real findFirst() would on the next request.
    const persistedTask = {
      id: "task-uuid-new", status: "PROPOSED", executionRoute: route.executionRoute, approvalLevel: route.approvalLevel,
      requiredEvidence: persistedData.requiredEvidence, evidenceRefs: persistedData.evidenceRefs,
    };
    const { deps: completeDeps, updateManyTask } = makeDeps(persistedTask);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", actorId: "mgr-1", actorRole: "manager", taskKey: "pc:c-review", evidenceRefs: [] },
      completeDeps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("EVIDENCE_REQUIRED");
    expect(updateManyTask).not.toHaveBeenCalled();
  });

  it("END-TO-END: once genuine evidence is supplied on COMPLETE, the same persisted (seed-free) task completes normally", async () => {
    const route = makeRoute({ taskKey: "pc:c-review", evidenceRefs: ["p1", "e1"], requiredEvidence: ["evidence the correction was carried out"] });
    const { deps: persistDeps, createTask } = makePersistDeps(null);
    await persistProcessExecutionRoutes("ws-1", analysisOf(route), "actor-1", persistDeps);
    const persistedData = createTask.mock.calls[0][0].data as Record<string, unknown>;
    const persistedTask = {
      id: "task-uuid-new", status: "PROPOSED", executionRoute: route.executionRoute, approvalLevel: route.approvalLevel,
      requiredEvidence: persistedData.requiredEvidence, evidenceRefs: persistedData.evidenceRefs,
    };
    const { deps: completeDeps, updateManyTask } = makeDeps(persistedTask);
    const res = await completeProcessTask(
      { workspaceId: "ws-1", actorId: "mgr-1", actorRole: "manager", taskKey: "pc:c-review", evidenceRefs: ["fixed the press step"] },
      completeDeps,
    );
    expect(res.ok).toBe(true);
    // The persisted evidenceRefs is exactly the genuine evidence -- the old seed ("p1", "e1") never leaks in.
    expect(updateManyTask.mock.calls[0][0].data.evidenceRefs).toEqual(["fixed the press step"]);
  });
});
