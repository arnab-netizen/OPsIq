/**
 * Neon expenditure/usage -- module 3 of the daily reporting system.
 *
 * No existing Neon API integration was found anywhere in this repo (checked src/lib, src/services,
 * src/infra, scripts -- the only "neon" hits are database-identity/connection-string guards, which
 * talk to Postgres itself, not the Neon control-plane API). This is a new, thin client against
 * Neon's documented consumption API:
 *   GET https://console.neon.tech/api/v2/consumption_history/projects
 *     ?from=...&to=...&granularity=daily&project_ids=...
 *     Authorization: Bearer <NEON_API_KEY>
 * (confirmed against Neon's own API reference: neon.com/docs/reference/api/consumption/get-consumption-history-per-project)
 *
 * NEON_API_KEY is not configured in this sandbox, so this module reports BLOCKED cleanly -- the
 * correct outcome here, proven by fixture tests for the day one *is* configured.
 */
import { fetchJson, HttpTransportError, type FetchLike } from "../http";
import { scrubLogText } from "@/lib/operator-error-governance";
import { buildMetric, buildSourceReport, type SourceContext, type SourceModule, type SourceReport } from "../types";

export const NEON_USAGE_SOURCE_ID = "neon-usage";
const METRIC_NAME = "compute_time_seconds";

interface NeonConsumptionPeriod {
  period_id?: string;
  consumption?: Array<{
    timeframe_start?: string;
    timeframe_end?: string;
    compute_time_seconds?: number;
    active_time_seconds?: number;
    written_data_bytes?: number;
    synthetic_storage_size_bytes?: number;
  }>;
}
interface NeonConsumptionResponse {
  projects?: Array<{ project_id?: string; periods?: NeonConsumptionPeriod[] }>;
}

export interface NeonUsageOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  apiBase?: string;
}

export function createNeonUsageModule(opts: NeonUsageOptions = {}): SourceModule {
  return {
    id: NEON_USAGE_SOURCE_ID,
    displayName: "Neon expenditure/usage",
    async run(ctx: SourceContext): Promise<SourceReport> {
      const startedAt = ctx.now().toISOString();
      const apiKey = ctx.env.NEON_API_KEY;
      const projectId = ctx.env.NEON_PROJECT_ID;
      const apiBase = opts.apiBase ?? ctx.env.NEON_API_BASE ?? "https://console.neon.tech/api/v2";

      if (!apiKey) {
        return single(ctx, startedAt, "BLOCKED", null, "NEON_API_KEY is not configured in this environment; no request was attempted.");
      }
      if (!projectId) {
        return single(ctx, startedAt, "BLOCKED", null, "NEON_API_KEY is set but NEON_PROJECT_ID is not configured; no request was attempted.");
      }

      const params = new URLSearchParams({
        from: ctx.window.start,
        to: ctx.window.end,
        granularity: "daily",
        project_ids: projectId,
      });
      const url = `${apiBase}/consumption_history/projects?${params.toString()}`;

      try {
        const res = await fetchJson<NeonConsumptionResponse>({
          url,
          init: { headers: { Authorization: `Bearer ${apiKey}` }, signal: ctx.signal },
          fetchImpl: opts.fetchImpl,
          timeoutMs: opts.timeoutMs,
          signal: ctx.signal,
        });

        if (!res.ok) {
          return single(ctx, startedAt, "FAILED", null, `Neon consumption API returned HTTP ${res.status} for /consumption_history/projects.`);
        }
        if (res.parseError || !res.json) {
          return single(ctx, startedAt, "FAILED", null, `Neon consumption API response could not be parsed: ${res.parseError ?? "empty body"}.`);
        }

        const project = res.json.projects?.find((p) => p.project_id === projectId) ?? res.json.projects?.[0];
        if (!project) {
          return single(ctx, startedAt, "UNAVAILABLE", null, `Neon consumption API returned no project entry for project_id=${projectId}.`);
        }
        const rows = (project.periods ?? []).flatMap((p) => p.consumption ?? []);
        if (rows.length === 0) {
          return single(ctx, startedAt, "UNAVAILABLE", null, "Neon consumption API returned the project but no consumption rows for this window.");
        }

        const totalComputeSeconds = rows.reduce((sum, r) => sum + (r.compute_time_seconds ?? 0), 0);
        const totalWrittenBytes = rows.reduce((sum, r) => sum + (r.written_data_bytes ?? 0), 0);
        const value = { computeTimeSeconds: totalComputeSeconds, writtenDataBytes: totalWrittenBytes, periods: rows.length };

        if (totalComputeSeconds === 0 && totalWrittenBytes === 0) {
          return single(ctx, startedAt, "CONFIRMED_ZERO", value, "Neon reported zero compute time and zero written data for this project in this window (a real, successfully-retrieved zero).");
        }
        return single(ctx, startedAt, "VERIFIED", value, `Neon reported ${totalComputeSeconds}s compute time and ${totalWrittenBytes} written bytes across ${rows.length} period row(s).`);
      } catch (err) {
        let safeMessage: string;
        if (err instanceof HttpTransportError) {
          safeMessage = scrubLogText(err.message);
        } else {
          safeMessage = `unexpected error calling Neon consumption API: ${scrubLogText(String((err as Error)?.message ?? err))}`;
        }
        return single(ctx, startedAt, "FAILED", null, safeMessage);
      }
    },
  };
}

function single(ctx: SourceContext, startedAt: string, status: Parameters<typeof buildMetric>[0]["status"], value: unknown, detail: string): SourceReport {
  const retrievedAt = ctx.now().toISOString();
  return buildSourceReport({
    source: NEON_USAGE_SOURCE_ID,
    displayName: "Neon expenditure/usage",
    startedAt,
    metrics: [buildMetric({ name: METRIC_NAME, source: NEON_USAGE_SOURCE_ID, status, window: ctx.window, value, detail, retrievedAt })],
  });
}
