/**
 * InMemorySchedulerProvider honors the same outcome / idempotency / by-id contract as the
 * database provider (the DB behaviour itself is proven in the scheduler-*.db.test.ts suites).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/infra/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { InMemorySchedulerProvider, type TaskHandler } from "@/infra/scheduler";

const due = () => new Date(Date.now() - 1000);

describe("InMemorySchedulerProvider contract", () => {
  it("a FAILED outcome is terminal: not retried, not re-run", async () => {
    const s = new InMemorySchedulerProvider();
    const id = await s.schedule({ taskName: "t", scheduledFor: due() });
    let runs = 0;
    const handlers = new Map<string, TaskHandler>([["t", async () => { runs++; return { status: "FAILED", summary: "no" }; }]]);
    expect(await s.processDue(handlers)).toBe(0);
    expect(await s.processDue(handlers)).toBe(0);
    expect(await s.processTaskById(id, handlers)).toBe(false);
    expect(runs).toBe(1);
  });

  it("a thrown error stays retryable (not due until backoff elapses)", async () => {
    const s = new InMemorySchedulerProvider();
    const id = await s.schedule({ taskName: "t", scheduledFor: due(), maxAttempts: 3 });
    let runs = 0;
    const handlers = new Map<string, TaskHandler>([["t", async () => { runs++; throw new Error("x"); }]]);
    await s.processTaskById(id, handlers);
    expect(await s.processDue(handlers)).toBe(0);
    expect(runs).toBe(1);
  });

  it("scheduleIdempotent reports exactly one creator and the same id for replays", async () => {
    const s = new InMemorySchedulerProvider();
    const input = { taskName: "t", scheduledFor: due(), idempotencyKey: "k" };
    const results = await Promise.all(Array.from({ length: 10 }, () => s.scheduleIdempotent(input)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
  });

  it("refuses a key already held by a different task type or workspace", async () => {
    const s = new InMemorySchedulerProvider();
    await s.scheduleIdempotent({ taskName: "t", scheduledFor: due(), idempotencyKey: "k", workspaceId: "w1" });
    await expect(s.scheduleIdempotent({ taskName: "t", scheduledFor: due(), idempotencyKey: "k", workspaceId: "w2" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(s.scheduleIdempotent({ taskName: "u", scheduledFor: due(), idempotencyKey: "k", workspaceId: "w1" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("processTaskById runs only the named due pending task", async () => {
    const s = new InMemorySchedulerProvider();
    const a = await s.schedule({ taskName: "t", scheduledFor: due() });
    const b = await s.schedule({ taskName: "t", scheduledFor: due() });
    const future = await s.schedule({ taskName: "t", scheduledFor: new Date(Date.now() + 60_000) });
    const seen: string[] = [];
    const handlers = new Map<string, TaskHandler>([["t", async (_p, c) => { seen.push(c.taskId); }]]);
    expect(await s.processTaskById(a, handlers)).toBe(true);
    expect(await s.processTaskById(a, handlers)).toBe(false); // already completed
    expect(await s.processTaskById(future, handlers)).toBe(false); // not due
    expect(await s.processTaskById("missing", handlers)).toBe(false);
    expect(seen).toEqual([a]);
    expect(await s.processTaskById(b, new Map())).toBe(false); // no handler: left untouched
  });
});
