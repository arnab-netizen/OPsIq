#!/usr/bin/env node
/**
 * Analyzer for dashboard route 500 diagnostic output
 * Parses workflow logs to extract and classify the root cause
 *
 * Usage:
 *   node scripts/analyze-dashboard-diagnostic.js < workflow-output.txt
 */

const readline = require("readline");

async function analyzeDiagnostic() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let diagnosticOutput = null;
  let routeLogs = [];
  let capturedOutput = "";

  for await (const line of rl) {
    capturedOutput += line + "\n";

    // Look for diagnostic output
    if (line.includes("[DASHBOARD_DIAGNOSTIC]")) {
      routeLogs.push(line);
    }

    // Look for diagnostic JSON in curly braces
    if (line.includes("userFound") || line.includes("classification")) {
      try {
        // Try to extract JSON from line
        const jsonMatch = line.match(/\{.*\}/);
        if (jsonMatch) {
          diagnosticOutput = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Not valid JSON, continue
      }
    }

    // Also try to parse complete diagnostic output blocks
    if (line.trim().startsWith("{") && diagnosticOutput === null) {
      try {
        let jsonStr = line;
        // Read more lines if needed to complete JSON
        diagnosticOutput = JSON.parse(jsonStr);
      } catch (e) {
        // Will try again on next line
      }
    }
  }

  console.log("╔════════════════════════════════════════════╗");
  console.log("║  Dashboard Route 500 Diagnostic Analysis   ║");
  console.log("╚════════════════════════════════════════════╝\n");

  if (!diagnosticOutput) {
    console.log("❌ No diagnostic output found in logs");
    console.log("Expected output to include diagnostic JSON with keys:");
    console.log("  - userFound");
    console.log("  - membershipFound");
    console.log("  - engagementFound");
    console.log("  - errorName");
    console.log("  - classification");
    return;
  }

  console.log("✓ Diagnostic output parsed\n");

  // Analyze step by step
  console.log("SETUP VALIDATION:");
  console.log(`  User found: ${diagnosticOutput.userFound ? "✓" : "✗"}`);
  console.log(`  Membership found: ${diagnosticOutput.membershipFound ? "✓" : "✗"}`);
  console.log(`  Workspace UUID-like: ${diagnosticOutput.workspaceIdUuidLike ? "✓" : "✗"}`);
  console.log(`  Engagement found: ${diagnosticOutput.engagementFound ? "✓" : "✗"}`);
  console.log(`  Workspace matches: ${diagnosticOutput.engagementWorkspaceMatches ? "✓" : "✗"}`);
  console.log(`  Engagement visibility: ${diagnosticOutput.engagementVisibility || "unknown"}`);
  console.log(`  Has client ID: ${diagnosticOutput.hasClientId ? "✓" : "✗"}\n`);

  console.log("SERVICE CALL:");
  console.log(
    `  Service call succeeded: ${diagnosticOutput.serviceCallSucceeded ? "✓" : "✗"}`
  );
  console.log(
    `  Dashboard empty object: ${diagnosticOutput.dashboardEmptyObject ? "⚠" : "✓"}`
  );

  if (diagnosticOutput.dashboardTopLevelKeys && Array.isArray(diagnosticOutput.dashboardTopLevelKeys)) {
    console.log(
      `  Dashboard fields: ${diagnosticOutput.dashboardTopLevelKeys.length} keys`
    );
    if (diagnosticOutput.dashboardTopLevelKeys.length > 0) {
      console.log(`    - ${diagnosticOutput.dashboardTopLevelKeys.slice(0, 5).join(", ")}`);
      if (diagnosticOutput.dashboardTopLevelKeys.length > 5) {
        console.log(`    ... and ${diagnosticOutput.dashboardTopLevelKeys.length - 5} more`);
      }
    }
  }
  console.log("");

  if (diagnosticOutput.serviceCallSucceeded) {
    console.log("✅ ROOT CAUSE: Service call succeeded - no issue detected by diagnostic");
    console.log("   The dashboard route should return 200.");
    console.log("   Check if issue is in response serialization or wrapper contract.\n");
  } else {
    console.log("ERROR DETAILS:");
    console.log(`  Error name: ${diagnosticOutput.errorName || "unknown"}`);
    console.log(`  Safe message: ${diagnosticOutput.safeErrorMessage || "none"}`);
    console.log(`  Stack location: ${diagnosticOutput.stackFileLine || "not captured"}`);
    console.log(`  Classification: ${diagnosticOutput.classification || "cannot_determine"}\n`);

    // Classify root cause
    const classification = diagnosticOutput.classification;

    if (classification === "null_related_data_bug") {
      console.log("🔍 ROOT CAUSE: Null Reference Error");
      console.log("   Action: Find where code accesses property on null object");
      console.log(`   Location: ${diagnosticOutput.stackFileLine}`);
      console.log("   Fix: Add null check before property access\n");
    } else if (classification === "service_runtime_exception") {
      console.log("🔍 ROOT CAUSE: Service Layer Exception");
      console.log("   Action: Check error name and message for details");
      console.log(`   Error: ${diagnosticOutput.errorName}`);
      console.log(`   Message: ${diagnosticOutput.safeErrorMessage}`);
      console.log("   Fix: Depends on error type\n");
    } else if (classification === "database_error") {
      console.log("🔍 ROOT CAUSE: Database Query Failure");
      console.log("   Action: Check Prisma error code");
      console.log(`   Location: ${diagnosticOutput.stackFileLine}`);
      console.log("   Fix: Review query conditions, relationships, or constraints\n");
    } else if (classification === "response_contract_bug") {
      console.log("🔍 ROOT CAUSE: Response Contract Violation");
      console.log("   The dashboard route returned invalid response type");
      console.log("   Check that handler returns plain object, not Response\n");
    } else if (classification === "cannot_determine") {
      console.log("⚠️  ROOT CAUSE: Cannot Determine");
      console.log("   Diagnostic endpoint unable to classify error");
      console.log("   Need additional logging or manual investigation\n");
    } else {
      console.log(`⚠️  ROOT CAUSE: ${classification}`);
      console.log("   Review error name and message for details\n");
    }
  }

  // Print route logs if available
  if (routeLogs.length > 0) {
    console.log("ROUTE STAGE LOGS:");
    routeLogs.forEach((log) => console.log(`  ${log}`));
    console.log("");
  }

  console.log("NEXT ACTION:");
  if (diagnosticOutput.serviceCallSucceeded) {
    console.log("1. Check if dashboard route response is valid 200");
    console.log("2. If 500 still occurring, check wrapper error handling");
    console.log("3. Review route stage logs for failure point");
  } else {
    console.log(`1. Root cause likely: ${diagnosticOutput.classification || "unknown"}`);
    console.log("2. Review code at stack location");
    console.log("3. Add null checks or error handling as needed");
    console.log("4. Re-run smoke test to verify fix");
  }
}

analyzeDiagnostic().catch(console.error);
