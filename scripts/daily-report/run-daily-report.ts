#!/usr/bin/env tsx
/**
 * Daily report orchestrator CLI.
 *
 * Runs every registered source module (see src/lib/daily-report/sources/*) in parallel, aggregates
 * the results, and writes a timestamped JSON + Markdown pair into this repo's existing evidence
 * convention (docs/opsiq/evidence/<feature>/artifacts/, matching docs/opsiq/evidence/stage-7/artifacts/).
 *
 * This script is intentionally NOT wired into any cron/cloud routine yet -- building and proving the
 * reporting system works is this task's scope; scheduling it is a deliberate follow-up once this is
 * reviewed. Run it manually with: npx tsx scripts/daily-report/run-daily-report.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createBackupFreshnessModule } from "../../src/lib/daily-report/sources/backup-freshness";
import { createGithubActionsScheduleHealthModule } from "../../src/lib/daily-report/sources/github-actions-schedule-health";
import { createInternalRecordsModule } from "../../src/lib/daily-report/sources/internal-records";
import { createMetricoolModule } from "../../src/lib/daily-report/sources/metricool-scheduled-posts";
import { createNeonUsageModule } from "../../src/lib/daily-report/sources/neon-usage";
import { createSearchConsoleStubModule } from "../../src/lib/daily-report/sources/search-console-stub";
import { createVercelRuntimeHealthModule } from "../../src/lib/daily-report/sources/vercel-runtime-health";
import { createVercelWebAnalyticsModule } from "../../src/lib/daily-report/sources/vercel-web-analytics";
import { renderDailyReportMarkdown } from "../../src/lib/daily-report/markdown-report";
import { runDailyReportOrchestrator } from "../../src/lib/daily-report/orchestrator";
import type { SourceModule } from "../../src/lib/daily-report/types";

const EVIDENCE_ROOT = path.join(process.cwd(), "docs", "opsiq", "evidence", "daily-report", "artifacts");

function allModules(): SourceModule[] {
  return [
    createVercelRuntimeHealthModule(),
    createVercelWebAnalyticsModule(),
    createNeonUsageModule(),
    createMetricoolModule(),
    createGithubActionsScheduleHealthModule(),
    createInternalRecordsModule(),
    createSearchConsoleStubModule(),
    createBackupFreshnessModule(),
  ];
}

async function main(): Promise<void> {
  const report = await runDailyReportOrchestrator({ modules: allModules() });
  const markdown = renderDailyReportMarkdown(report);

  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const runDir = path.join(EVIDENCE_ROOT, stamp);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(runDir, "report.md"), markdown + "\n", "utf8");
  // Convenience copies at the artifacts root, always reflecting the most recent run.
  fs.writeFileSync(path.join(EVIDENCE_ROOT, "latest.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(EVIDENCE_ROOT, "latest.md"), markdown + "\n", "utf8");

  console.log(`Daily report written to ${path.relative(process.cwd(), runDir)}/{report.json,report.md}`);
  console.log(`Latest copy: ${path.relative(process.cwd(), EVIDENCE_ROOT)}/{latest.json,latest.md}`);

  const failedModules = report.sources.filter((s) => s.moduleError !== null);
  if (failedModules.length > 0) {
    console.error(`WARNING: ${failedModules.length} module(s) hit the orchestrator's safety net: ${failedModules.map((s) => s.source).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("daily-report run failed:", err);
  process.exitCode = 1;
});
