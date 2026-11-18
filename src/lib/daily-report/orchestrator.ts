/**
 * Orchestrator for the modular autonomous daily reporting system.
 *
 * Runs every registered source module in parallel. A module's failure, throw, rejection or timeout
 * must never prevent any other module's results from appearing in the final report -- this is
 * enforced with Promise.allSettled PLUS a per-module timeout race, which is a second, independent
 * safety net beyond each module's own internal try/catch (see types.ts for why both layers exist).
 */
import { buildSourceReport, last24HourWindow, type ReportingWindow, type SourceModule, type SourceReport } from "./types";

export interface DailyReport {
  readonly generatedAt: string;
  readonly window: ReportingWindow;
  readonly sources: readonly SourceReport[];
}

export interface RunOrchestratorOptions {
  modules: readonly SourceModule[];
  window?: ReportingWindow;
  now?: () => Date;
  env?: Readonly<Record<string, string | undefined>>;
  /** Per-module wall-clock budget. A module that exceeds this is reported as FAILED, never allowed to hang the run. Default 30s. */
  perModuleTimeoutMs?: number;
}

function timeoutGuard<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`module exceeded its ${ms}ms execution budget`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function runDailyReportOrchestrator(opts: RunOrchestratorOptions): Promise<DailyReport> {
  const now = opts.now ?? (() => new Date());
  const window = opts.window ?? last24HourWindow(now());
  const env = opts.env ?? process.env;
  const perModuleTimeoutMs = opts.perModuleTimeoutMs ?? 30_000;

  const settled = await Promise.allSettled(
    opts.modules.map((mod) =>
      // Wrapped in an async IIFE so a module that throws SYNCHRONOUSLY (before ever returning a
      // Promise) becomes a rejection here, not an exception that escapes `.map()` and crashes the
      // whole orchestrator before Promise.allSettled can even isolate it.
      timeoutGuard(
        (async () => mod.run({ window, now, env }))(),
        perModuleTimeoutMs,
      ),
    ),
  );

  const sources: SourceReport[] = settled.map((result, i) => {
    const mod = opts.modules[i];
    if (result.status === "fulfilled") return result.value;
    // The module itself threw, rejected or exceeded its budget -- the orchestrator's safety net, not
    // the module's own error handling. Still surfaced as a full SourceReport so the aggregate report
    // (and every other module's results) is never missing an entry.
    const startedAt = now().toISOString();
    return buildSourceReport({
      source: mod.id,
      displayName: mod.displayName,
      startedAt,
      metrics: [],
      moduleError: String(result.reason?.message ?? result.reason),
    });
  });

  return { generatedAt: now().toISOString(), window, sources };
}
