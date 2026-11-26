/**
 * GitHub Actions schedule health -- module 5 of the daily reporting system.
 *
 * REAL AND LIVE: this module (via the default `gh api`-backed transport in ../github-actions-client)
 * was exercised against the actual repo during development --
 *   `gh api repos/arnab-netizen/OPsIq/actions/workflows` and `.../runs` both returned real data in
 *   this sandbox -- so, unlike modules 1-4 and 7, it is not waiting on a credential that doesn't
 *   exist here. It discovers every workflow with a `schedule:`/`cron:` trigger by reading the
 * checked-out workflow YAML (js-yaml, already a devDependency) and cross-references each one's most
 * recent run against the GitHub Actions API, then judges "on time vs overdue" against the cron's own
 * cadence (../cron-cadence) -- never a fixed, made-up threshold.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { isOverdue } from "../cron-cadence";
import { createGhCliTransport, createGithubActionsClient, GithubActionsBlockedError, type GithubActionsClient } from "../github-actions-client";
import { buildMetric, buildSourceReport, type Metric, type SourceContext, type SourceModule, type SourceReport } from "../types";

export const GITHUB_ACTIONS_SCHEDULE_HEALTH_SOURCE_ID = "github-actions-schedule-health";

export interface ScheduledWorkflow {
  fileName: string;
  crons: string[];
}

/** Reads every *.yml/*.yaml under .github/workflows and extracts any `on.schedule[].cron` entries. Pure I/O, no network. */
export function discoverScheduledWorkflows(workflowsDir: string): ScheduledWorkflow[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  } catch {
    return [];
  }
  const result: ScheduledWorkflow[] = [];
  for (const fileName of entries) {
    try {
      const raw = fs.readFileSync(path.join(workflowsDir, fileName), "utf8");
      const doc = yaml.load(raw) as Record<string, unknown> | undefined;
      // YAML parses the bare `on:` key as the boolean `true` in some loaders; workflow files use it as a map.
      const onBlock = (doc?.on ?? (doc as Record<string, unknown>)?.["true" as keyof typeof doc]) as Record<string, unknown> | undefined;
      const schedule = onBlock?.schedule as Array<{ cron?: string }> | undefined;
      const crons = Array.isArray(schedule) ? schedule.map((s) => s.cron).filter((c): c is string => typeof c === "string") : [];
      if (crons.length > 0) result.push({ fileName, crons });
    } catch {
      // Unreadable/unparsable workflow file: skip it rather than fail the whole discovery pass.
      continue;
    }
  }
  return result.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export interface GithubActionsScheduleHealthOptions {
  /** Defaults to <cwd>/.github/workflows. */
  workflowsDir?: string;
  client?: GithubActionsClient;
  owner?: string;
  repo?: string;
  graceMultiplier?: number;
}

