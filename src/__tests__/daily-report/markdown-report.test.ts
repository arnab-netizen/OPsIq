import { describe, expect, it } from "vitest";
import { renderDailyReportMarkdown } from "@/lib/daily-report/markdown-report";
import { buildMetric, buildSourceReport } from "@/lib/daily-report/types";
import type { DailyReport } from "@/lib/daily-report/orchestrator";

const WINDOW = { start: "2026-11-16T00:00:00.000Z", end: "2026-11-17T00:00:00.000Z" };

function sampleReport(): DailyReport {
  return {
    generatedAt: "2026-11-17T00:00:01.000Z",
    window: WINDOW,
    sources: [
      buildSourceReport({
        source: "vercel-runtime-health",
        displayName: "Vercel runtime health",
        startedAt: "2026-11-17T00:00:00.000Z",
        metrics: [buildMetric({ name: "latest_deployment_state", source: "vercel-runtime-health", status: "BLOCKED", window: WINDOW, value: null, detail: "VERCEL_TOKEN not configured." })],
      }),
      buildSourceReport({
        source: "crashed-module",
        displayName: "Crashed Module",
        startedAt: "2026-11-17T00:00:00.000Z",
        metrics: [],
        moduleError: "boom",
      }),
    ],
  };
}

describe("renderDailyReportMarkdown", () => {
  it("includes the window, every source's display name, and status counts", () => {
    const md = renderDailyReportMarkdown(sampleReport());
    expect(md).toContain("# OpsIQ Daily Operations Report");
    expect(md).toContain(WINDOW.start);
    expect(md).toContain(WINDOW.end);
    expect(md).toContain("Vercel runtime health");
    expect(md).toContain("BLOCKED: 1");
  });

  it("calls out module-level crashes distinctly from handled BLOCKED/FAILED metrics", () => {
    const md = renderDailyReportMarkdown(sampleReport());
    expect(md).toContain("Crashed Module");
    expect(md).toContain("boom");
    expect(md).toContain("1 source module(s) failed outside their own error handling");
  });

  it("renders every metric's name, status, value and detail", () => {
    const md = renderDailyReportMarkdown(sampleReport());
    expect(md).toContain("latest_deployment_state");
    expect(md).toContain("VERCEL_TOKEN not configured.");
  });

  it("is deterministic for the same input", () => {
    const report = sampleReport();
    expect(renderDailyReportMarkdown(report)).toBe(renderDailyReportMarkdown(report));
  });
});
