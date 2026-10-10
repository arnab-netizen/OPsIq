/**
 * QBO producer backlog / truncation signal (RC13), DB-free: the scan result states when it stopped at its page cap, how many
 * connections were skipped because they already have an open task, and the open backlog.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ list: vi.fn(), findMany: vi.fn(), count: vi.fn(), schedule: vi.fn(), cont: vi.fn() }));
vi.mock("@/lib/db", () => {
  const fakeDb = { scheduledTask: { findMany: m.findMany, count: m.count } };
  return { db: fakeDb, getDbInstance: () => fakeDb };
});
vi.mock("@/infra/scheduler", () => ({ DatabaseSchedulerProvider: class { scheduleIdempotent = m.schedule; } }));
vi.mock("@/infra/scheduler-handlers", () => ({
  TASK_NAME_ALERT_EMAIL_RETRY: "a", TASK_NAME_FINANCE_LEARNING_BRIDGE: "b", TASK_NAME_REASSESSMENT_SCAN: "c", TASK_NAME_RISK_REVIEW_SCAN: "d",
}));
vi.mock("@/infra/qbo-sync-tasks", () => ({ TASK_NAME_QBO_READ_SYNC: "qbo-read-sync", enqueueQboSyncContinuation: m.cont }));
vi.mock("@/services/quickbooks/qbo-sync-store.service", () => ({ listSchedulableConnections: m.list }));

import { enqueueDueQboReadSyncTasks } from "@/services/scheduler/scheduler-producers";

const ENV = { QUICKBOOKS_CLIENT_ID: "cid", QUICKBOOKS_CLIENT_SECRET: "sec", QUICKBOOKS_REDIRECT_URI: "https://app.example.com/cb", QUICKBOOKS_ENVIRONMENT: "sandbox" };
const conn = (i: number) => ({ connectionId: `c${i}`, workspaceId: `w${i % 7}`, businessId: `b${i}`, continuationKey: null });
const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => conn(from + i));

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.findMany.mockResolvedValue([]);
  m.count.mockResolvedValue(0);
  m.schedule.mockResolvedValue({ id: "t", created: true });
  m.cont.mockResolvedValue(true);
});

describe("QBO producer scan result", () => {
  it("reports truncation when the page cap is reached with a still-full page", async () => {
    m.list.mockImplementation(async (i: { offset: number }) => page(i.offset, 200));
    const r = await enqueueDueQboReadSyncTasks(ENV);
    expect(m.list).toHaveBeenCalledTimes(10);
    expect(r).toMatchObject({ candidatesFound: 2000, enqueued: 2000, truncated: true });
  });

  it("is not truncated when the scan ends on a short page", async () => {
    m.list.mockResolvedValueOnce(page(0, 200)).mockResolvedValueOnce(page(200, 3));
    const r = await enqueueDueQboReadSyncTasks(ENV);
    expect(r).toMatchObject({ candidatesFound: 203, truncated: false });
  });

  it("skips connections that already have a pending / running task and reports the open backlog", async () => {
    m.list.mockResolvedValueOnce(page(0, 5));
    m.findMany.mockResolvedValue([{ payload: { connectionId: "c1", trigger: "SCHEDULED" } }, { payload: { connectionId: "c3" } }, { payload: null }, { payload: { connectionId: "not-a-candidate" } }]);
    m.count.mockResolvedValue(42);
    const r = await enqueueDueQboReadSyncTasks(ENV);
    expect(r).toEqual({ candidatesFound: 5, enqueued: 3, skippedOpenTask: 2, truncated: false, openTasks: 42 });
    expect(m.schedule).toHaveBeenCalledTimes(3);
    const queued = m.schedule.mock.calls.map((c: unknown[]) => (c[0] as { payload: { connectionId: string } }).payload.connectionId).sort();
    expect(queued).toEqual(["c0", "c2", "c4"]);
  });

  it("an unconfigured deployment does nothing and says so", async () => {
    expect(await enqueueDueQboReadSyncTasks({})).toEqual({ candidatesFound: 0, enqueued: 0, skippedOpenTask: 0, truncated: false, openTasks: 0 });
    expect(m.list).not.toHaveBeenCalled();
  });

  it("an optional workspace scope is passed to the connection listing and the backlog count", async () => {
    m.list.mockResolvedValueOnce([]);
    await enqueueDueQboReadSyncTasks(ENV, { onlyWorkspaceIds: ["w1"] });
    expect(m.list).toHaveBeenCalledWith(expect.objectContaining({ onlyWorkspaceIds: ["w1"] }));
    expect(m.count).toHaveBeenCalledWith({ where: expect.objectContaining({ workspaceId: { in: ["w1"] } }) });
  });
});
