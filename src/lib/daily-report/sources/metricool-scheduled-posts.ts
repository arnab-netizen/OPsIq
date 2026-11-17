/**
 * Metricool scheduled-post status -- module 4 of the daily reporting system.
 *
 * No existing Metricool integration code was found anywhere in this repo (checked src/lib,
 * src/services, src/infra, scripts). This is a new, thin client against Metricool's documented
 * public API auth/endpoint convention:
 *   GET https://app.metricool.com/api/v2/scheduler/posts?blogId=...&userId=...&start=...&end=...
 *     X-Mc-Auth: <METRICOOL_API_TOKEN>
 * (per Metricool's "Common questions and errors when using the API" and "Basic Guide for API
 * Integration" help-center pages: userId/blogId travel as query params, the account token travels
 * in the X-Mc-Auth header.)
 *
 * No METRICOOL_API_TOKEN/METRICOOL_BLOG_ID/METRICOOL_USER_ID exist in this sandbox, so this module
 * reports BLOCKED cleanly -- proven correct by fixture tests for the day credentials are configured.
 */
import { fetchJson, HttpTransportError, type FetchLike } from "../http";
import { buildMetric, buildSourceReport, type SourceContext, type SourceModule, type SourceReport } from "../types";

export const METRICOOL_SOURCE_ID = "metricool-scheduled-posts";
const METRIC_NAME = "scheduled_post_failures";

interface MetricoolPost {
  id?: string | number;
  publicationDate?: { dateTime?: string };
  status?: string; // e.g. "PUBLISHED", "SCHEDULED", "ERROR", "DRAFT"
  providers?: Array<{ network?: string }>;
}
type MetricoolPostsResponse = MetricoolPost[] | { data?: MetricoolPost[] };

export interface MetricoolOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  apiBase?: string;
}

export function createMetricoolModule(opts: MetricoolOptions = {}): SourceModule {
  return {
    id: METRICOOL_SOURCE_ID,
    displayName: "Metricool scheduled-post status",
    async run(ctx: SourceContext): Promise<SourceReport> {
      const startedAt = ctx.now().toISOString();
      const token = ctx.env.METRICOOL_API_TOKEN;
      const blogId = ctx.env.METRICOOL_BLOG_ID;
      const userId = ctx.env.METRICOOL_USER_ID;
      const apiBase = opts.apiBase ?? ctx.env.METRICOOL_API_BASE ?? "https://app.metricool.com/api/v2";

      const missing = [
        !token ? "METRICOOL_API_TOKEN" : null,
        !blogId ? "METRICOOL_BLOG_ID" : null,
        !userId ? "METRICOOL_USER_ID" : null,
      ].filter((m): m is string => m !== null);
      if (missing.length > 0) {
        return single(ctx, startedAt, "BLOCKED", null, `${missing.join(" and ")} not configured in this environment; no request was attempted.`);
      }

      const params = new URLSearchParams({ blogId: blogId!, userId: userId!, start: ctx.window.start, end: ctx.window.end });
      const url = `${apiBase}/scheduler/posts?${params.toString()}`;

      try {
        const res = await fetchJson<MetricoolPostsResponse>({
          url,
          init: { headers: { "X-Mc-Auth": token! }, signal: ctx.signal },
          fetchImpl: opts.fetchImpl,
          timeoutMs: opts.timeoutMs,
          signal: ctx.signal,
        });

        if (!res.ok) {
          return single(ctx, startedAt, "FAILED", null, `Metricool API returned HTTP ${res.status} for /scheduler/posts.`);
        }
        if (res.parseError || !res.json) {
          return single(ctx, startedAt, "FAILED", null, `Metricool API response could not be parsed: ${res.parseError ?? "empty body"}.`);
        }

        const posts = Array.isArray(res.json) ? res.json : res.json.data;
        if (!Array.isArray(posts)) {
          return single(ctx, startedAt, "FAILED", null, "Metricool API returned 200 but the response body was not a post list.");
        }

        const failures = posts.filter((p) => (p.status ?? "").toUpperCase() === "ERROR");
        const value = { totalScheduled: posts.length, failures: failures.length, failedPostIds: failures.map((p) => p.id ?? null) };

        if (failures.length === 0) {
          return single(
            ctx,
            startedAt,
            "CONFIRMED_ZERO",
            value,
            `Metricool reported ${posts.length} scheduled post(s) in this window with zero failures (a real, successfully-retrieved zero).`,
          );
        }
        return single(ctx, startedAt, "VERIFIED", value, `Metricool reported ${failures.length} of ${posts.length} scheduled post(s) in a failed/ERROR state.`);
      } catch (err) {
        const message = err instanceof HttpTransportError ? err.message : `unexpected error calling Metricool API: ${String((err as Error)?.message ?? err)}`;
        return single(ctx, startedAt, "FAILED", null, message);
      }
    },
  };
}

function single(ctx: SourceContext, startedAt: string, status: Parameters<typeof buildMetric>[0]["status"], value: unknown, detail: string): SourceReport {
  const retrievedAt = ctx.now().toISOString();
  return buildSourceReport({
    source: METRICOOL_SOURCE_ID,
    displayName: "Metricool scheduled-post status",
    startedAt,
    metrics: [buildMetric({ name: METRIC_NAME, source: METRICOOL_SOURCE_ID, status, window: ctx.window, value, detail, retrievedAt })],
  });
}
