/**
 * Renders a `DailyReport` as a human-readable Markdown summary. Pure/deterministic given its input
 * (no I/O), so it is directly unit-testable and the CLI script only handles writing the result to disk.
 */
import type { DailyReport } from "./orchestrator";
import type { Metric, MetricStatus, SourceReport } from "./types";

const STATUS_EMOJI: Record<MetricStatus, string> = {
  VERIFIED: "✅",
  CONFIRMED_ZERO: "➖",
  UNAVAILABLE: "⚠️",
  STALE: "⏳",
  BLOCKED: "🔒",
  FAILED: "❌",
};

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return "`" + JSON.stringify(value) + "`";
  return String(value);
}

function renderMetricRow(m: Metric): string {
  return `| ${m.name} | ${STATUS_EMOJI[m.status]} ${m.status} | ${renderValue(m.value)} | ${m.detail} |`;
}

function renderSourceSection(s: SourceReport): string {
  const lines: string[] = [];
  lines.push(`### ${s.displayName} (\`${s.source}\`)`);
  lines.push("");
  lines.push(`- Ran ${s.startedAt} -> ${s.finishedAt} (${s.durationMs}ms)`);
  if (s.moduleError) {
    lines.push(`- **Module error (orchestrator safety net caught this; see below):** ${s.moduleError}`);
  }
  lines.push("");
  if (s.metrics.length === 0) {
    lines.push(s.moduleError ? "_No metrics were produced -- the module failed before it could run its own error handling._" : "_No metrics were produced._");
    lines.push("");
    return lines.join("\n");
  }
  lines.push("| Metric | Status | Value | Detail |");
  lines.push("|---|---|---|---|");
  for (const m of s.metrics) lines.push(renderMetricRow(m));
  lines.push("");
  return lines.join("\n");
}

export function renderDailyReportMarkdown(report: DailyReport): string {
  const lines: string[] = [];
  lines.push("# OpsIQ Daily Operations Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Window: ${report.window.start} -> ${report.window.end}`);
  lines.push("");

  const allMetrics = report.sources.flatMap((s) => s.metrics);
  const counts = allMetrics.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});
  lines.push("## Summary");
  lines.push("");
  lines.push(
    (Object.keys(STATUS_EMOJI) as MetricStatus[])
      .map((status) => `${STATUS_EMOJI[status]} ${status}: ${counts[status] ?? 0}`)
      .join("  ·  "),
  );
  const crashed = report.sources.filter((s) => s.moduleError !== null);
  if (crashed.length > 0) {
    lines.push("");
    lines.push(`**${crashed.length} source module(s) failed outside their own error handling** (caught by the orchestrator's safety net): ${crashed.map((s) => s.source).join(", ")}. Every other source still reported normally below.`);
  }
  lines.push("");
  lines.push("## Sources");
  lines.push("");
  for (const s of report.sources) lines.push(renderSourceSection(s));

  return lines.join("\n");
}
