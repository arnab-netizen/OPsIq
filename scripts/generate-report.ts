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
  console.log("                 OPSIQ REPORT GENERATOR");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    const engagementId = await question("Engagement ID: ");
    if (!engagementId) {
      console.error("Error: Engagement ID is required");
      process.exit(1);
    }

    rl.close();

    console.log("\n📊 Generating report...\n");

    const report = await generateReport(engagementId, "report-generator");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("                   OPSIQ ENGAGEMENT REPORT");
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log(`📋 CLIENT & ENGAGEMENT:`);
    console.log(`   Client: ${report.clientName}`);
    console.log(`   Engagement ID: ${report.engagementId}`);
    console.log();

    console.log(`📝 SUMMARY:`);
    console.log(`   ${report.summary}`);
    console.log();

    console.log(`💊 HEALTH ASSESSMENT:`);
    const healthBadge = {
      blocked: "🔴 BLOCKED",
      at_risk: "🟠 AT RISK",
      healthy: "🟢 HEALTHY",
      unknown: "⚪ UNKNOWN",
    }[report.healthStatus] || "UNKNOWN";
    console.log(`   Status: ${healthBadge}`);
    console.log(`   Assessment: ${report.healthReason}`);
    console.log();

    if (report.keyBlockers.length > 0) {
      console.log(`🛑 KEY BLOCKERS (${report.keyBlockers.length}):`);
      report.keyBlockers.forEach((blocker, idx) => {
        const severityBadge = {
          critical: "🔴",
          high: "🟠",
          medium: "🟡",
          low: "🟢",
        }[blocker.severity];
        console.log(`\n   ${idx + 1}. ${severityBadge} ${blocker.issue}`);
        console.log(`      WHY: ${blocker.why}`);
        console.log(`      IMPACT: ${blocker.impact}`);
      });
      console.log();
    } else {
      console.log(`🛑 KEY BLOCKERS: None identified\n`);
    }

    if (report.criticalActions.length > 0) {
      console.log(`✅ CRITICAL ACTIONS (${report.criticalActions.length}):`);
      report.criticalActions.forEach((action, idx) => {
        const priorityBadge = {
          high: "🔴",
          medium: "🟡",
          low: "🟢",
        }[action.priority];
        console.log(`\n   ${idx + 1}. ${priorityBadge} ${action.title}`);
        console.log(`      WHAT: ${action.rationale}`);
        if (action.dueDate) {
          console.log(`      DUE: ${action.dueDate}`);
        }
        if (action.owner) {
          console.log(`      OWNER: ${action.owner}`);
        } else {
          console.log(`      OWNER: ⚠️ UNASSIGNED`);
        }
      });
      console.log();
    } else {
      console.log(`✅ CRITICAL ACTIONS: None pending\n`);
    }

    if (report.recommendedNextSteps.length > 0) {
      console.log(`🎯 RECOMMENDED NEXT STEPS:`);
      report.recommendedNextSteps.forEach((step, idx) => {
        console.log(`   ${idx + 1}. ${step}`);
      });
      console.log();
    }

    console.log(`📈 METADATA:`);
    console.log(`   Findings: ${report.metadata.findingsCount}`);
    console.log(`   Actions: ${report.metadata.actionsCount}`);
    console.log(`   Generated: ${new Date(report.metadata.generatedAt).toLocaleString()}`);
    console.log();

    console.log("═══════════════════════════════════════════════════════════");
    console.log("                    REPORT COMPLETED");
    console.log("═══════════════════════════════════════════════════════════\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error generating report:");
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    console.error("\n📝 NOTE: Ensure the engagement ID is correct and database is accessible.\n");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
