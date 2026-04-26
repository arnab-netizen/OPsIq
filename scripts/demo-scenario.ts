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
    console.log("          BUSINESS RECOVERY REPORT");
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log(`CLIENT:`);
    console.log(`Retail Store Losing Revenue\n`);

    console.log(`PROBLEM:`);
    console.log(`Revenue dropped 40% in 3 months due to operational failures\n`);

    console.log(`CURRENT STATUS:`);
    const healthMap: { [key: string]: string } = {
      blocked: "Critical - Action Required",
      at_risk: "At Risk - Intervention Needed",
      healthy: "On Track",
      unknown: "Assessment Pending"
    };
    const riskMap: { [key: string]: string } = {
      blocked: "Severe",
      at_risk: "High",
      healthy: "Low",
      unknown: "Unclear"
    };
    console.log(`Health: ${healthMap[result.health.status] || "Unknown"}`);
    console.log(`Risk Level: ${riskMap[result.health.status] || "Unknown"}`);
    console.log();
    if (result.health.reasons.length > 0) {
      console.log(`Status: ${result.health.reasons[0]}`);
    } else {
      console.log("Status: Assessment in progress");
    }
    console.log();

    if (result.findings.length > 0) {
      console.log(`CRITICAL ISSUES:`);
      result.findings.forEach((finding) => {
        console.log(`• ${finding.title}`);
      });
      console.log();
    }

    if (result.blockers.length > 0 || result.risks.length > 0) {
      console.log(`BLOCKERS:`);
      const allBlockers = [...(result.blockers || []), ...(result.risks || [])];
      allBlockers.slice(0, 3).forEach((blocker, idx) => {
        console.log(`\n${idx + 1}. ${blocker}`);
        console.log(`   Impact: Requires immediate attention`);
      });
      console.log();
    }

    if (result.actions.length > 0) {
      console.log(`ACTION PLAN:`);
      result.actions.forEach((action, idx) => {
        const stateMap = {
          critical: "Priority",
          high: "Priority",
          medium: "Standard",
          low: "Planned"
        };
        console.log(`${idx + 1}. [${stateMap[action.priority] || "Planned"}] ${action.title}`);
      });
      console.log();
    }

    console.log(`NEXT STEPS:`);
    console.log(`1. Hold immediate recovery meeting`);
    console.log(`2. Assign ownership for each action`);
    console.log(`3. Establish weekly review cadence`);
    console.log(`4. Monitor and report progress to leadership\n`);

    console.log("═══════════════════════════════════════════════════════════");
    console.log("End of Report");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Summary
    console.log("✅ Demo Scenario Completed:");
    console.log(`   ✓ Business assessment completed`);
    console.log(`   ✓ ${result.findings.length} key issues identified`);
    console.log(`   ✓ ${result.actions.length} action items prioritized`);
    console.log(`   ✓ Risk assessment: ${healthMap[result.health.status] || "Unknown"}`);
    console.log(`\n✅ Recovery plan ready for implementation!\n`);

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
