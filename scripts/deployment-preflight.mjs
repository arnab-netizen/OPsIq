#!/usr/bin/env node

/**
 * Deployment Preflight Checker
 *
 * Validates environment readiness for deployment without requiring actual deployment.
 * Checks required environment variables, Node version, package state, schema validity.
 *
 * Usage: npm run deployment:preflight
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Reconciled to the env contract the application code actually reads.
// Authentication is session/cookie based (no NextAuth) and requires no secret,
// so the previously-listed NEXTAUTH_SECRET / NEXTAUTH_URL were phantom blockers
// and have been removed. Stripe is optional (lazy clients; no customer-journey
// dependency): canonical STRIPE_SECRET_KEY, with STRIPE_API_KEY as a legacy alias.
const envRequirements = [
  { name: "NODE_ENV", category: "REQUIRED" },
  { name: "DATABASE_URL", category: "REQUIRED" },
  { name: "NEXT_PUBLIC_APP_URL", category: "EXTERNAL_RUNTIME_REQUIRED" },
  { name: "SKIP_ENV_VALIDATION", category: "LOCAL_ONLY" },
  { name: "STRIPE_SECRET_KEY", category: "OPTIONAL" }, // STRIPE_API_KEY = legacy alias
  { name: "STRIPE_WEBHOOK_SECRET", category: "OPTIONAL" },
  { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", category: "OPTIONAL" },
  { name: "OPSIQ_DIAGNOSTIC_KEY", category: "OPTIONAL" },
  { name: "SENTRY_DSN", category: "OPTIONAL" },
  { name: "ASYMMETRIC_PRIVATE_KEY", category: "OPTIONAL" }, // Ed25519/ECDSA private key for decision signing; falls back to filesystem .keys/ in non-serverless
  { name: "ASYMMETRIC_PUBLIC_KEY", category: "OPTIONAL" },  // Matching public key; required alongside ASYMMETRIC_PRIVATE_KEY
];

const report = {
  timestamp: new Date().toISOString(),
  node_version: process.version,
  npm_version: "",
  environment_checks: [],
  package_integrity: {
    package_json_exists: false,
    node_modules_exists: false,
    package_lock_exists: false,
  },
  prisma_schema_valid: false,
  prisma_migrations_status: "UNKNOWN",
  overall_status: "READY",
  blockers: [],
  warnings: [],
};

// Get npm version
try {
  report.npm_version = execSync("npm --version", { encoding: "utf-8" }).trim();
} catch {
  report.blockers.push("npm not available");
}

// Check environment variables (don't print values)
console.log("🔍 Checking environment variables...");
for (const env of envRequirements) {
  const present = process.env[env.name] !== undefined;
  report.environment_checks.push({
    name: env.name,
    category: env.category,
    present,
    value: present ? "[SET]" : "[NOT SET]",
  });

  const status = present ? "✓" : "✗";
  console.log(`  ${status} ${env.name}: ${present ? "set" : "not set"} [${env.category}]`);

  if (env.category === "REQUIRED" && !present) {
    report.blockers.push(`Required env ${env.name} not set`);
  } else if (env.category === "EXTERNAL_RUNTIME_REQUIRED" && !present) {
    report.warnings.push(`External runtime env ${env.name} not set - will be needed at deployment`);
  }
}

// Check package integrity
console.log("\n📦 Checking package integrity...");
const packageJsonPath = path.join(projectRoot, "package.json");
const nodeModulesPath = path.join(projectRoot, "node_modules");
const packageLockPath = path.join(projectRoot, "package-lock.json");

report.package_integrity.package_json_exists = fs.existsSync(packageJsonPath);
report.package_integrity.node_modules_exists = fs.existsSync(nodeModulesPath);
report.package_integrity.package_lock_exists = fs.existsSync(packageLockPath);

console.log(`  ${report.package_integrity.package_json_exists ? "✓" : "✗"} package.json exists`);
console.log(`  ${report.package_integrity.node_modules_exists ? "✓" : "✗"} node_modules exists`);
console.log(`  ${report.package_integrity.package_lock_exists ? "✓" : "✗"} package-lock.json exists`);

if (!report.package_integrity.node_modules_exists) {
  report.warnings.push("node_modules not present - run 'npm ci' before deployment");
}

// Check Prisma schema validity
console.log("\n🔐 Checking Prisma schema...");
try {
  execSync("npx prisma validate", { cwd: projectRoot, stdio: "pipe" });
  report.prisma_schema_valid = true;
  console.log(`  ✓ Prisma schema is valid`);
} catch {
  report.prisma_schema_valid = false;
  report.blockers.push("Prisma schema validation failed");
  console.log(`  ✗ Prisma schema validation failed`);
}

// Check Prisma migrations status (only if DATABASE_URL is set)
if (process.env.DATABASE_URL) {
  console.log("\n📋 Checking Prisma migration status...");
  try {
    execSync("npx prisma migrate status", { cwd: projectRoot, encoding: "utf-8", stdio: "pipe" });
    report.prisma_migrations_status = "UP_TO_DATE";
    console.log(`  ✓ Migrations up to date`);
  } catch (e) {
    const error = String(e);
    if (error.includes("pending")) {
      report.prisma_migrations_status = "PENDING_MIGRATIONS";
      report.warnings.push("Pending migrations found - run 'npx prisma migrate deploy' before deployment");
      console.log(`  ⚠ Pending migrations`);
    } else {
      report.prisma_migrations_status = "ERROR";
      report.blockers.push("Failed to check migration status");
      console.log(`  ✗ Failed to check migration status`);
    }
  }
} else {
  report.prisma_migrations_status = "DATABASE_URL_NOT_SET";
  console.log(`  ⊘ Skipping - DATABASE_URL not set`);
}

// Determine overall status
if (report.blockers.length > 0) {
  report.overall_status = "BLOCKED";
} else if (report.warnings.length > 0) {
  report.overall_status = "WARNING";
} else {
  report.overall_status = "READY";
}

// Print summary
console.log("\n" + "=".repeat(50));
console.log(`📊 Preflight Status: ${report.overall_status}`);
console.log("=".repeat(50));

if (report.blockers.length > 0) {
  console.log("\n🚫 Blockers:");
  report.blockers.forEach((b) => console.log(`  - ${b}`));
}

if (report.warnings.length > 0) {
  console.log("\n⚠️  Warnings:");
  report.warnings.forEach((w) => console.log(`  - ${w}`));
}

// Write report
const reportPath = path.join(projectRoot, ".claude", "deployment_preflight_report.json");
const reportDir = path.dirname(reportPath);
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\n✓ Report written to ${reportPath}`);

// Exit with appropriate code
process.exit(report.overall_status === "BLOCKED" ? 1 : 0);
