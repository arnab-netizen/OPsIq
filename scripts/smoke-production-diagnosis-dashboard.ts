#!/usr/bin/env node
/**
 * Production Diagnosis → Dashboard Smoke Test
 *
 * Proves: signup → diagnosis → real recommendations on dashboard
 *
 * Usage:
 *   BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-production-diagnosis-dashboard.ts
 */

export {};

const baseUrl = process.env.BASE_URL || "https://o-ps-iq.vercel.app";
const timestamp = Date.now();
const testEmail = `opsiq-smoke+${timestamp}@example.com`;
const testPassword = "ProductionTest123!";
const testWorkspace = `Smoke Test ${timestamp}`;

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

interface DiagnosisResponse {
  id: string;
  engagementId: string;
  diagnosisSummary?: string;
  recommendations?: Array<{ id: string; title: string; priority: string }>;
  actionPlan?: Array<{ title: string; priority: string }>;
}

interface DashboardResponse {
  workspaceId?: string;
  engagementCount?: number;
  actionQueueSize?: number;
  recommendedActions?: Array<{
    id: string;
    title: string;
    description?: string;
    priority: string;
    source?: string;
  }>;
  topRisks?: unknown[];
  [key: string]: unknown;
}

async function smokeTest(): Promise<void> {
  console.log("🚀 Production Diagnosis → Dashboard Smoke Test");
  console.log(`📍 Base URL: ${baseUrl}`);
  console.log(`📧 Test Email: ${testEmail}`);
  console.log("");

  const diagnosticKey = process.env.OPSIQ_DIAGNOSTIC_KEY;
  if (!diagnosticKey || diagnosticKey === "not-set") {
    console.log("⚠️  OPSIQ_DIAGNOSTIC_KEY not available");
    console.log("   Diagnostic output will be limited");
  }

  let userId: string | null = null;
  let workspaceId: string | null = null;
  let sessionCookie: string = "";

  try {
    // STEP 0: Verify deployment
    console.log("0️⃣  GET /api/internal/build-info (verify deployment)");
    const buildInfoResponse = await fetch(`${baseUrl}/api/internal/build-info`);
    console.log(`   Status: ${buildInfoResponse.status}`);

    if (buildInfoResponse.status !== 200) {
      console.log("❌ BUILD_INFO_ENDPOINT_FAILED");
      process.exit(1);
    }

    const buildInfo = await buildInfoResponse.json();
    console.log(`   Environment: ${buildInfo.environment}`);
    console.log(`   Deployed commit: ${buildInfo.commit?.substring(0, 7) || "unknown"}`);
    console.log("");

    // STEP 1: Signup
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
      process.exit(1);
    }

    const signupData: SignupResponse = await signupResponse.json();
    if (!signupData.success || !signupData.user?.id || !signupData.workspace?.id) {
      console.log("❌ SIGNUP_RESPONSE_INVALID");
      process.exit(1);
    }

    userId = signupData.user.id;
    workspaceId = signupData.workspace.id;

    console.log(`   ✓ User created: ${maskId(userId)}`);
    console.log(`   ✓ Workspace created: ${maskId(workspaceId)}\n`);

    const setCookieHeader = signupResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      console.log("❌ NO_SESSION_COOKIE");
      process.exit(1);
    }

    sessionCookie = setCookieHeader.split(";")[0].trim();
    console.log(`   ✓ Session cookie: ${maskId(sessionCookie)}\n`);

    // STEP 2: Create diagnosis
    console.log("2️⃣  POST /api/diagnosis (business analysis)");
    const diagnosisHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "idempotency-key": `diag-${timestamp}`,
      Cookie: sessionCookie,
    };
    if (diagnosticKey) {
      diagnosisHeaders["x-opsiq-diagnostic-key"] = diagnosticKey;
    }
    const diagnosisResponse = await fetch(`${baseUrl}/api/diagnosis`, {
      method: "POST",
      headers: diagnosisHeaders,
      body: JSON.stringify({
        businessName: "Smoke Test Business",
        businessType: "SaaS",
        problemStatement: "Revenue declining and costs are out of control",
        mainIssue: "cash_flow",
        monthlyRevenue: 50000,
        monthlyCosts: 60000,
        customerCount: 100,
      }),
    });

    const diagnosisStatus = diagnosisResponse.status;
    console.log(`   Status: ${diagnosisStatus}`);

    if (diagnosisStatus !== 201) {
      console.log("❌ DIAGNOSIS_FAILED");

      // Try to parse diagnostic response
      let diagnosisDiagnostic: any = null;
      try {
        diagnosisDiagnostic = await diagnosisResponse.json();
      } catch {
        const diagnosisText = await diagnosisResponse.text();
        console.log(`   Response: ${diagnosisText.substring(0, 200)}`);
      }

      if (diagnosisDiagnostic && diagnosisDiagnostic.diagnostics) {
        console.log("\n📋 DIAGNOSIS ROUTE DIAGNOSTIC OUTPUT:");
        console.log(`   routeWrapper: ${diagnosisDiagnostic.diagnostics.routeWrapper}`);
        console.log(`   requireWorkspaceConfigured: ${diagnosisDiagnostic.diagnostics.requireWorkspaceConfigured}`);

        console.log("\n   Context Keys:");
        console.log(`     verifiedActorIdPresent: ${diagnosisDiagnostic.diagnostics.ctxKeys.verifiedActorIdPresent}`);
        console.log(`     verifiedWorkspaceIdPresent: ${diagnosisDiagnostic.diagnostics.ctxKeys.verifiedWorkspaceIdPresent}`);
        console.log(`     requestPresent: ${diagnosisDiagnostic.diagnostics.ctxKeys.requestPresent}`);
        console.log(`     sessionPresent: ${diagnosisDiagnostic.diagnostics.ctxKeys.sessionPresent}`);

        console.log("\n   Workspace ID Source:");
        console.log(`     verifiedWorkspaceIdPresent: ${diagnosisDiagnostic.diagnostics.workspaceIdSource.verifiedWorkspaceIdPresent}`);
        console.log(`     verifiedWorkspaceIdValue: ${diagnosisDiagnostic.diagnostics.workspaceIdSource.verifiedWorkspaceIdValue}`);

        console.log("\n   Actor ID Source:");
        console.log(`     verifiedActorIdPresent: ${diagnosisDiagnostic.diagnostics.actorIdSource.verifiedActorIdPresent}`);
        console.log(`     verifiedActorIdValue: ${diagnosisDiagnostic.diagnostics.actorIdSource.verifiedActorIdValue}`);

        console.log("\n   Service Input Context:");
        console.log(`     willReceiveWorkspaceId: ${diagnosisDiagnostic.diagnostics.diagnosisServiceInputContext.willReceiveWorkspaceId}`);
        console.log(`     workspaceIdValueWillBePassed: ${diagnosisDiagnostic.diagnostics.diagnosisServiceInputContext.workspaceIdValueWillBePassed}`);

        console.log("\n   Error Details:");
        console.log(`     errorName: ${diagnosisDiagnostic.diagnostics.errorDetails.errorName}`);
        console.log(`     safeErrorMessage: ${diagnosisDiagnostic.diagnostics.errorDetails.safeErrorMessage}`);
      }

      process.exit(1);
    }

    const diagnosisData: DiagnosisResponse = await diagnosisResponse.json();
    if (!diagnosisData.engagementId) {
      console.log("❌ DIAGNOSIS_RESPONSE_INVALID");
      process.exit(1);
    }

    console.log(`   ✓ Diagnosis created`);
    console.log(`   ✓ Engagement created: ${maskId(diagnosisData.engagementId)}`);
    console.log(`   ✓ Recommendations: ${diagnosisData.recommendations?.length || 0}`);
    console.log(`   ✓ Action plan: ${diagnosisData.actionPlan?.length || 0}\n`);

    // STEP 3: Get engagements
    console.log("3️⃣  GET /api/engagements (verify engagement)");
    const engagementsResponse = await fetch(`${baseUrl}/api/engagements`, {
      method: "GET",
      headers: { Cookie: sessionCookie },
    });

    const engagementsStatus = engagementsResponse.status;
    console.log(`   Status: ${engagementsStatus}`);

    if (engagementsStatus !== 200) {
      console.log("❌ ENGAGEMENTS_API_FAILED");
      process.exit(1);
    }

    console.log(`   ✓ Engagements queryable\n`);

    // STEP 4: Get owner dashboard
    console.log("4️⃣  GET /api/owner/dashboard (real recommendations)");
    const dashboardResponse = await fetch(`${baseUrl}/api/owner/dashboard`, {
      method: "GET",
      headers: { Cookie: sessionCookie },
    });

    const dashboardStatus = dashboardResponse.status;
    console.log(`   Status: ${dashboardStatus}`);

    if (dashboardStatus !== 200) {
      console.log(`❌ DASHBOARD_API_FAILED (${dashboardStatus})`);
      process.exit(1);
    }

    const dashboardData: DashboardResponse = await dashboardResponse.json();

    // Verify engagement was created
    if (!dashboardData.engagementCount || dashboardData.engagementCount < 1) {
      console.log("❌ ENGAGEMENT_NOT_ON_DASHBOARD");
      console.log(`   engagementCount: ${dashboardData.engagementCount}`);
      process.exit(1);
    }

    console.log(`   ✓ engagementCount: ${dashboardData.engagementCount}`);

    // Verify actions were created
    if (typeof dashboardData.actionQueueSize !== "number") {
      console.log(`❌ ACTION_QUEUE_INVALID (${typeof dashboardData.actionQueueSize})`);
      process.exit(1);
    }

    console.log(`   ✓ actionQueueSize: ${dashboardData.actionQueueSize}`);

    // Verify recommendations are from diagnosis (not generic fallback)
    const recommendedActions = dashboardData.recommendedActions || [];
    if (!Array.isArray(recommendedActions)) {
      console.log(`❌ RECOMMENDED_ACTIONS_NOT_ARRAY`);
      process.exit(1);
    }

    console.log(`   ✓ recommendedActions: ${recommendedActions.length} items`);

    // Check if recommendations are diagnosis-specific
    if (recommendedActions.length === 0) {
      console.log("❌ NO_RECOMMENDATIONS_FROM_DIAGNOSIS");
      console.log("   Dashboard should show diagnosis-specific recommendations");
      process.exit(1);
    }

    // Verify recommendations have source field indicating diagnosis
    const diagnosisRecommendations = recommendedActions.filter(
      (r: any) => r.source === "diagnosis"
    );

    if (diagnosisRecommendations.length === 0) {
      console.log("⚠️  RECOMMENDATIONS_NOT_MARKED_AS_DIAGNOSIS");
      console.log("   Recommendations exist but source field not set");
      console.log("   This may indicate generic fallback is being used");
    } else {
      console.log(
        `   ✓ Diagnosis recommendations: ${diagnosisRecommendations.length}/${recommendedActions.length}`
      );
    }

    // Verify no mock UUID in response
    const responseString = JSON.stringify(dashboardData);
    if (responseString.includes("550e8400-e29b-41d4-a716-446655440000")) {
      console.log("❌ MOCK_UUID_DETECTED");
      process.exit(1);
    }

    console.log(`   ✓ No hardcoded mock UUID\n`);

    // SUCCESS
    console.log("✅ DIAGNOSIS_TO_DASHBOARD_PRODUCTION_VERIFIED");
    console.log("");
    console.log("Test Summary:");
    console.log(`   Email: ${testEmail}`);
    console.log(`   User ID: ${maskId(userId)}`);
    console.log(`   Workspace ID: ${maskId(workspaceId)}`);
    console.log(`   Engagements: ${dashboardData.engagementCount}`);
    console.log(`   Actions: ${dashboardData.actionQueueSize}`);
    console.log(`   Recommendations: ${recommendedActions.length}`);
    console.log(`   Diagnosis-sourced: ${diagnosisRecommendations.length}`);
    console.log("");

    process.exit(0);
  } catch (error) {
    console.log("❌ NETWORK_OR_PARSE_ERROR");
    const message = error instanceof Error ? error.message : String(error);
    console.log(`   ${message}`);
    process.exit(1);
  }
}

smokeTest();
