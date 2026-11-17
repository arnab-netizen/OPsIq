/**
 * Shared contract for the modular autonomous daily reporting system.
 *
 * Design rules (do not weaken these in any source module):
 *  - Exactly six verification states exist. No module may invent a seventh.
 *      VERIFIED       - the source was queried successfully and returned a real, trustworthy value.
 *      CONFIRMED_ZERO - the source was queried successfully and genuinely returned zero. Never used for
 *                       "we have no data" or "we couldn't reach it" -- only for a real, observed zero.
 *      UNAVAILABLE    - the source was reachable/credentialed but the specific data is not obtainable
 *                       right now for a known, documented reason (e.g. a broken endpoint contract).
 *      STALE          - data was retrieved but is older than the reporting window tolerates, or the
 *                       thing being measured has "never happened" in a way that must not be mistaken
 *                       for a confirmed zero (e.g. a scheduled job with zero runs ever).
 *      BLOCKED        - the module could not even attempt the query (no credential/config in this
 *                       environment). This is the default, honest state when a secret is absent.
 *      FAILED         - the module attempted the query and it errored (network, HTTP error, malformed
 *                       response, timeout).
 *  - Every Metric carries its source id, the reporting window it describes, the retrieval timestamp,
 *    and its verification status. `detail` must always explain the status in one sentence.
 *  - A module's run() must NEVER throw for an ordinary failure mode (missing credential, HTTP error,
 *    timeout, malformed body). Those become FAILED/BLOCKED/UNAVAILABLE metrics. The orchestrator adds a
 *    second, independent safety net (Promise.allSettled + per-module timeout) for the case a module
 *    still throws or hangs, so one module can never prevent others from reporting.
 */

export type MetricStatus = "VERIFIED" | "CONFIRMED_ZERO" | "UNAVAILABLE" | "STALE" | "BLOCKED" | "FAILED";

export const METRIC_STATUSES: readonly MetricStatus[] = [
  "VERIFIED",
  "CONFIRMED_ZERO",
  "UNAVAILABLE",
  "STALE",
  "BLOCKED",
  "FAILED",
] as const;

/** The period a metric describes. ISO-8601 instants, end exclusive-or-inclusive per module convention, always stated in `detail` if it matters. */
export interface ReportingWindow {
  readonly start: string;
  readonly end: string;
}

/** One fact about one source, with full provenance. */
export interface Metric {
  /** Stable, machine-readable name, unique within a source (e.g. "latest_deployment_state"). */
  readonly name: string;
  /** The module id that produced this metric (e.g. "vercel-runtime-health"). */
  readonly source: string;
  readonly status: MetricStatus;
  readonly window: ReportingWindow;
  /** When this module actually attempted the retrieval (ISO-8601). */
  readonly retrievedAt: string;
  /** The retrieved value, or null when status is BLOCKED/UNAVAILABLE/FAILED/STALE-never-happened. */
  readonly value: unknown;
  /** One-sentence human explanation of the status -- never empty. */
  readonly detail: string;
}

/** Everything one source module produced for one run, plus its own execution bookkeeping. */
export interface SourceReport {
  readonly source: string;
  readonly displayName: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly metrics: readonly Metric[];
  /**
   * Non-null only if the module itself crashed or timed out OUTSIDE its own error handling (the
   * orchestrator's safety net caught it). A well-behaved module leaves this null even when every one
   * of its metrics is BLOCKED or FAILED, because that is a normal, handled outcome, not a module crash.
   */
  readonly moduleError: string | null;
}

export interface SourceContext {
  readonly window: ReportingWindow;
  readonly now: () => Date;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
}

export interface SourceModule {
  readonly id: string;
  readonly displayName: string;
  run(ctx: SourceContext): Promise<SourceReport>;
}

/** Builds a single Metric with a consistent shape. `retrievedAt` defaults to ctx.now(). */
export function buildMetric(args: {
  name: string;
  source: string;
  status: MetricStatus;
  window: ReportingWindow;
  value: unknown;
  detail: string;
  retrievedAt?: string;
}): Metric {
  return {
    name: args.name,
    source: args.source,
    status: args.status,
    window: args.window,
    value: args.value,
    detail: args.detail,
    retrievedAt: args.retrievedAt ?? new Date().toISOString(),
  };
}

/** Builds a SourceReport from a list of metrics already produced by a module. */
export function buildSourceReport(args: {
  source: string;
  displayName: string;
  startedAt: string;
  finishedAt?: string;
  metrics: readonly Metric[];
  moduleError?: string | null;
}): SourceReport {
  const finishedAt = args.finishedAt ?? new Date().toISOString();
  return {
    source: args.source,
    displayName: args.displayName,
    startedAt: args.startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(args.startedAt).getTime()),
    metrics: args.metrics,
    moduleError: args.moduleError ?? null,
  };
}

/** A default 24h reporting window ending now, used when the caller does not specify one. */
export function last24HourWindow(now: Date = new Date()): ReportingWindow {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  return { start, end };
}
