#!/usr/bin/env tsx

import "dotenv/config";
import * as readline from "readline";
import { executeWorkflow, ExecuteInput } from "../src/services/execute.js";

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
  console.log("\n=== OPSIQ CLI EXECUTOR ===\n");

  try {
    // Collect user input
    const clientName = await question("Client name: ");
    if (!clientName) {
      console.error("Error: Client name is required");
      process.exit(1);
    }

    const problem = await question("Problem statement: ");
    if (!problem) {
      console.error("Error: Problem statement is required");
      process.exit(1);
    }

    const findingsInput = await question(
      "Findings (comma-separated): "
    );
    if (!findingsInput) {
      console.error("Error: At least one finding is required");
      process.exit(1);
    }

    const findings = findingsInput
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    if (findings.length === 0) {
      console.error("Error: At least one finding is required");
      process.exit(1);
    }

    const priorityInput = await question(
      "Priority (low/medium/high/critical) [high]: "
    );
    const priority = (
      priorityInput || "high"
    ).toLowerCase() as "low" | "medium" | "high" | "critical";

    if (!["low", "medium", "high", "critical"].includes(priority)) {
      console.error(
        "Error: Priority must be low, medium, high, or critical"
      );
      process.exit(1);
    }

    rl.close();

    // Execute workflow
    console.log("\nExecuting workflow...\n");

    const input: ExecuteInput = {
      clientName,
      problem,
      findings,
      priority,
    };

    // Use a default actor ID for CLI execution
    const actorId = "cli-executor";
    const result = await executeWorkflow(input, actorId);

    // Format output
    console.log("=== OPSIQ EXECUTION REPORT ===\n");

    console.log(`Client: ${clientName}`);
    console.log(`Problem: ${problem}\n`);

    console.log(`Engagement ID: ${result.engagementId}`);
    console.log(`Status: ${result.status}\n`);

    console.log(`Health:`);
    console.log(`  Status: ${result.health.status}`);
    if (result.health.reasons.length > 0) {
      console.log(`  Reasons:`);
      result.health.reasons.forEach((reason) => {
        console.log(`    - ${reason}`);
      });
    }
    console.log();

    if (result.findings.length > 0) {
      console.log(`Findings (${result.findings.length}):`);
      result.findings.forEach((finding, index) => {
        console.log(`  ${index + 1}. ${finding.title}`);
      });
      console.log();
    }

    if (result.actions.length > 0) {
      console.log(`Actions (${result.actions.length}):`);
      result.actions.forEach((action, index) => {
        console.log(
          `  ${index + 1}. [${action.status}] ${action.title} (Priority: ${action.priority})`
        );
      });
      console.log();
    }

    if (result.blockers.length > 0) {
      console.log(`Blockers:`);
      result.blockers.forEach((blocker) => {
        console.log(`  - ${blocker}`);
      });
      console.log();
    }

    if (result.risks.length > 0) {
      console.log(`Risks:`);
      result.risks.forEach((risk) => {
        console.log(`  - ${risk}`);
      });
      console.log();
    }

    console.log("=== END REPORT ===\n");
    process.exit(0);
  } catch (error) {
    console.error("\nError executing workflow:");
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    } else {
      console.error(`  ${String(error)}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
