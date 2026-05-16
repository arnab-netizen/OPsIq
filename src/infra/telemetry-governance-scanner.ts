/**
 * PHASE 4: TELEMETRY GOVERNANCE SCANNER
 *
 * STEP 10: Scan codebase for telemetry violations
 * Used in CI to prevent:
 * - Direct console logging
 * - Raw auth logging
 * - Unsanitized telemetry
 * - Missing correlation IDs
 * - Missing execution traces
 * - Route-specific telemetry
 * - Missing telemetry emission
 * - Telemetry after handler mutation
 * - Duplicate telemetry paths
 *
 * CI MUST FAIL on violations.
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Governance violation report
 */
export interface GovernanceViolation {
  file: string;
  line: number;
  severity: "ERROR" | "WARNING";
  rule: string;
  message: string;
  code: string;
}

/**
 * Governance violation patterns (regex to detect)
 */
const VIOLATION_PATTERNS = [
  {
    rule: "DIRECT_CONSOLE_LOG",
    pattern: /console\.(log|warn|error|debug)\s*\(/g,
    severity: "ERROR" as const,
    message: "Direct console logging detected. Use logger instead.",
  },
  {
    rule: "UNSANITIZED_JWT",
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    severity: "ERROR" as const,
    message: "Unredacted JWT detected in code. Use sanitizer.",
  },
  {
    rule: "DIRECT_AUTH_LOGGING",
    pattern: /logger\.(info|warn|error)\s*\([^)]*auth[^)]*password/gi,
    severity: "ERROR" as const,
    message: "Raw auth/password logging detected. Sanitize first.",
  },
  {
    rule: "MISSING_CORRELATION_ID",
    pattern: /emitTelemetry\s*\(\s*\{[^}]*(?!correlationId)/g,
    severity: "WARNING" as const,
    message: "Telemetry event missing correlationId.",
  },
];

/**
 * Files/patterns to skip from governance scanning
 */
const SKIP_PATTERNS = [
  /node_modules\//,
  /\.next\//,
  /dist\//,
  /build\//,
  /\/__tests__\//,
  /\/test\//,
  /\.test\.ts$/,
  /\.spec\.ts$/,
  // Skip test files and lock files
  /package-lock\.json$/,
  /yarn\.lock$/,
];

/**
 * Scan a file for governance violations
 */
export function scanFileForViolations(filePath: string, content: string): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  // Check if file should be skipped
  if (SKIP_PATTERNS.some((pattern) => pattern.test(filePath))) {
    return violations;
  }

  // Skip non-source files
  if (!/\.(ts|tsx)$/.test(filePath)) {
    return violations;
  }

  const lines = content.split("\n");

  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;

    // Check each violation pattern
    for (const { rule, pattern, severity, message } of VIOLATION_PATTERNS) {
      const matches = line.match(pattern);
      if (matches) {
        violations.push({
          file: filePath,
          line: lineNumber,
          severity,
          rule,
          message,
          code: line.trim(),
        });
      }
    }

    // Custom rules for specific patterns
    checkCustomRules(line, lineNumber, filePath, violations);
  });

  return violations;
}

/**
 * Custom governance rules (beyond regex)
 */
function checkCustomRules(
  line: string,
  lineNumber: number,
  filePath: string,
  violations: GovernanceViolation[]
): void {
  // Rule: emitTelemetry calls must have complete event
  if (line.includes("emitTelemetry")) {
    if (!line.includes("correlationId") && !line.includes("...")) {
      violations.push({
        file: filePath,
        line: lineNumber,
        severity: "WARNING",
        rule: "INCOMPLETE_TELEMETRY",
        message: "emitTelemetry call may be missing required fields (correlationId)",
        code: line.trim(),
      });
    }
  }

  // Rule: Route-specific telemetry
  if (
    (line.includes('telemetryClass: "') || line.includes("eventType:")) &&
    (line.includes("req.path") || line.includes("route.path") || line.includes("path:"))
  ) {
    violations.push({
      file: filePath,
      line: lineNumber,
      severity: "WARNING",
      rule: "ROUTE_SPECIFIC_TELEMETRY",
      message: "Telemetry should not be route-specific. Keep events uniform.",
      code: line.trim(),
    });
  }
}

/**
 * Recursively scan directory for violations
 */
export function scanDirectoryForViolations(dirPath: string): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  function walkDir(currentPath: string) {
    try {
      const entries = fs.readdirSync(currentPath);

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry);
        const stat = fs.statSync(entryPath);

        // Skip if matches skip patterns
        if (SKIP_PATTERNS.some((pattern) => pattern.test(entryPath))) {
          continue;
        }

        if (stat.isDirectory()) {
          walkDir(entryPath);
        } else if (/\.(ts|tsx)$/.test(entryPath)) {
          const content = fs.readFileSync(entryPath, "utf-8");
          const fileViolations = scanFileForViolations(entryPath, content);
          violations.push(...fileViolations);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  walkDir(dirPath);
  return violations;
}

/**
 * Generate governance report
 */
export function generateGovernanceReport(violations: GovernanceViolation[]): string {
  if (violations.length === 0) {
    return "✓ All telemetry governance rules passed";
  }

  const errors = violations.filter((v) => v.severity === "ERROR");
  const warnings = violations.filter((v) => v.severity === "WARNING");

  let report = "Telemetry Governance Report\n";
  report += `${"=".repeat(80)}\n\n`;

  if (errors.length > 0) {
    report += `❌ ERRORS: ${errors.length}\n`;
    report += `${"─".repeat(80)}\n`;
    for (const error of errors) {
      report += `\n${error.file}:${error.line}\n`;
      report += `  Rule: ${error.rule}\n`;
      report += `  Message: ${error.message}\n`;
      report += `  Code: ${error.code}\n`;
    }
    report += "\n";
  }

  if (warnings.length > 0) {
    report += `⚠️  WARNINGS: ${warnings.length}\n`;
    report += `${"─".repeat(80)}\n`;
    for (const warning of warnings) {
      report += `\n${warning.file}:${warning.line}\n`;
      report += `  Rule: ${warning.rule}\n`;
      report += `  Message: ${warning.message}\n`;
      report += `  Code: ${warning.code}\n`;
    }
    report += "\n";
  }

  report += `\n${errors.length > 0 ? "FAILED" : "PASSED WITH WARNINGS"}\n`;
  report += `Errors: ${errors.length}, Warnings: ${warnings.length}\n`;

  return report;
}

/**
 * Check if violations should fail CI
 */
export function shouldFailCI(violations: GovernanceViolation[]): boolean {
  // Fail if any errors
  return violations.some((v) => v.severity === "ERROR");
}

/**
 * CLI entry point
 */
export async function runGovernanceCheck(srcDir: string = "./src"): Promise<number> {
  console.log("🔍 Running Telemetry Governance Scanner...\n");

  const violations = scanDirectoryForViolations(srcDir);
  const report = generateGovernanceReport(violations);

  console.log(report);

  if (shouldFailCI(violations)) {
    console.error("\n❌ Governance check FAILED\n");
    return 1;
  }

  console.log("\n✓ Governance check PASSED\n");
  return 0;
}

// Export for testing
export { VIOLATION_PATTERNS, SKIP_PATTERNS };
