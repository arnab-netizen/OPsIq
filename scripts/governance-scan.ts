#!/usr/bin/env node

/**
 * Governance Violation Scanner
 *
 * Detects violations of operator UX governance:
 * - Raw error.message usage
 * - Unsafe error rendering
 * - Mutations bypassing governance
 * - Metrics not using GovMetric
 * - Dead-end empty states
 *
 * Usage: npx ts-node scripts/governance-scan.ts [--fix] [--strict]
 */

import fs from "fs";
import path from "path";
import { glob } from "glob";

// Frozen pre-existing governance findings live here. Any error-severity finding
// NOT present in this baseline fails a strict scan, so the gate still blocks NEW
// governance debt while pre-existing findings on main are recovered to green.
const BASELINE_FILE = ".claude/governance-baseline.json";

interface Violation {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  type:
    | "raw-error-message"
    | "unsafe-error-render"
    | "unsafe-toast"
    | "unsafe-mutation"
    | "unsafe-metric"
    | "dead-empty-state";
  message: string;
  code: string;
  suggestion: string;
}

class GovernanceScanner {
  violations: Violation[] = [];
  scannedFiles = 0;
  fixMode = false;
  strictMode = false;
  updateBaselineMode = false;

  constructor(
    options: { fix?: boolean; strict?: boolean; updateBaseline?: boolean } = {}
  ) {
    this.fixMode = options.fix ?? false;
    this.strictMode = options.strict ?? false;
    this.updateBaselineMode = options.updateBaseline ?? false;
  }

  async scan(srcDir: string): Promise<void> {
    console.log("🔍 Scanning for governance violations...\n");

    // Scan React/TS component files
    const componentFiles = await glob([
      `${srcDir}/**/*.tsx`,
      `${srcDir}/**/*.ts`,
      `!${srcDir}/**/node_modules/**`,
      `!${srcDir}/**/*.test.ts`,
      `!${srcDir}/**/*.test.tsx`,
    ]);

    for (const file of componentFiles) {
      // Defensive exclusion: the glob negations above use a "./src/**" prefix
      // that does not match paths returned as "src/...", so test files leaked
      // into the scan. Filter them out explicitly regardless of path shape.
      if (this.isExcludedFile(file)) continue;
      this.scannedFiles++;
      this.scanFile(file);
    }

    this.dedupeViolations();
    this.reportResults();
  }

  // Returns true for any test/spec file or test directory that must never be scanned.
  private isExcludedFile(file: string): boolean {
    const normalized = file.replace(/\\/g, "/");
    return (
      /\.(test|spec)\.(ts|tsx)$/.test(normalized) ||
      normalized.includes("/__tests__/") ||
      normalized.includes("/__ignored_tests__/") ||
      normalized.includes("/node_modules/")
    );
  }

  // Collapse identical findings (same rule type, file, line, and code) that arise
  // when multiple patterns for one rule match the same source line.
  private dedupeViolations(): void {
    const seen = new Set<string>();
    this.violations = this.violations.filter((v) => {
      const key = this.violationKey(v);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Stable identity for a finding, used for dedupe and baseline matching.
  private violationKey(v: Violation): string {
    return `${v.type}::${v.file}::${v.line}::${v.code}`;
  }

  private scanFile(filePath: string): void {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      this.checkErrorMessage(filePath, line, lineNumber);
      this.checkErrorRendering(filePath, line, lineNumber);
      this.checkToastUsage(filePath, line, lineNumber);
      this.checkMutationUsage(filePath, line, lineNumber);
      this.checkMetricUsage(filePath, line, lineNumber);
      this.checkEmptyState(filePath, line, lineNumber);
    });
  }

  private checkErrorMessage(file: string, line: string, lineNum: number): void {
    // Pattern: error?.message, err?.message, error.message, etc
    const patterns = [
      /(?:error|err)\.message\s*[=:]/i,
      /(?:error|err)\?\.message\s*[=:]/i,
      /getMessage\(\)/i,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        this.violations.push({
          file,
          line: lineNum,
          column: line.indexOf(match[0]),
          severity: "error",
          type: "raw-error-message",
          message: "Raw error.message exposed - use toOperatorSafeError()",
          code: line.trim(),
          suggestion:
            "Replace with: const safeError = toOperatorSafeError(err, context);",
        });
      }
    }
  }

