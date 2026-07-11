#!/usr/bin/env node
/**
 * Phase R0 — ACTIVE_TEST_ASSERTION_TRUTH scanner
 *
 * Counts and locates `expect(true).toBe(true)` (and common variants) across
 * test files. These are placeholder assertions that always pass regardless of
 * the code under test, making test suites report green while providing zero
 * coverage signal.
 *
 * Usage:
 *   node scripts/scan-fake-assertions.js [--path src/__tests__]
 *
 * Output: per-file count and line numbers, then a grand total.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_TEST_PATH = path.resolve(__dirname, "../src/__tests__");
const scanPath = process.argv.includes("--path")
  ? path.resolve(process.argv[process.argv.indexOf("--path") + 1])
  : DEFAULT_TEST_PATH;

// Patterns that are unconditionally true regardless of implementation
const FAKE_ASSERTION_PATTERNS = [
  /expect\(true\)\.toBe\(true\)/,
  /expect\(true\)\.toEqual\(true\)/,
  /expect\(1\)\.toBe\(1\)/,
  /expect\(1\)\.toEqual\(1\)/,
  /expect\(".*"\)\.toMatch\(\/Phase R1\/\)/,  // Phase R1 deferred placeholders (known, intentional)
];

// Patterns we explicitly exclude (intentional deferred markers)
const INTENTIONAL_PATTERNS = [
  /Phase R1/,
  /Phase R0/,
  /Placeholder/i,
];

function walkDir(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      files.push(...walkDir(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx") || entry.name.endsWith(".spec.ts"))
    ) {
      files.push(full);
    }
  }
  return files;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isIntentional = INTENTIONAL_PATTERNS.some((p) => p.test(line));
    const isFake = FAKE_ASSERTION_PATTERNS.some((p) => p.test(line));

    if (isFake && !isIntentional) {
      hits.push({ lineNum: i + 1, text: line.trim() });
    }
  }

  return hits;
}

function main() {
  console.log(`Scanning: ${scanPath}\n`);

  const files = walkDir(scanPath);
  let grandTotal = 0;
  const results = [];

  for (const file of files) {
    const hits = scanFile(file);
    if (hits.length > 0) {
      grandTotal += hits.length;
      results.push({
        file: path.relative(path.resolve(__dirname, ".."), file),
        count: hits.length,
        lines: hits,
      });
    }
  }

  if (grandTotal === 0) {
    console.log("CLEAN — no unconditional fake assertions found.");
    process.exit(0);
  }

  console.log(`FAKE ASSERTIONS (${grandTotal} total across ${results.length} files):\n`);
  for (const r of results) {
    console.log(`  ${r.file} — ${r.count} fake assertion(s)`);
    for (const h of r.lines) {
      console.log(`    line ${h.lineNum}: ${h.text}`);
    }
    console.log();
  }

  console.log(`Grand total: ${grandTotal} fake assertions in ${results.length} files`);
  console.log("These tests always pass and provide zero coverage signal.");

  process.exit(1);
}

main();
