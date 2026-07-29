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
const DEMO_EMAIL = process.env.DEMO_EMAIL || "operator@demo.local";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "";
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

    // Step 2.5: Verify and backfill demo user permission
    console.log("2️⃣ ·5️⃣  GET /api/internal/demo-permission-proof (verify permissions)");
    const permissionProofResponse = await fetch(
      `${BASE_URL}/api/internal/demo-permission-proof`,
      {
        method: "GET",
        headers: {
          "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
        },
      }
    );

    console.log(`   Status: ${permissionProofResponse.status}`);

    if (permissionProofResponse.status === 404) {
      console.log("❌ PERMISSION_PROOF_ENDPOINT_NOT_FOUND");
      console.log("   Endpoint not deployed yet");
      process.exit(1);
    }

    if (permissionProofResponse.status !== 200) {
      // A 500 here can be SCHEMA_DRIFT — the deployed database is behind on a migration
      // (a required column is missing) — rather than a product or permission failure.
      // Classify honestly from the response body so the smoke reports SCHEMA_DRIFT/BLOCKED
      // instead of a misleading generic failure. This NEVER passes on drift: it exits
      // non-zero. It only tells the truth about WHY the run is not green.
      let proofBody: any = {};
      try {
        proofBody = await permissionProofResponse.json();
      } catch {
        // non-JSON body; fall through to generic failure
      }

      if (proofBody?.classification === "schema_drift") {
        console.log("🟠 SCHEMA_DRIFT — deployed database is behind on a migration (BLOCKED, not a product failure)");
        if (proofBody.schemaDrift) {
          console.log(
            `   Missing column: ${proofBody.schemaDrift.table || "?"}.${proofBody.schemaDrift.column || "?"}`
          );
          console.log(
            `   Introduced by migration: ${proofBody.schemaDrift.introducedByMigration || "unknown"}`
          );
          if (proofBody.schemaDrift.summary) {
            console.log(`   ${proofBody.schemaDrift.summary}`);
          }
        }
        console.log("   Remediation: apply the pending migration to the deployed database.");
        console.log("   This is OWNER-RUN only — see docs/audits/*-phase-4-production-schema-drift-readiness/MIGRATION_RUNBOOK.md.");
        console.log("   Smoke result: BLOCKED_SCHEMA_DRIFT (not PASS, not product FAIL).");
        // Distinct non-zero exit code so SCHEMA_DRIFT/BLOCKED is not conflated with a product FAIL.
        process.exit(2);
      }

      console.log(`❌ PERMISSION_PROOF_ENDPOINT_FAILED (${permissionProofResponse.status})`);
      if (proofBody?.classification) {
        console.log(`   Classification: ${proofBody.classification}`);
      }
      process.exit(1);
    }

    const permissionProof = await permissionProofResponse.json();
    console.log(`   User found: ${permissionProof.userFound ? "✓" : "✗"}`);
    console.log(`   Membership active: ${permissionProof.membershipActive ? "✓" : "✗"}`);
    console.log(`   Workspace UUID-like: ${permissionProof.workspaceIdUuidLike ? "✓" : "✗"}`);
    console.log(
      `   Role assignment found: ${permissionProof.roleAssignmentFound ? "✓" : "✗"}`
    );
    console.log(
      `   Role grants engagement:view: ${permissionProof.roleGrantsEngagementView ? "✓" : "✗"}`
    );
    console.log(`   Classification: ${permissionProof.classification}`);

    // If role assignment is missing, attempt backfill
    if (permissionProof.classification === "role_assignment_missing") {
      console.log("\n   Attempting to backfill missing role assignment...");
      const backfillResponse = await fetch(
        `${BASE_URL}/api/internal/demo-permission-proof`,
        {
          method: "POST",
          headers: {
            "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
          },
        }
      );

      console.log(`   Backfill status: ${backfillResponse.status}`);

      if (backfillResponse.status !== 200) {
        console.log(`❌ PERMISSION_BACKFILL_FAILED (${backfillResponse.status})`);
        const backfillError = await backfillResponse.json();
        console.log(`   Reason: ${backfillError.reason || "unknown"}`);
        process.exit(1);
      }

      const backfillResult = await backfillResponse.json();
      console.log(`   Backfill result: ${backfillResult.status}`);
      console.log(`   Role active: ${backfillResult.roleAssignmentActive ? "✓" : "✗"}`);
      console.log(
        `   Grants engagement:view: ${backfillResult.roleGrantsEngagementView ? "✓" : "✗"}`
      );
      console.log("   ✓ Role assignment backfilled\n");
    } else if (permissionProof.classification === "permission_ready") {
      console.log("   ✓ Permissions ready\n");
    } else {
      console.log(`❌ PERMISSION_STATE_INVALID (${permissionProof.classification})`);
      console.log(`   User found: ${permissionProof.userFound}`);
      console.log(`   Membership found: ${permissionProof.membershipFound}`);
      console.log(`   Workspace ID valid: ${permissionProof.workspaceIdUuidLike}`);
      process.exit(1);
    }

    // Step 2.6: Verify demo engagement data is accessible and backfill if needed
    console.log("2️⃣.6️⃣ GET /api/internal/demo-engagement-proof (verify demo data)");
    const engagementProofResponse = await fetch(
      `${BASE_URL}/api/internal/demo-engagement-proof`,
      {
        method: "GET",
        headers: {
          "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
        },
      }
    );

    console.log(`   Status: ${engagementProofResponse.status}`);

    if (engagementProofResponse.status !== 200) {
      console.log("❌ DEMO_ENGAGEMENT_PROOF_FAILED");
      process.exit(1);
    }

    const engagementProof = await engagementProofResponse.json();
    console.log(`   Scoped engagements: ${engagementProof.scopedEngagementCount}`);
    console.log(`   Total engagements: ${engagementProof.totalEngagementCount}`);
    console.log(`   Demo engagement found: ${engagementProof.demoEngagementFound ? "✓" : "✗"}`);
    console.log(
      `   Demo engagement workspace matches: ${engagementProof.demoEngagementWorkspaceMatches ? "✓" : "✗"}`
    );
    console.log(`   Demo client found: ${engagementProof.demoClientFound ? "✓" : "✗"}`);
    console.log(
      `   Classification: ${engagementProof.classification}`
    );

    if (
      engagementProof.classification === "demo_engagement_missing" ||
      engagementProof.classification === "demo_engagement_wrong_workspace" ||
      engagementProof.classification === "demo_client_missing" ||
      engagementProof.classification === "demo_engagement_visibility_wrong" ||
      engagementProof.classification === "demo_engagement_membership_missing" ||
      engagementProof.classification === "demo_engagement_membership_inactive" ||
      engagementProof.classification === "demo_engagement_membership_wrong_workspace"
    ) {
      console.log("\n   🔧 Demo data missing, mislinked, or access insufficient - backfilling...");
      const engagementBackfillResponse = await fetch(
        `${BASE_URL}/api/internal/demo-engagement-proof`,
        {
          method: "POST",
          headers: {
            "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
          },
        }
      );

      console.log(`   Backfill status: ${engagementBackfillResponse.status}`);

      if (engagementBackfillResponse.status !== 200) {
        console.log(`❌ DEMO_ENGAGEMENT_BACKFILL_FAILED (${engagementBackfillResponse.status})`);
        const backfillError = await engagementBackfillResponse.json();
        console.log(`   Reason: ${backfillError.reason || "unknown"}`);
        console.log(`   BackfillStage: ${backfillError.backfillStage || "unknown"}`);
        console.log(`   ErrorName: ${backfillError.errorName || "unknown"}`);
        console.log(`   SafeErrorMessage: ${backfillError.safeErrorMessage || "unknown"}`);
        console.log(`   StackFileLine: ${backfillError.stackFileLine || "unknown"}`);
        console.log(`   Classification: ${backfillError.classification || "unknown"}`);
        process.exit(1);
      }

      const backfillResult = await engagementBackfillResponse.json();
      console.log(`   Backfill result: ${backfillResult.status}`);
      console.log(`   Action: ${backfillResult.backfillAction}`);

      // Verify again after backfill
      const verifyResponse = await fetch(
        `${BASE_URL}/api/internal/demo-engagement-proof`,
        {
          method: "GET",
          headers: {
            "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
          },
        }
      );

      if (verifyResponse.status === 200) {
        const verifyProof = await verifyResponse.json();
        console.log(`   After backfill: ${verifyProof.classification}`);

        if (verifyProof.classification !== "demo_data_ready") {
          console.log(`❌ DEMO_DATA_NOT_READY_AFTER_BACKFILL (${verifyProof.classification})`);
          process.exit(1);
        }
      }
      console.log("   ✓ Demo data backfilled\n");
    } else if (engagementProof.classification === "demo_data_ready") {
      console.log("   ✓ Demo data ready\n");
    } else {
      console.log(`❌ DEMO_DATA_STATE_INVALID (${engagementProof.classification})`);
      console.log(`   Membership found: ${engagementProof.membershipFound}`);
      console.log(`   Workspace ID valid: ${engagementProof.workspaceIdUuidLike}`);
      console.log(`   Demo engagement found: ${engagementProof.demoEngagementFound}`);
      console.log(`   Demo engagement membership: ${engagementProof.demoEngagementMembershipFound ? "found" : "missing"}`);
      console.log(`   Demo engagement membership active: ${engagementProof.demoEngagementMembershipActive ? "yes" : "no"}`);
      process.exit(1);
    }

    // Step 3: Verify demo data is accessible via API
    console.log("3️⃣  GET /api/engagements (verify demo data via API)");
    const engagementsResponse = await fetch(`${BASE_URL}/api/engagements`, {
      method: "GET",
      headers: {
        Cookie: sessionCookie,
        "x-workspace-id": "demo", // This will be validated by the API
        "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
      },
    });

    console.log(`   Status: ${engagementsResponse.status}`);

    if (engagementsResponse.status === 200) {
      const data = await engagementsResponse.json();
      const engagementCount = Array.isArray(data) ? data.length : data.engagements?.length || 0;

      if (engagementCount > 0) {
        console.log(`   ✓ Found ${engagementCount} engagement(s)\n`);

        // TASK B: Extract first engagement ID and test fixed routes
        let firstEngagementId: string | null = null;
        const engagementArray = Array.isArray(data) ? data : data.engagements || data.data || data.items || data.results || [];

        if (Array.isArray(engagementArray) && engagementArray.length > 0) {
          firstEngagementId = engagementArray[0]?.id;
        }

        if (!firstEngagementId) {
          console.log("❌ ENGAGEMENT_ID_EXTRACTION_FAILED");
          console.log("   Could not extract engagement ID from response");
          process.exit(1);
        }

        // Mask ID for safe logging: first 4 + ... + last 4
        const maskedId = firstEngagementId.substring(0, 4) + "..." + firstEngagementId.substring(firstEngagementId.length - 4);
        console.log(`4️⃣  GET /api/engagements/{${maskedId}}/dashboard (Phase 2 fixed route)`);

        const dashboardResponse = await fetch(`${BASE_URL}/api/engagements/${firstEngagementId}/dashboard`, {
          method: "GET",
          headers: {
            Cookie: sessionCookie,
            "x-workspace-id": "demo",
            "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
          },
        });

        console.log(`   Status: ${dashboardResponse.status}`);

        if (dashboardResponse.status !== 200) {
          console.log("❌ DASHBOARD_ROUTE_FAILED");
          console.log(`   Status: ${dashboardResponse.status}`);
          console.log("   Calling diagnostic endpoint to trace root cause...\n");

          // TASK B: Call diagnostic endpoint before exiting
          try {
            const diagnosticResponse = await fetch(
              `${BASE_URL}/api/internal/engagement-dashboard-route-proof`,
              {
                headers: {
                  "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
                },
              }
            );

            console.log(`   Diagnostic Status: ${diagnosticResponse.status}`);

            if (diagnosticResponse.status === 200) {
              const diagnostic = await diagnosticResponse.json();

              console.log("   Diagnostic Output:");
              console.log(`     userFound: ${diagnostic.userFound}`);
              console.log(`     membershipFound: ${diagnostic.membershipFound}`);
              console.log(
                `     workspaceIdUuidLike: ${diagnostic.workspaceIdUuidLike}`
              );
              console.log(`     engagementFound: ${diagnostic.engagementFound}`);
              console.log(
                `     engagementWorkspaceMatches: ${diagnostic.engagementWorkspaceMatches}`
              );
              console.log(
                `     engagementVisibility: ${diagnostic.engagementVisibility}`
              );
              console.log(`     hasClientId: ${diagnostic.hasClientId}`);
              console.log(
                `     serviceCallSucceeded: ${diagnostic.serviceCallSucceeded}`
              );
              console.log(
                `     dashboardTopLevelKeys: ${(diagnostic.dashboardTopLevelKeys || []).length}`
              );
              console.log(
                `     dashboardEmptyObject: ${diagnostic.dashboardEmptyObject}`
              );
              console.log(`     errorName: ${diagnostic.errorName}`);
              console.log(`     safeErrorMessage: ${diagnostic.safeErrorMessage}`);
              console.log(`     stackFileLine: ${diagnostic.stackFileLine}`);
              console.log(`     classification: ${diagnostic.classification}`);
            } else if (diagnosticResponse.status === 404) {
              console.log("   ❌ Diagnostic endpoint not found (404)");
              console.log(
                "   Possible causes: OPSIQ_DIAGNOSTIC_KEY missing or endpoint not deployed"
              );
              console.log("   Please verify:");
              console.log(
                "   1. OPSIQ_DIAGNOSTIC_KEY is set as GitHub Actions secret"
              );
              console.log(
                "   2. Diagnostic endpoint is deployed with current commit"
              );
            } else {
              console.log(
                `   ⚠️  Diagnostic endpoint returned unexpected status: ${diagnosticResponse.status}`
              );
            }
          } catch (diagnosticError) {
            console.log(
              `   ⚠️  Diagnostic call failed: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`
            );
          }

          console.log("");
          process.exit(1);
        }

        const dashboardData = await dashboardResponse.json();
        const dashboardTopLevelType = typeof dashboardData;
        const dashboardTopLevelKeys = dashboardTopLevelType === "object" && dashboardData !== null ? Object.keys(dashboardData).length : 0;

        if (JSON.stringify(dashboardData) === "{}") {
          console.log("❌ DASHBOARD_RESPONSE_EMPTY_OBJECT");
          console.log("   Response is empty object: {}");
          process.exit(1);
        }

        if (dashboardTopLevelKeys === 0) {
          console.log("❌ DASHBOARD_NO_TOP_LEVEL_KEYS");
          console.log("   Response has no top-level keys");
          process.exit(1);
        }

        console.log(`   ✓ Response is object with ${dashboardTopLevelKeys} top-level keys\n`);

        // Test drift route
        console.log(`5️⃣  GET /api/engagements/{${maskedId}}/drift (Phase 2 fixed route)`);

        const driftResponse = await fetch(`${BASE_URL}/api/engagements/${firstEngagementId}/drift`, {
          method: "GET",
          headers: {
            Cookie: sessionCookie,
            "x-workspace-id": "demo",
            "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
          },
        });

        console.log(`   Status: ${driftResponse.status}`);

        if (driftResponse.status !== 200) {
          console.log("❌ DRIFT_ROUTE_FAILED");
          console.log(`   Status: ${driftResponse.status}`);
          console.log("   Calling drift-specific diagnostic endpoint to trace root cause...\n");

          // Call drift-specific diagnostic endpoint (not dashboard diagnostic)
          try {
            const diagnosticResponse = await fetch(
              `${BASE_URL}/api/internal/engagement-drift-route-proof?key=${encodeURIComponent(OPSIQ_DIAGNOSTIC_KEY)}`,
              {
                method: "GET",
              }
            );

            console.log(`   Diagnostic Status: ${diagnosticResponse.status}`);

            if (diagnosticResponse.status === 200) {
              const diagnostic = await diagnosticResponse.json();

              console.log("   Drift Diagnostic Output:");
              console.log(`     demoUserFound: ${diagnostic.demoUserFound}`);
              console.log(`     workspaceMembershipFound: ${diagnostic.workspaceMembershipFound}`);
              console.log(
                `     workspaceUuidLike: ${diagnostic.workspaceUuidLike}`
              );
              console.log(`     demoEngagementFound: ${diagnostic.demoEngagementFound}`);
              console.log(
                `     engagementWorkspaceMatch: ${diagnostic.engagementWorkspaceMatch}`
              );
              console.log(
                `     engagementAccessible: ${diagnostic.engagementAccessible}`
              );
              console.log(
                `     serviceCallSucceeded: ${diagnostic.serviceCallSucceeded}`
              );
              console.log(
                `     returnedTopLevelKeysCount: ${diagnostic.returnedTopLevelKeysCount}`
              );
              console.log(
                `     returnedEmptyObject: ${diagnostic.returnedEmptyObject}`
              );
              console.log(`     errorName: ${diagnostic.errorName}`);
              console.log(`     safeErrorMessage: ${diagnostic.safeErrorMessage}`);
              console.log(`     stackFileLine: ${diagnostic.stackFileLine}`);
              console.log(`     classification: ${diagnostic.classification}`);
            } else if (diagnosticResponse.status === 404) {
              console.log("   ❌ Drift diagnostic endpoint not found (404)");
              console.log(
                "   Endpoint may not be deployed or OPSIQ_DIAGNOSTIC_KEY missing"
              );
            } else {
              console.log(
                `   ⚠️  Drift diagnostic endpoint returned status: ${diagnosticResponse.status}`
              );
            }
          } catch (diagnosticError) {
            console.log(
              `   ⚠️  Drift diagnostic call failed: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`
            );
          }

          console.log("");
          process.exit(1);
        }

        const driftData = await driftResponse.json();
        const driftTopLevelType = typeof driftData;
        const driftTopLevelKeys = driftTopLevelType === "object" && driftData !== null ? Object.keys(driftData).length : 0;

        if (JSON.stringify(driftData) === "{}") {
          console.log("❌ DRIFT_RESPONSE_EMPTY_OBJECT");
          console.log("   Response is empty object: {}");
          process.exit(1);
        }

        if (driftTopLevelKeys === 0) {
          console.log("❌ DRIFT_NO_TOP_LEVEL_KEYS");
          console.log("   Response has no top-level keys");
          process.exit(1);
        }

        console.log(`   ✓ Response is object with ${driftTopLevelKeys} top-level keys\n`);

        // TASK C: Optional safe 404 check for dashboard route
        console.log("6️⃣  GET /api/engagements/00000000-0000-0000-0000-000000000000/dashboard (404 safety check)");
        const notFoundResponse = await fetch(`${BASE_URL}/api/engagements/00000000-0000-0000-0000-000000000000/dashboard`, {
          method: "GET",
          headers: {
            Cookie: sessionCookie,
            "x-workspace-id": "demo",
            "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
          },
        });

        console.log(`   Status: ${notFoundResponse.status}`);

        if (notFoundResponse.status === 404) {
          const errorData = await notFoundResponse.json();
          const errorJson = JSON.stringify(errorData);

          if (errorJson === "{}") {
            console.log("   ⚠️  404 returned empty object (acceptable but not ideal)");
          } else {
            const isSafe = !errorJson.includes("stack") && !errorJson.toLowerCase().includes("secret") && !errorJson.toLowerCase().includes("password");
            if (isSafe) {
              console.log("   ✓ 404 returned safe JSON body\n");
            } else {
              console.log("   ⚠️  404 response may contain unsafe data\n");
            }
          }
        } else {
          console.log("   ⚠️  Unexpected status for 404 check (not 404)\n");
        }

        console.log("✅ DASHBOARD VERIFICATION SUCCESS");
        console.log("");
        console.log("Dashboard and Phase 2 fixed routes verified:");
        console.log(`   - Engagements: ${engagementCount} found`);
        console.log(`   - Dashboard route: ✓ 200, ${dashboardTopLevelKeys} keys`);
        console.log(`   - Drift route: ✓ 200, ${driftTopLevelKeys} keys`);
        console.log("   - Authentication: working");
        console.log("   - Data layer: accessible");
        process.exit(0);
      } else {
        console.log("   ⚠️  No engagements found\n");

        // Check if demo engagement proof shows data exists
        if (engagementProof.classification === "demo_data_ready") {
          console.log(
            "❌ ENGAGEMENTS_API_FILTER_OR_RESPONSE_SHAPE_MISMATCH"
          );
          console.log("");
          console.log(
            "Runtime DB proof shows demo_data_ready but /api/engagements returned empty."
          );
          console.log("This indicates a mismatch in:");
          console.log("  - Route workspace resolution");
          console.log("  - Service query filters (visibility, status, etc.)");
          console.log("  - Response mapper/DTO logic");
          console.log("  - Smoke parser logic");
          console.log("");
          console.log(`Proof shows: ${engagementProof.scopedEngagementCount} scoped engagement(s)`);
          console.log(`API returned: ${engagementCount} engagement(s)`);

          // Safe response dump for diagnostics
          console.log("\n📋 SAFE RESPONSE STRUCTURE DUMP:");
          console.log("─────────────────────────────────────────────");
          const topLevelType = Array.isArray(data) ? "array" : typeof data;
          const topLevelKeys = !Array.isArray(data) && typeof data === "object" ? Object.keys(data || {}).sort() : [];
          console.log(`   topLevelType: ${topLevelType}`);
          console.log(`   topLevelKeys: [${topLevelKeys.join(", ")}]`);

          if (Array.isArray(data)) {
            console.log(`   rootArrayLength: ${data.length}`);
          } else if (typeof data === "object" && data !== null) {
            const dataArray = data.data as any;
            const engagementsArray = data.engagements as any;
            const itemsArray = data.items as any;
            const resultsArray = data.results as any;

            if (Array.isArray(dataArray)) console.log(`   dataArrayLength: ${dataArray.length}`);
            if (Array.isArray(engagementsArray)) console.log(`   dataEngagementsLength: ${engagementsArray.length}`);
            if (Array.isArray(itemsArray)) console.log(`   itemsLength: ${itemsArray.length}`);
            if (Array.isArray(resultsArray)) console.log(`   resultsLength: ${resultsArray.length}`);

            // Detect array path
            let detectedPath = "none";
            if (Array.isArray(data)) detectedPath = "root";
            else if (Array.isArray(dataArray)) detectedPath = "data";
            else if (Array.isArray(engagementsArray)) detectedPath = "engagements";
            else if (Array.isArray(itemsArray)) detectedPath = "items";
            else if (Array.isArray(resultsArray)) detectedPath = "results";
            console.log(`   detectedArrayPath: ${detectedPath}`);

            // First item keys if any
            const arrayToInspect = Array.isArray(data) ? data : engagementsArray || dataArray || itemsArray || resultsArray || [];
            if (arrayToInspect.length > 0 && typeof arrayToInspect[0] === "object") {
              const firstItemKeys = Object.keys(arrayToInspect[0]).sort();
              console.log(`   firstItemKeys: [${firstItemKeys.slice(0, 5).join(", ")}${firstItemKeys.length > 5 ? ", ..." : ""}]`);
            }
          }
          console.log("─────────────────────────────────────────────");

          // Auto-call runtime trace to identify exact filter point
          console.log("\n🔍 AUTO-CALLING RUNTIME TRACE...");
          const traceResponse = await fetch(`${BASE_URL}/api/internal/engagements-api-runtime-trace`, {
            method: "GET",
            headers: {
              "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
            },
          });

          if (traceResponse.status === 200) {
            const trace = await traceResponse.json();
            console.log("\n📊 RUNTIME TRACE RESULTS:");
            console.log("─────────────────────────────────────────────");
            console.log(`   proofScopedCount: ${trace.proofScopedCount}`);
            console.log(`   rawPrismaCount: ${trace.rawPrismaCount}`);
            if (trace.rawPrismaSafeSample) {
              console.log(`   rawPrismaSafeSample:`);
              console.log(`      code: ${trace.rawPrismaSafeSample.code}`);
              console.log(`      status: ${trace.rawPrismaSafeSample.status}`);
              console.log(`      visibility: ${trace.rawPrismaSafeSample.visibility}`);
              console.log(`      serviceTier: ${trace.rawPrismaSafeSample.serviceTier}`);
              console.log(`      healthStatus: ${trace.rawPrismaSafeSample.healthStatus}`);
              console.log(`      interventionMode: ${trace.rawPrismaSafeSample.interventionMode}`);
              console.log(`      hasClientId: ${trace.rawPrismaSafeSample.hasClientId}`);
            }
            console.log(`   serviceWhereClause: { workspaceId: ***, visibility: ${JSON.stringify(trace.serviceWhereClause?.visibility)} }`);
            console.log(`   serviceCountBeforeMapping: ${trace.serviceCountBeforeMapping}`);
            console.log(`   serviceCountAfterMapping: ${trace.serviceCountAfterMapping}`);
            console.log(`   mapperResultCount: ${trace.mapperResultCount}`);
            console.log(`   routeResponseShape: [${trace.routeResponseShape?.join(", ") || "none"}]`);
            console.log(`   rootCauseClassification: ${trace.rootCauseClassification}`);
            console.log("─────────────────────────────────────────────\n");
          }

          process.exit(1);
        }

        console.log(
          "⚠️  DASHBOARD LOADS but no demo data"
        );
        console.log("");
        console.log("Possible causes:");
        console.log(
          "  - Demo data has not been backfilled to database"
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
          // Check if wrapper extracted Prisma code from raw error
          if (
            errorData.errorName === "PrismaClientKnownRequestError" &&
            errorData.prismaCode
          ) {
            console.log("✅ WRAPPER_RAW_PRISMA_CODE_CAPTURED");
            console.log("");
            console.log("Wrapper successfully extracted Prisma code from raw error:");
            console.log(`   PrismaCode: ${errorData.prismaCode}`);
            console.log(`   SafeMessage: ${errorData.safeMessage || "n/a"}`);
            console.log(`   SafeMetaKeys: ${JSON.stringify(errorData.safeMetaKeys) || "n/a"}`);
            console.log(`   FailingOperation: ${errorData.failingOperation}`);
            console.log(`   RouteVersion: ${errorData.routeVersion}`);
            console.log(`   EngagementsServiceVersion: ${errorData.engagementsServiceVersion}`);
            console.log("");

            // TASK D: If P2007, call probe endpoint to identify exact failing operation
            if (errorData.prismaCode === "P2007") {
              console.log("🔍 Prisma Error P2007 detected - Running diagnostic probes...");
              console.log("");

              try {
                const probeResponse = await fetch(
                  `${BASE_URL}/api/internal/debug-engagements-p2007`,
                  {
                    headers: {
                      "x-opsiq-diagnostic-key": OPSIQ_DIAGNOSTIC_KEY,
                    },
                  }
                );

                if (probeResponse.status === 200) {
                  const probeData = await probeResponse.json();
                  const probes = probeData.probes || [];

                  console.log("P2007 Probe Results:");
                  console.log("");
                  console.log("┌─────────────────────────────────┬────────┐");
                  console.log("│ Probe Name                      │ Status │");
                  console.log("├─────────────────────────────────┼────────┤");

                  for (const probe of probes) {
                    const name = probe.name.padEnd(31);
                    const status = probe.status === "pass" ? "✅ PASS" : "❌ FAIL";
                    console.log(`│ ${name} │ ${status.padEnd(6)} │`);

                    if (probe.status === "fail") {
                      if (probe.prismaCode) {
                        console.log(`│   └─ prismaCode: ${probe.prismaCode}`);
                      }
                      if (probe.safeMessage) {
                        console.log(
                          `│   └─ message: ${probe.safeMessage.substring(0, 40)}`
                        );
                      }
                      if (probe.driverAdapterErrorName) {
                        console.log(
                          `│   └─ adapterError: ${probe.driverAdapterErrorName}`
                        );
                      }
                    }
                  }

                  console.log("└─────────────────────────────────┴────────┘");
                  console.log("");

                  // TASK E: Decision tree analysis
                  const countFailed = probes.find(
                    (p) => p.name === "probe_01_count_minimal"
                  )?.status === "fail";
                  const findFirstIdFailed = probes.find(
                    (p) => p.name === "probe_02_findFirst_id_only"
                  )?.status === "fail";
                  const findManyIdFailed = probes.find(
                    (p) => p.name === "probe_03_findMany_id_only"
                  )?.status === "fail";
                  const relationFailed = probes.find(
                    (p) => p.name === "probe_06_relation_only"
                  )?.status === "fail";

                  console.log("Diagnosis:");
                  if (countFailed && findFirstIdFailed && findManyIdFailed) {
                    console.log(
                      "   ❌ Basic model/where clause broken (affects count, findFirst, findMany)"
                    );
                    console.log(
                      "   Issue: workspaceId filter or base engagement model issue"
                    );
                  } else if (
                    !countFailed &&
                    !findFirstIdFailed &&
                    !findManyIdFailed &&
                    relationFailed
                  ) {
                    console.log("   ❌ Relation failed but basic queries work");
                    console.log("   Issue: clientAccount relation issue");
                  } else if (!relationFailed && probes.some((p) => p.name.includes("select") && p.status === "fail")) {
                    console.log("   ❌ Specific field in select failing");
                    console.log("   Issue: One of these fields invalid: healthStatus, interventionMode, serviceTier");
                  } else if (
                    probes.find((p) => p.name === "probe_07_full_select")
                      ?.status === "fail"
                  ) {
                    console.log("   ❌ Full select fails but parts work");
                    console.log("   Issue: Service mapper combining valid fields incorrectly");
                  } else {
                    console.log("   ❌ Unexpected probe pattern");
                  }

                  process.exit(1);
                } else {
                  console.log(
                    `❌ Probe endpoint failed with status ${probeResponse.status}`
                  );
                  process.exit(1);
                }
              } catch (probeError) {
                console.log(
                  `❌ Probe request failed: ${probeError instanceof Error ? probeError.message : String(probeError)}`
                );
                process.exit(1);
              }
            }

            console.log("Next action: Fix the exact Prisma code.");
            process.exit(1);
          }

          // If no prismaCode extracted from Prisma error, that's a failure
          if (
            errorData.errorName === "PrismaClientKnownRequestError" &&
            !errorData.prismaCode
          ) {
            console.log("❌ WRAPPER_PRISMA_CODE_EXTRACTION_FAILED");
            console.log("");
            console.log(
              "Wrapper received raw PrismaClientKnownRequestError but did not extract prismaCode."
            );
            console.log("Check wrapper fallback Prisma extraction logic.");
            process.exit(1);
          }

          // Check for missing route metadata
          if (!errorData.routeVersion) {
            console.log("❌ ROUTE_VERSION_MISSING");
            console.log(
              "Wrapper fallback did not include routeVersion from options."
            );
            process.exit(1);
          }

          if (!errorData.engagementsServiceVersion) {
            console.log("❌ ENGAGEMENTS_SERVICE_VERSION_MISSING");
            console.log(
              "Wrapper fallback did not include engagementsServiceVersion from options."
            );
            process.exit(1);
          }

          // Generic handler invocation failure (not Prisma)
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
