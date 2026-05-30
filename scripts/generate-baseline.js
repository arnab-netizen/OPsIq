#!/usr/bin/env node
/**
 * Generate baseline of known wrapped response violations
 *
 * This establishes the current state as the baseline so the ratchet
 * can detect ONLY NEW violations.
 */

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src");

const WRAPPER_PATTERNS = [
  /export const (GET|POST|PUT|DELETE|PATCH) = withCanonicalEnforcement\(/,
  /export const (GET|POST|PUT|DELETE|PATCH) = withEnforcementFull\(/,
];

const VIOLATION_PATTERNS = [
  /return Response\.json\(/,
  /return NextResponse\.json\(/,
];

const SAFE_DIRECT_ROUTES = [
  "app/api/health/route.ts",
  "app/middleware.ts",
];

let violations = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const fileName = path.relative(SRC_DIR, filePath);

  // Skip test files
  if (fileName.includes("__tests__") || fileName.endsWith(".test.ts") || fileName.endsWith(".test.tsx")) {
    return;
  }

  const isWrapped = WRAPPER_PATTERNS.some((pattern) => pattern.test(content));
  const isDirect = SAFE_DIRECT_ROUTES.some((route) =>
    fileName.endsWith(route)
  );

  if (!isWrapped || isDirect) {
    return;
  }

  const hasViolation = VIOLATION_PATTERNS.some((pattern) =>
    pattern.test(content)
  );

  if (hasViolation) {
    violations.push({
      file: fileName,
      route: "/" + fileName.replace(/^app\/api/, "").replace(/\/route\.ts$/, ""),
      violation_type: "wrapped_handler_returns_response_json",
      wrapper_detected: true,
      remediation_status: "legacy_pending",
      discovered_at: new Date().toISOString(),
    });
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      scanFile(filePath);
    }
  });
}

walkDir(SRC_DIR);

const baseline = {
  generated_at: new Date().toISOString(),
  scanner_version: "1.0.0",
  total_known_violations: violations.length,
  violations: violations.sort((a, b) => a.file.localeCompare(b.file)),
};

const outputPath = path.join(
  __dirname,
  "..",
  "qa",
  "baselines",
  "wrapped-response-violations.json"
);

// Ensure directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2));

console.log(`Baseline created: ${outputPath}`);
console.log(`Total violations: ${violations.length}`);
