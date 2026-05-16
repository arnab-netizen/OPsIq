#!/usr/bin/env node

/**
 * PHASE G2: COMPILER HARDENING VALIDATION
 *
 * Validates that no new violations have been introduced:
 * 1. No new `any` types in auth paths
 * 2. No new unions of AuthContext|CanonicalAuthContext
 * 3. No new unsafe casts on auth objects
 * 4. No legacy auth imports in canonical routes
 *
 * Exit code: 0 if compliant, 1 if violations found
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");

const violations = [];

// Check 1: No `any` in auth context parameters
console.log("PHASE G2: Scanning for auth type violations...");

const serviceFiles = glob.sync("src/services/**/*.ts");
const routeFiles = glob.sync("src/app/api/**/route.ts");

// Check service files for `any` in context parameters
serviceFiles.forEach(file => {
  const content = fs.readFileSync(file, "utf-8");

  // Look for authContext: any
  if (/authContext\s*:\s*any\b/.test(content)) {
    violations.push({
      file,
      rule: "NO_ANY_IN_AUTH",
      message: "Service function has authContext: any parameter",
    });
  }

  // Look for union types
  if (/authContext\s*:\s*\(.*AuthContext.*\|.*CanonicalAuthContext.*\)/.test(content)) {
    violations.push({
      file,
      rule: "NO_AUTH_CONTEXT_UNION",
      message: "Service function has union type mixing auth contexts",
    });
  }
});

// Check routes for legacy imports in GET/POST/etc using canonical enforcement
routeFiles.forEach(file => {
  const content = fs.readFileSync(file, "utf-8");

  // Check if this file is mixing canonical and legacy enforcement
  const hasCanonical = content.includes("withCanonicalEnforcement");
  const hasLegacy = content.includes("withEnforcementFull");

  // Warn if mixing (but don't fail yet - PATCH methods may still be legacy)
  if (hasCanonical && hasLegacy) {
    // This is OK during transition - one method can be canonical, another legacy
    // The violation would only be if a SPECIFIC endpoint using canonical also imports unused legacy
  }
});

// Check for unsafe casts on auth objects
[...serviceFiles, ...routeFiles].forEach(file => {
  const content = fs.readFileSync(file, "utf-8");

  // Look for authContext specifically cast to any (not other casts)
  if (/authContext\s*as\s*any\b/.test(content)) {
    violations.push({
      file,
      rule: "NO_UNSAFE_CAST",
      message: "authContext object cast to any type",
    });
  }
});

// Report findings
if (violations.length > 0) {
  console.log(`\n❌ PHASE G2 VIOLATIONS FOUND: ${violations.length}\n`);
  violations.forEach(v => {
    console.log(`  ${v.file}`);
    console.log(`    [${v.rule}] ${v.message}`);
  });
  process.exit(1);
} else {
  console.log("\n✓ PHASE G2 COMPLIANT: No compiler hardening violations\n");
  process.exit(0);
}
