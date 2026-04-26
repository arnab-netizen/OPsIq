import { promises as fs } from "fs";
import { join } from "path";
import { generateReport, StandardizedReport } from "./report-generator.js";
import { ValidationError } from "../infra/errors.js";
import { logger } from "../infra/logger.js";

export type ExportFormat = "text" | "markdown" | "json";

interface ExportResult {
  format: ExportFormat;
  filePath: string;
  fileName: string;
  fileSize: number;
  timestamp: string;
  clientName: string;
}

function formatAsText(report: StandardizedReport): string {
  const lines: string[] = [];
  const separator = "═".repeat(70);

  lines.push(separator);
  lines.push(report.title.toUpperCase().padStart(45));
  lines.push(separator);
  lines.push("");

  lines.push(`CLIENT: ${report.client}`);
  lines.push(`DATE: ${new Date(report.generatedAt).toLocaleDateString()}`);
  lines.push("");

  lines.push("PROBLEM STATEMENT:");
  lines.push(report.problem);
  lines.push("");

  lines.push("─".repeat(70));
  lines.push("SUMMARY");
  lines.push("─".repeat(70));
  report.summary.forEach((item) => {
    lines.push(`• ${item}`);
  });
  lines.push("");

  lines.push("─".repeat(70));
  lines.push("CURRENT STATUS");
  lines.push("─".repeat(70));
  lines.push(`Health: ${report.currentStatus.health}`);
  lines.push(`Risk Level: ${report.currentStatus.riskLevel}`);
  lines.push(`Timeline: ${report.currentStatus.timeline}`);
  lines.push("");

  lines.push("─".repeat(70));
  lines.push("ROOT CAUSES");
  lines.push("─".repeat(70));
  report.rootCauses.forEach((cause) => {
    lines.push(`• ${cause}`);
  });
  lines.push("");

  lines.push("─".repeat(70));
  lines.push("BLOCKERS");
  lines.push("─".repeat(70));
  report.blockers.forEach((blocker, idx) => {
    lines.push(`${idx + 1}. ${blocker.title}`);
    lines.push(`   Description: ${blocker.description}`);
    lines.push(`   Consequence: ${blocker.consequence}`);
    lines.push("");
  });

  lines.push("─".repeat(70));
  lines.push("CONSEQUENCES");
  lines.push("─".repeat(70));
  report.consequences.forEach((consequence) => {
    lines.push(`• ${consequence}`);
  });
  lines.push("");

  lines.push("─".repeat(70));
  lines.push("ACTION PLAN");
  lines.push("─".repeat(70));
  lines.push("\nURGENT (Next 48 Hours):");
  report.actionPlan.urgent_48h.forEach((action) => {
    const ownerStr = action.owner ? ` [Owner: ${action.owner}]` : " [Unassigned]";
    lines.push(`${action.sequence}. ${action.action}${ownerStr}`);
  });

  lines.push("\n7-DAY PRIORITY:");
  report.actionPlan.week_7days.forEach((action) => {
    const ownerStr = action.owner ? ` [Owner: ${action.owner}]` : " [Unassigned]";
    lines.push(`${action.sequence}. ${action.action}${ownerStr}`);
  });
  lines.push("");

  lines.push("─".repeat(70));
  lines.push("RISK TIMELINE");
  lines.push("─".repeat(70));
  report.riskTimeline.forEach((event) => {
    lines.push(`Day ${event.day}: ${event.event} [${event.severity.toUpperCase()}]`);
  });
  lines.push("");

  lines.push(separator);
  lines.push("AUDIT TRAIL & TRACEABILITY");
  lines.push(separator);
  lines.push(`Engagement ID: ${report.traceability.engagementId}`);
  lines.push(`Generated: ${new Date(report.traceability.timestamp).toLocaleString()}`);
  lines.push(`Findings Count: ${report.traceability.findingsCount}`);
  lines.push(`Actions Count: ${report.traceability.actionsCount}`);
  lines.push(`State Transitions: ${report.traceability.stateTransitionsCount}`);
  lines.push(`Data Source: ${report.traceability.dataSource}`);
  lines.push(`Execution Engine: ${report.traceability.executionEngine}`);
  lines.push(separator);
  lines.push("This report contains confidential business information.");
  lines.push(separator);

  return lines.join("\n");
}

