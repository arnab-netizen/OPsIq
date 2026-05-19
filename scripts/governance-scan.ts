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

  constructor(options: { fix?: boolean; strict?: boolean } = {}) {
    this.fixMode = options.fix ?? false;
    this.strictMode = options.strict ?? false;
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
      this.scannedFiles++;
      this.scanFile(file);
    }

    this.reportResults();
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

    if (this.strictMode && errorCount > 0) {
      console.log("❌ Strict mode: Build failed due to governance errors\n");
      process.exit(1);
    }

    // Exit with warning code if errors exist
    if (errorCount > 0) {
      process.exit(1);
    }
  }
}

// Main
const args = process.argv.slice(2);
const scanner = new GovernanceScanner({
  fix: args.includes("--fix"),
  strict: args.includes("--strict"),
});

scanner.scan("./src").catch((err) => {
  console.error("Scanner error:", err);
  process.exit(1);
});
