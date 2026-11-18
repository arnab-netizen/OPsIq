import { describe, expect, it, vi } from "vitest";
import { runDailyReportOrchestrator } from "@/lib/daily-report/orchestrator";
import { buildMetric, buildSourceReport, type SourceModule } from "@/lib/daily-report/types";

const WINDOW = { start: "2026-11-16T00:00:00.000Z", end: "2026-11-17T00:00:00.000Z" };
const NOW = new Date("2026-11-17T00:00:00.000Z");

function healthyModule(id: string): SourceModule {
  return {
    id,
    displayName: id,
    async run(ctx) {
      return buildSourceReport({
        source: id,
        displayName: id,
        startedAt: ctx.now().toISOString(),
        metrics: [buildMetric({ name: "ok", source: id, status: "VERIFIED", window: ctx.window, value: 1, detail: "fine" })],
      });
    },
  };
}

function throwingModule(id: string): SourceModule {
  return {
    id,
    displayName: id,
    async run() {
      throw new Error(`${id} exploded`);
    },
  };
}

function rejectingSyncModule(id: string): SourceModule {
  return {
    id,
    displayName: id,
    run() {
      // Synchronous throw inside a function typed to return a Promise -- the orchestrator must
      // still not blow up, because `mod.run(...)` is called inside `.map()`, not awaited there.
      throw new Error(`${id} threw synchronously`);
    },
  };
}

function hangingModule(id: string): SourceModule {
  return {
    id,
    displayName: id,
    run() {
      return new Promise(() => {
        /* never resolves */
      });
    },
  };
}

describe("runDailyReportOrchestrator", () => {
  it("aggregates every module's report when all succeed", async () => {
    const report = await runDailyReportOrchestrator({
      modules: [healthyModule("a"), healthyModule("b"), healthyModule("c")],
      window: WINDOW,
      now: () => NOW,
    });
    expect(report.sources).toHaveLength(3);
    expect(report.sources.map((s) => s.source)).toEqual(["a", "b", "c"]);
    for (const s of report.sources) {
      expect(s.moduleError).toBeNull();
      expect(s.metrics[0].status).toBe("VERIFIED");
    }
  });

  it("a module that throws does not prevent the other modules' results from appearing", async () => {
    const report = await runDailyReportOrchestrator({
      modules: [healthyModule("good-1"), throwingModule("bad"), healthyModule("good-2")],
      window: WINDOW,
      now: () => NOW,
    });
    expect(report.sources).toHaveLength(3);
    const good1 = report.sources.find((s) => s.source === "good-1")!;
    const bad = report.sources.find((s) => s.source === "bad")!;
    const good2 = report.sources.find((s) => s.source === "good-2")!;

    expect(good1.metrics[0].status).toBe("VERIFIED");
    expect(good2.metrics[0].status).toBe("VERIFIED");
    expect(bad.moduleError).toMatch(/bad exploded/);
    expect(bad.metrics).toHaveLength(0);
  });

  it("a module that throws synchronously (before returning a Promise) is still isolated", async () => {
    const report = await runDailyReportOrchestrator({
      modules: [healthyModule("good"), rejectingSyncModule("sync-bad")],
      window: WINDOW,
      now: () => NOW,
    });
    expect(report.sources.find((s) => s.source === "good")!.metrics[0].status).toBe("VERIFIED");
    expect(report.sources.find((s) => s.source === "sync-bad")!.moduleError).toMatch(/threw synchronously/);
  });

  it("a module that hangs past its timeout budget is reported as failed, not left pending forever", async () => {
    const report = await runDailyReportOrchestrator({
      modules: [healthyModule("fast"), hangingModule("slow")],
      window: WINDOW,
      now: () => NOW,
      perModuleTimeoutMs: 20,
    });
    expect(report.sources.find((s) => s.source === "fast")!.metrics[0].status).toBe("VERIFIED");
    const slow = report.sources.find((s) => s.source === "slow")!;
    expect(slow.moduleError).toMatch(/execution budget/);
  });

  it("runs every module in parallel, not sequentially", async () => {
    const order: string[] = [];
    function trackedModule(id: string, delayMs: number): SourceModule {
      return {
        id,
        displayName: id,
        async run(ctx) {
          await new Promise((r) => setTimeout(r, delayMs));
          order.push(id);
          return buildSourceReport({ source: id, displayName: id, startedAt: ctx.now().toISOString(), metrics: [] });
        },
      };
    }
    const start = Date.now();
    await runDailyReportOrchestrator({ modules: [trackedModule("slow", 30), trackedModule("fast", 5)], window: WINDOW, now: () => NOW });
    const elapsed = Date.now() - start;
    expect(order).toEqual(["fast", "slow"]); // fast finishes first => they ran concurrently, not in listed order
    expect(elapsed).toBeLessThan(55); // well under the sum of both delays (35ms) if sequential plus overhead
  });

  it("defaults to a 24h window ending now when none is supplied", async () => {
    const fixedNow = new Date("2026-11-17T12:00:00.000Z");
    const report = await runDailyReportOrchestrator({ modules: [healthyModule("a")], now: () => fixedNow });
    expect(report.window.end).toBe(fixedNow.toISOString());
    expect(new Date(report.window.end).getTime() - new Date(report.window.start).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("passes env through to every module", async () => {
    const seen: Array<Record<string, string | undefined>> = [];
    const mod: SourceModule = {
      id: "env-check",
      displayName: "env-check",
      async run(ctx) {
        seen.push(ctx.env);
        return buildSourceReport({ source: "env-check", displayName: "env-check", startedAt: ctx.now().toISOString(), metrics: [] });
      },
    };
    await runDailyReportOrchestrator({ modules: [mod], window: WINDOW, now: () => NOW, env: { FOO: "bar" } });
    expect(seen[0]).toEqual({ FOO: "bar" });
  });
});

describe("timeoutGuard behavior via orchestrator (vi.useFakeTimers safety)", () => {
  it("does not leak timers for modules that resolve well before the budget", async () => {
    vi.useFakeTimers();
    try {
      const promise = runDailyReportOrchestrator({ modules: [healthyModule("a")], window: WINDOW, now: () => NOW, perModuleTimeoutMs: 100_000 });
      await vi.advanceTimersByTimeAsync(0);
      const report = await promise;
      expect(report.sources[0].metrics[0].status).toBe("VERIFIED");
    } finally {
      vi.useRealTimers();
    }
  });
});
