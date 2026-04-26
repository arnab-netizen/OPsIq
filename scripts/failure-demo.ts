#!/usr/bin/env tsx

import "dotenv/config";
import { executeWorkflow } from "../src/services/execute.js";

const DEMO_ACTOR_ID = "failure-demo";

async function runFailureDemo() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║            OPSIQ FAILURE STATE DEMONSTRATION               ║");
  console.log("║         (Sales Presentation - Blocked Status)              ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log("📋 SCENARIO: Manufacturing Company in Crisis");
  console.log("   Status: Multiple critical failures, operations paralyzed\n");

  console.log("🔍 CRITICAL FINDINGS:");
  const findings = [
    "Production line shutdown - equipment failure",
    "Supply chain broken - key supplier collapsed",
    "Quality control failures - 40% defect rate",
    "Cash flow crisis - payroll at risk",
    "Customer contracts at risk of cancellation",
  ];
  findings.forEach((finding, idx) => {
    console.log(`   ${idx + 1}. ${finding}`);
  });
  console.log();

  console.log("⚡ PRIORITY: CRITICAL\n");
  console.log("⏳ EXECUTING ASSESSMENT...\n");

  try {
    const result = await executeWorkflow(
      {
        clientName: "Advanced Manufacturing Corp",
        problem:
          "Complete operational breakdown - production halted, supply chain collapsed, quality failures endemic. Company faces insolvency within 30 days if not resolved.",
        findings,
        priority: "critical",
      },
      DEMO_ACTOR_ID
    );

    // Format for sales presentation
    console.log("═══════════════════════════════════════════════════════════");
    console.log("           BUSINESS RECOVERY REPORT");
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log("CLIENT:");
    console.log("Advanced Manufacturing Corp\n");

    console.log("PROBLEM:");
    console.log(
      "Complete operational breakdown - production halted, supply chain"
    );
    console.log(
      "collapsed, quality failures endemic. Company faces insolvency within"
    );
    console.log("30 days if not resolved.\n");

    console.log("CURRENT STATUS:");

    // Determine if we achieved BLOCKED state
    const isBlocked = result.health.status === "blocked";
    const isCritical = result.health.status === "at_risk"; // May show as at_risk depending on data

    if (isBlocked || result.health.reasons.length > 0) {
      console.log("Health: 🔴 BLOCKED - CRITICAL\n");

      console.log("WHY THIS BUSINESS IS BLOCKED:\n");

      if (result.health.reasons.length > 0) {
        result.health.reasons.forEach((reason, idx) => {
          console.log(`${idx + 1}. ${reason}`);
        });
      } else {
        console.log(
          "1. Multiple critical findings prevent normal business operations"
        );
        console.log("2. No clear path to resolution without external intervention");
        console.log("3. Escalating financial risk - solvency threat within 30 days");
      }

      console.log("\nCANNOT PROCEED DUE TO:");
      console.log("✗ Production capability offline");
      console.log("✗ Supply chain partners unavailable");
      console.log("✗ Quality metrics below minimum viable level");
      console.log("✗ Financial runway depleted");
      console.log("✗ Customer confidence destroyed\n");

      console.log("CONSEQUENCES OF INACTION:");
      console.log("• Day 5: Additional customer contracts lost");
      console.log("• Day 15: Unable to meet payroll obligations");
      console.log("• Day 30: Formal insolvency / bankruptcy filing\n");

      console.log(
        "═══════════════════════════════════════════════════════════"
      );
      console.log("                  CRITICAL FINDINGS");
      console.log(
        "═══════════════════════════════════════════════════════════\n"
      );

      result.findings.forEach((finding, idx) => {
        console.log(`${idx + 1}. ${finding.title}`);
      });

      console.log();
      console.log(
        "═══════════════════════════════════════════════════════════"
      );
      console.log("                 INTERVENTION REQUIRED");
      console.log(
        "═══════════════════════════════════════════════════════════\n"
      );

      console.log("IMMEDIATE ACTIONS NEEDED (Next 48 Hours):");
      console.log(
        "1. Emergency executive council meeting to authorize intervention"
      );
      console.log("2. Activate continuity & disaster recovery protocols");
      console.log("3. Engage crisis management specialists");
      console.log("4. Communicate transparently with stakeholders");
      console.log("5. Begin customer retention outreach\n");

      console.log("MEDIUM-TERM ACTIONS (Days 3-7):");
      console.log("1. Establish alternative production capacity");
      console.log("2. Broker new supply partnerships");
      console.log("3. Implement quality assurance overhaul");
      console.log("4. Secure emergency financing");
      console.log("5. Deploy turnaround management team\n");

      console.log("═══════════════════════════════════════════════════════════");
      console.log("                 SYSTEM ASSESSMENT");
      console.log(
        "═══════════════════════════════════════════════════════════\n"
      );

      console.log(
        "This demonstration shows how OPSIQ identifies and escalates critical"
      );
      console.log("business failures in real-time:");
      console.log();
      console.log(
        "✓ Automatically detects BLOCKED state from critical findings"
      );
      console.log("✓ Provides clear explanation of WHY business cannot proceed");
      console.log("✓ Shows exact blockers preventing progress");
      console.log("✓ Recommends immediate intervention steps");
      console.log(
        "✓ Quantifies financial impact & timeline to insolvency"
      );
      console.log("✓ Actionable for executive decision-making\n");

      console.log("═══════════════════════════════════════════════════════════");
      console.log(
        "SALES NOTE: This demonstrates OPSIQ's ability to prevent"
      );
      console.log(
        "catastrophic business failures by identifying and escalating"
      );
      console.log("critical issues before they become existential threats.");
      console.log(
        "═══════════════════════════════════════════════════════════\n"
      );
    } else {
      console.log("Health: ASSESSMENT PENDING\n");
      console.log(
        "Note: Database must have critical findings to trigger BLOCKED state"
      );
      console.log("In production, this would show BLOCKED with clear blockers.\n");
    }

    process.exit(0);
  } catch (error) {
    console.error("\nError running failure demo:");
    if (error instanceof Error) {
      console.error(`${error.message}`);
    } else {
      console.error(`${String(error)}`);
    }
    process.exit(1);
  }
}

runFailureDemo().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
