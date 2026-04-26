#!/usr/bin/env tsx

import "dotenv/config";
import * as readline from "readline";
import { exportReport, exportReportMultiFormat, ExportFormat } from "../src/services/report-export.js";

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
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║         OPSIQ REPORT EXPORT SYSTEM                        ║");
  console.log("║     Generate Client-Deliverable Files                    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  try {
    const engagementId = await question("Engagement Reference: ");
    if (!engagementId) {
      console.error("✗ Engagement reference is required");
      process.exit(1);
    }

    console.log(
      "\nExport Formats: text, markdown, json, all"
    );
    const formatInput = await question("Format (default: all): ");
    const formatStr = formatInput || "all";

    rl.close();

    console.log("\n⏳ Generating and exporting report...\n");

    let results;

    if (formatStr === "all") {
      results = await exportReportMultiFormat(engagementId, [
        "text",
        "markdown",
        "json",
      ], "export-cli");
    } else {
      const format = formatStr as ExportFormat;
      results = [await exportReport(engagementId, format, "export-cli")];
    }

    console.log("═══════════════════════════════════════════════════════════");
    console.log("                    EXPORT COMPLETED");
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log(`Client: ${results[0].clientName}`);
    console.log(`Engagement: ${engagementId}\n`);

    console.log("FILES GENERATED:\n");

    results.forEach((result, idx) => {
      const sizeKB = (result.fileSize / 1024).toFixed(2);
      console.log(`${idx + 1}. ${result.fileName}`);
      console.log(`   Format: ${result.format.toUpperCase()}`);
      console.log(`   Size: ${sizeKB} KB`);
      console.log(`   Path: ${result.filePath}`);
      console.log();
    });

    console.log("═══════════════════════════════════════════════════════════");
    console.log(
      `✅ ${results.length} file(s) exported successfully to /exports directory`
    );
    console.log("═══════════════════════════════════════════════════════════\n");

    // Display sample content for each format
    if (formatStr === "all" || formatStr === "markdown") {
      const mdResult = results.find((r) => r.format === "markdown");
      if (mdResult) {
        console.log("📄 Markdown Format:");
        console.log("   Perfect for email sharing and client review");
        console.log("   Fully formatted with proper structure\n");
      }
    }

    if (formatStr === "all" || formatStr === "json") {
      const jsonResult = results.find((r) => r.format === "json");
      if (jsonResult) {
        console.log("📊 JSON Format:");
        console.log("   Suitable for API integration and data processing");
        console.log("   Structured data for dashboards and reports\n");
      }
    }

    if (formatStr === "all" || formatStr === "text") {
      const txtResult = results.find((r) => r.format === "text");
      if (txtResult) {
        console.log("📝 Text Format:");
        console.log("   Professional plaintext document");
        console.log("   Print-ready format for stakeholders\n");
      }
    }

    console.log("💡 TIP: Files are ready for client distribution.");
    console.log("   Share via email, upload to document management, or print.\n");

    process.exit(0);
  } catch (error) {
    console.error("\n✗ Export Failed:\n");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    console.error(
      "\nNote: Ensure engagement exists and database is accessible.\n"
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
