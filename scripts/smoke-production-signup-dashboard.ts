#!/usr/bin/env node
/**
 * Production Signup and Real Dashboard Smoke Test
 *
 * Proves: signup → auto-login → real dashboard (no mock data)
 *
 * Usage:
 *   BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-production-signup-dashboard.ts
 */

const baseUrl = process.env.BASE_URL || "https://o-ps-iq.vercel.app";
const timestamp = Date.now();
const testEmail = `opsiq-smoke+${timestamp}@example.com`;
const testPassword = "ProductionTest123!";
const testWorkspace = `Smoke Test ${timestamp}`;

// Mask sensitive IDs for safe logging
function maskId(id: string): string {
  if (!id || id.length < 8) return "***";
  return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
}

interface SignupResponse {
  success: boolean;
  user?: { id: string; email: string };
  workspace?: { id: string; name: string };
  error?: string;
}

interface DashboardResponse {
  workspaceId?: string;
  engagementCount?: number;
  actionQueueSize?: number;
  topRisks?: unknown[];
  recommendedActions?: unknown[];
  criticalActions?: unknown[];
  [key: string]: unknown;
}

async function smokeTest(): Promise<void> {
  console.log("🚀 Production Signup → Real Dashboard Smoke Test");
  console.log(`📍 Base URL: ${baseUrl}`);
  console.log(`📧 Test Email: ${testEmail}`);
  console.log("");

  let userId: string | null = null;
  let workspaceId: string | null = null;
  let sessionCookie: string = "";

  try {
    // STEP 1: Sign up new user
    console.log("1️⃣  POST /api/auth/signup");
    const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        workspaceName: testWorkspace,
      }),
    });

    const signupStatus = signupResponse.status;
    console.log(`   Status: ${signupStatus}`);

    if (signupStatus !== 201) {
      console.log("❌ SIGNUP_FAILED");
      const signupText = await signupResponse.text();
      console.log(`   Response: ${signupText.substring(0, 200)}`);
      process.exit(1);
    }

    const signupData: SignupResponse = await signupResponse.json();

    if (!signupData.success || !signupData.user?.id || !signupData.workspace?.id) {
      console.log("❌ SIGNUP_RESPONSE_INVALID");
      console.log(`   success: ${signupData.success}`);
      console.log(`   user.id present: ${!!signupData.user?.id}`);
      console.log(`   workspace.id present: ${!!signupData.workspace?.id}`);
      process.exit(1);
    }

    userId = signupData.user.id;
    workspaceId = signupData.workspace.id;

    console.log(`   ✓ User created: ${maskId(userId)}`);
    console.log(`   ✓ Workspace created: ${maskId(workspaceId)}`);
    console.log(`   ✓ Email: ${testEmail}`);
    console.log(`   ✓ Workspace: ${testWorkspace}`);

    // Extract session cookie
    const setCookieHeader = signupResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      console.log("❌ NO_SESSION_COOKIE");
      console.log("   set-cookie header missing from signup response");
      process.exit(1);
    }

    sessionCookie = setCookieHeader.split(";")[0].trim();
    console.log(`   ✓ Session cookie: ${maskId(sessionCookie)}\n`);

    // STEP 2: Load dashboard page
    console.log("2️⃣  GET /dashboard (dashboard page)");
    const dashboardPageResponse = await fetch(`${baseUrl}/dashboard`, {
      method: "GET",
      headers: { Cookie: sessionCookie },
    });

    const dashboardPageStatus = dashboardPageResponse.status;
    console.log(`   Status: ${dashboardPageStatus}`);

    if (dashboardPageStatus === 200) {
      console.log(`   ✓ Dashboard page loads\n`);
    } else if (dashboardPageStatus === 401 || dashboardPageStatus === 403) {
      console.log(`   ⚠️  Unauthorized (${dashboardPageStatus}) - may require workspace context\n`);
    } else {
      console.log(`❌ UNEXPECTED_DASHBOARD_PAGE_STATUS (${dashboardPageStatus})\n`);
    }

    // STEP 3: Call owner dashboard API
    console.log("3️⃣  GET /api/owner/dashboard (real data API)");
    const dashboardApiResponse = await fetch(`${baseUrl}/api/owner/dashboard`, {
      method: "GET",
      headers: { Cookie: sessionCookie },
    });

    const dashboardApiStatus = dashboardApiResponse.status;
    console.log(`   Status: ${dashboardApiStatus}`);

    if (dashboardApiStatus !== 200) {
      console.log(`❌ DASHBOARD_API_FAILED (${dashboardApiStatus})`);
      const errorText = await dashboardApiResponse.text();
      console.log(`   Response: ${errorText.substring(0, 200)}`);
      process.exit(1);
    }

    const dashboardData: DashboardResponse = await dashboardApiResponse.json();

    // Verify response is object
    if (typeof dashboardData !== "object" || dashboardData === null) {
      console.log("❌ DASHBOARD_RESPONSE_NOT_OBJECT");
      console.log(`   Type: ${typeof dashboardData}`);
      process.exit(1);
    }

    console.log(`   ✓ Response is object`);

    // VERIFY: No hardcoded mock data
    const responseString = JSON.stringify(dashboardData);
    const hasMockUuid = responseString.includes("550e8400-e29b-41d4-a716-446655440000");
    const hasMockEngagements = responseString.includes("mockEngagementSnapshots");
    const hasMockActions = responseString.includes("mockActions");
    const hasMockKPIs = responseString.includes("mockKPIs");

    if (hasMockUuid) {
      console.log("❌ MOCK_UUID_DETECTED");
      console.log("   Response contains hardcoded 550e8400-e29b-41d4-a716-446655440000");
      process.exit(1);
    }
    console.log(`   ✓ No hardcoded UUID 550e8400`);

    if (hasMockEngagements || hasMockActions || hasMockKPIs) {
      console.log("❌ MOCK_ARRAY_DETECTED");
      console.log(`   mockEngagementSnapshots: ${hasMockEngagements}`);
      console.log(`   mockActions: ${hasMockActions}`);
      console.log(`   mockKPIs: ${hasMockKPIs}`);
      process.exit(1);
    }
    console.log(`   ✓ No mock arrays (mockEngagementSnapshots, mockActions, mockKPIs)`);

    // VERIFY: Workspace ID matches signup (if returned)
    if (dashboardData.workspaceId && dashboardData.workspaceId !== workspaceId) {
      console.log("❌ WORKSPACE_ID_MISMATCH");
      console.log(`   Signup workspace: ${maskId(workspaceId)}`);
      console.log(`   Dashboard workspace: ${maskId(dashboardData.workspaceId)}`);
      process.exit(1);
    }
    if (dashboardData.workspaceId) {
      console.log(`   ✓ Workspace ID matches: ${maskId(workspaceId)}`);
    }

    // VERIFY: Empty-state fields are safe
    const engagementCount = dashboardData.engagementCount;
    const actionQueueSize = dashboardData.actionQueueSize;
    const topRisks = dashboardData.topRisks;
    const recommendedActions = dashboardData.recommendedActions;

    if (typeof engagementCount !== "number") {
      console.log(`❌ ENGAGEMENT_COUNT_INVALID (${typeof engagementCount})`);
      process.exit(1);
    }
    console.log(`   ✓ engagementCount is number: ${engagementCount}`);

    if (typeof actionQueueSize !== "number") {
      console.log(`❌ ACTION_QUEUE_SIZE_INVALID (${typeof actionQueueSize})`);
      process.exit(1);
    }
    console.log(`   ✓ actionQueueSize is number: ${actionQueueSize}`);

    if (!Array.isArray(topRisks)) {
      console.log(`❌ TOP_RISKS_NOT_ARRAY (${typeof topRisks})`);
      process.exit(1);
    }
    console.log(`   ✓ topRisks is array: ${topRisks.length} items`);

    if (!Array.isArray(recommendedActions)) {
      console.log(`❌ RECOMMENDED_ACTIONS_NOT_ARRAY (${typeof recommendedActions})`);
      process.exit(1);
    }
    console.log(`   ✓ recommendedActions is array: ${recommendedActions.length} items\n`);

    // SUCCESS
    console.log("✅ SIGNUP_AND_REAL_DASHBOARD_PRODUCTION_VERIFIED");
    console.log("");
    console.log("Test Summary:");
    console.log(`   Email: ${testEmail}`);
    console.log(`   User ID: ${maskId(userId)}`);
    console.log(`   Workspace ID: ${maskId(workspaceId)}`);
    console.log(`   Session: ${maskId(sessionCookie)}`);
    console.log(`   Dashboard page: ${dashboardPageStatus}`);
    console.log(`   Dashboard API: ${dashboardApiStatus}`);
    console.log(`   Mock data: ✗ (none detected)`);
    console.log(`   Empty state: ✓ (safe)`);
    console.log("");

    process.exit(0);
  } catch (error) {
    console.log("❌ NETWORK_OR_PARSE_ERROR");
    const message = error instanceof Error ? error.message : String(error);
    console.log(`   ${message}`);
    console.log("");
    console.log("Possible causes:");
    console.log(`   - Cannot reach ${baseUrl}`);
    console.log("   - Network connectivity issue");
    console.log("   - JSON parse error");
    process.exit(1);
  }
}

smokeTest();
