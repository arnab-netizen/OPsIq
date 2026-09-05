/**
 * Password-reset flood [db].
 *
 * No existing test exercised POST /api/auth/forgot-password's rate limiting
 * at all (password-reset-e2e.db.test.ts covers the request/redemption
 * journey, not abuse volume). The route applies TWO independent limits per
 * request — `password-reset:${ip}` and `password-reset:${email}` (see
 * forgot-password/route.ts) — specifically because a per-IP-only limit is
 * trivially bypassed by rotating source IPs; the per-EMAIL bucket is the
 * real defense against inbox-bombing one target address. This file proves
 * both independently:
 *   1. flooding from a single IP (same target email) trips the limiter.
 *   2. flooding a single target email from DIFFERING IPs still trips the
 *      limiter — proving IP rotation does not bypass it.
 *   3. a fresh, unrelated IP+email pair is unaffected (buckets are scoped,
 *      not global).
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, afterAll } from "vitest";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { deletePgRateLimitBucket } from "@/infra/rate-limiter-pg";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] forgot-password flood is rate-limited per IP and per email", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const targetEmail = `reset-flood-target-${stamp}@example.com`;
  const singleIp = "203.0.113.230"; // TEST-NET-3, unique to this file
  const rotatingIps = [
    "203.0.113.231",
    "203.0.113.232",
    "203.0.113.233",
    "203.0.113.234",
    "203.0.113.235",
    "203.0.113.236",
    "203.0.113.237",
    "203.0.113.238",
  ];
  const freshIp = "203.0.113.239";
  const freshEmail = `reset-flood-fresh-${stamp}@example.com`;

  afterAll(async () => {
    await deletePgRateLimitBucket(`password-reset:${singleIp}`);
    await deletePgRateLimitBucket(`password-reset:${targetEmail}`);
    await deletePgRateLimitBucket(`password-reset:${freshIp}`);
    await deletePgRateLimitBucket(`password-reset:${freshEmail}`);
    for (const ip of rotatingIps) {
      await deletePgRateLimitBucket(`password-reset:${ip}`);
    }
    // No account exists for these synthetic emails (the route's
    // enumeration-resistant generic response works identically for a
    // nonexistent account), so there is no user/workspace graph to clean up
    // — only PasswordResetToken rows would be created for a REAL account,
    // and none is created here.
  });

  function forgotPasswordRequest(email: string, ip: string): Request {
    return new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email }),
    });
  }

  async function forgotPassword(email: string, ip: string) {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    return POST(forgotPasswordRequest(email, ip) as never);
  }

  it("[db] flooding one IP against the same target email trips the per-IP limit", async () => {
    let got429 = false;
    for (let i = 0; i < 10; i++) {
      const res = await forgotPassword(targetEmail, singleIp);
      if (res.status === 429) {
        got429 = true;
        break;
      }
      expect(res.status).toBe(200);
    }
    expect(got429).toBe(true);
  });

  it("[db] flooding the SAME target email from DIFFERING (rotating) IPs still trips the per-email limit — IP rotation does not bypass it", async () => {
    // Reset state from the previous test so this test's outcome is
    // attributable only to the per-email bucket, not IP-bucket carryover.
    await deletePgRateLimitBucket(`password-reset:${targetEmail}`);
    await deletePgRateLimitBucket(`password-reset:${singleIp}`);

    let got429 = false;
    for (const ip of rotatingIps) {
      const res = await forgotPassword(targetEmail, ip);
      if (res.status === 429) {
        got429 = true;
        break;
      }
      expect(res.status).toBe(200);
    }
    // Every rotating IP is fresh (its own untouched per-IP bucket), so the
    // ONLY thing that can have tripped this is the shared per-email bucket
    // for targetEmail.
    expect(got429).toBe(true);
  });

  it("[db] a fresh, unrelated IP+email pair is unaffected by the prior floods (buckets are scoped, not global)", async () => {
    const res = await forgotPassword(freshEmail, freshIp);
    expect(res.status).toBe(200);
    const json = await res.json();
    // Enumeration-resistance contract holds even under otherwise-unrelated
    // abuse activity elsewhere.
    expect(json).toEqual({
      success: true,
      message: "If an account exists for that email, we've sent a password reset link.",
    });
  });
});
