/**
 * STAGE 8 — Vercel cron compatibility.
 *
 * Blocker: vercel.json scheduled /api/internal/cron/scheduler at "* * * * *".
 * Vercel's Hobby plan permits once-per-day cron only and REJECTS a more frequent
 * expression at deploy time, failing the entire deployment. Every git-triggered
 * build was therefore failing.
 *
 * Remediation: a daily schedule, plus a bounded drain loop in the route so the
 * lower cadence cannot strand a backlog. Both jobs were already catch-up
 * (`scheduled_for <= now`; all FAILED alerts below max attempts), so a missed
 * window delays work but never drops it.
 *
 * DB-level claim semantics — atomic claim, disjoint concurrent claims, no
 * re-claim of completed/dead-letter rows, lease expiry, backoff — are proven
 * against real PostgreSQL in src/__tests__/stage7/scheduler-pg.db.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the route's collaborators
// ─────────────────────────────────────────────────────────────────────────────

const processDue = vi.fn();
const retryEmailAlert = vi.fn();
const alertFindMany = vi.fn();

vi.mock("@/infra/scheduler", () => ({
  DatabaseSchedulerProvider: class {
    processDue = processDue;
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    alert: { findMany: alertFindMany },
    ownerFinanceVerification: { findMany: vi.fn().mockResolvedValue([]) },
  },
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/services/alerts/alert-email-retry.service", () => ({
  retryEmailAlert,
}));

vi.mock("@/services/owner-finance/learning-bridge.service", () => ({
  reconcileMissingFinanceLearningSignals: vi.fn().mockResolvedValue({
    gapsFound: 0,
    gapsBridged: 0,
    gapsSkipped: 0,
    errors: [],
  }),
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
  alertFindMany.mockResolvedValue([]);
  retryEmailAlert.mockResolvedValue({ status: "SENT", alertId: "a", attemptCount: 1 });
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

describe("[stage8] 8. batch limits do not permanently strand work", () => {
  it("email sweep pages through a backlog larger than one batch", async () => {
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `alert-${i}`, workspaceId: "ws-1" }));
    alertFindMany
      .mockResolvedValueOnce(page(20))
      .mockResolvedValueOnce(page(20))
      .mockResolvedValueOnce(page(4))
      .mockResolvedValue([]);

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    expect(body.results.emailRetry.attempted).toBe(44);
    expect(retryEmailAlert).toHaveBeenCalledTimes(44);
  });

  it("stops paging as soon as a partial batch is returned", async () => {
    alertFindMany.mockResolvedValueOnce([{ id: "a1", workspaceId: "ws" }]).mockResolvedValue([]);
    const { GET } = await loadRoute();
    await GET(cronRequest(SECRET));
    expect(alertFindMany).toHaveBeenCalledTimes(1);
  });

  it("does not spin when no work exists", async () => {
    const { GET } = await loadRoute();
    await GET(cronRequest(SECRET));
    expect(processDue).toHaveBeenCalledTimes(1);
    expect(alertFindMany).toHaveBeenCalledTimes(1);
  });

  it("does not spin when tasks are claimed but no handler completes them", async () => {
    // The live configuration passes an empty handler map: claimed tasks are
    // released back to pending and processDue reports 0 completed. The drain
    // loop must terminate rather than re-claiming forever.
    processDue.mockResolvedValue(0);
    const { GET } = await loadRoute();
    await GET(cronRequest(SECRET));
    expect(processDue).toHaveBeenCalledTimes(1);
  });

  it("bounds the drain with an explicit pass cap and wall-clock budget", () => {
    expect(ROUTE_SRC).toMatch(/MAX_DRAIN_PASSES\s*=\s*\d+/);
    expect(ROUTE_SRC).toMatch(/DRAIN_BUDGET_MS\s*=\s*[\d_]+/);
    expect(ROUTE_SRC).toMatch(/Date\.now\(\)\s*>=\s*deadline/);
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

  it("keeps failed tasks retryable with backoff rather than dropping them", () => {
    expect(SCHEDULER_SRC).toMatch(/status:\s*"pending"[\s\S]*scheduledFor:\s*nextRun/);
    expect(SCHEDULER_SRC).toMatch(/dead_letter/);
  });

  it("a scheduler failure does not abort the email sweep", async () => {
    processDue.mockRejectedValue(new Error("scheduler exploded"));
    alertFindMany.mockResolvedValueOnce([{ id: "a1", workspaceId: "ws" }]).mockResolvedValue([]);

    const { GET } = await loadRoute();
    const res = await GET(cronRequest(SECRET));
    const body = await res.json();

    expect(res.status).toBe(207); // partial success, not a 500
    expect(body.ok).toBe(false);
    expect(retryEmailAlert).toHaveBeenCalledTimes(1);
  });

  it("an individual email failure does not abort the sweep", async () => {
    alertFindMany
      .mockResolvedValueOnce([
        { id: "a1", workspaceId: "ws" },
        { id: "a2", workspaceId: "ws" },
      ])
      .mockResolvedValue([]);
    retryEmailAlert
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValue({ status: "SENT", alertId: "a2", attemptCount: 1 });

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    expect(body.results.emailRetry.attempted).toBe(2);
    expect(body.results.emailRetry.failed).toBe(1);
    expect(body.results.emailRetry.sent).toBe(1);
  });
});

describe("[stage8] drain-loop termination and call bounds", () => {
  const MAX_DRAIN_PASSES = 25;
  const EMAIL_PAGE = 20;

  const fullEmailPage = (tag: string) =>
    Array.from({ length: EMAIL_PAGE }, (_, i) => ({ id: `${tag}-${i}`, workspaceId: "ws" }));

  it("1. zero progress in both subsystems terminates after one pass each", async () => {
    processDue.mockResolvedValue(0);
    alertFindMany.mockResolvedValue([]);

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    expect(processDue).toHaveBeenCalledTimes(1);
    expect(alertFindMany).toHaveBeenCalledTimes(1);
    expect(body.results.schedulerPasses).toBe(0);
    expect(body.results.emailRetry.passes).toBe(0);
  });

  it("2. task-only progress keeps the task loop going and does not stall the email loop", async () => {
    processDue.mockResolvedValueOnce(50).mockResolvedValueOnce(50).mockResolvedValue(0);
    alertFindMany.mockResolvedValue([]);

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    expect(processDue).toHaveBeenCalledTimes(3);
    expect(body.results.schedulerTasksProcessed).toBe(100);
    expect(alertFindMany).toHaveBeenCalledTimes(1);
  });

  it("3. email-only progress keeps the email loop going with no task work", async () => {
    processDue.mockResolvedValue(0);
    alertFindMany
      .mockResolvedValueOnce(fullEmailPage("p1"))
      .mockResolvedValueOnce([{ id: "tail", workspaceId: "ws" }])
      .mockResolvedValue([]);

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    expect(processDue).toHaveBeenCalledTimes(1);
    expect(alertFindMany).toHaveBeenCalledTimes(2);
    expect(body.results.emailRetry.attempted).toBe(EMAIL_PAGE + 1);
  });

  it("4. both subsystems making progress continue independently", async () => {
    processDue.mockResolvedValueOnce(50).mockResolvedValueOnce(3).mockResolvedValue(0);
    alertFindMany
      .mockResolvedValueOnce(fullEmailPage("a"))
      .mockResolvedValueOnce(fullEmailPage("b"))
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    expect(processDue).toHaveBeenCalledTimes(3);
    expect(body.results.schedulerTasksProcessed).toBe(53);
    expect(alertFindMany).toHaveBeenCalledTimes(3);
    expect(body.results.emailRetry.attempted).toBe(EMAIL_PAGE * 2);
  });

  it("5/10. an endless backlog terminates at the pass cap, bounding DB calls", async () => {
    // Never-ending work in both subsystems: the cap is the only thing that stops it.
    processDue.mockResolvedValue(50);
    alertFindMany.mockImplementation(async () => fullEmailPage("endless"));

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    expect(processDue).toHaveBeenCalledTimes(MAX_DRAIN_PASSES);
    expect(alertFindMany).toHaveBeenCalledTimes(MAX_DRAIN_PASSES);

    // Maximum theoretical rows touched in one invocation is bounded.
    expect(body.results.schedulerTasksProcessed).toBe(MAX_DRAIN_PASSES * 50); // 1250
    expect(body.results.emailRetry.attempted).toBe(MAX_DRAIN_PASSES * EMAIL_PAGE); // 500
    expect(retryEmailAlert).toHaveBeenCalledTimes(MAX_DRAIN_PASSES * EMAIL_PAGE);
  });

  it("6. the shared wall-clock budget terminates the drain before the pass cap", async () => {
    // Virtual clock: each task pass burns 20s of the 45s budget.
    let clock = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock);

    processDue.mockImplementation(async () => {
      clock += 20_000;
      return 50; // always more work — only the budget can stop this
    });
    alertFindMany.mockResolvedValue(fullEmailPage("t"));

    const { GET } = await loadRoute();
    const body = await (await GET(cronRequest(SECRET))).json();

    // Passes at t=0, 20s, 40s; the 4th check sees 60s >= 45s deadline.
    expect(processDue).toHaveBeenCalledTimes(3);
    expect(processDue.mock.calls.length).toBeLessThan(MAX_DRAIN_PASSES);
    // Budget already spent, so the email loop stops before its first query.
    expect(alertFindMany).not.toHaveBeenCalled();
    expect(body.results.emailRetry.attempted).toBe(0);

    nowSpy.mockRestore();
  });

  it("7. a throw in task processing is contained and leaves work retryable", async () => {
    processDue.mockRejectedValue(new Error("claim failed"));
    alertFindMany.mockResolvedValueOnce([{ id: "e1", workspaceId: "ws" }]).mockResolvedValue([]);

    const { GET } = await loadRoute();
    const res = await GET(cronRequest(SECRET));
    const body = await res.json();

    // No completion is recorded, the route does not 500, and the next
    // invocation can re-claim because nothing was marked completed here.
    expect(res.status).toBe(207);
    expect(body.results.schedulerTasksProcessed).toBeUndefined();
    expect(processDue).toHaveBeenCalledTimes(1); // throw exits the loop
    expect(retryEmailAlert).toHaveBeenCalledTimes(1); // other subsystem unaffected
  });

  it("8. a throw in email processing is contained and leaves that alert retryable", async () => {
    processDue.mockResolvedValue(0);
    alertFindMany
      .mockResolvedValueOnce([
        { id: "x1", workspaceId: "ws" },
        { id: "x2", workspaceId: "ws" },
      ])
      .mockResolvedValue([]);
    retryEmailAlert
      .mockRejectedValueOnce(new Error("provider 503"))
      .mockResolvedValue({ status: "SENT", alertId: "x2", attemptCount: 1 });

    const { GET } = await loadRoute();
    const res = await GET(cronRequest(SECRET));
    const body = await res.json();

    // The thrown alert is counted failed, never marked sent, so it stays
    // eligible for the next sweep; the sibling alert still completes.
    expect(res.status).toBe(200);
    expect(body.results.emailRetry.failed).toBe(1);
    expect(body.results.emailRetry.sent).toBe(1);
  });

  it("9. no row is processed twice within one invocation", async () => {
    alertFindMany
      .mockResolvedValueOnce(fullEmailPage("page1"))
      .mockResolvedValueOnce(fullEmailPage("page2"))
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);

    const { GET } = await loadRoute();
    await GET(cronRequest(SECRET));

    const ids = retryEmailAlert.mock.calls.map((c) => c[0] as string);
    expect(ids).toHaveLength(EMAIL_PAGE * 2);
    expect(new Set(ids).size).toBe(ids.length); // every id exactly once
  });
});

describe("[stage8] 10. selected cadence matches the classified requirement", () => {
  it("no production code enqueues scheduled tasks, so no task requires minute cadence", () => {
    // If this ever fails, a task producer was added: re-classify its required
    // maximum delay before relying on the daily cron alone.
    const producers = ["getScheduler().schedule(", "scheduler.schedule("];
    const routeUsesScheduler = producers.some((p) => ROUTE_SRC.includes(p));
    expect(routeUsesScheduler).toBe(false);
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
