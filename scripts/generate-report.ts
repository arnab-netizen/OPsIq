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
  console.log("                 BUSINESS RECOVERY REPORT");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    const engagementId = await question("Engagement Reference: ");
    if (!engagementId) {
      console.error("Error: Engagement reference is required");
      process.exit(1);
    }

    rl.close();

    console.log("\nGenerating report...\n");

    const report = await generateReport(engagementId, "report-generator");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("           BUSINESS RECOVERY REPORT");
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log(`CLIENT:`);
    console.log(`${report.client}\n`);

    console.log(`PROBLEM:`);
    console.log(`${report.problem}\n`);

    console.log(`CURRENT STATUS:`);
    console.log(`Health: ${report.currentStatus.health}`);
    console.log(`Risk Level: ${report.currentStatus.riskLevel}`);
    console.log(`\n${report.currentStatus.summary}\n`);

    if (report.criticalIssues.length > 0) {
      console.log(`CRITICAL ISSUES:`);
      report.criticalIssues.forEach((issue) => {
        console.log(`• ${issue}`);
      });
      console.log();
    }

    if (report.blockers.length > 0) {
      console.log(`BLOCKERS:`);
      report.blockers.forEach((blocker, idx) => {
        console.log(`\n${idx + 1}. ${blocker.title}`);
        console.log(`   Why: ${blocker.description}`);
        console.log(`   Impact: ${blocker.impact}`);
      });
      console.log();
    }

    if (report.actionPlan.length > 0) {
      console.log(`ACTION PLAN:`);
      report.actionPlan.forEach((action) => {
        const dueStr = action.dueDate ? ` - Due: ${action.dueDate}` : "";
        const ownerStr = action.owner ? ` - Owner: ${action.owner}` : "";
        console.log(
          `${action.sequence}. [${action.state}] ${action.action}${ownerStr}${dueStr}`
        );
      });
      console.log();
    }

    if (report.nextSteps.length > 0) {
      console.log(`NEXT STEPS:`);
      report.nextSteps.forEach((step, idx) => {
        console.log(`${idx + 1}. ${step}`);
      });
      console.log();
    }

    console.log(`Report generated: ${new Date(report.generatedAt).toLocaleString()}`);
    console.log();

    console.log("═══════════════════════════════════════════════════════════");
    console.log("End of Report");
    console.log("═══════════════════════════════════════════════════════════\n");

    process.exit(0);
  } catch (error) {
    console.error("\nError generating report:");
    if (error instanceof Error) {
      console.error(`${error.message}`);
    } else {
      console.error(`${String(error)}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
