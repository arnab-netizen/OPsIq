#!/usr/bin/env node
/**
 * Static scanner: Detect Response.json() returns in canonical wrapper handlers
 *
 * Regression guard for: Handler returning Response.json() to wrapper that
 * expects plain serializable objects.
 *
 * Fails CI if violations found.
 */

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src");

// Routes that are known to use canonical wrapper
const WRAPPED_ROUTES = [
  "app/api/engagements/route.ts",
  "app/api/internal/demo-permission-proof/route.ts",
  "app/api/internal/demo-engagement-proof/route.ts",
  // Add more as they're converted to canonical wrapper
];

// Patterns indicating a handler is wrapped by canonical enforcement
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
  "app/api/health/route.ts", // Health check - can return Response
  "app/middleware.ts", // Middleware - uses NextResponse
];

let violations = [];
let checked = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const fileName = path.relative(SRC_DIR, filePath);

  // Check if it's a wrapped route
  const isWrapped = WRAPPER_PATTERNS.some((pattern) => pattern.test(content));
  const isDirect = SAFE_DIRECT_ROUTES.some((route) =>
    fileName.endsWith(route)
  );

  if (!isWrapped) {
    return; // Not a wrapped route
  }

  if (isDirect) {
    return; // Direct route, allowed to use Response
  }

  checked.push(fileName);

  // Check for violations in wrapped handler
  const violations_found = VIOLATION_PATTERNS.filter((pattern) =>
    pattern.test(content)
  );

  if (violations_found.length > 0) {
    violations.push({
      file: fileName,
      message: `Wrapped handler returns Response.json() instead of plain object`,
      patterns: violations_found.map((p) => p.toString()),
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

console.log("Scanning for wrapped handler Response.json() violations...\n");

walkDir(SRC_DIR);

console.log(`Checked ${checked.length} wrapped route files:`);
checked.forEach((file) => {
  console.log(`  ✓ ${file}`);
});

if (violations.length > 0) {
  console.error("\n❌ VIOLATIONS FOUND:");
  violations.forEach((v) => {
    console.error(`\n  File: ${v.file}`);
    console.error(`  Issue: ${v.message}`);
    console.error(`  Fix: Return plain object from handler, not Response.json()`);
  });
  process.exit(1);
} else {
  console.log("\n✅ All wrapped handlers return plain objects (no Response.json violations)");
  process.exit(0);
}
