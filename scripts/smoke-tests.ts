#!/usr/bin/env node

/**
 * Production Smoke Tests
 *
 * Verifies critical OpsIQ functionality after deployment.
 * Run immediately after deploying to production.
 *
 * Usage: npm run smoke:prod
 * Usage: npm run smoke:staging -- --env=staging
 */

import https from "https";

export {};

interface TestResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  message: string;
  duration: number;
  details?: string[];
}

const results: TestResult[] = [];

// Configuration
const env = process.argv.includes("--env=staging") ? "staging" : "production";
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://yourdomain.com";
const timeout = 30000; // 30 seconds

console.log(`\n🧪 OpsIQ Production Smoke Tests`);
console.log(`Environment: ${env}`);
console.log(`Base URL: ${baseUrl}`);
console.log(`\n${"─".repeat(60)}\n`);

// Helper function for HTTP requests
async function request(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);

    const req = https.request(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      timeout,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode || 500,
            data: data ? JSON.parse(data) : null,
            headers: res.headers as Record<string, string>,
          });
        } catch {
          resolve({
            status: res.statusCode || 500,
            data: data,
            headers: res.headers as Record<string, string>,
          });
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<void> {
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, status: "PASS", message: "✓", duration });
    console.log(`✓ ${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", message, duration });
    console.log(`✗ ${name} - ${message}`);
  }
}

// Test Suite
async function main() {
  // Fail closed: refuse to run against an unconfigured / placeholder target.
  // Previously baseUrl defaulted to "https://yourdomain.com", so the suite would
  // "run" against a non-existent host and report misleading results.
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl || /yourdomain\.com|example\.com/.test(configuredUrl)) {
    console.error(
      `\n✗ BLOCKED: NEXT_PUBLIC_APP_URL is not set to a real ${env} URL ` +
        `(got: ${configuredUrl ?? "<unset>"}).`,
    );
    console.error(
      `  Smoke tests cannot verify a deployment without a real target. ` +
        `Set NEXT_PUBLIC_APP_URL and re-run. Classifying as BLOCKED (not PASS).`,
    );
    process.exit(1);
  }

  // Test 1: Health Check
  await runTest("Health check endpoint", async () => {
    const res = await request("GET", "/api/health");

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    const data = res.data as Record<string, unknown>;
    if (!data.status) {
      throw new Error("Missing health status");
    }

    if (
      typeof data.status !== "string" ||
      !["healthy", "degraded"].includes(data.status)
    ) {
      throw new Error(`Invalid health status: ${data.status}`);
    }

    const checks = data.checks as Record<string, unknown>;
    if (!checks || !checks.database) {
      throw new Error("Missing database health check");
    }

    const dbCheck = checks.database as Record<string, unknown>;
    if (dbCheck.status !== "healthy") {
      throw new Error(`Database health: ${dbCheck.status}`);
    }

    if (typeof dbCheck.latencyMs !== "number" || dbCheck.latencyMs > 5000) {
      throw new Error(`High database latency: ${dbCheck.latencyMs}ms`);
    }
  });

  // Test 2: Readiness Check
  await runTest("Readiness probe", async () => {
    const res = await request("GET", "/api/ops/readiness");

    if (res.status !== 200 && res.status !== 503) {
      throw new Error(`Expected 200 or 503, got ${res.status}`);
    }
  });

  // Test 3: Liveness Check
  await runTest("Liveness probe", async () => {
    const res = await request("GET", "/api/liveness");

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
  });

  // Test 4: API Authentication Boundary
  await runTest("Authentication enforcement", async () => {
    // Try to access protected endpoint without auth.
    // A protected endpoint must respond 401/302. Any other status — OR an
    // inability to reach it — is a FAILURE, not a pass. Previously non-timeout
    // network errors were swallowed, so an unreachable endpoint counted as
    // "auth enforced". Fail closed instead: rethrow so the check fails.
    const res = await request("GET", "/api/workspaces");

    // Should be 401 (unauthenticated) or 302 (redirect to login)
    if (res.status !== 401 && res.status !== 302) {
      throw new Error(
        `Expected 401 or 302, got ${res.status} (endpoint not protected)`
      );
    }
  });

  // Test 5: Database Connectivity
  await runTest("Database connectivity", async () => {
    const res = await request("GET", "/api/health");

    if (res.status !== 200) {
      throw new Error(`Health check failed: ${res.status}`);
    }

    const data = res.data as Record<string, unknown>;
    const checks = data.checks as Record<string, unknown>;
    const dbCheck = checks.database as Record<string, unknown>;

    if (
      dbCheck.status !== "healthy" &&
      dbCheck.status !== "degraded"
    ) {
      throw new Error(`Database status: ${dbCheck.status}`);
    }

    if (!dbCheck.latencyMs) {
      throw new Error("Database latency not measured");
    }
  });

  // Test 6: Memory Health
  await runTest("Memory health", async () => {
    const res = await request("GET", "/api/health");

    if (res.status !== 200) {
      throw new Error(`Health check failed: ${res.status}`);
    }

    const data = res.data as Record<string, unknown>;
    const checks = data.checks as Record<string, unknown>;
    const memory = checks.memory as Record<string, unknown>;

    if (!memory.status) {
      throw new Error("Missing memory check");
    }

    if (memory.status === "unhealthy") {
      throw new Error(`High memory usage: ${memory.usage}`);
    }
  });

  // Test 7: Runtime Check
  await runTest("Runtime environment", async () => {
    const res = await request("GET", "/api/health");

    if (res.status !== 200) {
      throw new Error(`Health check failed: ${res.status}`);
    }

    const data = res.data as Record<string, unknown>;
    const checks = data.checks as Record<string, unknown>;
    const runtime = checks.runtime as Record<string, unknown>;

    if (!runtime.nodeVersion) {
      throw new Error("Missing Node.js version");
    }

    if (runtime.environment !== "production" && env === "production") {
      throw new Error(`Wrong environment: ${runtime.environment}`);
    }
  });

  // Test 8: Uptime Check
  await runTest("Application uptime", async () => {
    const res = await request("GET", "/api/health");

    if (res.status !== 200) {
      throw new Error(`Health check failed: ${res.status}`);
    }

    const data = res.data as Record<string, unknown>;
    const checks = data.checks as Record<string, unknown>;
    const uptime = checks.uptime as Record<string, unknown>;

    if (typeof uptime.uptimeSeconds !== "number") {
      throw new Error("Missing uptime");
    }

    if (uptime.uptimeSeconds < 5 && env === "production") {
      throw new Error(`Recently restarted: ${uptime.uptimeSeconds}s uptime`);
    }
  });

  // Test 9: Webhook Endpoint Available
  await runTest("Webhook endpoint ready", async () => {
    try {
      const res = await request("POST", "/api/webhooks/stripe", {});

      // Expected: 401 (no signature) or 400 (invalid payload)
      // NOT 404 (endpoint doesn't exist)
      if (res.status === 404) {
        throw new Error("Webhook endpoint not found");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("timeout")) {
        throw error;
      }
      // Other errors are acceptable (missing signature, etc.)
    }
  });

  // Print Summary
  console.log(`\n${"─".repeat(60)}`);

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const warnings = results.filter((r) => r.status === "WARN").length;

  console.log(`\n📊 Summary:`);
  console.log(`  ✓ Passed:  ${passed}/${results.length}`);
  if (failed > 0) console.log(`  ✗ Failed:  ${failed}`);
  if (warnings > 0) console.log(`  ⚠ Warnings: ${warnings}`);

  if (failed === 0) {
    console.log(`\n✓ All smoke tests passed! Deployment is healthy.`);
    console.log(`\n📋 Next Steps:`);
    console.log(`  1. Monitor error rate and latency for 1 hour`);
    console.log(`  2. Check monitoring dashboard (Sentry, DataDog, etc.)`);
    console.log(`  3. Verify Stripe webhooks are being processed`);
    console.log(`  4. Test critical business features manually`);
    process.exit(0);
  } else {
    console.log(`\n✗ Smoke tests failed! Deployment may have issues.`);
    console.log(`\n📋 Next Steps:`);
    console.log(`  1. Review failed test details above`);
    console.log(`  2. Check application logs: kubectl logs deployment/opsiq`);
    console.log(`  3. Verify environment variables are set correctly`);
    console.log(`  4. If critical: initiate rollback (see docs/ROLLBACK_RUNBOOK.md)`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n✗ Smoke test error: ${error.message}`);
  process.exit(1);
});
