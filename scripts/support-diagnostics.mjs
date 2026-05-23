#!/usr/bin/env node

/**
 * Support Diagnostics Bundle Generator
 *
 * Collects non-secret operational diagnostics for support teams.
 * Never prints or exports secret values.
 *
 * Usage: npm run support:diagnostics
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const bundle = {
  timestamp: new Date().toISOString(),
  git: {
    sha: "",
    branch: "",
    remote_url: "",
  },
  environment: {
    node_version: process.version,
    npm_version: "",
    environment_type: process.env.NODE_ENV || "unknown",
    skip_env_validation: Boolean(process.env.SKIP_ENV_VALIDATION),
  },
  package: {
    version: "0.1.0",
    name: "opsiq",
    scripts_available: [],
  },
  validation: {
    prisma_validate: "FAIL",
    lint_ratchet: "FAIL",
    governance_scan: "FAIL",
    tsc: "FAIL",
    build: "FAIL",
  },
  env_presence: {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    NEXTAUTH_SECRET: Boolean(process.env.NEXTAUTH_SECRET),
    NEXTAUTH_URL: Boolean(process.env.NEXTAUTH_URL),
    NODE_ENV: Boolean(process.env.NODE_ENV),
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
  },
  routes: {
    health_endpoint_available: false,
    readiness_endpoint_available: false,
    startup_endpoint_available: false,
    ops_readiness_endpoint_available: false,
    ops_runtime_endpoint_available: false,
  },
};

console.log("📦 Collecting diagnostics...\n");

// Get git info
try {
  bundle.git.sha = execSync("git rev-parse HEAD", { cwd: projectRoot, encoding: "utf-8" }).trim().substring(0, 12);
  bundle.git.branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: projectRoot, encoding: "utf-8" }).trim();
  bundle.git.remote_url = execSync("git config --get remote.origin.url", { cwd: projectRoot, encoding: "utf-8" }).trim();
} catch {
  console.warn("⚠️  Could not get git information");
}

// Get npm version
try {
  bundle.environment.npm_version = execSync("npm --version", { encoding: "utf-8" }).trim();
} catch {
  console.warn("⚠️  Could not get npm version");
}

// Get package.json info
const packageJsonPath = path.join(projectRoot, "package.json");
if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  bundle.package.version = pkg.version;
  bundle.package.name = pkg.name;
  bundle.package.scripts_available = Object.keys(pkg.scripts || {});
}

// Run validation checks
console.log("🔍 Running validation checks...");

try {
  execSync("npx prisma validate", { cwd: projectRoot, stdio: "pipe" });
  bundle.validation.prisma_validate = "PASS";
} catch {
  bundle.validation.prisma_validate = "FAIL";
}

try {
  execSync("npm run lint:ratchet", { cwd: projectRoot, stdio: "pipe" });
  bundle.validation.lint_ratchet = "PASS";
} catch {
  bundle.validation.lint_ratchet = "FAIL";
}

try {
  execSync("npm run governance:scan:strict", { cwd: projectRoot, stdio: "pipe" });
  bundle.validation.governance_scan = "PASS";
} catch {
  bundle.validation.governance_scan = "FAIL";
}

try {
  execSync("npx tsc --noEmit", { cwd: projectRoot, stdio: "pipe" });
  bundle.validation.tsc = "PASS";
} catch {
  bundle.validation.tsc = "FAIL";
}

try {
  execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });
  bundle.validation.build = "PASS";
} catch {
  bundle.validation.build = "FAIL";
}

// Check for endpoint files (non-functional check, just file existence)
const endpointFiles = [
  { file: "src/app/api/health/route.ts", key: "health_endpoint_available" },
  { file: "src/app/api/readiness/route.ts", key: "readiness_endpoint_available" },
  { file: "src/app/api/startup/route.ts", key: "startup_endpoint_available" },
  { file: "src/app/api/ops/readiness/route.ts", key: "ops_readiness_endpoint_available" },
  { file: "src/app/api/ops/runtime/route.ts", key: "ops_runtime_endpoint_available" },
];

for (const endpoint of endpointFiles) {
  const filePath = path.join(projectRoot, endpoint.file);
  bundle.routes[endpoint.key] = fs.existsSync(filePath);
}

// Print summary
console.log("\n📊 Diagnostics Summary:");
console.log(`  Git SHA: ${bundle.git.sha}`);
console.log(`  Branch: ${bundle.git.branch}`);
console.log(`  Node: ${bundle.environment.node_version}`);
console.log(`  NPM: ${bundle.environment.npm_version}`);
console.log(`  Prisma validate: ${bundle.validation.prisma_validate}`);
console.log(`  Lint ratchet: ${bundle.validation.lint_ratchet}`);
console.log(`  Governance scan: ${bundle.validation.governance_scan}`);
console.log(`  TypeScript: ${bundle.validation.tsc}`);
console.log(`  Build: ${bundle.validation.build}`);

// Write bundle
const bundlePath = path.join(projectRoot, ".claude", "support_diagnostics_bundle.json");
const bundleDir = path.dirname(bundlePath);
if (!fs.existsSync(bundleDir)) {
  fs.mkdirSync(bundleDir, { recursive: true });
}
fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
console.log(`\n✓ Bundle written to ${bundlePath}`);

process.exit(0);
