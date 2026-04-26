#!/usr/bin/env tsx

import "dotenv/config";
import * as readline from "readline";
import {
  IntakeInputSchema,
  FindingCategorySchema,
  SeveritySchema,
  formatFindingCategory,
  getCategoryDescription,
} from "../src/domain/intake-schema.js";
import { executeWorkflow } from "../src/services/execute.js";
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

async function promptFindings(): Promise<
  Array<{ category: string; description: string; severity: string }>
> {
  const findings = [];
  const categories = ["operations", "finance", "supply", "sales", "people"];

  console.log("\n📋 ADD FINDINGS (structured intake)\n");
  console.log(
    "Finding categories: operations, finance, supply, sales, people"
  );
  console.log('Enter findings one at a time. Type "done" when finished.\n');

  let findingCount = 1;
  while (findingCount <= 10) {
    console.log(`Finding ${findingCount}:`);

    // Get category
    let validCategory = false;
    let category = "";
    while (!validCategory) {
      category = await question(
        `  Category (${categories.join(
          "/"
        )}): `
      );
      if (categories.includes(category.toLowerCase())) {
        validCategory = true;
        category = category.toLowerCase();
      } else {
        console.log("  ✗ Invalid category. Choose from: " + categories.join(", "));
      }
    }

    // Get description
    let description = "";
    let validDescription = false;
    while (!validDescription) {
      description = await question(`  Description: `);
      if (description.length >= 10) {
        validDescription = true;
      } else {
        console.log("  ✗ Description must be at least 10 characters.");
      }
    }

    // Get severity
    const severities = ["low", "medium", "high", "critical"];
    let validSeverity = false;
    let severity = "";
    while (!validSeverity) {
      severity = await question(
        `  Severity (${severities.join("/")}): `
      );
      if (severities.includes(severity.toLowerCase())) {
        validSeverity = true;
        severity = severity.toLowerCase();
      } else {
        console.log(
          "  ✗ Invalid severity. Choose from: " + severities.join(", ")
        );
      }
    }

    findings.push({
      category,
      description,
      severity,
    });

    console.log("  ✓ Finding added\n");

    if (findingCount >= 1) {
      const continueAdding = await question(
        "Add another finding? (yes/no): "
      );
      if (
        continueAdding.toLowerCase() === "no" ||
        continueAdding.toLowerCase() === "n"
      ) {
        break;
      }
    }

    findingCount++;
  }

  if (findings.length === 0) {
    console.error("\n✗ At least one finding is required.");
    process.exit(1);
  }

  return findings;
}

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║          OPSIQ STRUCTURED INTAKE SYSTEM                    ║");
  console.log("║     Standardized business assessment & analysis            ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  try {
    // Collect structured input
    console.log("📝 CLIENT INFORMATION\n");

    const clientName = await question("Client name: ");
    if (!clientName) {
      console.error("✗ Client name is required");
      process.exit(1);
    }

    const industry = await question(
      "Industry (e.g., Manufacturing, Retail, Tech): "
    );
    if (!industry) {
      console.error("✗ Industry is required");
      process.exit(1);
    }

    const problemSummary = await question(
      "Problem summary (minimum 20 characters): "
    );
    if (problemSummary.length < 20) {
      console.error(
        "✗ Problem summary must be at least 20 characters"
      );
      process.exit(1);
    }

    // Optional impact metrics
    console.log("\n💰 IMPACT ASSESSMENT (optional)\n");

    const revenueImpactStr = await question(
      "Revenue impact ($): "
    );
    const revenueImpact = revenueImpactStr
      ? parseInt(revenueImpactStr)
      : undefined;
    if (revenueImpactStr && isNaN(revenueImpact!)) {
      console.error("✗ Revenue impact must be a number");
      process.exit(1);
    }

    const timeToFailureStr = await question(
      "Time to failure (days): "
    );
    const timeToFailure = timeToFailureStr
      ? parseInt(timeToFailureStr)
      : undefined;
    if (timeToFailureStr && isNaN(timeToFailure!)) {
      console.error("✗ Time to failure must be a number");
      process.exit(1);
    }

    // Collect findings
    const findingsInput = await promptFindings();

    rl.close();

    // Validate complete intake
    const intakeData = {
      clientName,
      industry,
      problemSummary,
      revenueImpact,
      timeToFailure,
      findings: findingsInput,
    };

    console.log("\n✓ Validating intake data...");
    const validatedIntake = IntakeInputSchema.parse(intakeData);
    console.log("✓ Intake validated successfully\n");

    console.log("⚙️  EXECUTING ASSESSMENT...\n");

    // Execute workflow
    const result = await executeWorkflow(
      {
        clientName: validatedIntake.clientName,
        problem: validatedIntake.problemSummary,
        findings: validatedIntake.findings.map((f) => f.description),
        priority: validatedIntake.findings.some((f) => f.severity === "critical")
          ? "critical"
          : validatedIntake.findings.some((f) => f.severity === "high")
            ? "high"
            : "medium",
      },
      "intake-cli"
    );

    // Try to generate report if we have an engagement ID
    if (result.engagementId) {
      console.log("📊 Generating detailed report...\n");
      try {
        const report = await generateReport(result.engagementId, "intake-cli");

        console.log("═══════════════════════════════════════════════════════════");
        console.log("           BUSINESS RECOVERY REPORT");
        console.log("═══════════════════════════════════════════════════════════\n");

        console.log(`CLIENT:`);
        console.log(`${report.client}`);
        console.log(`Industry: ${validatedIntake.industry}\n`);

        console.log(`PROBLEM:`);
        console.log(`${report.problem}\n`);

        if (validatedIntake.revenueImpact) {
          console.log(
            `FINANCIAL IMPACT: $${validatedIntake.revenueImpact.toLocaleString()}`
          );
        }
        if (validatedIntake.timeToFailure) {
          console.log(`TIME TO FAILURE: ${validatedIntake.timeToFailure} days`);
        }
        if (validatedIntake.revenueImpact || validatedIntake.timeToFailure) {
          console.log();
        }

        console.log(`CURRENT STATUS:`);
        console.log(`Health: ${report.currentStatus.health}`);
        console.log(`Risk Level: ${report.currentStatus.riskLevel}`);
        console.log(`\n${report.currentStatus.summary}\n`);

        console.log(`FINDINGS BY CATEGORY:`);
        const findingsByCategory = validatedIntake.findings.reduce(
          (acc, finding) => {
            if (!acc[finding.category]) acc[finding.category] = [];
            acc[finding.category].push(finding);
            return acc;
          },
          {} as { [key: string]: typeof validatedIntake.findings }
        );

        for (const [category, categoryFindings] of Object.entries(
          findingsByCategory
        )) {
          console.log(`\n${formatFindingCategory(category as any)}:`);
          categoryFindings.forEach((f) => {
            console.log(`  • ${f.description} [${f.severity}]`);
          });
        }

        if (report.criticalIssues.length > 0) {
          console.log(`\nCRITICAL ISSUES:`);
          report.criticalIssues.forEach((issue) => {
            console.log(`• ${issue}`);
          });
        }

        if (report.blockers.length > 0) {
          console.log(`\nBLOCKERS:\n`);
          report.blockers.forEach((blocker, idx) => {
            console.log(`${idx + 1}. ${blocker.title}`);
            console.log(`   Why: ${blocker.description}`);
            console.log(`   Impact: ${blocker.impact}\n`);
          });
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
        }

        console.log();
        console.log("═══════════════════════════════════════════════════════════");
        console.log("End of Report");
        console.log("═══════════════════════════════════════════════════════════\n");
      } catch (reportError) {
        console.log("(Report generation requires database connectivity)\n");
      }
    }

    console.log("✅ Assessment completed successfully!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error during intake:\n");
    if (error instanceof Error) {
      console.error(`${error.message}\n`);
    } else {
      console.error(`${String(error)}\n`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