export function createGithubActionsScheduleHealthModule(opts: GithubActionsScheduleHealthOptions = {}): SourceModule {
  return {
    id: GITHUB_ACTIONS_SCHEDULE_HEALTH_SOURCE_ID,
    displayName: "GitHub Actions schedule health",
    async run(ctx: SourceContext): Promise<SourceReport> {
      const startedAt = ctx.now().toISOString();
      const workflowsDir = opts.workflowsDir ?? path.join(process.cwd(), ".github", "workflows");
      const owner = opts.owner ?? ctx.env.GITHUB_REPOSITORY_OWNER ?? "arnab-netizen";
      const repo = opts.repo ?? "OPsIq";
      const client = opts.client ?? createGithubActionsClient({ owner, repo, transport: createGhCliTransport() });
      const graceMultiplier = opts.graceMultiplier ?? 2;

      const scheduled = discoverScheduledWorkflows(workflowsDir);
      if (scheduled.length === 0) {
        return buildSourceReport({
          source: GITHUB_ACTIONS_SCHEDULE_HEALTH_SOURCE_ID,
          displayName: "GitHub Actions schedule health",
          startedAt,
          metrics: [
            buildMetric({
              name: "scheduled_workflow_count",
              source: GITHUB_ACTIONS_SCHEDULE_HEALTH_SOURCE_ID,
              status: "UNAVAILABLE",
              window: ctx.window,
              value: null,
              detail: `No cron-scheduled workflows were found under ${workflowsDir}; nothing to check.`,
              retrievedAt: ctx.now().toISOString(),
            }),
          ],
        });
      }

      const metrics: Metric[] = [];
      for (const wf of scheduled) {
        const retrievedAt = ctx.now().toISOString();
        try {
          const runs = await client.listRuns(wf.fileName, 1);
          if (runs.length === 0) {
            metrics.push(
              buildMetric({
                name: `${wf.fileName}.last_run_status`,
                source: GITHUB_ACTIONS_SCHEDULE_HEALTH_SOURCE_ID,
                status: "STALE",
                window: ctx.window,
                value: { crons: wf.crons },
                detail: `${wf.fileName} has a schedule trigger but has never run (zero runs ever; not a confirmed zero).`,
                retrievedAt,
              }),
            );
            continue;
          }
          const latest = runs[0];
          const conclusion = latest.conclusion ?? latest.status ?? "unknown";
          const statusMetricStatus = conclusion === "success" ? "VERIFIED" : conclusion === "in_progress" || conclusion === "queued" ? "VERIFIED" : "FAILED";
          metrics.push(
            buildMetric({
              name: `${wf.fileName}.last_run_status`,
              source: GITHUB_ACTIONS_SCHEDULE_HEALTH_SOURCE_ID,
              status: statusMetricStatus,
              window: ctx.window,
              value: { runId: latest.id, conclusion, createdAt: latest.created_at },
              detail: `${wf.fileName} last run (#${latest.id}, created ${latest.created_at}) concluded "${conclusion}".`,
              retrievedAt,
            }),
          );

          const lastRunAt = new Date(latest.run_started_at ?? latest.created_at);
          const overdueResults = wf.crons.map((cron) => isOverdue(lastRunAt, cron, ctx.now(), graceMultiplier));
          if (overdueResults.every((r) => r === null)) {
            metrics.push(
              buildMetric({
                name: `${wf.fileName}.schedule_adherence`,
                source: GITHUB_ACTIONS_SCHEDULE_HEALTH_SOURCE_ID,
                status: "UNAVAILABLE",
                window: ctx.window,
                value: { crons: wf.crons },
                detail: `${wf.fileName}'s cron expression(s) (${wf.crons.join(", ")}) are not a cadence shape this estimator recognizes; adherence cannot be judged.`,
                retrievedAt,
              }),
            );
          } else {
            const overdue = overdueResults.some((r) => r === true);
            metrics.push(
              buildMetric({
                name: `${wf.fileName}.schedule_adherence`,
                source: GITHUB_ACTIONS_SCHEDULE_HEALTH_SOURCE_ID,
                status: overdue ? "STALE" : "VERIFIED",
                window: ctx.window,
                value: { lastRunAt: lastRunAt.toISOString(), crons: wf.crons },
                detail: overdue
                  ? `${wf.fileName}'s last run at ${lastRunAt.toISOString()} is overdue against its own cron cadence (${wf.crons.join(", ")}).`
                  : `${wf.fileName}'s last run at ${lastRunAt.toISOString()} is within its own cron cadence (${wf.crons.join(", ")}).`,
                retrievedAt,
              }),
            );
          }
        } catch (err) {
          const blocked = err instanceof GithubActionsBlockedError;
          metrics.push(
            buildMetric({
              name: `${wf.fileName}.last_run_status`,
              source: GITHUB_ACTIONS_SCHEDULE_HEALTH_SOURCE_ID,
              status: blocked ? "BLOCKED" : "FAILED",
              window: ctx.window,
              value: null,
              detail: `Could not retrieve runs for ${wf.fileName}: ${String((err as Error)?.message ?? err)}`,
              retrievedAt,
            }),
          );
        }
      }

      return buildSourceReport({
        source: GITHUB_ACTIONS_SCHEDULE_HEALTH_SOURCE_ID,
        displayName: "GitHub Actions schedule health",
        startedAt,
        metrics,
      });
    },
  };
}
