/**
 * COMPREHENSIVE ROOT CAUSE DIAGNOSTIC
 *
 * Calls all diagnostic endpoints in sequence to trace exactly where
 * /api/engagements data disappears despite demo_data_ready classification.
 *
 * FLOW:
 * 1. demo-permission-proof: Check user has admin_or_portfolio_manager role
 * 2. demo-engagement-proof: Check demo engagement exists with correct visibility
 * 3. engagements-api-runtime-trace: Compare raw data vs service result
 *
 * ROOT CAUSE CANDIDATES:
 * - A) Permission missing: policy.roles empty, hasInternalAccess=false
 * - B) Service gets wrong workspace: wrong workspaceId passed
 * - C) Service filters out engagement: visibility field mismatch
 * - D) Response mapping: service returns data but route maps wrong
 * - E) Auth rejection: policyFact.valid=false, request 401s before service
 */

import * as https from "https";
import type { IncomingMessage } from "node:http";
import * as http from "http";

const DIAGNOSTIC_KEY = process.env.OPSIQ_DIAGNOSTIC_KEY || "demo-key-12345";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
}

async function fetchDiagnostic(
  endpoint: string,
  options: FetchOptions = {}
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${endpoint}`);
    const headers = {
      "x-opsiq-diagnostic-key": DIAGNOSTIC_KEY,
      ...options.headers,
    };

    const fetchOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers,
    };

    const protocol = url.protocol === "https:" ? https : http;
    const req = protocol.request(fetchOptions, (res: IncomingMessage) => {
      let data = "";
      res.on("data", (chunk: Buffer | string) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode || 500,
            data: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode || 500,
            data: { raw: data },
          });
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

async function main() {
  console.log("🔍 ROOT CAUSE DIAGNOSTIC FOR /api/engagements EMPTY RESPONSE");
  console.log("================================================================\n");

  try {
    // ========================================
    // STEP 1: PERMISSION CHECK
    // ========================================
    console.log("STEP 1️⃣ : Permission State (demo-permission-proof GET)");
    console.log("─────────────────────────────────────────────────────────────");

    const permResult = await fetchDiagnostic("/api/internal/demo-permission-proof");
    console.log(`   Status: ${permResult.status}`);
    console.log(`   User found: ${permResult.data.userFound}`);
    console.log(`   Membership active: ${permResult.data.membershipActive}`);
    console.log(`   Role assignment found: ${permResult.data.roleAssignmentFound}`);
    console.log(`   Role: ${permResult.data.role}`);
    console.log(`   Role assignment active: ${permResult.data.roleAssignmentActive}`);
    console.log(`   Has engagement:view: ${permResult.data.policyContextHasEngagementView}`);
    console.log(`   Classification: ${permResult.data.classification}`);

    if (
      permResult.data.classification === "role_assignment_missing" ||
      !permResult.data.roleAssignmentActive
    ) {
      console.log("\n   ⚠️  Role assignment missing - backfilling...");
      const backfillResult = await fetchDiagnostic("/api/internal/demo-permission-proof", {
        method: "POST",
      });
      console.log(`   Backfill status: ${backfillResult.status}`);
      if (backfillResult.status === 200) {
        console.log(`   ✓ Role backfilled successfully\n`);
      } else {
        console.log(`   ✗ Backfill failed!\n`);
      }
    } else {
      console.log("   ✓ Permission ready\n");
    }

    // ========================================
    // STEP 2: ENGAGEMENT DATA CHECK
    // ========================================
    console.log("STEP 2️⃣ : Engagement Data State (demo-engagement-proof GET)");
    console.log("─────────────────────────────────────────────────────────────");

    const engResult = await fetchDiagnostic("/api/internal/demo-engagement-proof");
    console.log(`   Status: ${engResult.status}`);
    console.log(`   Scoped engagement count: ${engResult.data.scopedEngagementCount}`);
    console.log(`   Total engagement count: ${engResult.data.totalEngagementCount}`);
    console.log(`   Demo engagement found: ${engResult.data.demoEngagementFound}`);
    console.log(`   Demo engagement workspace matches: ${engResult.data.demoEngagementWorkspaceMatches}`);
    console.log(`   Demo engagement visibility: ${engResult.data.demoEngagementVisibility}`);
    console.log(`   Demo engagement visibility correct: ${engResult.data.demoEngagementVisibilityCorrect}`);
    console.log(`   Demo client found: ${engResult.data.demoClientFound}`);
    console.log(`   Classification: ${engResult.data.classification}`);

    if (engResult.data.classification !== "demo_data_ready") {
      console.log("\n   ⚠️  Demo data not ready - backfilling...");
      const backfillResult = await fetchDiagnostic("/api/internal/demo-engagement-proof", {
        method: "POST",
      });
      console.log(`   Backfill status: ${backfillResult.status}`);
      if (backfillResult.status === 200) {
        console.log(`   ✓ Demo data backfilled successfully\n`);
      } else {
        console.log(`   ✗ Backfill failed!\n`);
      }
    } else {
      console.log("   ✓ Demo data ready\n");
    }

    // ========================================
    // STEP 3: RUNTIME TRACE
    // ========================================
    console.log("STEP 3️⃣ : Runtime Trace (engagements-api-runtime-trace GET)");
    console.log("─────────────────────────────────────────────────────────────");

    const traceResult = await fetchDiagnostic("/api/internal/engagements-api-runtime-trace");
    console.log(`   Status: ${traceResult.status}`);

    if (traceResult.status === 200) {
      console.log(`   Workspace ID (sample): ${traceResult.data.workspaceIdSample}`);
      console.log(`   Raw proof count: ${traceResult.data.proofCount}`);
      console.log(`   Raw engagements count: ${traceResult.data.rawEngagementsCount}`);
      console.log(`   Demo engagement in raw: ${traceResult.data.demoEngagementInRaw}`);
      console.log(`   Demo engagement visibility: ${traceResult.data.demoEngagementVisibility}`);
      console.log(`   User has admin role: ${traceResult.data.userHasAdminRole}`);
      console.log(`   User roles: ${traceResult.data.userRoleAssignments?.map((r: any) => r.role).join(", ") || "NONE"}`);
      console.log(`   Service received result: ${traceResult.data.serviceResultReceived}`);
      console.log(`   Service error: ${traceResult.data.serviceError || "NONE"}`);
      console.log(`   Service engagement count: ${traceResult.data.serviceEngagementCount}`);
      console.log(`   Root cause: ${traceResult.data.rootCauseClassification}\n`);

      // Analyze root cause
      const classification = traceResult.data.rootCauseClassification;
      console.log("ROOT CAUSE ANALYSIS:");
      console.log("────────────────────");

      if (classification === "no_engagement_in_database") {
        console.log(
          "   ✗ Demo engagement not in database at all!\n" +
            "     ACTION: Check if backfill created engagement"
        );
      } else if (classification === "raw_query_returns_empty") {
        console.log(
          "   ✗ Demo engagement not found in raw query!\n" +
            "     ISSUE: Engagement exists in count but not in findMany\n" +
            "     ACTION: Check schema, indexes, or soft-delete state"
        );
      } else if (classification === "visibility_filter_excludes_demo_engagement") {
        console.log(
          "   ✗ Demo engagement filtered out by visibility!\n" +
            "     ISSUE: Visibility field is not 'client_visible'\n" +
            "     ACTION: Check engagement.visibility value"
        );
      } else if (classification === "service_call_failed") {
        console.log(
          `   ✗ Service call failed!\n` +
            `     ERROR: ${traceResult.data.serviceError}\n` +
            `     ACTION: Check service layer logs`
        );
      } else if (classification === "service_filters_out_all_engagements") {
        console.log(
          "   ✗ Service returns empty despite raw data present!\n" +
            "     ISSUE: Service applying additional filters\n" +
            "     ACTION: Check listEngagements for undocumented filters"
        );
      } else if (classification === "service_returns_data_check_response_shape") {
        console.log(
          "   ✓ Service returns data!\n" +
            "     ISSUE: Response shape mismatch at route level\n" +
            "     ACTION: Check /api/engagements route response handling"
        );
      } else if (classification === "unknown") {
        console.log(
          "   ? Cannot determine root cause\n" +
            "     Check detailed trace output above"
        );
      }
    } else {
      console.log(`   ✗ Trace endpoint failed: ${traceResult.status}`);
      console.log(`   Response: ${JSON.stringify(traceResult.data, null, 2)}`);
    }

    console.log("\n================================================================");
    console.log("✅ DIAGNOSTIC COMPLETE");
  } catch (error) {
    console.error("❌ Diagnostic failed:", error);
    process.exit(1);
  }
}

main();
