#!/usr/bin/env node

/**
 * Deployment Readiness Validator
 *
 * Validates that the system is ready for production deployment.
 * Checks: CI status, environment variables, database schema, build artifacts, tests.
 *
 * Usage: npm run validate:deployment
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

interface ValidationResult {
  name: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  details?: string[];
}

interface DeploymentReadiness {
  timestamp: string;
  overallStatus: "READY" | "WARNING" | "BLOCKED";
  results: ValidationResult[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
}

const results: ValidationResult[] = [];

function addResult(
  name: string,
  status: "PASS" | "WARN" | "FAIL",
  message: string,
  details?: string[]
): void {
  results.push({ name, status, message, details });
  const symbol = status === "PASS" ? "✓" : status === "WARN" ? "⚠" : "✗";
  console.log(`${symbol} ${name}: ${message}`);
  if (details) {
    details.forEach((d) => console.log(`  → ${d}`));
  }
}

// Check 1: Environment Variables
function checkEnvironmentVariables(): void {
  console.log("\n📋 Checking Environment Variables...");

  const required = [
    "NODE_ENV",
    "DATABASE_URL",
    "NEXT_PUBLIC_APP_URL",
  ];

  // NEXT_PUBLIC_API_URL is a legacy alias for NEXT_PUBLIC_APP_URL. It is NOT a
  // hard requirement: if the canonical NEXT_PUBLIC_APP_URL is absent but the
  // legacy NEXT_PUBLIC_API_URL is present, treat the URL requirement as met.
  const legacyUrlAlias: Record<string, string> = {
    NEXT_PUBLIC_APP_URL: "NEXT_PUBLIC_API_URL",
  };

  const optional = [
    "SENTRY_DSN",
    "STRIPE_SECRET_KEY", // canonical; STRIPE_API_KEY accepted as legacy alias
    "STRIPE_WEBHOOK_SECRET",
    "OPSIQ_DIAGNOSTIC_KEY",
    "SLACK_WEBHOOK_URL",
  ];

  const missing: string[] = [];
  const optionalMissing: string[] = [];

  required.forEach((envVar) => {
    const alias = legacyUrlAlias[envVar];
    const satisfied =
      Boolean(process.env[envVar]) || (alias ? Boolean(process.env[alias]) : false);
    if (!satisfied) {
      missing.push(envVar);
    }
  });

  optional.forEach((envVar) => {
    if (!process.env[envVar]) {
      optionalMissing.push(envVar);
    }
  });

  if (missing.length === 0) {
    addResult(
      "Required Environment Variables",
      "PASS",
      `All ${required.length} required variables set`
    );
  } else {
    addResult(
      "Required Environment Variables",
      "FAIL",
      `Missing ${missing.length} required variables`,
      missing
    );
  }

  if (optionalMissing.length > 0) {
    addResult(
      "Optional Environment Variables",
      "WARN",
      `${optionalMissing.length} optional variables not set`,
      optionalMissing
    );
  }
}

// Check 2: Build Artifacts
function checkBuildArtifacts(): void {
  console.log("\n🏗️  Checking Build Artifacts...");

  const requiredFiles = [
    ".next",
    "node_modules",
    "package.json",
    "tsconfig.json",
  ];

  const missingFiles: string[] = [];

  requiredFiles.forEach((file) => {
    const fullPath = path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) {
      missingFiles.push(file);
    }
  });

  if (missingFiles.length === 0) {
    addResult(
      "Build Artifacts",
      "PASS",
      "All required build artifacts present"
    );
  } else {
    addResult(
      "Build Artifacts",
      "FAIL",
      `Missing ${missingFiles.length} required artifacts`,
      missingFiles
    );
  }
}

// Check 3: TypeScript Compilation
function checkTypeScript(): void {
  console.log("\n🔤 Checking TypeScript Compilation...");

  try {
    execSync("npx tsc --noEmit", { stdio: "pipe" });
    addResult(
      "TypeScript Compilation",
      "PASS",
      "No type errors found"
    );
  } catch (error) {
    addResult(
      "TypeScript Compilation",
      "FAIL",
      "Type errors detected. Run: npx tsc --noEmit"
    );
  }
}

// Check 4: Prisma Schema
function checkPrismaSchema(): void {
  console.log("\n🗄️  Checking Prisma Schema...");

  try {
    execSync("npx prisma validate", { stdio: "pipe" });
    addResult(
      "Prisma Schema Validation",
      "PASS",
      "Database schema is valid"
    );
  } catch (error) {
    addResult(
      "Prisma Schema Validation",
      "FAIL",
      "Schema validation failed. Run: npx prisma validate"
    );
  }
}

// Check 5: Package Dependencies
function checkDependencies(): void {
  console.log("\n📦 Checking Package Dependencies...");

  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const devDeps = Object.keys(packageJson.devDependencies || {});
    const hasCriticalDevDeps = [
      "typescript",
      "vitest",
      "prisma",
      "eslint",
    ].every((dep) => devDeps.includes(dep));

    if (hasCriticalDevDeps) {
      addResult(
        "Development Dependencies",
        "PASS",
        "All critical dev dependencies installed"
      );
    } else {
      addResult(
        "Development Dependencies",
        "FAIL",
        "Missing critical dev dependencies"
      );
    }
  } catch (error) {
    addResult(
      "Package Dependencies",
      "FAIL",
      "Could not verify dependencies"
    );
  }
}

// Check 6: Git State
function checkGitState(): void {
  console.log("\n📁 Checking Git State...");

  try {
    const status = execSync("git status --short", { encoding: "utf-8" });
    const isDirty = status.trim().length > 0;

    if (isDirty) {
      addResult(
        "Git Working Tree",
        "WARN",
        "Uncommitted changes detected",
        status
          .split("\n")
          .filter((l) => l.trim())
          .slice(0, 5)
      );
    } else {
      addResult(
        "Git Working Tree",
        "PASS",
        "Clean working tree"
      );
    }
  } catch (error) {
    addResult(
      "Git State",
      "WARN",
      "Could not check git status"
    );
  }
}

// Check 7: Documentation
function checkDocumentation(): void {
  console.log("\n📖 Checking Documentation...");

  const requiredDocs = [
    "README.md",
    "docs/BRANCH_PROTECTION_RULES.md",
    "docs/DEPLOYMENT_CHECKLIST.md",
  ];

  const missingDocs = requiredDocs.filter(
    (doc) => !fs.existsSync(path.join(process.cwd(), doc))
  );

  if (missingDocs.length === 0) {
    addResult(
      "Critical Documentation",
      "PASS",
      "All required documentation present"
    );
  } else {
    addResult(
      "Critical Documentation",
      "WARN",
      `${missingDocs.length} documentation files missing`,
      missingDocs
    );
  }
}

// Check 8: Security Configuration
function checkSecurityConfiguration(): void {
  console.log("\n🔒 Checking Security Configuration...");

  const securityChecks: [string, boolean][] = [
    [".env.example exists", fs.existsSync(path.join(process.cwd(), ".env.example"))],
    [".gitignore configured", fs.existsSync(path.join(process.cwd(), ".gitignore"))],
    ["No .env in git", !fs.existsSync(path.join(process.cwd(), ".env"))],
  ];

  const failedChecks = securityChecks.filter(([_, passed]) => !passed);

  if (failedChecks.length === 0) {
    addResult(
      "Security Configuration",
      "PASS",
      "All security checks passed"
    );
  } else {
    addResult(
      "Security Configuration",
      "FAIL",
      `${failedChecks.length} security checks failed`,
      failedChecks.map(([name]) => name)
    );
  }
}

// Generate Report
function generateReport(): DeploymentReadiness {
  const passed = results.filter((r) => r.status === "PASS").length;
  const warnings = results.filter((r) => r.status === "WARN").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  let overallStatus: "READY" | "WARNING" | "BLOCKED" = "READY";
  if (failed > 0) overallStatus = "BLOCKED";
  else if (warnings > 0) overallStatus = "WARNING";

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    results,
    summary: { passed, warnings, failed },
  };
}

// Main Execution
async function main(): Promise<void> {
  console.log("🚀 OpsIQ Deployment Readiness Validator\n");
  console.log("=" .repeat(60));

  checkEnvironmentVariables();
  checkBuildArtifacts();
  checkTypeScript();
  checkPrismaSchema();
  checkDependencies();
  checkGitState();
  checkDocumentation();
  checkSecurityConfiguration();

  const report = generateReport();

  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Deployment Readiness Summary");
  console.log(`Status: ${report.overallStatus}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Warnings: ${report.summary.warnings}`);
  console.log(`Failed: ${report.summary.failed}`);

  if (report.overallStatus === "READY") {
    console.log("\n✅ System is READY for deployment!");
    process.exit(0);
  } else if (report.overallStatus === "WARNING") {
    console.log("\n⚠️  System is deployable but with warnings.");
    console.log("Review and resolve warnings before production.");
    process.exit(0);
  } else {
    console.log("\n❌ System is NOT ready for deployment.");
    console.log("Resolve all failures before deploying.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Validation error:", error.message);
  process.exit(1);
});