function formatAsMarkdown(report: StandardizedReport): string {
  const lines: string[] = [];

  lines.push(`# ${report.title}`);
  lines.push("");
  lines.push(`**Client:** ${report.client}`);
  lines.push(
    `**Generated:** ${new Date(report.generatedAt).toLocaleDateString()}`
  );
  lines.push("");

  lines.push("## Problem Statement");
  lines.push("");
  lines.push(report.problem);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  report.summary.forEach((item) => {
    lines.push(`- ${item}`);
  });
  lines.push("");

  lines.push("## Current Status");
  lines.push("");
  lines.push(`| Aspect | Status |`);
  lines.push(`|--------|--------|`);
  lines.push(`| Health | ${report.currentStatus.health} |`);
  lines.push(`| Risk Level | ${report.currentStatus.riskLevel} |`);
  lines.push(`| Timeline | ${report.currentStatus.timeline} |`);
  lines.push("");

  lines.push("## Root Causes");
  lines.push("");
  report.rootCauses.forEach((cause) => {
    lines.push(`- ${cause}`);
  });
  lines.push("");

  lines.push("## Blockers");
  lines.push("");
  report.blockers.forEach((blocker, idx) => {
    lines.push(`### ${idx + 1}. ${blocker.title}`);
    lines.push("");
    lines.push(`**Description:** ${blocker.description}`);
    lines.push("");
    lines.push(`**Consequence:** ${blocker.consequence}`);
    lines.push("");
  });

  lines.push("## Consequences");
  lines.push("");
  report.consequences.forEach((consequence) => {
    lines.push(`- ${consequence}`);
  });
  lines.push("");

  lines.push("## Action Plan");
  lines.push("");
  lines.push("### Urgent (Next 48 Hours)");
  lines.push("");
  report.actionPlan.urgent_48h.forEach((action) => {
    const ownerStr = action.owner ? ` _(Owner: ${action.owner})_` : " _(Unassigned)_";
    lines.push(`${action.sequence}. ${action.action}${ownerStr}`);
  });

  lines.push("");
  lines.push("### 7-Day Priority");
  lines.push("");
  report.actionPlan.week_7days.forEach((action) => {
    const ownerStr = action.owner ? ` _(Owner: ${action.owner})_` : " _(Unassigned)_";
    lines.push(`${action.sequence}. ${action.action}${ownerStr}`);
  });
  lines.push("");

  lines.push("## Risk Timeline");
  lines.push("");
  report.riskTimeline.forEach((event) => {
    lines.push(
      `- **Day ${event.day}:** ${event.event} _(${event.severity.toUpperCase()})_`
    );
  });
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Audit Trail & Traceability");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Engagement ID | ${report.traceability.engagementId} |`);
  lines.push(`| Generated | ${new Date(report.traceability.timestamp).toLocaleString()} |`);
  lines.push(`| Findings Count | ${report.traceability.findingsCount} |`);
  lines.push(`| Actions Count | ${report.traceability.actionsCount} |`);
  lines.push(`| State Transitions | ${report.traceability.stateTransitionsCount} |`);
  lines.push(`| Data Source | ${report.traceability.dataSource} |`);
  lines.push(`| Execution Engine | ${report.traceability.executionEngine} |`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "_This report contains confidential business information._"
  );

  return lines.join("\n");
}

function formatAsJson(report: StandardizedReport): string {
  return JSON.stringify(report, null, 2);
}

async function ensureExportsDirectory(): Promise<string> {
  const exportsDir = join(process.cwd(), "exports");

  try {
    await fs.mkdir(exportsDir, { recursive: true });
    return exportsDir;
  } catch (error) {
    throw new ValidationError(`Failed to create exports directory: ${error}`);
  }
}

export async function exportReport(
  engagementId: string,
  format: ExportFormat = "text",
  userId?: string
): Promise<ExportResult> {
  logger.info("Exporting report", { engagementId, format });

  // Validate format
  const validFormats: ExportFormat[] = ["text", "markdown", "json"];
  if (!validFormats.includes(format)) {
    throw new ValidationError(
      `Invalid export format: ${format}. Must be one of: ${validFormats.join(", ")}`
    );
  }

  // Generate report
  const report = await generateReport(engagementId, userId);

  // Format content
  let content: string;
  let extension: string;

  switch (format) {
    case "markdown":
      content = formatAsMarkdown(report);
      extension = "md";
      break;
    case "json":
      content = formatAsJson(report);
      extension = "json";
      break;
    case "text":
    default:
      content = formatAsText(report);
      extension = "txt";
      break;
  }

  // Prepare file path
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .split("T")[0]; // YYYY-MM-DD
  const clientName = report.client
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const fileName = `${clientName}-${timestamp}.${extension}`;

  // Ensure exports directory exists
  const exportsDir = await ensureExportsDirectory();
  const filePath = join(exportsDir, fileName);

  // Write file
  try {
    await fs.writeFile(filePath, content, "utf-8");
    const fileSize = Buffer.byteLength(content, "utf-8");

    logger.info("Report exported successfully", {
      engagementId,
      format,
      filePath,
      fileSize,
    });

    return {
      format,
      filePath,
      fileName,
      fileSize,
      timestamp: new Date().toISOString(),
      clientName: report.client,
    };
  } catch (error) {
    throw new ValidationError(
      `Failed to write export file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function exportReportMultiFormat(
  engagementId: string,
  formats: ExportFormat[] = ["text", "markdown", "json"],
  userId?: string
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];

  for (const format of formats) {
    const result = await exportReport(engagementId, format, userId);
    results.push(result);
  }

  return results;
}
