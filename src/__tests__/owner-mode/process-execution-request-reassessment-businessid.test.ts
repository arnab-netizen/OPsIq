/**
 * applyProcessExecutionAction — REQUEST_REASSESSMENT businessId guardrails (PR H).
 *
 * Mocked-DB unit tests (no real Postgres — pattern mirrors phase3-task-lifecycle.test.ts)
 * proving the server side of the REQUEST_REASSESSMENT business-context contract that
 * OwnerCockpitPage's `onAction()` must satisfy:
 *   1. businessId is required unconditionally (process-execution-bridge.service.ts ~line 608-609).
 *   2. A businessId from another workspace is rejected (WRONG_WORKSPACE) — never persisted.
 *   3. A businessId that does not match the task's own businessId is rejected as not-found
 *      (defense-in-depth — never reveals cross-business existence).
 *   4. A correct, in-workspace businessId succeeds, calls createReassessmentEvent with that
 *      businessId, and stamps it onto the task's reassessmentId.
 *
 * createReassessmentEvent itself (the row + its OWNER_REASSESSMENT_CREATED audit event, written
 * atomically) is already covered by reassessment-event.service.test.ts and by the real-DB
 * REQUEST_REASSESSMENT case in process-execution-affordances.db.test.ts; it is mocked here so
 * these tests isolate applyProcessExecutionAction's OWN guardrails (the actual root-cause
 * surface for this PR) from that service's internals.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateReassessmentEvent = vi.fn();
vi.mock("@/services/owner-mode/reassessment-event.service", () => ({
  createReassessmentEvent: (...a: unknown[]) => mockCreateReassessmentEvent(...a),
}));

import { applyProcessExecutionAction, type ProcessBridgeDb } from "@/services/owner-mode/process-execution-bridge.service";

const WS_A = "aaaaaaaa-aaaa-4000-8000-000000000001";
const BIZ_A = "cccccccc-cccc-4000-8000-000000000003";
const BIZ_FOREIGN = "dddddddd-dddd-4000-8000-000000000004";
const BIZ_OTHER_IN_WS = "eeeeeeee-eeee-4000-8000-000000000005";
const ACTOR = "actor-owner-1";
const TASK_KEY = "pc:corr-1";

function baseTask(over: Record<string, unknown> = {}) {
  return {
    id: "task-uuid-1",
    workspaceId: WS_A,
    businessId: null,
    taskKey: TASK_KEY,
    status: "IN_PROGRESS",
    executionRoute: "CREATE_CORRECTION_TASK",
    sourceFindingKey: "corr-1",
    ...over,
  };
}

function makeDb(over: { task?: Record<string, unknown> | null; ownerBusinessIds?: string[] } = {}) {
  const task = over.task === undefined ? baseTask() : over.task;
  const ownerBusinessIds = over.ownerBusinessIds ?? [BIZ_A, BIZ_OTHER_IN_WS];
  return {
    processExecutionTask: {
      findFirst: vi.fn(async () => task),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    ownerBusiness: {
      // Mirrors businessInWorkspace(): only resolves for a business that is BOTH the right id
      // AND in the right workspace (WS_A here — a WS_B-scoped id can never match).
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceId: string } }) =>
        ownerBusinessIds.includes(where.id) && where.workspaceId === WS_A ? { id: where.id } : null
      ),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateReassessmentEvent.mockResolvedValue({
    id: "re-generated-1",
    workspaceId: WS_A,
    businessId: BIZ_A,
    trigger: "owner_dispute",
    status: "pending",
    sourceProofId: null,
    outcomeId: null,
    createdAt: new Date("2026-09-17T00:00:00Z"),
    deduped: false,
  });
});

describe("REQUEST_REASSESSMENT — module contract assertions", () => {
  it("applyProcessExecutionAction is a function", () => { expect(typeof applyProcessExecutionAction).toBe("function"); });
  it("mockCreateReassessmentEvent is a function", () => { expect(typeof mockCreateReassessmentEvent).toBe("function"); });
});

describe("REQUEST_REASSESSMENT business-context guardrails", () => {
  it("rejects with MISSING_INPUT when no businessId is supplied (the original defect's mechanism)", async () => {
    const db = makeDb();
    const result = await applyProcessExecutionAction(
      { workspaceId: WS_A, actorId: ACTOR, actorRole: "owner", taskKey: TASK_KEY, action: "REQUEST_REASSESSMENT", businessId: null },
      { db: db as unknown as ProcessBridgeDb, uuid: () => "u1", now: () => new Date("2026-09-17T00:00:00Z") }
    );
    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("MISSING_INPUT");
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("rejects a foreign businessId (a different workspace's business) with WRONG_WORKSPACE and never opens a reassessment", async () => {
    const db = makeDb();
    const result = await applyProcessExecutionAction(
      { workspaceId: WS_A, actorId: ACTOR, actorRole: "owner", taskKey: TASK_KEY, action: "REQUEST_REASSESSMENT", businessId: BIZ_FOREIGN },
      { db: db as unknown as ProcessBridgeDb, uuid: () => "u1", now: () => new Date("2026-09-17T00:00:00Z") }
    );
    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("WRONG_WORKSPACE");
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("rejects a businessId that does not match the task's own businessId (mismatched task/business pairing)", async () => {
    const db = makeDb({ task: baseTask({ businessId: BIZ_A }) });
    const result = await applyProcessExecutionAction(
      // BIZ_OTHER_IN_WS is a real business in the same workspace, but not the one this task belongs to.
      { workspaceId: WS_A, actorId: ACTOR, actorRole: "owner", taskKey: TASK_KEY, action: "REQUEST_REASSESSMENT", businessId: BIZ_OTHER_IN_WS },
      { db: db as unknown as ProcessBridgeDb, uuid: () => "u1", now: () => new Date("2026-09-17T00:00:00Z") }
    );
    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("succeeds with a correct, in-workspace businessId: opens a reassessment and stamps it onto the task", async () => {
    const db = makeDb({ task: baseTask({ businessId: BIZ_A }) });
    const result = await applyProcessExecutionAction(
      { workspaceId: WS_A, actorId: ACTOR, actorRole: "owner", taskKey: TASK_KEY, action: "REQUEST_REASSESSMENT", businessId: BIZ_A, reason: "the fix did not hold" },
      { db: db as unknown as ProcessBridgeDb, uuid: () => "u1", now: () => new Date("2026-09-17T00:00:00Z") }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reassessmentId).toBe("re-generated-1");
    expect(mockCreateReassessmentEvent).toHaveBeenCalledTimes(1);
    const call = mockCreateReassessmentEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(call.workspaceId).toBe(WS_A);
    expect(call.businessId).toBe(BIZ_A);
    expect(call.trigger).toBe("owner_dispute");
    expect(db.processExecutionTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: WS_A, taskKey: TASK_KEY },
        data: expect.objectContaining({ reassessmentId: "re-generated-1" }),
      })
    );
  });

  it("succeeds even on a task with no businessId of its own (workspace-level task), when a valid businessId is supplied", async () => {
    const db = makeDb({ task: baseTask({ businessId: null }) });
    const result = await applyProcessExecutionAction(
      { workspaceId: WS_A, actorId: ACTOR, actorRole: "owner", taskKey: TASK_KEY, action: "REQUEST_REASSESSMENT", businessId: BIZ_A },
      { db: db as unknown as ProcessBridgeDb, uuid: () => "u1", now: () => new Date("2026-09-17T00:00:00Z") }
    );
    expect(result.ok).toBe(true);
    expect(mockCreateReassessmentEvent).toHaveBeenCalledTimes(1);
  });
});
