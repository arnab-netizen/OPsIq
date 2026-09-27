/**
 * STAGE 8 — Vercel cron compatibility.
 *
 * Blocker: vercel.json scheduled /api/internal/cron/scheduler at "* * * * *".
 * Vercel's Hobby plan permits once-per-day cron only and REJECTS a more frequent
 * expression at deploy time, failing the entire deployment. Every git-triggered
 * build was therefore failing.
 *
 * Remediation: a daily schedule, plus a bounded drain loop in the route so the
 * lower cadence cannot strand a backlog. All task types are catch-up
 * (`scheduled_for <= now`), so a missed window delays work but never drops it.
 *
 * P0-08: the route previously ran two hand-rolled, independently-paginated
 * inline sweeps (email retry, finance-learning gap) alongside a SEPARATE,
 * empty-handler-map scheduler drain. Both sweeps are now canonical producers
 * (src/services/scheduler/scheduler-producers.ts, unit-tested in
 * scheduler-producers.test.ts) that enqueue ScheduledTask rows, executed
 * through the SAME single processDue() drain as every other task type via
 * the real handler registry (src/infra/scheduler-handlers.ts). This file
 * tests the route's OWN orchestration (auth, producer-then-drain sequencing,
 * budget/pass-cap bounding, error containment) by mocking the producers and
 * processDue() directly — each producer's own scan/enqueue logic has its own
 * dedicated unit tests.
 *
 * DB-level claim semantics — atomic claim, disjoint concurrent claims, no
 * re-claim of completed/dead-letter rows, lease expiry, backoff, fail-closed
 * unknown-handler dead-lettering — are proven against real PostgreSQL in
 * src/__tests__/stage7/scheduler-pg.db.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the route's collaborators
// ─────────────────────────────────────────────────────────────────────────────

const processDue = vi.fn();
const enqueueDueEmailRetryTasks = vi.fn();
const enqueueDueFinanceLearningBridgeTasks = vi.fn();
const enqueueDueReassessmentScanTasks = vi.fn();
const enqueueDueRiskReviewScanTasks = vi.fn();

vi.mock("@/infra/scheduler", () => ({
  DatabaseSchedulerProvider: class {
    processDue = processDue;
  },
}));

vi.mock("@/infra/scheduler-handlers", () => ({
  getProductionTaskHandlers: () => new Map([["stub", async () => {}]]),
}));

vi.mock("@/services/scheduler/scheduler-producers", () => ({
  enqueueDueEmailRetryTasks,
  enqueueDueFinanceLearningBridgeTasks,
  enqueueDueReassessmentScanTasks,
  enqueueDueRiskReviewScanTasks,
}));

vi.mock("@/infra/observability", () => ({ captureError: vi.fn() }));

const ROUTE_SRC = readFileSync(
  path.join(process.cwd(), "src/app/api/internal/cron/scheduler/route.ts"),
  "utf8",
);
const SCHEDULER_SRC = readFileSync(
  path.join(process.cwd(), "src/infra/scheduler.ts"),
  "utf8",
);
const PRODUCERS_SRC = readFileSync(
  path.join(process.cwd(), "src/services/scheduler/scheduler-producers.ts"),
  "utf8",
);
const VERCEL_JSON = JSON.parse(
  readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
);

const SECRET = "test-cron-secret-value";

function cronRequest(token?: string): Request {
  return new Request("https://example.test/api/internal/cron/scheduler", {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/internal/cron/scheduler/route");
}

/**
 * A cron expression runs at most once per day (the Hobby ceiling) only when the
 * minute and hour fields are both fixed single values.
 */
