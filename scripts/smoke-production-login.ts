#!/usr/bin/env node
/**
 * Smoke test for production login endpoint.
 * Verifies that /api/auth/login can successfully authenticate demo user.
 *
 * Usage:
 *   npx tsx scripts/smoke-production-login.ts
 *   BASE_URL=https://staging.example.com npx tsx scripts/smoke-production-login.ts
 */

// Use built-in fetch (Node.js 18+)

const BASE_URL = process.env.BASE_URL || "https://o-ps-iq.vercel.app";
const DEMO_EMAIL = "operator@demo.local";
const DEMO_PASSWORD = "demo-password-123";

interface LoginResponse {
  user?: {
    id: string;
    email: string;
    name: string | null;
  };
  error?: string;
  classification?: string;
  stage?: string;
}

async function smokeTestLogin(): Promise<void> {
  console.log("🧪 Production Login Smoke Test");
  console.log(`📍 Target: ${BASE_URL}`);
  console.log(`👤 Email: ${DEMO_EMAIL}`);
  console.log("");

  try {
    // Test 1: Verify endpoint is reachable
    console.log("1️⃣  Testing endpoint connectivity...");
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      }),
    });

    console.log(`   Status: ${response.status}`);

    let data: LoginResponse;
    const responseText = await response.text();

    if (response.status === 403 || response.status === 404) {
      console.error("   ❌ Got 403/404 - Production may not have deployed latest code yet");
      console.error(`   Response: ${responseText.substring(0, 200)}`);
      process.exit(1);
    }

    try {
      data = JSON.parse(responseText) as LoginResponse;
    } catch (parseError) {
      console.log(`   Response body (first 200 chars): ${responseText.substring(0, 200)}`);
      throw new Error(`Failed to parse response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Test 2: Check response format
    console.log("2️⃣  Checking response format...");
    if (!data) {
      console.error("   ❌ No response body");
      process.exit(1);
    }

    console.log(`   Response keys: ${Object.keys(data).join(", ")}`);

    // Test 3: Evaluate login result
    console.log("3️⃣  Evaluating login result...");

    if (response.status === 200) {
      console.log("   ✅ Login succeeded (status 200)");

      if (data.user) {
        console.log(`   👤 User ID: ${data.user.id}`);
        console.log(`   📧 User email: ${data.user.email}`);
        console.log(`   🏷️  User name: ${data.user.name || "(not set)"}`);
      }

      // Check for Set-Cookie header
      const setCookie = response.headers.get("set-cookie");
      console.log(
        `   🍪 Session cookie: ${setCookie ? "present" : "missing"}`
      );

      console.log("");
      console.log(
        "✅ LOGIN SUCCESSFUL - Production login is working correctly"
      );
      process.exit(0);
    } else if (response.status === 401) {
      console.log(`   ℹ️  Unauthorized (status 401)`);
      console.log(`   Error: ${data.error}`);
      console.log(`   Classification: ${data.classification || "unknown"}`);

      if (data.classification === "invalid_credentials") {
        console.log("   → User not found or password mismatch");
        console.log("   → Seed may not have been run, or URL is wrong");
      }

      process.exit(1);
    } else if (response.status === 400) {
      console.log(`   ⚠️  Validation error (status 400)`);
      console.log(`   Error: ${data.error}`);
      console.log(`   Classification: ${data.classification || "unknown"}`);
      process.exit(1);
    } else if (response.status === 500) {
      console.log(`   ❌ Server error (status 500)`);
      console.log(`   Error: ${data.error}`);
      console.log(`   Classification: ${data.classification || "unknown"}`);
      console.log(`   Stage: ${data.stage || "unknown"}`);

      // Provide context based on classification
      if (data.classification === "db_init_failed") {
        console.log("   → Database initialization failed");
        console.log("   → Check DATABASE_URL in Vercel production env");
      } else if (data.classification === "user_lookup_failed") {
        console.log("   → User lookup failed");
        console.log("   → Database may not be seeded");
      } else if (data.classification === "session_create_failed") {
        console.log("   → Session creation failed");
        console.log("   → Database schema or session table issue");
      }

      process.exit(1);
    } else {
      console.log(`   ❌ Unexpected status: ${response.status}`);
      console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Test execution failed:");
    console.error(
      error instanceof Error ? error.message : String(error)
    );
    console.error("");
    console.error("Possible causes:");
    console.error(
      `  - Network error: Cannot reach ${BASE_URL}`
    );
    console.error(
      "  - Incorrect BASE_URL environment variable"
    );
    console.error("  - Production deployment is not ready");
    process.exit(1);
  }
}

smokeTestLogin();
