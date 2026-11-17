/**
 * Vercel runtime health -- module 1 of the daily reporting system.
 *
 * Follows the same env-var/auth convention already used for Vercel in this repo (see
 * scripts/stage7-probes/s7-i1-health-probe.mjs and scripts/release/lib/paywall-release.mjs):
 * a bearer VERCEL_TOKEN against VERCEL_API_BASE (default https://api.vercel.com), scoped to a
 * project via VERCEL_PROJECT_ID (and optionally a team via VERCEL_TEAM_ID).
 *
 * No live VERCEL_TOKEN exists in this sandbox, so this module reports BLOCKED cleanly when the
 * credential is absent -- that is the expected, correct outcome here. It is built so that supplying
 * VERCEL_TOKEN and VERCEL_PROJECT_ID in any environment (including CI) makes it start reporting real
 * deployment health immediately, with no code change.
 */
import { fetchJson, HttpTransportError, type FetchLike } from "../http";
import { buildMetric, buildSourceReport, type SourceContext, type SourceModule, type SourceReport } from "../types";

export const VERCEL_RUNTIME_HEALTH_SOURCE_ID = "vercel-runtime-health";

interface VercelDeploymentsResponse {
  deployments?: Array<{
    uid?: string;
    url?: string;
    created?: number;
    createdAt?: number;
    state?: string;
    readyState?: string;
    target?: string | null;
    meta?: { githubCommitSha?: string };
  }>;
}

export interface VercelRuntimeHealthOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** How old the latest deployment may be before it is reported STALE instead of VERIFIED. Default 48h. */
  staleAfterMs?: number;
}

export function createVercelRuntimeHealthModule(opts: VercelRuntimeHealthOptions = {}): SourceModule {
  return {
    id: VERCEL_RUNTIME_HEALTH_SOURCE_ID,
    displayName: "Vercel runtime health",
    async run(ctx: SourceContext): Promise<SourceReport> {
      const startedAt = ctx.now().toISOString();
      const metricName = "latest_deployment_state";
      const token = ctx.env.VERCEL_TOKEN;
      const projectId = ctx.env.VERCEL_PROJECT_ID;
      const apiBase = ctx.env.VERCEL_API_BASE || "https://api.vercel.com";
      const teamId = ctx.env.VERCEL_TEAM_ID;

      if (!token) {
        return buildSourceReport({
          source: VERCEL_RUNTIME_HEALTH_SOURCE_ID,
          displayName: "Vercel runtime health",
          startedAt,
          metrics: [
            buildMetric({
              name: metricName,
              source: VERCEL_RUNTIME_HEALTH_SOURCE_ID,
              status: "BLOCKED",
              window: ctx.window,
              value: null,
              detail: "VERCEL_TOKEN is not configured in this environment; no request was attempted.",
              retrievedAt: ctx.now().toISOString(),
            }),
          ],
        });
      }
      if (!projectId) {
        return buildSourceReport({
          source: VERCEL_RUNTIME_HEALTH_SOURCE_ID,
          displayName: "Vercel runtime health",
          startedAt,
          metrics: [
            buildMetric({
              name: metricName,
              source: VERCEL_RUNTIME_HEALTH_SOURCE_ID,
              status: "BLOCKED",
              window: ctx.window,
              value: null,
              detail: "VERCEL_TOKEN is set but VERCEL_PROJECT_ID is not configured; no request was attempted.",
              retrievedAt: ctx.now().toISOString(),
            }),
          ],
        });
      }

      const params = new URLSearchParams({ projectId, target: "production", limit: "1" });
      if (teamId) params.set("teamId", teamId);
      const url = `${apiBase}/v6/deployments?${params.toString()}`;
      const retrievedAt = ctx.now().toISOString();

      try {
        const res = await fetchJson<VercelDeploymentsResponse>({
          url,
          init: { headers: { Authorization: `Bearer ${token}` }, signal: ctx.signal },
          fetchImpl: opts.fetchImpl,
          timeoutMs: opts.timeoutMs,
          signal: ctx.signal,
        });

        if (!res.ok) {
          return oneMetricReport(ctx, metricName, "FAILED", null, `Vercel API returned HTTP ${res.status} for ${url.replace(apiBase, "")}`, retrievedAt);
        }
        if (res.parseError || !res.json) {
          return oneMetricReport(ctx, metricName, "FAILED", null, `Vercel API response could not be parsed: ${res.parseError ?? "empty body"}`, retrievedAt);
        }
        const deployments = res.json.deployments;
        if (!Array.isArray(deployments) || deployments.length === 0) {
          return oneMetricReport(
            ctx,
            metricName,
            "UNAVAILABLE",
            null,
            "Vercel reported zero production deployments for this project; deployment health cannot be assessed.",
            retrievedAt,
          );
        }

        const latest = deployments[0];
        const createdMs = latest.createdAt ?? latest.created;
        const state = latest.readyState ?? latest.state ?? "UNKNOWN";
        const staleAfterMs = opts.staleAfterMs ?? 48 * 60 * 60 * 1000;
        const ageMs = typeof createdMs === "number" ? ctx.now().getTime() - createdMs : null;
        const value = {
          deploymentId: latest.uid ?? null,
          state,
          url: latest.url ?? null,
          commitSha: latest.meta?.githubCommitSha ?? null,
          createdAt: typeof createdMs === "number" ? new Date(createdMs).toISOString() : null,
        };

        if (ageMs !== null && ageMs > staleAfterMs) {
          return oneMetricReport(
            ctx,
            metricName,
            "STALE",
            value,
            `Latest production deployment is ${Math.round(ageMs / 3_600_000)}h old, exceeding the ${Math.round(staleAfterMs / 3_600_000)}h freshness bound.`,
            retrievedAt,
          );
        }
        return oneMetricReport(ctx, metricName, "VERIFIED", value, `Latest production deployment state is "${state}".`, retrievedAt);
      } catch (err) {
        const message = err instanceof HttpTransportError ? err.message : `unexpected error calling Vercel API: ${String((err as Error)?.message ?? err)}`;
        return oneMetricReport(ctx, metricName, "FAILED", null, message, retrievedAt);
      }
    },
  };
}

function oneMetricReport(
  ctx: SourceContext,
  name: string,
  status: Parameters<typeof buildMetric>[0]["status"],
  value: unknown,
  detail: string,
  retrievedAt: string,
): SourceReport {
  return buildSourceReport({
    source: VERCEL_RUNTIME_HEALTH_SOURCE_ID,
    displayName: "Vercel runtime health",
    startedAt: retrievedAt,
    metrics: [buildMetric({ name, source: VERCEL_RUNTIME_HEALTH_SOURCE_ID, status, window: ctx.window, value, detail, retrievedAt })],
  });
}
