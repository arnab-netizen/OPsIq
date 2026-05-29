#!/usr/bin/env node
// @ts-nocheck
/**
 * Production Dashboard Smoke Test
 * Tests that dashboard loads with demo data after login
 *
 * Usage:
 *   BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-production-dashboard.ts
 */

const BASE_URL = process.env.BASE_URL || "https://o-ps-iq.vercel.app";
const DEMO_EMAIL = "operator@demo.local";
const DEMO_PASSWORD = "demo-password-123";
const OPSIQ_DIAGNOSTIC_KEY = process.env.OPSIQ_DIAGNOSTIC_KEY || "not-set";

// Get GitHub SHA from environment (set by workflow)
const GITHUB_SHA = process.env.GITHUB_SHA || "unknown";

interface DashboardResponse {
  activeEngagements?: number;
  criticalFindings?: number;
  openActions?: number;
  blockedActions?: number;
}

async function smokeTest(): Promise<void> {
  console.log("📊 Production Dashboard Smoke Test");
  console.log(`📍 Target: ${BASE_URL}`);
  console.log("");

  let sessionCookie = "";

  try {
    // Step 0A: Verify deployment commit matches GitHub SHA
    console.log("0️⃣ A GET /api/internal/build-info (verify deployment)");
    const buildInfoResponse = await fetch(`${BASE_URL}/api/internal/build-info`);
    console.log(`   Status: ${buildInfoResponse.status}`);

    if (buildInfoResponse.status !== 200) {
      console.log("❌ BUILD_INFO_ENDPOINT_FAILED");
      process.exit(1);
    }

    const buildInfo = await buildInfoResponse.json();
    console.log(`   GitHub SHA: ${GITHUB_SHA}`);
    console.log(`   Deployed Commit: ${buildInfo.commit}`);
    console.log(`   Environment: ${buildInfo.environment}`);
    console.log(`   RouteVersion: ${buildInfo.routeVersion}`);
    console.log("");

    if (buildInfo.commit !== GITHUB_SHA) {
      console.log("❌ DEPLOYMENT_COMMIT_MISMATCH");
      console.log(`   Expected: ${GITHUB_SHA}`);
      console.log(`   Got: ${buildInfo.commit}`);
      console.log("");
      console.log("Vercel has not deployed the latest commit yet.");
      process.exit(1);
    }

    // Step 0B: Verify route and service proof
    console.log("0️⃣ B GET /api/internal/engagements-route-proof (verify route)");

    // Check if diagnostic key is available
    if (!OPSIQ_DIAGNOSTIC_KEY || OPSIQ_DIAGNOSTIC_KEY === "not-set") {
      console.log("❌ MISSING_OPSIQ_DIAGNOSTIC_KEY_IN_GITHUB_ACTIONS_ENV");
      console.log("   GitHub secret is not available to this workflow step.");
      console.log("   Check workflow env mapping in .github/workflows/smoke-production-dashboard.yml");
      process.exit(1);
    }

    const routeProofResponse = await fetch(
      `${BASE_URL}/api/internal/engagements-route-proof`,
      {
        headers: {
          "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
        },
      }
    );
    console.log(`   Status: ${routeProofResponse.status}`);

    if (routeProofResponse.status === 404 || routeProofResponse.status === 403) {
      console.log("❌ ROUTE_PROOF_ENDPOINT_UNAUTHORIZED");
      console.log("   Key rejected by endpoint");
      process.exit(1);
    }

    if (routeProofResponse.status !== 200) {
      console.log("❌ ROUTE_PROOF_ENDPOINT_FAILED");
      console.log(`   Status: ${routeProofResponse.status}`);
      process.exit(1);
    }

    const routeProof = await routeProofResponse.json();
    console.log(`   RouteVersion: ${routeProof.routeVersion}`);
    console.log(`   ServiceImportPath: ${routeProof.serviceImportPath}`);
    console.log(`   HandlerName: ${routeProof.handlerName}`);
    console.log(`   ServiceVersion: ${routeProof.serviceVersion}`);
    console.log(`   DeployedCommit: ${routeProof.deployedCommit}`);
    console.log("");

    // Validate proof values
    if (routeProof.routeVersion !== "engagements-route-debug-v2") {
      console.log("❌ ROUTE_VERSION_MISMATCH");
      console.log(`   Expected: engagements-route-debug-v2`);
      console.log(`   Got: ${routeProof.routeVersion}`);
      process.exit(1);
    }

    if (routeProof.serviceVersion !== "engagements-service-prisma-debug-v2") {
      console.log("❌ SERVICE_VERSION_MISMATCH");
      console.log(`   Expected: engagements-service-prisma-debug-v2`);
      console.log(`   Got: ${routeProof.serviceVersion}`);
      process.exit(1);
    }

    if (routeProof.deployedCommit !== GITHUB_SHA) {
      console.log("❌ PROOF_COMMIT_MISMATCH");
      console.log(`   Expected: ${GITHUB_SHA}`);
      console.log(`   Got: ${routeProof.deployedCommit}`);
      process.exit(1);
    }

    console.log("✅ Deployment and route proof verified");
    console.log("");

    // Step 1: Login to get session
    console.log("1️⃣  POST /api/auth/login");
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      }),
    });

    console.log(`   Status: ${loginResponse.status}`);

    if (loginResponse.status !== 200) {
      console.log("❌ LOGIN FAILED");
      console.log(`   Status: ${loginResponse.status}`);
      const text = await loginResponse.text();
      console.log(`   Response: ${text.substring(0, 100)}`);
      process.exit(1);
    }

    // Extract session cookie
    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      console.log("❌ NO SESSION COOKIE");
      console.log("   set-cookie header missing from login response");
      process.exit(1);
    }

    // Parse session cookie for authenticated requests
    const cookies = setCookieHeader.split(",").map((c) => c.split(";")[0].trim());
    sessionCookie = cookies.join("; ");

    console.log("   ✓ Session established\n");

    // Step 2: Load dashboard (GET / which serves dashboard page)
    console.log("2️⃣  GET / (dashboard page)");
    const dashboardResponse = await fetch(`${BASE_URL}/`, {
      method: "GET",
      headers: {
        Cookie: sessionCookie,
      },
    });

    console.log(`   Status: ${dashboardResponse.status}`);

    if (dashboardResponse.status === 200) {
      const html = await dashboardResponse.text();

      // Check if dashboard page loaded (presence of key elements)
      const hasRoleMenu = html.includes("Dashboard") || html.includes("dashboard");
      const hasAuthElements = html.includes("Operator") || html.includes("operator");

      if (hasRoleMenu && hasAuthElements) {
        console.log("   ✓ Dashboard page loaded\n");
      } else {
        console.log("   ⚠️  Page loaded but dashboard elements not found");
        console.log("   (May be loading data via API)\n");
      }
    } else if (dashboardResponse.status === 401) {
      console.log("❌ UNAUTHORIZED (401)");
      console.log("   Session invalid or expired");
      process.exit(1);
    } else if (dashboardResponse.status === 403) {
      const text = await dashboardResponse.text();
      if (text.includes("Host not in allowlist")) {
        console.log("❌ BLOCKED BY VERCEL");
        console.log("   Host header validation failed");
        process.exit(1);
      } else {
        console.log("❌ FORBIDDEN (403)");
        process.exit(1);
      }
    } else {
      console.log(`❌ UNEXPECTED STATUS (${dashboardResponse.status})`);
      process.exit(1);
    }

    // Step 3: Verify demo data is accessible
    console.log("3️⃣  GET /api/engagements (verify demo data)");
    const engagementsResponse = await fetch(`${BASE_URL}/api/engagements`, {
      method: "GET",
      headers: {
        Cookie: sessionCookie,
        "x-workspace-id": "demo", // This will be validated by the API
      },
    });

    console.log(`   Status: ${engagementsResponse.status}`);

    if (engagementsResponse.status === 200) {
      const data = await engagementsResponse.json();
      const engagementCount = Array.isArray(data) ? data.length : data.engagements?.length || 0;

      if (engagementCount > 0) {
        console.log(`   ✓ Found ${engagementCount} engagement(s)\n`);

        console.log("✅ DASHBOARD VERIFICATION SUCCESS");
        console.log("");
        console.log("Dashboard is accessible and demo data is loading:");
        console.log(`   - Engagements: ${engagementCount} found`);
        console.log("   - Authentication: working");
        console.log("   - Data layer: accessible");
        process.exit(0);
      } else {
        console.log("   ⚠️  No engagements found\n");
        console.log(
          "⚠️  DASHBOARD LOADS but no demo data (check Seed Staging Database status)"
        );
        console.log("");
        console.log("Possible causes:");
        console.log(
          "  - Seed Staging Database workflow has not been run on staging"
        );
        console.log(
          "  - Demo data exists but is not linked to workspace (engagement.workspaceId = NULL)"
        );
        console.log("  - User has no workspace membership");
        process.exit(1);
      }
    } else if (engagementsResponse.status === 401) {
      console.log("❌ UNAUTHORIZED (401)");
      console.log("   Session is invalid or workspace context failed");
      process.exit(1);
    } else if (engagementsResponse.status === 500) {
      console.log("❌ INTERNAL SERVER ERROR (500)");
      try {
        const errorData = await engagementsResponse.json();

        // CRITICAL: Error boundary MUST include classification and stage
        if (!errorData.classification || errorData.classification === "undefined") {
          console.log("❌ CLASSIFICATION_MISSING_FROM_ERROR_RESPONSE");
          console.log(`   CorrelationId: ${errorData.correlationId}`);
          console.log("   Classification: MISSING");
          console.log("   Stage: MISSING");
          console.log("");
          console.log("DEFECT: API error boundary is not classifying failures.");
          console.log("Every 500 response MUST include classification and stage.");
          process.exit(1);
        }

        if (!errorData.stage || errorData.stage === "undefined") {
          console.log("❌ STAGE_MISSING_FROM_ERROR_RESPONSE");
          console.log(`   CorrelationId: ${errorData.correlationId}`);
          console.log(`   Classification: ${errorData.classification}`);
          console.log("   Stage: MISSING");
          console.log("");
          console.log("DEFECT: API error boundary is not including stage information.");
          process.exit(1);
        }

        console.log(`   CorrelationId: ${errorData.correlationId}`);
        console.log(`   Classification: ${errorData.classification}`);
        console.log(`   Stage: ${errorData.stage}`);
        if (errorData.operation) {
          console.log(`   Operation: ${errorData.operation}`);
        }
        if (errorData.errorName) {
          console.log(`   ErrorName: ${errorData.errorName}`);
        }
        if (errorData.routeVersion) {
          console.log(`   RouteVersion: ${errorData.routeVersion}`);
        }
        if (errorData.serviceImportPath) {
          console.log(`   ServiceImportPath: ${errorData.serviceImportPath}`);
        }
        if (errorData.handlerName) {
          console.log(`   HandlerName: ${errorData.handlerName}`);
        }
        if (errorData.failingOperation) {
          console.log(`   FailingOperation: ${errorData.failingOperation}`);
        }
        if (errorData.prismaCode) {
          console.log(`   PrismaCode: ${errorData.prismaCode}`);
        }
        if (errorData.safeMessage) {
          console.log(`   SafeMessage: ${errorData.safeMessage}`);
        }
        if (errorData.engagementsServiceVersion) {
          console.log(`   EngagementsServiceVersion: ${errorData.engagementsServiceVersion}`);
        }
        console.log(`   Error: ${errorData.error}`);
        console.log("");

        // CRITICAL: If Prisma error, must have prismaCode
        if (errorData.errorName === "PrismaClientKnownRequestError") {
          if (!errorData.prismaCode) {
            console.log("❌ PRISMA_CODE_MISSING");
            console.log("");
            console.log("CRITICAL: PrismaClientKnownRequestError occurred but prismaCode was not propagated.");
            console.log("This means the error detail propagation chain is broken.");
            console.log(`   CorrelationId: ${errorData.correlationId}`);
            console.log(`   Classification: ${errorData.classification}`);
            console.log(`   Stage: ${errorData.stage}`);
            console.log(`   FailingOperation: ${errorData.failingOperation || "unknown"}`);
            console.log("   EngagementsServiceVersion: " + (errorData.engagementsServiceVersion || "NOT_INCLUDED"));
            process.exit(1);
          }
        }

        // Generic handler_invocation_failed is a regression
        if (errorData.classification === "handler_invocation_failed") {
          console.log("❌ GENERIC_HANDLER_INVOCATION_FAILED");
          console.log("");
          console.log("REGRESSION: Wrapper returned generic handler_invocation_failed.");
          console.log("Route should have set errorNamespace option to avoid generic fallback.");
          console.log("");
          console.log("Fix: Ensure route passes errorNamespace to withCanonicalEnforcement.");
          process.exit(1);
        }

        // Route-specific handler invocation failure
        if (errorData.classification === "engagements_handler_invocation_failed") {
          console.log("❌ ENGAGEMENTS_HANDLER_INVOCATION_FAILED");
          console.log("");
          console.log("Route-specific handler failure. Raw error escaped classification:");
          console.log(`   ErrorName: ${errorData.errorName || "unknown"}`);
          console.log("");
          console.log("Fix: Find the raw error source (check errorName).");
          console.log("Ensure all code paths in handler throw ClassifiedApiError.");
          process.exit(1);
        }

        if (!errorData.classification || !errorData.classification.startsWith("engagements_")) {
          console.log("❌ UNEXPECTED_CLASSIFICATION");
          console.log(`   Got: ${errorData.classification}`);
          console.log("   Expected: engagements_* classification");
          process.exit(1);
        }

        console.log("This indicates an internal crash in the engagements API.");
        console.log("Use the correlationId and stage to locate the issue in production logs.");
      } catch {
        const text = await engagementsResponse.text();
        console.log(`   Response: ${text.substring(0, 200)}`);
      }
      process.exit(1);
    } else {
      console.log(`❌ UNEXPECTED STATUS (${engagementsResponse.status})`);
      const text = await engagementsResponse.text();
      console.log(`   Response: ${text.substring(0, 100)}`);
      process.exit(1);
    }
  } catch (error) {
    console.log("❌ NETWORK ERROR");
    console.log(
      `   ${error instanceof Error ? error.message : String(error)}`
    );
    console.log("");
    console.log("Possible causes:");
    console.log(`  - Cannot reach ${BASE_URL}`);
    console.log("  - Network connectivity issue");
    console.log("  - Vercel deployment not ready");
    process.exit(1);
  }
}

smokeTest();
