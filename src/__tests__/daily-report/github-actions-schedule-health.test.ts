import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGithubActionsScheduleHealthModule, discoverScheduledWorkflows } from "@/lib/daily-report/sources/github-actions-schedule-health";
import { GithubActionsBlockedError, type GhRun, type GithubActionsClient } from "@/lib/daily-report/github-actions-client";
import type { SourceContext } from "@/lib/daily-report/types";

const WINDOW = { start: "2026-11-16T00:00:00.000Z", end: "2026-11-17T00:00:00.000Z" };
const NOW = () => new Date("2026-11-17T07:00:00.000Z");

function ctx(env: Record<string, string | undefined> = {}): SourceContext {
  return { window: WINDOW, now: NOW, env };
}

let workflowsDir: string;

beforeEach(() => {
  workflowsDir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-report-wf-"));
});
afterEach(() => {
  fs.rmSync(workflowsDir, { recursive: true, force: true });
});

function writeWorkflow(fileName: string, contents: string) {
  fs.writeFileSync(path.join(workflowsDir, fileName), contents, "utf8");
}

describe("discoverScheduledWorkflows", () => {
  it("extracts cron expressions from workflows with a schedule trigger", () => {
    writeWorkflow("daily.yml", "on:\n  schedule:\n    - cron: '17 6 * * *'\n");
    writeWorkflow("dispatch-only.yml", "on:\n  workflow_dispatch: {}\n");
    const found = discoverScheduledWorkflows(workflowsDir);
    expect(found).toEqual([{ fileName: "daily.yml", crons: ["17 6 * * *"] }]);
  });

  it("returns an empty list for a directory with no scheduled workflows", () => {
    writeWorkflow("push-only.yml", "on:\n  push:\n    branches: [main]\n");
    expect(discoverScheduledWorkflows(workflowsDir)).toEqual([]);
  });

  it("returns an empty list (not a throw) for a missing directory", () => {
    expect(discoverScheduledWorkflows(path.join(workflowsDir, "does-not-exist"))).toEqual([]);
  });

  it("skips an unparsable workflow file rather than failing the whole discovery pass", () => {
    writeWorkflow("broken.yml", "on: [this is : not valid yaml::::");
    writeWorkflow("daily.yml", "on:\n  schedule:\n    - cron: '0 3 * * *'\n");
    expect(discoverScheduledWorkflows(workflowsDir)).toEqual([{ fileName: "daily.yml", crons: ["0 3 * * *"] }]);
  });

  it("supports multiple cron entries on one workflow", () => {
    writeWorkflow("multi.yml", "on:\n  schedule:\n    - cron: '0 3 * * *'\n    - cron: '0 15 * * *'\n");
    expect(discoverScheduledWorkflows(workflowsDir)).toEqual([{ fileName: "multi.yml", crons: ["0 3 * * *", "0 15 * * *"] }]);
  });
});

function fakeClient(runsByWorkflow: Record<string, GhRun[] | Error>): GithubActionsClient {
  return {
    async listWorkflows() {
      return [];
    },
    async listRuns(workflowFileNameOrId: string | number) {
      const entry = runsByWorkflow[String(workflowFileNameOrId)];
      if (entry instanceof Error) throw entry;
      return entry ?? [];
    },
  };
}

