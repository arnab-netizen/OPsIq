/**
 * Vercel Web Analytics adapter -- module 2 of the daily reporting system.
 *
 * KNOWN BROKEN INTEGRATION, documented and NOT being re-investigated in this task:
 *   GET /v1/query/web-analytics/visits/count returns 404 despite the Vercel dashboard showing
 *   real visit data for the same project. Root cause unproven (undocumented/renamed endpoint,
 *   wrong query shape, or a plan/scope gate -- unknown).
 *
 * This adapter is built against the documented endpoint contract (Vercel's public Web Analytics
 * query API: GET {apiBase}/v1/query/web-analytics/visits/count?projectId=...&from=...&to=...,
 * bearer VERCEL_TOKEN) so it is ready to flip on the instant that 404 resolves -- no shape change
 * needed, just the fix landing server-side. Until then:
 *   - no credential configured  -> BLOCKED
 *   - the documented 404        -> UNAVAILABLE, with the literal error, never a fabricated 0 or stale number
 *   - any other HTTP failure    -> FAILED
 *   - a genuine 200 with count 0 -> CONFIRMED_ZERO (a real, successful zero, once the endpoint works)
 *   - a genuine 200 with count > 0 -> VERIFIED
 */
import { fetchJson, HttpTransportError, type FetchLike } from "../http";
import { buildMetric, buildSourceReport, type SourceContext, type SourceModule, type SourceReport } from "../types";

export const VERCEL_WEB_ANALYTICS_SOURCE_ID = "vercel-web-analytics";
const METRIC_NAME = "visits_count";

/** The documented (but currently 404'ing) endpoint contract. Kept as a named constant so a future fix is a one-line change. */
export const WEB_ANALYTICS_VISITS_COUNT_PATH = "/v1/query/web-analytics/visits/count";

interface VisitsCountResponse {
  data?: Array<{ total?: number }>;
  total?: number;
}

export interface VercelWebAnalyticsOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export function createVercelWebAnalyticsModule(opts: VercelWebAnalyticsOptions = {}): SourceModule {
  return {
    id: VERCEL_WEB_ANALYTICS_SOURCE_ID,
    displayName: "Vercel Web Analytics",
    async run(ctx: SourceContext): Promise<SourceReport> {
      const startedAt = ctx.now().toISOString();
      const token = ctx.env.VERCEL_TOKEN;
      const projectId = ctx.env.VERCEL_PROJECT_ID;
      const apiBase = ctx.env.VERCEL_API_BASE || "https://api.vercel.com";
      const teamId = ctx.env.VERCEL_TEAM_ID;

      if (!token || !projectId) {
        const missing = !token && !projectId ? "VERCEL_TOKEN and VERCEL_PROJECT_ID" : !token ? "VERCEL_TOKEN" : "VERCEL_PROJECT_ID";
        return single(ctx, startedAt, "BLOCKED", null, `${missing} not configured in this environment; no request was attempted.`);
      }

      const params = new URLSearchParams({
        projectId,
        from: ctx.window.start,
        to: ctx.window.end,
      });
      if (teamId) params.set("teamId", teamId);
      const url = `${apiBase}${WEB_ANALYTICS_VISITS_COUNT_PATH}?${params.toString()}`;

      try {
        const res = await fetchJson<VisitsCountResponse>({
          url,
          init: { headers: { Authorization: `Bearer ${token}` }, signal: ctx.signal },
          fetchImpl: opts.fetchImpl,
          timeoutMs: opts.timeoutMs,
          signal: ctx.signal,
        });

        if (res.status === 404) {
          return single(
            ctx,
            startedAt,
            "UNAVAILABLE",
            null,
            `Vercel Web Analytics API returned HTTP 404 for ${WEB_ANALYTICS_VISITS_COUNT_PATH} (known-broken endpoint contract; the Vercel dashboard shows real data for this project, but this API call does not resolve). Not fabricating a count.`,
          );
        }
        if (!res.ok) {
          return single(ctx, startedAt, "FAILED", null, `Vercel Web Analytics API returned HTTP ${res.status} for ${WEB_ANALYTICS_VISITS_COUNT_PATH}.`);
        }
        if (res.parseError || !res.json) {
          return single(ctx, startedAt, "FAILED", null, `Vercel Web Analytics API response could not be parsed: ${res.parseError ?? "empty body"}.`);
        }

        const total = typeof res.json.total === "number" ? res.json.total : res.json.data?.[0]?.total;
        if (typeof total !== "number" || !Number.isFinite(total)) {
          return single(ctx, startedAt, "FAILED", null, "Vercel Web Analytics API returned 200 but no numeric visit total was present in the body.");
        }
        if (total === 0) {
          return single(ctx, startedAt, "CONFIRMED_ZERO", { visits: 0 }, "Vercel Web Analytics reported zero visits for this window (a real, successfully-retrieved zero).");
        }
        return single(ctx, startedAt, "VERIFIED", { visits: total }, `Vercel Web Analytics reported ${total} visits for this window.`);
      } catch (err) {
        const message = err instanceof HttpTransportError ? err.message : `unexpected error calling Vercel Web Analytics API: ${String((err as Error)?.message ?? err)}`;
        return single(ctx, startedAt, "FAILED", null, message);
      }
    },
  };
}

function single(ctx: SourceContext, startedAt: string, status: Parameters<typeof buildMetric>[0]["status"], value: unknown, detail: string): SourceReport {
  const retrievedAt = ctx.now().toISOString();
  return buildSourceReport({
    source: VERCEL_WEB_ANALYTICS_SOURCE_ID,
    displayName: "Vercel Web Analytics",
    startedAt,
    metrics: [buildMetric({ name: METRIC_NAME, source: VERCEL_WEB_ANALYTICS_SOURCE_ID, status, window: ctx.window, value, detail, retrievedAt })],
  });
}
