/**
 * PHASE F3: STATIC SHADOW READ DETECTOR
 *
 * Scans codebase for forbidden auth reads.
 * BLOCKS build if shadow reads detected.
 * Reports severity and remediation paths.
 */

import fs from "fs";
import path from "path";
import { glob } from "glob";

/**
 * Auth read patterns that trigger violations
 */
const FORBIDDEN_AUTH_READS = [
  // withAuth function calls
  {
    pattern: /await\s+withAuth\s*\(/g,
    name: "withAuth()",
    severity: "CRITICAL",
    replacement: "ctx.verifiedSessionSnapshot",
  },
  // withAuth direct calls
  {
    pattern: /withAuth\s*\(/g,
    name: "withAuth()",
    severity: "CRITICAL",
    replacement: "ctx.verifiedSessionSnapshot",
  },
  // requireAuth calls
  {
    pattern: /await\s+requireAuth\s*\(/g,
    name: "requireAuth()",
    severity: "CRITICAL",
    replacement: "ctx.verifiedSessionSnapshot",
  },
  // requireSession calls
  {
    pattern: /await\s+requireSession\s*\(/g,
    name: "requireSession()",
    severity: "CRITICAL",
    replacement: "ctx.verifiedSessionSnapshot",
  },
  // getServerAuthContext calls
  {
    pattern: /await\s+getServerAuthContext\s*\(/g,
    name: "getServerAuthContext()",
    severity: "CRITICAL",
    replacement: "ctx.verifiedSessionSnapshot",
  },
];

/**
 * Import patterns that trigger violations
 */
const FORBIDDEN_AUTH_IMPORTS = [
  {
    pattern: /from\s+["']@\/lib\/auth-guard["']/g,
    name: "auth-guard import",
    severity: "CRITICAL",
    location: "src/lib/auth-guard.ts",
  },
  {
    pattern: /import\s+\{\s*withAuth\s*\}/,
    name: "withAuth import",
    severity: "CRITICAL",
    location: "src/lib/auth-guard.ts",
  },
  {
    pattern: /import\s+\{\s*requireAuth\s*\}/,
    name: "requireAuth import",
    severity: "CRITICAL",
    location: "src/lib/auth-guard.ts",
  },
];

/**
 * Allowlisted files that are permitted to read auth
 */
const ALLOWLIST_PATTERNS = [
  "src/lib/canonical-route-enforcement.ts",
  "src/lib/canonical-verified-session.ts",
  "src/lib/canonical-execution-trace.ts",
  "src/lib/canonical-auth-facts.ts",
  "src/services/auth.ts",
  "src/governance/auth-shadow-read-scanner.ts",
];

/**
 * Files to skip scanning
 */
const SKIP_PATTERNS = [
  "**/node_modules/**",
  "**/.next/**",
  "**/__tests__/**",
  "**/dist/**",
  "**/build/**",
  "src/generated/**",
];

interface ShadowReadViolation {
  file: string;
  line: number;
  column: number;
  pattern: string;
  severity: "CRITICAL" | "WARNING" | "BLOCK_BUILD";
  replacement: string;
  context: string;
}

/**
 * Scan file for shadow auth reads
 */
function scanFileForShadowReads(filePath: string, content: string): ShadowReadViolation[] {
  const violations: ShadowReadViolation[] = [];
  const lines = content.split("\n");

  // Check if file is in allowlist
  const isAllowed = ALLOWLIST_PATTERNS.some((pattern) => filePath.includes(pattern));
  if (isAllowed) {
    return violations;
  }

  // Check for forbidden patterns
  lines.forEach((line, lineNum) => {
    FORBIDDEN_AUTH_READS.forEach((rule) => {
      let match;
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      while ((match = regex.exec(line)) !== null) {
        violations.push({
          file: filePath,
          line: lineNum + 1,
          column: match.index + 1,
          pattern: rule.name,
          severity: rule.severity as any,
          replacement: rule.replacement,
          context: line.trim(),
        });
      }
    });
  });

  return violations;
}

/**
 * Scan file for forbidden imports
 */
function scanFileForForbiddenImports(filePath: string, content: string): ShadowReadViolation[] {
  const violations: ShadowReadViolation[] = [];

  // Check if file is in allowlist
  const isAllowed = ALLOWLIST_PATTERNS.some((pattern) => filePath.includes(pattern));
  if (isAllowed) {
    return violations;
  }

  const lines = content.split("\n");
  lines.forEach((line, lineNum) => {
    FORBIDDEN_AUTH_IMPORTS.forEach((rule) => {
      if (rule.pattern.test(line)) {
        violations.push({
          file: filePath,
          line: lineNum + 1,
          column: 1,
          pattern: rule.name,
          severity: "BLOCK_BUILD",
          replacement: "Remove import - use ctx.verifiedSessionSnapshot",
          context: line.trim(),
        });
      }
    });
  });

  return violations;
}

/**
 * Should skip scanning this file?
 */
function shouldSkipFile(filePath: string): boolean {
  return SKIP_PATTERNS.some((pattern) => {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const globPattern = pattern.replace(/\\/g, "/");
    return new RegExp(globPattern.replace(/\*/g, ".*")).test(normalizedPath);
  });
}

/**
 * Scan entire codebase
 */
export async function scanForShadowReads(srcDir: string = "src"): Promise<ShadowReadViolation[]> {
  const violations: ShadowReadViolation[] = [];

  // Find all TypeScript files
  const files = await glob(`${srcDir}/**/*.ts`, {
    ignore: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
  });

  for (const file of files) {
    if (shouldSkipFile(file)) {
      continue;
    }

    try {
      const content = fs.readFileSync(file, "utf-8");

      // Scan for shadow reads
      const readViolations = scanFileForShadowReads(file, content);
      violations.push(...readViolations);

      // Scan for forbidden imports
      const importViolations = scanFileForForbiddenImports(file, content);
      violations.push(...importViolations);
    } catch (error) {
      console.warn(`Error scanning file ${file}:`, error);
    }
  }

  return violations;
}

/**
 * Generate report
 */
export function generateReport(violations: ShadowReadViolation[]): string {
  if (violations.length === 0) {
    return "✓ No shadow auth reads detected";
  }

  const critical = violations.filter((v) => v.severity === "CRITICAL").length;
  const blockBuild = violations.filter((v) => v.severity === "BLOCK_BUILD").length;

  let report = `
SHADOW AUTH READ VIOLATIONS DETECTED

Total violations: ${violations.length}
Critical: ${critical}
Block build: ${blockBuild}

`;

  violations.forEach((v) => {
    report += `
${v.file}:${v.line}:${v.column}
  Pattern: ${v.pattern}
  Severity: ${v.severity}
  Context: ${v.context}
  Replacement: ${v.replacement}
`;
  });

  return report;
}

/**
 * Export violations as JSON
 */
export function exportViolationsAsJSON(
  violations: ShadowReadViolation[],
  outputPath: string
): void {
  const output = {
    timestamp: new Date().toISOString(),
    totalViolations: violations.length,
    critical: violations.filter((v) => v.severity === "CRITICAL").length,
    blockBuild: violations.filter((v) => v.severity === "BLOCK_BUILD").length,
    violations: violations,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
}

/**
 * CLI: Run scanner
 */
async function main() {
  console.log("Scanning for shadow auth reads...\n");

  const violations = await scanForShadowReads("src");

  const report = generateReport(violations);
  console.log(report);

  // Export JSON
  exportViolationsAsJSON(violations, "shadow_read_violations.json");

  // Exit with error if critical violations found
  if (violations.some((v) => v.severity === "CRITICAL" || v.severity === "BLOCK_BUILD")) {
    console.error(
      "\n❌ SHADOW AUTH READS DETECTED - BUILD WILL FAIL\n" +
        "See shadow_read_violations.json for details.\n" +
        "Replace shadow reads with ctx.verifiedSessionSnapshot"
    );
    process.exit(1);
  }

  console.log("\n✓ Build gate PASSED - No shadow reads");
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Scanner error:", error);
    process.exit(1);
  });
}

export { ShadowReadViolation };
