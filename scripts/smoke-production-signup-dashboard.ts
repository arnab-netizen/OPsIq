#!/usr/bin/env node
/**
 * Signup Smoke Test (pending-verification response) — STAGING / DEVELOPMENT ONLY
 *
 * Signup no longer accepts a password and no longer signs anyone in: it answers 201 "pending verification" and the
 * owner proves the mailbox, then chooses a password from the emailed link. This script cannot read a mailbox, so it
 * stops after asserting that 201 response. The dashboard steps need a real signed-in owner: use the browser journey
 * (tests/browser/public-beta-obq-journey.spec.ts) or scripts/seed-e2e-owner.ts for that.
 *
 * This script creates a user and workspace in the target database. It MUST NOT
 * run against a production database without a deliberate cleanup contract.
 *
 * Safety gates (enforced below):
 *  1. If BASE_URL matches a known production pattern, the script aborts unless
 *     SMOKE_ALLOW_PRODUCTION_WRITES=true is explicitly set.
 *  2. The created records persist after the test — use a dedicated staging
 *     database or ensure periodic cleanup via the admin panel.
 *
 * Usage (staging):
 *   BASE_URL=https://staging.opsiq.example.com npx tsx scripts/smoke-production-signup-dashboard.ts
 *
 * Usage (production — only with explicit write authorization):
 *   SMOKE_ALLOW_PRODUCTION_WRITES=true BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-production-signup-dashboard.ts
 *
 * MUTATION CLASSIFICATION:
 *   - USER_WORKSPACE_CREATION: an unverified user and workspace row are created (they hold a capacity place for 24h)
 *
 * CLEANUP: Records created by this script must be removed via the admin panel
 * or database console. No automated cleanup is performed.
 */

export {};

const baseUrl = process.env.BASE_URL || "https://o-ps-iq.vercel.app";

// Production write guard: abort if pointing at known production URLs without explicit opt-in.
const PRODUCTION_URL_PATTERNS = [
  /o-ps-iq\.vercel\.app/i,
  /opsiq\.app/i,
  /opsiq\.com/i,
];
const isProductionUrl = PRODUCTION_URL_PATTERNS.some((p) => p.test(baseUrl));
if (isProductionUrl && process.env.SMOKE_ALLOW_PRODUCTION_WRITES !== "true") {
  console.error("ERROR: BASE_URL matches a production pattern.");
  console.error("This script creates permanent user/workspace records.");
  console.error("To run against production, set: SMOKE_ALLOW_PRODUCTION_WRITES=true");
  console.error("Ensure you have a cleanup plan before proceeding.");
  process.exit(1);
}

const timestamp = Date.now();
const testEmail = `opsiq-smoke+${timestamp}@example.com`;
const testWorkspace = `Smoke Test ${timestamp}`;

interface SignupResponse {
  success?: boolean;
  pendingVerification?: boolean;
  message?: string;
  error?: string;
  user?: unknown;
  workspace?: unknown;
}

