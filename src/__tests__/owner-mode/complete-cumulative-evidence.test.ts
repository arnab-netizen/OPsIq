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
 */
import { describe, it, expect, vi } from "vitest";
import { completeProcessTask, type ProcessBridgeDb, type ProcessBridgeDeps } from "@/services/owner-mode/process-execution-bridge.service";

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
