/**
 * Backup freshness -- module 8 of the daily reporting system.
 *
 * REAL AND LIVE, same transport as module 5: `gh api repos/arnab-netizen/OPsIq/actions/workflows/scheduled-backup-r2.yml/runs`.
 * This workflow (.github/workflows/scheduled-backup-r2.yml) is `workflow_dispatch`-only -- it has no
 * cron trigger -- so freshness here is judged against a fixed staleness bound (default 36h), not a
 * cron cadence (module 5 already covers the separate, actually-scheduled scheduled-backup.yml).
 *
 * Zero runs ever is reported as BLOCKED (nothing to observe yet), never CONFIRMED_ZERO -- that state
 * is reserved for a source that was successfully queried and genuinely returned a zero count, which
 * "the backup workflow has never run" is not: it is an absence of data, not an observed zero.
 */
import {
  createGhCliTransport,
  createGithubActionsClient,
  GithubActionsBlockedError,
  type GithubActionsClient,
} from "../github-actions-client";
import { scrubLogText } from "@/lib/operator-error-governance";
import { buildMetric, buildSourceReport, type SourceContext, type SourceModule, type SourceReport } from "../types";

export const BACKUP_FRESHNESS_SOURCE_ID = "backup-freshness";
const METRIC_NAME = "last_successful_backup_age";
export const BACKUP_WORKFLOW_FILE = "scheduled-backup-r2.yml";

export interface BackupFreshnessOptions {
  client?: GithubActionsClient;
  owner?: string;
  repo?: string;
  workflowFile?: string;
  /** How old the last successful run may be before STALE instead of VERIFIED. Default 36h. */
  staleAfterMs?: number;
}

export function createBackupFreshnessModule(opts: BackupFreshnessOptions = {}): SourceModule {
  return {
    id: BACKUP_FRESHNESS_SOURCE_ID,
    displayName: "Backup freshness",
    async run(ctx: SourceContext): Promise<SourceReport> {
      const startedAt = ctx.now().toISOString();
      const owner = opts.owner ?? ctx.env.GITHUB_REPOSITORY_OWNER ?? "arnab-netizen";
      const repo = opts.repo ?? "OPsIq";
      const workflowFile = opts.workflowFile ?? BACKUP_WORKFLOW_FILE;
      const client = opts.client ?? createGithubActionsClient({ owner, repo, transport: createGhCliTransport() });
      const staleAfterMs = opts.staleAfterMs ?? 36 * 60 * 60 * 1000;
      const retrievedAt = ctx.now().toISOString();

      try {
        const runs = await client.listRuns(workflowFile, 20);
        if (runs.length === 0) {
          return single(ctx, startedAt, "BLOCKED", null, `${workflowFile} has zero runs ever; there is nothing to observe (not a confirmed zero -- a confirmed zero requires a successful query that found real data to count).`);
        }

        const successfulRuns = runs.filter((r) => r.conclusion === "success");
        if (successfulRuns.length === 0) {
          const latest = runs[0];
          return single(
            ctx,
            startedAt,
            "STALE",
            { latestRunId: latest.id, latestConclusion: latest.conclusion, runsObserved: runs.length },
            `${workflowFile} has ${runs.length} run(s) but none succeeded (most recent concluded "${latest.conclusion ?? latest.status ?? "unknown"}"); no successful backup to measure freshness from.`,
          );
        }

        const latestSuccess = successfulRuns[0];
        const lastSuccessAt = new Date(latestSuccess.run_started_at ?? latestSuccess.created_at);
        const ageMs = ctx.now().getTime() - lastSuccessAt.getTime();
        const value = { lastSuccessfulRunId: latestSuccess.id, lastSuccessAt: lastSuccessAt.toISOString(), ageHours: Math.round(ageMs / 3_600_000) };

        if (ageMs > staleAfterMs) {
          return single(ctx, startedAt, "STALE", value, `Last successful backup (#${latestSuccess.id}) was ${value.ageHours}h ago, exceeding the ${Math.round(staleAfterMs / 3_600_000)}h freshness bound.`);
        }
        return single(ctx, startedAt, "VERIFIED", value, `Last successful backup (#${latestSuccess.id}) was ${value.ageHours}h ago, within the freshness bound.`);
      } catch (err) {
        const blocked = err instanceof GithubActionsBlockedError;
        const safeDetail = `Could not retrieve runs for ${workflowFile}: ${scrubLogText(String((err as Error)?.message ?? err))}`;
        return single(ctx, startedAt, blocked ? "BLOCKED" : "FAILED", null, safeDetail);
      }

      function single(
        c: SourceContext,
        sAt: string,
        status: Parameters<typeof buildMetric>[0]["status"],
        value: unknown,
        detail: string,
      ): SourceReport {
        return buildSourceReport({
          source: BACKUP_FRESHNESS_SOURCE_ID,
          displayName: "Backup freshness",
          startedAt: sAt,
          metrics: [buildMetric({ name: METRIC_NAME, source: BACKUP_FRESHNESS_SOURCE_ID, status, window: c.window, value, detail, retrievedAt })],
        });
      }
    },
  };
}
