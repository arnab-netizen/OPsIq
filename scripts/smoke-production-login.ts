#!/usr/bin/env node
// @ts-nocheck
/**
 * Production Login Smoke Test
 * Tests /api/auth/login endpoint with demo credentials
 *
 * Usage:
 *   BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-production-login.ts
 */

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

async function smokeTest(): Promise<void> {
  console.log("🧪 Production Login Smoke Test");
  console.log(`📍 Target: ${BASE_URL}`);
  console.log("");

  try {
    console.log("1️⃣  POST /api/auth/login");

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

    const contentType = response.headers.get("content-type") || "(none)";
    console.log(`   Content-Type: ${contentType}`);

    const setCookie = response.headers.get("set-cookie") ? "true" : "false";
    console.log(`   Set-Cookie: ${setCookie}`);

    // Safely read response
    let responseData: LoginResponse | null = null;
    let responseText = "";

    try {
      responseText = await response.text();

      if (responseText && contentType.includes("application/json")) {
        responseData = JSON.parse(responseText) as LoginResponse;
      }
    } catch (parseError) {
      console.log(
        `   (Response not JSON: ${responseText.substring(0, 100)}...)`
      );
    }

    console.log("");

    // Evaluate result
    if (response.status === 200) {
      console.log("✅ LOGIN SUCCESS");
      if (responseData?.user) {
        console.log(`   User: ${responseData.user.email}`);
      }
      console.log(`   Set-Cookie: ${setCookie}`);
      process.exit(0);
    } else if (response.status === 401) {
      console.log("⚠️  LOGIN FAILED (401)");
      if (responseData?.classification) {
        console.log(`   Classification: ${responseData.classification}`);
      }
      console.log(`   Error: ${responseData?.error || "no error message"}`);
      process.exit(1);
    } else if (response.status === 403) {
      if (responseText.includes("Host not in allowlist")) {
        console.log("❌ BLOCKED BY VERCEL");
        console.log("   Host header validation failed");
        console.log("   (Expected in non-Vercel networks)");
        process.exit(1);
      } else {
        console.log("❌ FORBIDDEN (403)");
        console.log(`   Response: ${responseText.substring(0, 100)}`);
        process.exit(1);
      }
    } else if (response.status === 500) {
      console.log("❌ SERVER ERROR (500)");
      if (responseData?.stage) {
        console.log(`   Failed stage: ${responseData.stage}`);
      }
      if (responseData?.classification) {
        console.log(
          `   Classification: ${responseData.classification}`
        );
      }
      console.log(`   Error: ${responseData?.error || responseText.substring(0, 100)}`);
      process.exit(1);
    } else {
      console.log(`❌ UNEXPECTED STATUS (${response.status})`);
      console.log(
        `   Response: ${responseText.substring(0, 100)}`
      );
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