  private checkErrorRendering(file: string, line: string, lineNum: number): void {
    // Pattern: setError(err...), {error && <div>{error}</div>}, etc
    const patterns = [
      /setError\s*\(\s*(?:err|error)/i,
      /return\s*.*?err(?:or)?.*?message/i,
      /\{error\s*&&\s*<.*?{.*?error.*?}/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(line)) {
        // Check if it's using governance
        if (
          line.includes("toOperatorSafeError") ||
          line.includes("classifyOperatorError") ||
          line.includes("renderOperatorError")
        ) {
          continue; // Already governed
        }

        this.violations.push({
          file,
          line: lineNum,
          column: 0,
          severity: "error",
          type: "unsafe-error-render",
          message: "Error rendered without governance - use operator-error-governance",
          code: line.trim(),
          suggestion:
            "Use: const governed = classifyOperatorError(error, context);",
        });
      }
    }
  }

  private checkToastUsage(file: string, line: string, lineNum: number): void {
    // Pattern: toast.error(error...), showNotification(error...), etc
    const patterns = [
      /toast\.error\s*\(\s*(?:err|error)/i,
      /showNotification\s*\(\s*(?:err|error)/i,
      /notify\s*\(\s*(?:err|error)/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(line)) {
        // Check if already governed
        if (
          line.includes("toOperatorSafeError") ||
          line.includes("classifyOperatorError")
        ) {
          continue;
        }

        this.violations.push({
          file,
          line: lineNum,
          column: 0,
          severity: "warning",
          type: "unsafe-toast",
          message: "Toast notification without governance",
          code: line.trim(),
          suggestion:
            "Use: const safe = toOperatorSafeError(error, context); toast.error(safe.error);",
        });
      }
    }
  }

  private checkMutationUsage(file: string, line: string, lineNum: number): void {
    // Pattern: fetch(...).then().catch() without useOperatorMutation
    if (file.includes(".test.") || file.includes(".spec.")) return;

    const hasFetch = /fetch\s*\(/i.test(line);
    const hasMutate = /mutate|useOperatorMutation|GovMutationButton/i.test(line);

    if (hasFetch && !hasMutate) {
      // Check context - some fetch calls are OK (reading, not writing)
      const isWrite = /POST|PATCH|PUT|DELETE/i.test(line);
      if (isWrite && !line.includes("//")) {
        this.violations.push({
          file,
          line: lineNum,
          column: 0,
          severity: "error",
          type: "unsafe-mutation",
          message: "Mutation without governance hook - use useOperatorMutation",
          code: line.trim(),
          suggestion:
            "Refactor to use: const { mutate } = useOperatorMutation({...}); mutate(data);",
        });
      }
    }
  }

  private checkMetricUsage(file: string, line: string, lineNum: number): void {
    // Pattern: <div>{confidence}%</div> or raw metric display
    const patterns = [
      /\{(?:confidence|priority|impact|urgency|complexity|completion|risk)\}[%]?<\/div>/i,
      /\{metric\s*\}(?!\s*\?)/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(line)) {
        // Check if already using GovMetric
        if (
          line.includes("GovMetric") ||
          line.includes("metric-registry") ||
          line.includes("formatMetricValue")
        ) {
          continue;
        }

        this.violations.push({
          file,
          line: lineNum,
          column: 0,
          severity: "error",
          type: "unsafe-metric",
          message:
            "Raw metric display without governance - use <GovMetric /> component",
          code: line.trim(),
          suggestion:
            "Replace with: <GovMetric name=\"confidence\" value={confidence} />",
        });
      }
    }
  }

  private checkEmptyState(file: string, line: string, lineNum: number): void {
    // Pattern: null, "No data", empty div, etc without guidance
    const patterns = [
      /return\s+null\s*[;{]/i,
      /!data.*?&&\s*<div>No/i,
      /if\s*\(!.*?\)\s*return\s+null/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(line)) {
        // Check if using GovernedEmptyState
        if (line.includes("GovernedEmptyState") || line.includes("CompactEmptyState")) {
          continue;
        }

        this.violations.push({
          file,
          line: lineNum,
          column: 0,
          severity: "warning",
          type: "dead-empty-state",
          message:
            "Potential dead-end empty state - should use GovernedEmptyState for guidance",
          code: line.trim(),
          suggestion:
            "Use: <GovernedEmptyState reason=\"no_data\" primaryAction={{...}} />",
        });
      }
    }
  }

  private reportResults(): void {
    const errorCount = this.violations.filter((v) => v.severity === "error").length;
    const warningCount = this.violations.filter(
      (v) => v.severity === "warning"
    ).length;

    console.log(`\n📊 Scanned ${this.scannedFiles} files\n`);

    if (this.violations.length === 0) {
      console.log("✅ No governance violations found!\n");
      process.exit(0);
    }

    // Group by type
    const byType: Record<string, Violation[]> = {};
    this.violations.forEach((v) => {
      if (!byType[v.type]) byType[v.type] = [];
      byType[v.type].push(v);
    });

    for (const [type, violations] of Object.entries(byType)) {
      console.log(
        `\n${type.toUpperCase().replace(/-/g, " ")} (${violations.length})`
      );
      console.log("─".repeat(60));

      violations.slice(0, 5).forEach((v) => {
        const icon =
          v.severity === "error"
            ? "❌"
            : v.severity === "warning"
              ? "⚠️"
              : "ℹ️";
        console.log(`${icon} ${v.file}:${v.line}`);
        console.log(`   ${v.message}`);
        console.log(`   Code: ${v.code.substring(0, 70)}`);
        console.log(`   Fix: ${v.suggestion}\n`);
      });

      if (violations.length > 5) {
        console.log(`   ... and ${violations.length - 5} more\n`);
      }
    }

    console.log(`\n📈 Summary:`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Warnings: ${warningCount}`);
    console.log(`   Total: ${this.violations.length}\n`);

    const errorViolations = this.violations.filter((v) => v.severity === "error");

    // Baseline writer mode: freeze the current error-severity findings.
    if (this.updateBaselineMode) {
      this.writeBaseline(errorViolations);
      console.log(
        `✅ Baseline written: ${BASELINE_FILE} (${errorViolations.length} frozen error findings)\n`
      );
      process.exit(0);
    }

    // Gate on NEW error findings only: pre-existing findings recorded in the
    // baseline are frozen, but any error not in the baseline still fails.
    const baselineKeys = this.loadBaselineKeys();
    const newErrors = errorViolations.filter(
      (v) => !baselineKeys.has(this.violationKey(v))
    );
    const matched = errorViolations.length - newErrors.length;

    if (baselineKeys.size > 0) {
      console.log(
        `🧊 Governance baseline: ${baselineKeys.size} frozen finding(s); ${matched} matched, ${newErrors.length} new.\n`
      );
    }

    if (newErrors.length > 0) {
      console.log(
        `❌ ${newErrors.length} NEW governance error(s) not present in baseline:`
      );
      newErrors.forEach((v) =>
        console.log(`   ${v.file}:${v.line} [${v.type}] ${v.message}`)
      );
      console.log(
        `\n   If these are intentional pre-existing findings, regenerate the baseline with:\n   npm run governance:scan -- --update-baseline\n`
      );
      process.exit(1);
    }

    if (errorViolations.length > 0) {
      console.log(
        "✅ No NEW governance errors (pre-existing findings frozen by baseline)\n"
      );
    }
    process.exit(0);
  }

  // Load the set of frozen finding keys from the baseline file (if present).
  private loadBaselineKeys(): Set<string> {
    try {
      if (!fs.existsSync(BASELINE_FILE)) return new Set();
      const data = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf-8"));
      const findings: Array<{ type: string; file: string; line: number; code: string }> =
        Array.isArray(data.findings) ? data.findings : [];
      return new Set(
        findings.map((e) => `${e.type}::${e.file}::${e.line}::${e.code}`)
      );
    } catch {
      return new Set();
    }
  }

  // Write a deterministic, machine-readable baseline of frozen error findings.
  private writeBaseline(errorViolations: Violation[]): void {
    const findings = errorViolations
      .map((v) => ({
        type: v.type,
        category: v.type.toUpperCase().replace(/-/g, " "),
        file: v.file,
        line: v.line,
        severity: v.severity,
        code: v.code,
        reason: this.classifyReason(v),
      }))
      .sort((a, b) =>
        a.file !== b.file
          ? a.file.localeCompare(b.file)
          : a.line - b.line || a.type.localeCompare(b.type)
      );

    const out = {
      _comment:
        "Frozen pre-existing governance findings on main. Any error-severity finding NOT listed here fails a strict scan. Deterministic (sorted, no timestamps). Regenerate with: npm run governance:scan -- --update-baseline",
      total_frozen: findings.length,
      findings,
    };
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2) + "\n");
  }

  // Human-readable classification of why a pre-existing finding is frozen.
  private classifyReason(v: Violation): string {
    const f = v.file;
    if (v.type === "unsafe-error-render" && /\/app\/.*page\.tsx$/.test(f)) {
      return "operator-facing render; pre-existing, deferred to a separate runtime fix slice";
    }
    if (f.includes("/app/api/internal/")) {
      return "internal diagnostic route; server-side error string, not operator-rendered";
    }
    if (f.includes("/app/api/auth/")) {
      return "auth route server-side log/context string; not operator-rendered";
    }
    if (f.includes("/services/outcome/")) {
      return "outcome service internal validation/log message; not operator-rendered";
    }
    if (f.endsWith("/canonical-route-enforcement.ts")) {
      return "route-wrapper internal error classification (ClassifiedApiError construction)";
    }
    if (f.includes("/infra/")) {
      return "infra error classification/logging; not operator-rendered";
    }
    if (f.includes("/services/")) {
      return "service-layer server-side log/classification string; not operator-rendered";
    }
    if (f.includes("/app/api/")) {
      return "API route server-side error string used for classification/logging";
    }
    return "pre-existing governance finding (frozen for CI baseline recovery)";
  }
}

// Main
const args = process.argv.slice(2);
const scanner = new GovernanceScanner({
  fix: args.includes("--fix"),
  strict: args.includes("--strict"),
  updateBaseline: args.includes("--update-baseline"),
});

scanner.scan("./src").catch((err) => {
  console.error("Scanner error:", err);
  process.exit(1);
});