describe("github-actions-schedule-health module", () => {
  it("reports UNAVAILABLE when there are no scheduled workflows to check", async () => {
    const mod = createGithubActionsScheduleHealthModule({ workflowsDir, client: fakeClient({}) });
    const report = await mod.run(ctx());
    expect(report.metrics).toHaveLength(1);
    expect(report.metrics[0].status).toBe("UNAVAILABLE");
  });

  it("reports VERIFIED last_run_status and schedule_adherence for an on-time daily workflow (mirrors this repo's real scheduled-backup.yml)", async () => {
    writeWorkflow("scheduled-backup.yml", "on:\n  schedule:\n    - cron: '17 6 * * *'\n");
    const lastRunAt = "2026-11-17T06:17:05.000Z"; // just before NOW (07:00)
    const client = fakeClient({ "scheduled-backup.yml": [{ id: 1, status: "completed", conclusion: "success", created_at: lastRunAt, run_started_at: lastRunAt }] });
    const mod = createGithubActionsScheduleHealthModule({ workflowsDir, client });
    const report = await mod.run(ctx());
    const statusMetric = report.metrics.find((m) => m.name === "scheduled-backup.yml.last_run_status")!;
    const adherenceMetric = report.metrics.find((m) => m.name === "scheduled-backup.yml.schedule_adherence")!;
    expect(statusMetric.status).toBe("VERIFIED");
    expect(adherenceMetric.status).toBe("VERIFIED");
  });

  it("reports FAILED last_run_status when the latest run's conclusion was a failure", async () => {
    writeWorkflow("daily.yml", "on:\n  schedule:\n    - cron: '0 6 * * *'\n");
    const client = fakeClient({ "daily.yml": [{ id: 9, status: "completed", conclusion: "failure", created_at: "2026-11-17T06:00:00.000Z", run_started_at: "2026-11-17T06:00:00.000Z" }] });
    const mod = createGithubActionsScheduleHealthModule({ workflowsDir, client });
    const report = await mod.run(ctx());
    expect(report.metrics.find((m) => m.name === "daily.yml.last_run_status")!.status).toBe("FAILED");
  });

  it("reports STALE for a last run that is overdue against its own cron cadence", async () => {
    writeWorkflow("daily.yml", "on:\n  schedule:\n    - cron: '0 6 * * *'\n");
    const client = fakeClient({ "daily.yml": [{ id: 2, status: "completed", conclusion: "success", created_at: "2026-11-10T06:00:00.000Z", run_started_at: "2026-11-10T06:00:00.000Z" }] });
    const mod = createGithubActionsScheduleHealthModule({ workflowsDir, client });
    const report = await mod.run(ctx());
    expect(report.metrics.find((m) => m.name === "daily.yml.schedule_adherence")!.status).toBe("STALE");
  });

  it("reports STALE (never a confirmed zero) for a scheduled workflow with zero runs ever", async () => {
    writeWorkflow("never-run.yml", "on:\n  schedule:\n    - cron: '0 6 * * *'\n");
    const mod = createGithubActionsScheduleHealthModule({ workflowsDir, client: fakeClient({ "never-run.yml": [] }) });
    const report = await mod.run(ctx());
    const metric = report.metrics.find((m) => m.name === "never-run.yml.last_run_status")!;
    expect(metric.status).toBe("STALE");
    expect(metric.detail).toMatch(/never run/);
  });

  it("reports BLOCKED when the transport cannot authenticate, without crashing the module", async () => {
    writeWorkflow("daily.yml", "on:\n  schedule:\n    - cron: '0 6 * * *'\n");
    const client = fakeClient({ "daily.yml": new GithubActionsBlockedError("gh CLI not authenticated") });
    const mod = createGithubActionsScheduleHealthModule({ workflowsDir, client });
    const report = await mod.run(ctx());
    expect(report.moduleError).toBeNull();
    expect(report.metrics.find((m) => m.name === "daily.yml.last_run_status")!.status).toBe("BLOCKED");
  });

  it("reports FAILED (not BLOCKED) for a non-auth transport failure, and one workflow's failure never blocks another's metrics", async () => {
    writeWorkflow("a-broken.yml", "on:\n  schedule:\n    - cron: '0 6 * * *'\n");
    writeWorkflow("b-healthy.yml", "on:\n  schedule:\n    - cron: '0 9 * * *'\n");
    const client = fakeClient({
      "a-broken.yml": new Error("ECONNRESET"),
      "b-healthy.yml": [{ id: 3, status: "completed", conclusion: "success", created_at: "2026-11-17T06:50:00.000Z", run_started_at: "2026-11-17T06:50:00.000Z" }],
    });
    const mod = createGithubActionsScheduleHealthModule({ workflowsDir, client });
    const report = await mod.run(ctx());
    expect(report.metrics.find((m) => m.name === "a-broken.yml.last_run_status")!.status).toBe("FAILED");
    expect(report.metrics.find((m) => m.name === "b-healthy.yml.last_run_status")!.status).toBe("VERIFIED");
  });

  it("reports UNAVAILABLE schedule_adherence for a cron shape the estimator does not recognize, without guessing", async () => {
    writeWorkflow("weird.yml", "on:\n  schedule:\n    - cron: '0 9 1-5 * *'\n");
    const client = fakeClient({ "weird.yml": [{ id: 4, status: "completed", conclusion: "success", created_at: "2026-11-17T06:00:00.000Z", run_started_at: "2026-11-17T06:00:00.000Z" }] });
    const mod = createGithubActionsScheduleHealthModule({ workflowsDir, client });
    const report = await mod.run(ctx());
    expect(report.metrics.find((m) => m.name === "weird.yml.schedule_adherence")!.status).toBe("UNAVAILABLE");
  });
});
