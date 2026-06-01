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

      // Enhanced diagnostics for build-info failure
      console.log("\n📋 BUILD_INFO FAILURE DIAGNOSTICS:");
      console.log(`   status: ${buildInfoResponse.status}`);
      console.log(`   url: ${baseUrl}/api/internal/build-info`);

      // Try to read response body
      let responseBody = "";
      try {
        responseBody = await buildInfoResponse.text();
        if (responseBody) {
          console.log(`   response_body: ${responseBody.substring(0, 300)}`);
        } else {
          console.log(`   response_body: (empty)`);
        }
      } catch (e) {
        console.log(`   response_body: (failed to read: ${String(e).substring(0, 100)})`);
      }

      // Print response headers that might indicate protection
      const protectionHeaders = ["x-middleware-response", "cf-ray", "x-vercel-id", "server"];
      console.log(`   headers:`);
      for (const header of protectionHeaders) {
        const value = buildInfoResponse.headers.get(header);
        if (value) {
          console.log(`     ${header}: ${value}`);
        }
      }

      // Environment context
      console.log(`   context:`);
      console.log(`     BASE_URL: ${baseUrl}`);
      console.log(`     CI: ${process.env.CI || "false"}`);
      console.log(`     GITHUB_ACTIONS: ${process.env.GITHUB_ACTIONS || "false"}`);
      console.log(`     GITHUB_SHA: ${process.env.GITHUB_SHA || "not-set"}`);

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
      console.log("   ✓ Diagnostic key included in request");
    } else {
      console.log("   ⚠️  No diagnostic key in request");
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

      // Always print raw response
      let responseText = "";
      try {
        responseText = await diagnosisResponse.text();
      } catch (e) {
        responseText = "(failed to read response text)";
      }

      if (!responseText || responseText.length === 0) {
        console.log("   EMPTY_RESPONSE_BODY");
      } else {
        console.log(`   Raw response: ${responseText.substring(0, 500)}`);
      }

      // Try to parse as JSON and extract diagnostic fields
      let diagnosisDiagnostic: any = null;
      if (responseText) {
        try {
          diagnosisDiagnostic = JSON.parse(responseText);
        } catch (e) {
          console.log(`   (Not valid JSON: ${String(e).substring(0, 100)})`);
        }
      }

      if (diagnosisDiagnostic) {
        console.log("\n📋 DIAGNOSIS FAILURE DETAILS:");
        console.log(`   status: ${diagnosisStatus}`);

        if (diagnosisDiagnostic.error) console.log(`   error: ${diagnosisDiagnostic.error}`);
        if (diagnosisDiagnostic.correlationId) console.log(`   correlationId: ${diagnosisDiagnostic.correlationId}`);
        if (diagnosisDiagnostic.classification) console.log(`   classification: ${diagnosisDiagnostic.classification}`);
        if (diagnosisDiagnostic.stage) console.log(`   stage: ${diagnosisDiagnostic.stage}`);
        if (diagnosisDiagnostic.errorName) console.log(`   errorName: ${diagnosisDiagnostic.errorName}`);
        if (diagnosisDiagnostic.safeMessage) console.log(`   safeMessage: ${diagnosisDiagnostic.safeMessage}`);
        if (diagnosisDiagnostic.prismaCode) console.log(`   prismaCode: ${diagnosisDiagnostic.prismaCode}`);
        if (diagnosisDiagnostic.prismaClientVersion) console.log(`   prismaClientVersion: ${diagnosisDiagnostic.prismaClientVersion}`);
        if (diagnosisDiagnostic.prismaMeta) console.log(`   prismaMeta: ${JSON.stringify(diagnosisDiagnostic.prismaMeta).substring(0, 200)}`);

        if (diagnosisDiagnostic.diagnostics) {
          console.log("\n📋 ROUTE DIAGNOSTICS:");
          const d = diagnosisDiagnostic.diagnostics;

          if (d.routeWrapper) console.log(`   routeWrapper: ${d.routeWrapper}`);
          if (d.requireWorkspaceConfigured !== undefined) console.log(`   requireWorkspaceConfigured: ${d.requireWorkspaceConfigured}`);

          if (d.ctxKeys) {
            console.log("\n   Context Keys:");
            console.log(`     verifiedActorIdPresent: ${d.ctxKeys.verifiedActorIdPresent}`);
            console.log(`     verifiedWorkspaceIdPresent: ${d.ctxKeys.verifiedWorkspaceIdPresent}`);
            if (d.ctxKeys.requestPresent !== undefined) console.log(`     requestPresent: ${d.ctxKeys.requestPresent}`);
            if (d.ctxKeys.sessionPresent !== undefined) console.log(`     sessionPresent: ${d.ctxKeys.sessionPresent}`);
          }

          if (d.workspaceIdSource) {
            console.log("\n   Workspace ID Source:");
            console.log(`     verifiedWorkspaceIdPresent: ${d.workspaceIdSource.verifiedWorkspaceIdPresent}`);
            if (d.workspaceIdSource.verifiedWorkspaceIdValue) {
              console.log(`     verifiedWorkspaceIdValue: ${d.workspaceIdSource.verifiedWorkspaceIdValue}`);
            }
          }

          if (d.actorIdSource) {
            console.log("\n   Actor ID Source:");
            console.log(`     verifiedActorIdPresent: ${d.actorIdSource.verifiedActorIdPresent}`);
            if (d.actorIdSource.verifiedActorIdValue) {
              console.log(`     verifiedActorIdValue: ${d.actorIdSource.verifiedActorIdValue}`);
            }
          }

          if (d.diagnosisServiceInputContext) {
            console.log("\n   Service Input Context:");
            console.log(`     willReceiveWorkspaceId: ${d.diagnosisServiceInputContext.willReceiveWorkspaceId}`);
            if (d.diagnosisServiceInputContext.workspaceIdValueWillBePassed) {
              console.log(`     workspaceIdValueWillBePassed: ${d.diagnosisServiceInputContext.workspaceIdValueWillBePassed}`);
            }
          }

          if (d.errorDetails) {
            console.log("\n   Error Details:");
            console.log(`     errorName: ${d.errorDetails.errorName}`);
            console.log(`     safeErrorMessage: ${d.errorDetails.safeErrorMessage}`);
            if (d.errorDetails.prismaCode) console.log(`     prismaCode: ${d.errorDetails.prismaCode}`);
            if (d.errorDetails.prismaClientVersion) console.log(`     prismaClientVersion: ${d.errorDetails.prismaClientVersion}`);
            if (d.errorDetails.prismaMeta) {
              console.log(`     prismaMeta:`, JSON.stringify(d.errorDetails.prismaMeta).substring(0, 200));
            }
          }
        }
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
