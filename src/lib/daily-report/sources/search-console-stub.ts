/**
 * Google Search Console -- module 7 of the daily reporting system.
 *
 * STUB ONLY. A real Search Console integration is being built in a separate PR this session; this
 * module deliberately does not duplicate that work. It exists purely so the orchestrator has a
 * slot for GSC today, wired to this framework's exact SourceModule interface, so swapping in the
 * real client later is a one-file change (replace this module's implementation; the id, metric
 * name and shape can stay the same if convenient, or the real PR's own module can simply be added
 * and this stub deleted).
 *
 * Always reports BLOCKED with reason "no credential configured" -- never anything else.
 */
import { buildMetric, buildSourceReport, type SourceContext, type SourceModule, type SourceReport } from "../types";

export const SEARCH_CONSOLE_SOURCE_ID = "google-search-console";
const METRIC_NAME = "search_console_status";
export const SEARCH_CONSOLE_BLOCKED_REASON = "no credential configured";

export function createSearchConsoleStubModule(): SourceModule {
  return {
    id: SEARCH_CONSOLE_SOURCE_ID,
    displayName: "Google Search Console",
    async run(ctx: SourceContext): Promise<SourceReport> {
      const startedAt = ctx.now().toISOString();
      const retrievedAt = ctx.now().toISOString();
      return buildSourceReport({
        source: SEARCH_CONSOLE_SOURCE_ID,
        displayName: "Google Search Console",
        startedAt,
        metrics: [
          buildMetric({
            name: METRIC_NAME,
            source: SEARCH_CONSOLE_SOURCE_ID,
            status: "BLOCKED",
            window: ctx.window,
            value: null,
            detail: SEARCH_CONSOLE_BLOCKED_REASON,
            retrievedAt,
          }),
        ],
      });
    },
  };
}
