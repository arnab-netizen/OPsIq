/**
 * The after-response sync accelerator must never START a pass it cannot finish: the function is killed at maxDuration, and a killed
 * pass strands its task lease (and the per-connection lock) until the next cron drain. Stopping early is always safe because the
 * handler has already enqueued the durable continuation task.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  now: 0,
  passMs: 0,
  cursor: null as Date | null,
  processed: [] as string[],
  enqueued: [] as string[],
}));

vi.mock("@/lib/db", () => {
  const mockDb = { qboSyncState: { findFirst: vi.fn(async () => ({ baselineCursor: h.cursor, baselineCompletedAt: null })) } };
  return { db: mockDb, getDbInstance: () => mockDb };
});
vi.mock("@/infra/scheduler", () => ({
  DatabaseSchedulerProvider: class {
    async processTaskById(id: string) { h.processed.push(id); h.now += h.passMs; return true; }
  },
}));
vi.mock("@/infra/scheduler-handlers", () => ({ getProductionTaskHandlers: () => new Map() }));
vi.mock("@/infra/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/quickbooks/qbo-sync-scheduling", () => ({
  qboSyncKey: (_c: string, kind: string, _n: Date, extra = "") => `${kind}:${extra}`,
  enqueueQboSync: vi.fn(async (input: { key: string }) => { h.enqueued.push(input.key); return { taskId: `task-${h.enqueued.length}`, created: true }; }),
}));

import { processQboSyncChain, QBO_BACKGROUND_BUDGET_MS } from "@/services/quickbooks/qbo-sync-background";

const ids = { workspaceId: "w", connectionId: "c", taskId: "task-0" };
const run = () => processQboSyncChain(ids, { clock: () => h.now });

describe("processQboSyncChain deadline guard", () => {
  beforeEach(() => { h.now = 0; h.passMs = 0; h.cursor = null; h.processed = []; h.enqueued = []; });

  it("runs one pass and stops when no baseline cursor remains", async () => {
    h.passMs = 6_000;
    expect(await run()).toEqual({ ran: 1 });
    expect(h.enqueued).toEqual([]);
  });

  it("chains continuation passes while the observed pass length still fits the budget", async () => {
    h.passMs = 6_000;
    h.cursor = new Date("2026-05-01T00:00:00Z");
    const r = await run();
    expect(r.ran).toBeGreaterThan(1);
    expect(h.enqueued.length).toBe(r.ran - 1);
    expect(h.now).toBeLessThan(QBO_BACKGROUND_BUDGET_MS + 6_000);
  });

  it("does not start another pass that could overrun the budget (slow provider)", async () => {
    h.passMs = 30_000;
    h.cursor = new Date("2026-05-01T00:00:00Z");
    expect(await run()).toEqual({ ran: 1 });
    expect(h.processed).toEqual(["task-0"]);
    expect(h.enqueued).toEqual([]);
  });
});
