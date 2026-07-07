#!/usr/bin/env node

/**
 * Production Smoke Test Runner
 *
 * Performs lightweight smoke tests against safe GET endpoints.
 * Does NOT require actual deployment when BASE_URL is not provided.
 * When BASE_URL is provided, tests the deployed instance.
 *
 * Usage: npm run deployment:smoke [BASE_URL]
 * Example: npm run deployment:smoke https://app.opsiqu.com
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Get BASE_URL from env or command line argument
const baseUrl = process.env.BASE_URL || process.argv[2];

const report = {
  timestamp: new Date().toISOString(),
  base_url: baseUrl || "[NOT_PROVIDED]",
  offline_mode: !baseUrl,
  tests_run: 0,
  tests_passed: 0,
  tests_failed: 0,
  results: [],
  overall_status: "PASS",
};

const safeEndpoints = [
  { path: "/api/health", expectedKeys: ["status", "checks"] },
  { path: "/api/readiness", expectedKeys: ["startup_complete", "is_ready"] },
  { path: "/api/startup", expectedKeys: ["is_ready", "config_loaded"] },
  { path: "/api/ops/readiness", expectedKeys: ["current", "history"] },
  { path: "/api/ops/runtime", expectedKeys: ["runtime", "performance"] },
];

async function runTests() {
  if (!baseUrl) {
    console.log("⊘  BLOCKED: BASE_URL not provided — cannot verify a deployment");
    console.log("   To test a deployed instance, provide BASE_URL:");
    console.log("   npm run deployment:smoke https://app.example.com");
    console.log("\n   Required for deployment: BASE_URL_REQUIRED_FOR_SMOKE_TEST");
    // Fail closed: no target means the smoke check could not run. Classify as
    // BLOCKED (not PASS/PARTIAL) and exit non-zero so CI/gates do not treat a
    // skipped check as a healthy deployment.
    report.overall_status = "BLOCKED";
    writeReport();
    process.exit(1);
  }

  console.log(`🧪 Running smoke tests against ${baseUrl}\n`);

  for (const endpoint of safeEndpoints) {
    const url = `${baseUrl}${endpoint.path}`;
    const result = {
      endpoint: endpoint.path,
      method: "GET",
      status: 0,
      success: false,
      latency_ms: 0,
      response_shape_valid: false,
    };

    try {
      const startTime = Date.now();
      const response = await fetch(url, { timeout: 10000 });
      result.latency_ms = Date.now() - startTime;
      result.status = response.status;

      // Check status code (200-299 or 503 for readiness checks)
      const isHealthy = response.status >= 200 && response.status < 300;
      const isReadinessCheck = endpoint.path.includes("readiness") || endpoint.path.includes("startup");
      const isAcceptableStatus = isHealthy || (isReadinessCheck && response.status === 503);

      if (!isAcceptableStatus) {
        result.success = false;
        result.error = `Unexpected status ${response.status}`;
      } else {
        try {
          const data = await response.json();

          // Validate response shape
          const hasExpectedKeys = endpoint.expectedKeys.every((key) => key in data);
          result.response_shape_valid = hasExpectedKeys;

          if (!hasExpectedKeys) {
            result.success = false;
            result.error = `Missing expected keys: ${endpoint.expectedKeys.join(", ")}`;
          } else {
            result.success = true;
          }
        } catch {
          result.success = false;
          result.error = "Response is not valid JSON";
        }
      }
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);
    }

    report.results.push(result);
    report.tests_run++;
    if (result.success) {
      report.tests_passed++;
      console.log(`✓ ${endpoint.path} (${result.latency_ms}ms)`);
    } else {
      report.tests_failed++;
      report.overall_status = "FAIL";
      console.log(`✗ ${endpoint.path} - ${result.error}`);
    }
  }

  console.log(`\n📊 Summary: ${report.tests_passed}/${report.tests_run} tests passed`);
  if (report.overall_status === "FAIL") {
    console.log("⚠️  Some tests failed - check details in report");
  }
}

function writeReport() {
  const reportPath = path.join(projectRoot, ".claude", "production_smoke_report.json");
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✓ Report written to ${reportPath}`);
}

runTests().then(() => {
  writeReport();
  process.exit(report.overall_status === "FAIL" ? 1 : 0);
});