async function smokeTest(): Promise<void> {
  console.log("🚀 Production Signup → Real Dashboard Smoke Test");
  console.log(`📍 Base URL: ${baseUrl}`);
  console.log(`📧 Test Email: ${testEmail}`);
  console.log("");

  // Verify diagnostic key is available
  const diagnosticKey = process.env.OPSIQ_DIAGNOSTIC_KEY;
  if (!diagnosticKey || diagnosticKey === "not-set") {
    console.log("⚠️  OPSIQ_DIAGNOSTIC_KEY not available in environment");
    console.log("   Diagnostic output will be limited");
  }

  try {
    // STEP 0: Verify deployment is healthy
    console.log("0️⃣  GET /api/internal/build-info (verify deployment)");
    const buildInfoResponse = await fetch(`${baseUrl}/api/internal/build-info`);
    console.log(`   Status: ${buildInfoResponse.status}`);

    if (buildInfoResponse.status !== 200) {
      console.log("❌ BUILD_INFO_ENDPOINT_FAILED");
      console.log("   Deployment may not be ready yet");
      process.exit(1);
    }

    const buildInfo = await buildInfoResponse.json();
    console.log(`   Environment: ${buildInfo.environment}`);
    console.log(`   Deployed commit: ${buildInfo.commit?.substring(0, 7) || "unknown"}`);
    console.log("");

    // STEP 1: Sign up new user
    console.log("1️⃣  POST /api/auth/signup");
    const signupHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (diagnosticKey) {
      signupHeaders["x-opsiq-diagnostic-key"] = diagnosticKey;
    }
    const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: signupHeaders,
      body: JSON.stringify({
        email: testEmail,
        workspaceName: testWorkspace,
      }),
    });

    const signupStatus = signupResponse.status;
    console.log(`   Status: ${signupStatus}`);

    if (signupStatus !== 201) {
      console.log("❌ SIGNUP_FAILED");

      // Try to parse diagnostic response
      let signupDiagnostic: { reason?: string; stage?: string; errorName?: string; prismaCode?: string | null; safeMessage?: string; classification?: string } | null = null;
      try {
        signupDiagnostic = await signupResponse.json();
      } catch {
        const signupText = await signupResponse.text();
        console.log(`   Response: ${signupText.substring(0, 200)}`);
      }

      if (signupDiagnostic && signupDiagnostic.reason === "signup_failed") {
        console.log("\n📋 SIGNUP DIAGNOSTIC RESPONSE:");
        console.log(`   stage: ${signupDiagnostic.stage}`);
        console.log(`   errorName: ${signupDiagnostic.errorName}`);
        console.log(`   prismaCode: ${signupDiagnostic.prismaCode || "none"}`);
        console.log(`   safeMessage: ${signupDiagnostic.safeMessage}`);
        console.log(`   classification: ${signupDiagnostic.classification}`);
      }

      // Call diagnostic endpoint as secondary context
      console.log("\n🔍 CALLING DIAGNOSTIC ENDPOINT");
      console.log("GET /api/internal/signup-proof");

      const diagnosticResponse = await fetch(`${baseUrl}/api/internal/signup-proof`, {
        method: "GET",
        headers: { "x-opsiq-diagnostic-key": diagnosticKey || "not-set" },
      });

      if (diagnosticResponse.status === 200) {
        const diagnostic = await diagnosticResponse.json();
        console.log("\n📋 SIGNUP-PROOF DIAGNOSTIC RESULTS:");
        console.log(`   validation_ok: ${diagnostic.validation_ok}`);
        console.log(`   user_table_accessible: ${diagnostic.user_table_accessible}`);
        console.log(`   workspace_table_accessible: ${diagnostic.workspace_table_accessible}`);
        console.log(`   membership_table_accessible: ${diagnostic.membership_table_accessible}`);
        console.log(`   session_table_accessible: ${diagnostic.session_table_accessible}`);
        console.log(`   audit_table_accessible: ${diagnostic.audit_table_accessible}`);
        console.log(`   bcrypt_ok: ${diagnostic.bcrypt_ok}`);
        console.log(`   first_failing_step: ${diagnostic.first_failing_step}`);
        console.log(`   error_name: ${diagnostic.error_name}`);
        console.log(`   safe_error_message: ${diagnostic.safe_error_message}`);
        console.log(`   classification: ${diagnostic.classification}`);
      } else if (diagnosticResponse.status === 404) {
        console.log("\n⚠️  Diagnostic endpoint not available (404)");
        console.log("   Make sure OPSIQ_DIAGNOSTIC_KEY is set");
      } else {
        console.log(`\n⚠️  Diagnostic endpoint returned status ${diagnosticResponse.status}`);
      }

      process.exit(1);
    }

    const signupData: SignupResponse = await signupResponse.json();

    if (signupData.success !== true || signupData.pendingVerification !== true) {
      console.log("❌ SIGNUP_RESPONSE_INVALID");
      console.log(`   success: ${signupData.success}`);
      console.log(`   pendingVerification: ${signupData.pendingVerification}`);
      process.exit(1);
    }
    if (signupData.user !== undefined || signupData.workspace !== undefined) {
      console.log("❌ SIGNUP_RESPONSE_DISCLOSES_IDENTIFIERS");
      console.log("   The pending-verification response must carry no user or workspace object.");
      process.exit(1);
    }
    if (signupResponse.headers.get("set-cookie")) {
      console.log("❌ SIGNUP_SET_A_SESSION_COOKIE");
      console.log("   Signup must not sign anyone in before the mailbox is verified.");
      process.exit(1);
    }

    console.log("   ✓ 201 pending verification (no password accepted, no session cookie, no identifiers)");
    console.log("");
    console.log("✅ SIGNUP_PENDING_VERIFICATION_VERIFIED");
    console.log("");
    console.log("Stopping here on purpose: this script cannot read the mailbox, so it cannot click the");
    console.log("'Verify my email' link or choose a password. Complete those two steps by hand with the");
    console.log(`verification email sent to ${testEmail} (a real inbox is required), or use the browser journey.`);
    console.log(`   Workspace name used: ${testWorkspace}`);
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
