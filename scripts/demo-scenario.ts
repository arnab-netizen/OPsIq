#!/usr/bin/env tsx

import "dotenv/config";
import { executeWorkflow } from "../src/services/execute.js";

const DEMO_ACTOR_ID = "demo-executor";

async function runDemoScenario() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║        OPSIQ DETERMINISTIC DEMO SCENARIO                   ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log("📋 SCENARIO SETUP:");
  console.log("  Client: Retail Store Losing Revenue");
  console.log("  Problem: Revenue dropped 40% in 3 months");
  console.log("  Priority: CRITICAL\n");

  console.log("🔍 FINDINGS:");
  const findings = [
    "declining foot traffic",
    "poor online presence",
    "inventory mismatch"
  ];
  findings.forEach((finding, idx) => {
    console.log(`  ${idx + 1}. ${finding}`);
  });
  console.log();

  try {
    console.log("⚙️  EXECUTING WORKFLOW...\n");

    const result = await executeWorkflow(
      {
        clientName: "Retail Store Losing Revenue",
        problem: "Revenue dropped 40% in 3 months due to operational failures",
        findings,
        priority: "critical"
      },
      DEMO_ACTOR_ID
    );

    console.log("═══════════════════════════════════════════════════════════");
    console.log("                  OPSIQ EXECUTION REPORT");
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log(`📊 ENGAGEMENT DETAILS:`);
    console.log(`   Engagement ID: ${result.engagementId}`);
    console.log(`   Client ID: ${result.clientId}`);
    console.log(`   Client: Retail Store Losing Revenue`);
    console.log(`   Problem: Revenue dropped 40% in 3 months due to operational failures`);
    console.log(`   Status: ${result.status.toUpperCase()}\n`);

    console.log(`💊 HEALTH ASSESSMENT:`);
    console.log(`   Health Status: ${result.health.status.toUpperCase()}`);
    console.log(`   Assessment: ${
      result.health.status === "blocked"
        ? "CRITICAL - Immediate intervention required"
        : result.health.status === "at_risk"
        ? "HIGH RISK - Urgent action needed"
        : "STABLE"
    }`);
    if (result.health.reasons.length > 0) {
      console.log(`   Concerns:`);
      result.health.reasons.forEach((reason) => {
        console.log(`     • ${reason}`);
      });
    } else {
      console.log("   No concerns identified");
    }
    console.log();

    console.log(`📌 FINDINGS IDENTIFIED (${result.findings.length}):`);
    result.findings.forEach((finding, idx) => {
      console.log(`   ${idx + 1}. [ID: ${finding.id.substring(0, 8)}...] ${finding.title}`);
    });
    console.log();

    console.log(`✅ RECOMMENDED ACTIONS (${result.actions.length}):`);
    if (result.actions.length > 0) {
      result.actions.forEach((action, idx) => {
        const priorityBadge = {
          critical: "🔴",
          high: "🟠",
          medium: "🟡",
          low: "🟢"
        }[action.priority] || "⚪";
        console.log(`   ${idx + 1}. ${priorityBadge} ${action.title}`);
        console.log(`      Priority: ${action.priority.toUpperCase()}`);
      });
    } else {
      console.log("   No actions recommended");
    }
    console.log();

    if (result.blockers.length > 0) {
      console.log(`🛑 BLOCKERS IDENTIFIED (${result.blockers.length}):`);
      result.blockers.forEach((blocker, idx) => {
        console.log(`   ${idx + 1}. ${blocker}`);
      });
      console.log();
    }

    if (result.risks.length > 0) {
      console.log(`⚠️  CRITICAL RISKS (${result.risks.length}):`);
      result.risks.forEach((risk, idx) => {
        console.log(`   ${idx + 1}. ${risk}`);
      });
      console.log();
    }

    console.log("═══════════════════════════════════════════════════════════");
    console.log("                    EXECUTION COMPLETED");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Summary
    console.log("📈 EXECUTION SUMMARY:");
    console.log(`   ✓ Client account created`);
    console.log(`   ✓ Engagement established (ID: ${result.engagementId.substring(0, 8)}...)`);
    console.log(`   ✓ ${result.findings.length} findings registered from input`);
    console.log(`   ✓ ${result.actions.length} recommended actions generated`);
    console.log(`   ✓ Health assessment: ${result.health.status.toUpperCase()}`);

    // Check for state transitions and blocked conditions
    const hasBlockers = result.blockers.length > 0;
    const hasRisks = result.risks.length > 0;
    const isAtRiskOrBlocked = result.health.status === "blocked" || result.health.status === "at_risk";

    if (hasBlockers) {
      console.log(`   ✓ ${result.blockers.length} blocking condition(s) identified`);
    }
    if (hasRisks) {
      console.log(`   ✓ ${result.risks.length} critical risk(s) detected`);
    }
    if (isAtRiskOrBlocked) {
      console.log(`   ✓ State transitioned to: ${result.health.status.toUpperCase()}`);
      console.log(`   ✓ Intervention workflow activated`);
    }

    console.log(`\n✅ Demo scenario completed successfully!\n`);

  } catch (error) {
    console.error("\n❌ ERROR EXECUTING WORKFLOW:");
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    console.error("\n📝 NOTE: This script requires a PostgreSQL database connection.");
    console.error("   Ensure DATABASE_URL is configured and the server is running.");
    console.error("   See .env file for configuration details.\n");
    process.exit(1);
  }
}

runDemoScenario().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
