#!/usr/bin/env node
/**
 * PHASE F3: Static Shadow Read Scanner (Node.js version)
 * Run: node scripts/scan-shadow-reads.js
 */

const fs = require("fs");
const path = require("path");
const { globSync } = require("glob");

// Patterns that trigger violations
const FORBIDDEN_PATTERNS = [
  { regex: /await\s+withAuth\s*\(/, name: "withAuth()", severity: "CRITICAL" },
  { regex: /withAuth\s*\([^)]*\)/, name: "withAuth()", severity: "CRITICAL" },
  { regex: /await\s+requireAuth\s*\(/, name: "requireAuth()", severity: "CRITICAL" },
  { regex: /await\s+requireSession\s*\(/, name: "requireSession()", severity: "CRITICAL" },
  { regex: /await\s+getServerAuthContext\s*\(/, name: "getServerAuthContext()", severity: "CRITICAL" },
  { regex: /from\s+["']@\/lib\/auth-guard["']/, name: "auth-guard import", severity: "CRITICAL" },
];

// Allowlisted files
const ALLOWLIST = [
  "src/lib/canonical-route-enforcement.ts",
  "src/lib/canonical-verified-session.ts",
  "src/lib/canonical-execution-trace.ts",
  "src/lib/canonical-auth-facts.ts",
  "src/services/auth.ts",
  "src/governance/auth-shadow-read-scanner.ts",
  "src/lib/auth-guard.ts",
  "src/lib/auth-ownership-allowlist.ts",
  "scripts/scan-shadow-reads.js",
];

function isAllowlisted(filePath) {
  return ALLOWLIST.some((pattern) => filePath.includes(pattern));
}

function shouldSkip(filePath) {
  return (
    filePath.includes("node_modules") ||
    filePath.includes(".next") ||
    filePath.includes("dist") ||
    filePath.includes("__tests__") ||
    filePath.includes("generated") ||
    !filePath.endsWith(".ts")
  );
}

function scanFile(filePath) {
  if (shouldSkip(filePath) || isAllowlisted(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const violations = [];

    lines.forEach((line, lineNum) => {
      FORBIDDEN_PATTERNS.forEach((pattern) => {
        if (pattern.regex.test(line)) {
          violations.push({
            file: filePath,
            line: lineNum + 1,
            pattern: pattern.name,
            severity: pattern.severity,
            context: line.trim().substring(0, 80),
          });
        }
      });
    });

    return violations;
  } catch (error) {
    console.warn(`Error scanning ${filePath}:`, error.message);
    return [];
  }
}

console.log("Scanning for shadow auth reads...\n");

// Find all TS files
const files = globSync("src/**/*.ts", {
  ignore: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
});

const allViolations = [];
files.forEach((file) => {
  const violations = scanFile(file);
  allViolations.push(...violations);
});

// Print results
if (allViolations.length === 0) {
  console.log("✓ No shadow auth reads detected\n");
  process.exit(0);
}

console.log(`SHADOW AUTH READ VIOLATIONS: ${allViolations.length}\n`);
allViolations.forEach((v) => {
  console.log(`${v.file}:${v.line}`);
  console.log(`  Pattern: ${v.pattern}`);
  console.log(`  Severity: ${v.severity}`);
  console.log(`  Context: ${v.context}`);
  console.log();
});

// Write JSON report
const report = {
  timestamp: new Date().toISOString(),
  totalViolations: allViolations.length,
  critical: allViolations.filter((v) => v.severity === "CRITICAL").length,
  violations: allViolations,
};

fs.writeFileSync("shadow_read_violations.json", JSON.stringify(report, null, 2));
console.log(`Report saved to shadow_read_violations.json`);

const hasCritical = allViolations.some((v) => v.severity === "CRITICAL");
if (hasCritical) {
  console.error("\n❌ CRITICAL SHADOW READS DETECTED - BUILD FAILS");
  process.exit(1);
}

process.exit(0);
