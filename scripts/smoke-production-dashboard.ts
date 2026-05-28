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
        console.log(`   Error: ${errorData.error}`);
        console.log("");
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
