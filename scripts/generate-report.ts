#!/usr/bin/env tsx

import "dotenv/config";
import * as readline from "readline";
import { generateReport } from "../src/services/report-generator.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("           BUSINESS RECOVERY REPORT");
  console.log("             (Standardized Format)");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    const engagementId = await question("Engagement Reference: ");
    if (!engagementId) {
      console.error("✗ Engagement reference is required");
      process.exit(1);
    }

    rl.close();

    console.log("\nGenerating standardized report...\n");

    const report = await generateReport(engagementId, "report-generator");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("           BUSINESS RECOVERY REPORT");
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log("CLIENT:");
    console.log(`${report.client}\n`);

    console.log("PROBLEM:");
    console.log(`${report.problem}\n`);

    console.log("SUMMARY:");
    report.summary.forEach((item) => {
      console.log(`• ${item}`);
    });
    console.log();

    console.log("CURRENT STATUS:");
    console.log(`Health: ${report.currentStatus.health}`);
    console.log(`Risk Level: ${report.currentStatus.riskLevel}`);
    console.log(`Timeline: ${report.currentStatus.timeline}`);
    console.log();

    console.log("ROOT CAUSES:");
    report.rootCauses.forEach((cause) => {
      console.log(`• ${cause}`);
    });
    console.log();

    console.log("BLOCKERS:");
    report.blockers.forEach((blocker, idx) => {
      console.log(`\n${idx + 1}. ${blocker.title}`);
      console.log(`   Description: ${blocker.description}`);
      console.log(`   Consequence: ${blocker.consequence}`);
    });
    console.log();

    console.log("CONSEQUENCES:");
    report.consequences.forEach((consequence) => {
      console.log(`• ${consequence}`);
    });
    console.log();

    console.log("ACTION PLAN:");
    console.log("\nUrgent (Next 48 Hours):");
    report.actionPlan.urgent_48h.forEach((action) => {
      const ownerStr = action.owner ? ` - Owner: ${action.owner}` : " - [Unassigned]";
      console.log(`${action.sequence}. ${action.action}${ownerStr}`);
    });

    console.log("\n7-Day Priority:");
    report.actionPlan.week_7days.forEach((action) => {
      const ownerStr = action.owner ? ` - Owner: ${action.owner}` : " - [Unassigned]";
      console.log(`${action.sequence}. ${action.action}${ownerStr}`);
    });
    console.log();

    console.log("RISK TIMELINE:");
    report.riskTimeline.forEach((event) => {
      const severityBadge = {
        critical: "🔴",
        high: "🟠",
        medium: "🟡",
      }[event.severity] || "⚪";
      console.log(
        `Day ${event.day}: ${severityBadge} ${event.event}`
      );
    });
    console.log();

    console.log("BUSINESS IMPACT:");
    console.log(`Estimated Loss if No Action: ${report.businessImpact.estimatedLossIfNoAction}`);
    console.log(`Risk Level: ${report.businessImpact.riskLevel}`);
    console.log(`Urgency Score: ${report.businessImpact.urgencyScore}/10`);
    console.log(`Recommended Engagement: ${report.businessImpact.recommendedEngagementLevel.toUpperCase()}`);
    console.log();

    console.log("AUDIT TRAIL & TRACEABILITY:");
    console.log(`Engagement ID: ${report.traceability.engagementId}`);
    console.log(`Findings Count: ${report.traceability.findingsCount}`);
    console.log(`Actions Count: ${report.traceability.actionsCount}`);
    console.log(`State Transitions: ${report.traceability.stateTransitionsCount}`);
    console.log(`Data Source: ${report.traceability.dataSource}`);
    console.log(`Execution Engine: ${report.traceability.executionEngine}`);
    console.log();

    console.log("═══════════════════════════════════════════════════════════");
    console.log(`Report Generated: ${new Date(report.generatedAt).toLocaleString()}`);
    console.log("Format: STANDARDIZED (All sections present, data-sourced)");
    console.log("═══════════════════════════════════════════════════════════\n");

    process.exit(0);
  } catch (error) {
    console.error("\n✗ Report Generation Failed:\n");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    console.error(
      "\nNote: Report must include all standardized sections with data-derived content."
    );
    console.error(
      "Missing sections or insufficient data causes strict validation failure.\n"
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
