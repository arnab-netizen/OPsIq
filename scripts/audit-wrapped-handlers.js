#!/usr/bin/env node
/**
 * Static scanner: Detect Response.json() returns in canonical wrapper handlers
 *
 * Modes:
 * 1. Full audit (default): npm run audit:wrapped-handlers
 *    - Reports all violations
 *    - Exits 1 if any violations exist
 *
 * 2. Ratchet mode (CI): npm run audit:wrapped-handlers:ratchet
 *    - Compares current violations to baseline
 *    - Exits 0 if same or fewer violations (progress allowed)
 *    - Exits 1 only if new violations are found
 *
 * 3. Baseline update (manual only): npm run audit:wrapped-handlers:update-baseline
 *    - Regenerates baseline file
 *    - Not used in CI
 */

const fs = require("fs");
const path = require("path");

const MODE = process.argv[2] || "audit";
const SRC_DIR = path.join(__dirname, "..", "src");
const BASELINE_PATH = path.join(__dirname, "..", "qa", "baselines", "wrapped-response-violations.json");

// Routes that are known to use canonical wrapper
const WRAPPER_PATTERNS = [
  /export const (GET|POST|PUT|DELETE|PATCH) = withCanonicalEnforcement\(/,
  /export const (GET|POST|PUT|DELETE|PATCH) = withEnforcementFull\(/,
];

// Violations: Response.json or NextResponse.json in wrapped handler code
const VIOLATION_PATTERNS = [
  /return Response\.json\(/,
  /return NextResponse\.json\(/,
  /^\s*Response\.json\(/m,
  /^\s*NextResponse\.json\(/m,
];

// Safe patterns: Direct route handlers that can return Response
const SAFE_DIRECT_ROUTES = [
  "app/api/health/route.ts",
  "app/middleware.ts",
];

let violations = [];
let checked = [];

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

  if (!isWrapped) {
    return;
  }

  if (isDirect) {
    return;
  }

  checked.push(fileName);

  const violations_found = VIOLATION_PATTERNS.filter((pattern) =>
    pattern.test(content)
  );

  if (violations_found.length > 0) {
    violations.push(fileName);
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

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return null;
  }
  try {
    const content = fs.readFileSync(BASELINE_PATH, "utf-8");
    return JSON.parse(content);
  } catch (e) {
    console.error(`Error reading baseline: ${e.message}`);
    return null;
  }
}

function runAudit() {
  console.log("Scanning for wrapped handler Response.json() violations...\n");

  walkDir(SRC_DIR);

  console.log(`Checked ${checked.length} wrapped route files:`);
  checked.slice(0, 5).forEach((file) => {
    console.log(`  ✓ ${file}`);
  });
  if (checked.length > 5) {
    console.log(`  ... and ${checked.length - 5} more`);
  }

  if (violations.length > 0) {
    console.error(`\n❌ VIOLATIONS FOUND: ${violations.length}`);
    violations.slice(0, 10).forEach((v) => {
      console.error(`  - ${v}`);
    });
    if (violations.length > 10) {
      console.error(`  ... and ${violations.length - 10} more`);
    }
    process.exit(1);
  } else {
    console.log("\n✅ All wrapped handlers return plain objects (no Response.json violations)");
    process.exit(0);
  }
}

function runRatchet() {
  console.log("Running ratchet mode (comparing to baseline)...\n");

  const baseline = loadBaseline();
  if (!baseline) {
    console.error("❌ Baseline file not found or malformed");
    console.error(`Expected: ${BASELINE_PATH}`);
    process.exit(1);
  }

  walkDir(SRC_DIR);

  const baselineViolations = new Set(
    baseline.violations.map((v) => v.file)
  );
  const currentViolations = new Set(violations);

  const newViolations = violations.filter((v) => !baselineViolations.has(v));
  const resolvedViolations = baseline.violations.filter((v) =>
    !currentViolations.has(v.file)
  );

  console.log(`Baseline violations: ${baseline.total_known_violations}`);
  console.log(`Current violations: ${violations.length}`);
  console.log(`New violations: ${newViolations.length}`);
  console.log(`Resolved violations: ${resolvedViolations.length}`);

  if (newViolations.length > 0) {
    console.error("\n❌ NEW VIOLATIONS DETECTED:");
    newViolations.forEach((v) => {
      console.error(`  - ${v}`);
    });
    process.exit(1);
  }

  if (resolvedViolations.length > 0) {
    console.log("\n✅ Progress made:");
    resolvedViolations.slice(0, 5).forEach((v) => {
      console.log(`  Fixed: ${v.file}`);
    });
    if (resolvedViolations.length > 5) {
      console.log(`  ... and ${resolvedViolations.length - 5} more fixed`);
    }
  }

  console.log("\n✅ Ratchet passed (no new violations)");
  process.exit(0);
}

function updateBaseline() {
  console.log("Updating baseline...\n");

  walkDir(SRC_DIR);

  const baselineData = {
    generated_at: new Date().toISOString(),
    scanner_version: "1.0.0",
    total_known_violations: violations.length,
    violations: violations.map((v) => ({
      file: v,
      violation_type: "wrapped_handler_returns_response_json",
      wrapper_detected: true,
      remediation_status: "legacy_pending",
      discovered_at: new Date().toISOString(),
    })).sort((a, b) => a.file.localeCompare(b.file)),
  };

  const dir = path.dirname(BASELINE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baselineData, null, 2));

  console.log(`✅ Baseline updated: ${BASELINE_PATH}`);
  console.log(`Total violations: ${violations.length}`);
  process.exit(0);
}

// Route to appropriate mode
switch (MODE) {
  case "ratchet":
    runRatchet();
    break;
  case "update-baseline":
    updateBaseline();
    break;
  case "audit":
  default:
    runAudit();
}