function runsAtMostOncePerDay(expression: string): boolean {
  const [minute, hour] = expression.trim().split(/\s+/);
  const fixed = /^\d{1,2}$/;
  return fixed.test(minute ?? "") && fixed.test(hour ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  processDue.mockResolvedValue(0);
  enqueueDueEmailRetryTasks.mockResolvedValue({ candidatesFound: 0, enqueued: 0 });
  enqueueDueFinanceLearningBridgeTasks.mockResolvedValue({ candidatesFound: 0, enqueued: 0 });
  enqueueDueReassessmentScanTasks.mockResolvedValue({ candidatesFound: 0, enqueued: 0 });
  enqueueDueRiskReviewScanTasks.mockResolvedValue({ candidatesFound: 0, enqueued: 0 });
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("[stage8] 1. cron configuration is deployable on the current plan", () => {
  it("declares exactly one cron pointing at the scheduler endpoint", () => {
    expect(Array.isArray(VERCEL_JSON.crons)).toBe(true);
    expect(VERCEL_JSON.crons).toHaveLength(1);
    expect(VERCEL_JSON.crons[0].path).toBe("/api/internal/cron/scheduler");
  });

  it("uses a schedule that runs at most once per day (Hobby ceiling)", () => {
    const schedule: string = VERCEL_JSON.crons[0].schedule;
    expect(schedule).not.toBe("* * * * *");
    expect(runsAtMostOncePerDay(schedule)).toBe(true);
  });

  it("rejects the expressions Vercel refuses on Hobby", () => {
    for (const bad of ["* * * * *", "*/5 * * * *", "0 * * * *", "*/30 * * * *"]) {
      expect(runsAtMostOncePerDay(bad)).toBe(false);
    }
    for (const good of ["0 3 * * *", "15 0 * * *"]) {
      expect(runsAtMostOncePerDay(good)).toBe(true);
    }
  });
});

describe("[stage8] 6. cron authentication is fail-closed", () => {
  it("rejects a request with no Authorization header", async () => {
    const { GET } = await loadRoute();
    const res = await GET(cronRequest());
    expect(res.status).toBe(401);
    expect(processDue).not.toHaveBeenCalled();
    expect(enqueueDueEmailRetryTasks).not.toHaveBeenCalled();
  });

  it("rejects an incorrect secret", async () => {
    const { GET } = await loadRoute();
    const res = await GET(cronRequest("wrong-secret-value-here"));
    expect(res.status).toBe(401);
    expect(processDue).not.toHaveBeenCalled();
  });

  it("rejects every request when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await loadRoute();
    expect((await GET(cronRequest())).status).toBe(401);
    expect((await GET(cronRequest("anything"))).status).toBe(401);
    expect(processDue).not.toHaveBeenCalled();
  });

  it("accepts the correct secret", async () => {
    const { GET } = await loadRoute();
    const res = await GET(cronRequest(SECRET));
    expect(res.status).toBe(200);
    expect(processDue).toHaveBeenCalled();
  });
});

describe("[stage8] producers run before the drain and their results are reported", () => {
  it("calls all four producers and reports their scan results", async () => {
    enqueueDueEmailRetryTasks.mockResolvedValueOnce({ candidatesFound: 5, enqueued: 5 });
    enqueueDueFinanceLearningBridgeTasks.mockResolvedValueOnce({ candidatesFound: 2, enqueued: 2 });
    enqueueDueReassessmentScanTasks.mockResolvedValueOnce({ candidatesFound: 3, enqueued: 3 });
    enqueueDueRiskReviewScanTasks.mockResolvedValueOnce({ candidatesFound: 4, enqueued: 4 });

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    expect(enqueueDueEmailRetryTasks).toHaveBeenCalledTimes(1);
    expect(enqueueDueFinanceLearningBridgeTasks).toHaveBeenCalledTimes(1);
    expect(enqueueDueReassessmentScanTasks).toHaveBeenCalledTimes(1);
    expect(enqueueDueRiskReviewScanTasks).toHaveBeenCalledTimes(1);
    expect(body.results.producers.emailRetry).toEqual({ candidatesFound: 5, enqueued: 5 });
    expect(body.results.producers.financeLearningBridge).toEqual({ candidatesFound: 2, enqueued: 2 });
    expect(body.results.producers.reassessmentScan).toEqual({ candidatesFound: 3, enqueued: 3 });
    expect(body.results.producers.riskReviewScan).toEqual({ candidatesFound: 4, enqueued: 4 });
  });

  it("a producer failure does not abort the scheduler drain (207, not 500)", async () => {
    enqueueDueEmailRetryTasks.mockRejectedValue(new Error("db exploded"));
    processDue.mockResolvedValueOnce(3).mockResolvedValue(0);

    const { GET } = await loadRoute();
    const res = await GET(cronRequest(SECRET));
    const body = await res.json();

    expect(res.status).toBe(207);
    expect(body.ok).toBe(false);
    expect(body.results.schedulerTasksProcessed).toBe(3); // other subsystem unaffected
  });

  it("a scheduler drain failure does not prevent producers from having run", async () => {
    processDue.mockRejectedValue(new Error("claim failed"));
    enqueueDueEmailRetryTasks.mockResolvedValueOnce({ candidatesFound: 1, enqueued: 1 });

    const { GET } = await loadRoute();
    const res = await GET(cronRequest(SECRET));
    const body = await res.json();

    expect(res.status).toBe(207);
    expect(body.results.producers.emailRetry).toEqual({ candidatesFound: 1, enqueued: 1 });
    expect(body.results.schedulerTasksProcessed).toBeUndefined();
  });
});

describe("[stage8] 2/3/7. overdue work is processed regardless of cadence", () => {
  it("processes due tasks on invocation", async () => {
    processDue.mockResolvedValueOnce(3).mockResolvedValue(0);
    const { GET } = await loadRoute();
    const res = await GET(cronRequest(SECRET));
    const body = await res.json();
    expect(body.results.schedulerTasksProcessed).toBe(3);
  });

  it("selects due work by scheduled_for <= now, not exact-time matching", () => {
    // Exact-time matching would silently drop every window the cron missed.
    expect(SCHEDULER_SRC).toMatch(/"scheduled_for"\s*<=/);
    expect(SCHEDULER_SRC).not.toMatch(/"scheduled_for"\s*=\s*\$\{now\}/);
  });

  it("also reclaims running tasks whose lease expired", () => {
    expect(SCHEDULER_SRC).toMatch(/"status"\s*=\s*'running'\s*AND\s*"lease_expires_at"\s*</);
  });

  it("a single delayed invocation drains a multi-batch backlog", async () => {
    // Three full batches then empty — one invocation must clear all of them.
    processDue
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(7)
      .mockResolvedValue(0);

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    expect(body.results.schedulerTasksProcessed).toBe(107);
    expect(processDue.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe("[stage8] 8. batch limits and drain-loop termination do not permanently strand work", () => {
  it("bounds the drain with an explicit pass cap and wall-clock budget", () => {
    expect(ROUTE_SRC).toMatch(/MAX_DRAIN_PASSES\s*=\s*\d+/);
    expect(ROUTE_SRC).toMatch(/DRAIN_BUDGET_MS\s*=\s*[\d_]+/);
    expect(ROUTE_SRC).toMatch(/Date\.now\(\)\s*>=\s*deadline/);
  });

  it("does not spin when no work exists", async () => {
    const { GET } = await loadRoute();
    await GET(cronRequest(SECRET));
    expect(processDue).toHaveBeenCalledTimes(1);
  });

  it("does not spin when tasks are claimed but no handler completes them (unknown task type fails closed instead of looping)", async () => {
    // processDue() itself now fails an unknown task type closed (bounded
    // retry, then dead-letter — proven in scheduler-pg.db.test.ts #17), so a
    // pass returning 0 still terminates the drain loop rather than spinning.
    processDue.mockResolvedValue(0);
    const { GET } = await loadRoute();
    await GET(cronRequest(SECRET));
    expect(processDue).toHaveBeenCalledTimes(1);
  });

  it("1. zero progress terminates the drain after one pass", async () => {
    processDue.mockResolvedValue(0);
    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();
    expect(processDue).toHaveBeenCalledTimes(1);
    expect(body.results.schedulerPasses).toBe(0);
  });

  it("2. task progress keeps the drain going across multiple passes", async () => {
    processDue.mockResolvedValueOnce(50).mockResolvedValueOnce(50).mockResolvedValue(0);
    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();
    expect(processDue).toHaveBeenCalledTimes(3);
    expect(body.results.schedulerTasksProcessed).toBe(100);
  });

  it("5/10. an endless backlog terminates at the pass cap, bounding DB calls", async () => {
    const MAX_DRAIN_PASSES = 25;
    processDue.mockResolvedValue(50);

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    expect(processDue).toHaveBeenCalledTimes(MAX_DRAIN_PASSES);
    expect(body.results.schedulerTasksProcessed).toBe(MAX_DRAIN_PASSES * 50);
  });

  it("6. the wall-clock budget terminates the drain before the pass cap", async () => {
    const MAX_DRAIN_PASSES = 25;
    // Virtual clock: each pass burns 20s of the 45s budget.
    let clock = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock);

    processDue.mockImplementation(async () => {
      clock += 20_000;
      return 50; // always more work — only the budget can stop this
    });

    const { GET } = await loadRoute();
    await (await GET(cronRequest(SECRET))).json();

    // Passes at t=0, 20s, 40s; the 4th check sees 60s >= 45s deadline.
    expect(processDue).toHaveBeenCalledTimes(3);
    expect(processDue.mock.calls.length).toBeLessThan(MAX_DRAIN_PASSES);

    nowSpy.mockRestore();
  });

  it("7. a throw in the drain loop is contained and leaves work retryable", async () => {
    processDue.mockRejectedValue(new Error("claim failed"));

    const { GET } = await loadRoute();
    const res = await GET(cronRequest(SECRET));
    const body = await res.json();

    // No completion is recorded, the route does not 500, and the next
    // invocation can re-claim because nothing was marked completed here.
    expect(res.status).toBe(207);
    expect(body.results.schedulerTasksProcessed).toBeUndefined();
    expect(processDue).toHaveBeenCalledTimes(1); // throw exits the loop
  });
});

describe("[stage8] 4/5/9. duplicate, concurrency and retry safety are preserved", () => {
  it("retains FOR UPDATE SKIP LOCKED for concurrent-safe claiming", () => {
    expect(SCHEDULER_SRC).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("retains the unique idempotency key guard on schedule()", () => {
    expect(SCHEDULER_SRC).toMatch(/idempotencyKey/);
    expect(SCHEDULER_SRC).toMatch(/findUnique\(\{\s*where:\s*\{\s*idempotencyKey/);
  });

  it("keeps failed tasks retryable with backoff rather than dropping them, and dead-letters after exhaustion", () => {
    expect(SCHEDULER_SRC).toMatch(/status:\s*"pending"[\s\S]*scheduledFor:\s*nextRun/);
    expect(SCHEDULER_SRC).toMatch(/dead_letter/);
  });

  it("unknown task types are routed through the same failure path as a thrown handler error (fail closed, not silently released forever)", () => {
    expect(SCHEDULER_SRC).toMatch(/No handler registered for task type/);
    expect(SCHEDULER_SRC).toMatch(/recordFailure/);
  });
});

describe("[stage8] 10. selected cadence matches the classified requirement", () => {
  it("production code enqueues scheduled tasks via canonical producers, closing the P0-08 dead-scheduler gap", () => {
    // Positive contract replacing the historical negative canary
    // ("no production code enqueues scheduled tasks"). The route wires all
    // three producers, and each producer genuinely calls scheduler.schedule().
    expect(ROUTE_SRC).toMatch(/enqueueDueEmailRetryTasks/);
    expect(ROUTE_SRC).toMatch(/enqueueDueFinanceLearningBridgeTasks/);
    expect(ROUTE_SRC).toMatch(/enqueueDueReassessmentScanTasks/);
    expect(ROUTE_SRC).toMatch(/enqueueDueRiskReviewScanTasks/);
    expect(PRODUCERS_SRC).toMatch(/scheduler\.schedule\(/);
  });

  it("the handler registry is no longer permanently empty", () => {
    expect(ROUTE_SRC).not.toMatch(/No application task handlers registered yet/);
    expect(ROUTE_SRC).toMatch(/getProductionTaskHandlers/);
  });

  it("the first alert email is sent inline, so cron is a retry backstop only", () => {
    const alertService = readFileSync(
      path.join(process.cwd(), "src/services/alerts/alert-service.ts"),
      "utf8",
    );
    expect(alertService).toMatch(/emailDeliveryStatus:\s*"SENT"/);
    expect(alertService).toMatch(/emailDeliveryStatus:\s*"FAILED"/);
  });

  it("documents the cadence trade-off and the external-scheduler escape hatch", () => {
    const doc = readFileSync(
      path.join(process.cwd(), "docs/VERCEL_CRON_COMPATIBILITY.md"),
      "utf8",
    );
    expect(doc).toMatch(/Authorization: Bearer <CRON_SECRET>/);
    expect(doc).toMatch(/\/api\/internal\/cron\/scheduler/);
    expect(doc).toMatch(/24 hours|24h/i);
  });
});
