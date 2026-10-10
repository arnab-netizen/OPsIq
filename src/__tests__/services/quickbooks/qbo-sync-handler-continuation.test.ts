/**
 * The qbo-read-sync scheduler handler: a CONTINUING outcome queues the follow-up, and a failure to queue it never fails (and re-runs) a
 * healthy execution. The sync service and the enqueue helper are replaced - this test is about the handler's mapping only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const runScheduledQboSync = vi.fn();
const enqueueQboSyncContinuation = vi.fn();

vi.mock("@/services/quickbooks/qbo-sync.service", () => ({ runScheduledQboSync }));
vi.mock("@/infra/qbo-sync-tasks", () => ({ TASK_NAME_QBO_READ_SYNC: "qbo-read-sync", enqueueQboSyncContinuation }));

const counts = { fetched: {}, inserted: 4, updated: 1, unchanged: 0, skipped: 0, reportsStored: 0, reportsChanged: 0, reportsFailed: 0, pages: 3, tieBucketsClosed: 0, verifiedByRead: 0, unresolved: 0 };
const continuing = { status: "CONTINUING", runId: "r1", mode: "FULL", changed: true, counts, continuationKey: "sync:5:2" };
const ctx = { workspaceId: "ws-1", signal: new AbortController().signal } as never;

async function handler() {
  const { getProductionTaskHandlers } = await import("@/infra/scheduler-handlers");
  const h = getProductionTaskHandlers().get("qbo-read-sync");
  if (!h) throw new Error("handler not registered");
  return h;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("qbo-read-sync handler", () => {
  it("CONTINUING with a successful enqueue is SUCCESS and queues exactly the checkpoint's follow-up", async () => {
    runScheduledQboSync.mockResolvedValue(continuing);
    enqueueQboSyncContinuation.mockResolvedValue(true);
    const res = await (await handler())({ connectionId: "conn-1" }, ctx);
    expect(res).toMatchObject({ status: "SUCCESS" });
    expect(enqueueQboSyncContinuation).toHaveBeenCalledWith({ workspaceId: "ws-1", connectionId: "conn-1", continuationKey: "sync:5:2" });
  });

  it("CONTINUING whose enqueue THROWS does not throw (no re-run of a healthy execution): PARTIAL_FAILURE naming the daily producer", async () => {
    runScheduledQboSync.mockResolvedValue(continuing);
    enqueueQboSyncContinuation.mockRejectedValue(new Error("db blip"));
    const res = await (await handler())({ connectionId: "conn-1" }, ctx);
    expect(res).toMatchObject({ status: "PARTIAL_FAILURE" });
    expect(JSON.stringify(res)).toContain("daily producer");
    expect(JSON.stringify(res)).not.toContain("db blip");
  });

  it("the handler passes a wall-clock deadline to the sync, and takes the workspace only from the claimed task context", async () => {
    runScheduledQboSync.mockResolvedValue({ status: "NOT_DUE", nextAttemptNotBefore: new Date() });
    await (await handler())({ connectionId: "conn-9", workspaceId: "ws-evil" }, ctx);
    const [input, deps] = runScheduledQboSync.mock.calls[0];
    expect(input).toMatchObject({ workspaceId: "ws-1", connectionId: "conn-9" });
    expect(deps.deadlineMs).toBeGreaterThan(0);
  });

  it("FAILED and skipped outcomes map to PARTIAL_FAILURE / NO_WORK without queuing anything", async () => {
    runScheduledQboSync.mockResolvedValue({ status: "FAILED", runId: null, code: "PROVIDER_UNAVAILABLE", terminal: false, nextAttemptNotBefore: null });
    expect(await (await handler())({ connectionId: "c" }, ctx)).toMatchObject({ status: "PARTIAL_FAILURE" });
    runScheduledQboSync.mockResolvedValue({ status: "BUSY", runId: null, leaseExpiresAt: null });
    expect(await (await handler())({ connectionId: "c" }, ctx)).toMatchObject({ status: "NO_WORK" });
    expect(enqueueQboSyncContinuation).not.toHaveBeenCalled();
  });
});
