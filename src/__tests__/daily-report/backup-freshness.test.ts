import { describe, expect, it } from "vitest";
import { createBackupFreshnessModule } from "@/lib/daily-report/sources/backup-freshness";
import { GithubActionsBlockedError, type GhRun, type GithubActionsClient } from "@/lib/daily-report/github-actions-client";
import type { SourceContext } from "@/lib/daily-report/types";

const WINDOW = { start: "2026-11-16T00:00:00.000Z", end: "2026-11-17T00:00:00.000Z" };
const NOW = () => new Date("2026-11-17T12:00:00.000Z");

function ctx(): SourceContext {
  return { window: WINDOW, now: NOW, env: {} };
}

function clientReturning(runs: GhRun[] | Error): GithubActionsClient {
  return {
    async listWorkflows() {
      return [];
    },
    async listRuns() {
      if (runs instanceof Error) throw runs;
      return runs;
    },
  };
}

describe("backup-freshness", () => {
  it("reports BLOCKED (never CONFIRMED_ZERO) for zero runs ever -- this repo's actual state as described in the task", async () => {
    const mod = createBackupFreshnessModule({ client: clientReturning([]) });
    const report = await mod.run(ctx());
    expect(report.metrics).toHaveLength(1);
    expect(report.metrics[0].status).toBe("BLOCKED");
    expect(report.metrics[0].detail).toMatch(/zero runs ever/);
  });

  it("reports VERIFIED for a recent successful run", async () => {
    const mod = createBackupFreshnessModule({
      client: clientReturning([{ id: 1, status: "completed", conclusion: "success", created_at: "2026-11-17T06:00:00.000Z", run_started_at: "2026-11-17T06:00:00.000Z" }]),
    });
    const report = await mod.run(ctx());
    expect(report.metrics[0].status).toBe("VERIFIED");
    expect(report.metrics[0].value).toMatchObject({ lastSuccessfulRunId: 1 });
  });

  it("reports STALE for a successful run older than the freshness bound", async () => {
    const mod = createBackupFreshnessModule({
      staleAfterMs: 60 * 60 * 1000,
      client: clientReturning([{ id: 2, status: "completed", conclusion: "success", created_at: "2026-11-15T06:00:00.000Z", run_started_at: "2026-11-15T06:00:00.000Z" }]),
    });
    const report = await mod.run(ctx());
    expect(report.metrics[0].status).toBe("STALE");
  });

  it("reports STALE when every run exists but none succeeded (the real, currently-observed state: 1 run, conclusion failure)", async () => {
    const mod = createBackupFreshnessModule({
      client: clientReturning([{ id: 3, status: "completed", conclusion: "failure", created_at: "2026-11-17T06:00:00.000Z", run_started_at: "2026-11-17T06:00:00.000Z" }]),
    });
    const report = await mod.run(ctx());
    expect(report.metrics[0].status).toBe("STALE");
    expect(report.metrics[0].detail).toMatch(/none succeeded/);
  });

  it("reports BLOCKED when the transport cannot authenticate", async () => {
    const mod = createBackupFreshnessModule({ client: clientReturning(new GithubActionsBlockedError("not authenticated")) });
    const report = await mod.run(ctx());
    expect(report.metrics[0].status).toBe("BLOCKED");
  });

  it("reports FAILED for a non-auth transport error, never throwing", async () => {
    const mod = createBackupFreshnessModule({ client: clientReturning(new Error("ECONNRESET")) });
    const report = await mod.run(ctx());
    expect(report.metrics[0].status).toBe("FAILED");
  });
});
