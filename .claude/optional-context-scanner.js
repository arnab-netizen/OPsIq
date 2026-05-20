#!/usr/bin/env node
/**
 * Optional Context Exemption Scanner (Node.js)
 *
 * Validates that all optional ServiceCapabilityContext parameters in the codebase
 * are registered in .claude/optional_context_exemptions.json and follow security rules.
 *
 * Usage: node .claude/optional-context-scanner.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Load exemptions registry
function loadRegistry() {
  const registryPath = path.join(__dirname, "optional_context_exemptions.json");
  const content = fs.readFileSync(registryPath, "utf-8");
  return JSON.parse(content);
}

// Find all optional context parameters using grep
function findOptionalContextParameters() {
  const results = new Map();

  try {
    const output = execSync(
      `grep -rn "context?:" src/ --include="*.ts" 2>/dev/null | grep "ServiceCapabilityContext" || true`,
      { encoding: "utf-8", cwd: path.join(__dirname, "..") }
    );

    const lines = output.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):/);
      if (match) {
        const file = match[1];
        const lineNum = parseInt(match[2], 10);
        const filePath = path.join(__dirname, "..", file);

        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, "utf-8");
          const fileLines = fileContent.split("\n");

          // Find function/interface name by searching backward from this line
          let functionName = "unknown";
          for (let i = lineNum - 1; i >= Math.max(0, lineNum - 20); i--) {
            // Match function, async function, interface, type, or class
            const fnMatch = fileLines[i].match(
              /export\s+(?:async\s+)?(?:function|interface|type|class)\s+(\w+)/
            );
            if (fnMatch) {
              functionName = fnMatch[1];
              break;
            }
          }

          const key = `${file}::${functionName}`;
          results.set(key, { function: functionName, line: lineNum, file });
        }
      }
    }
  } catch (e) {
    // grep returns error if no matches
  }

  return results;
}

// Validate findings against registry
function validateFindings(found, registry) {
  const findings = [];
  const registered = new Map();

  // Build lookup map
  for (const exemption of registry.exemptions) {
    registered.set(`${exemption.file}::${exemption.function}`, exemption);
  }

  // Check each found parameter
  for (const [key, details] of found.entries()) {
    const exemption = registered.get(key);

    if (!exemption) {
      findings.push({
        file: details.file,
        function: details.function,
        line: details.line,
        reason: `Unregistered optional context parameter (must add to .claude/optional_context_exemptions.json)`,
        severity: "FAIL",
      });
      continue;
    }

    // Validate required fields
    if (!exemption.allowed_callers || exemption.allowed_callers.length === 0) {
      findings.push({
        file: exemption.file,
        function: exemption.function,
        line: exemption.line,
        reason: `Missing allowed_callers in registry entry`,
        severity: "FAIL",
      });
    }

    if (!exemption.expiry_phase) {
      findings.push({
        file: exemption.file,
        function: exemption.function,
        line: exemption.line,
        reason: `Missing expiry_phase in registry entry`,
        severity: "FAIL",
      });
    }

    if (!exemption.risk_level) {
      findings.push({
        file: exemption.file,
        function: exemption.function,
        line: exemption.line,
        reason: `Missing risk_level in registry entry`,
        severity: "FAIL",
      });
    }

    // Security validation
    if (exemption.is_user_triggered) {
      findings.push({
        file: exemption.file,
        function: exemption.function,
        line: exemption.line,
        reason: `SECURITY VIOLATION: User-triggered function has optional context (must be REQUIRED)`,
        severity: "FAIL",
      });
    }
  }

  return findings;
}

// Main
function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Optional Context Exemption Scanner");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");

  // Load registry
  let registry;
  try {
    registry = loadRegistry();
    console.log(`✓ Loaded registry: ${registry.exemptions.length} exemptions`);
  } catch (e) {
    console.error(`✗ FAIL: Cannot load registry (${e.message})`);
    process.exit(1);
  }

  // Find parameters
  console.log(`Scanning src/ for optional context...`);
  const found = findOptionalContextParameters();
  console.log(`✓ Found ${found.size} optional context parameters\n`);

  // Validate
  const violations = validateFindings(found, registry);

  // Report
  if (violations.length === 0) {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✓ PASS: All optional context registered + secure");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log(`Optional context parameters: ${found.size}`);
    console.log(`Registered exemptions: ${registry.exemptions.length}`);
    console.log(`Unregistered violations: 0`);
    console.log("");
    process.exit(0);
  }

  const failures = violations.filter((v) => v.severity === "FAIL");
  const warnings = violations.filter((v) => v.severity === "WARN");

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ✗ FAIL: Security violations detected");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");

  if (failures.length > 0) {
    console.log(`Failures (${failures.length}):`);
    for (const v of failures) {
      console.log(`  ✗ ${v.file}::${v.function} (line ${v.line})`);
      console.log(`    ${v.reason}`);
    }
    console.log("");
  }

  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const v of warnings) {
      console.log(`  ⚠ ${v.file}::${v.function} (line ${v.line})`);
      console.log(`    ${v.reason}`);
    }
    console.log("");
  }

  console.log(`Total violations: ${violations.length}`);
  console.log("");
  process.exit(failures.length > 0 ? 1 : 0);
}

main();
