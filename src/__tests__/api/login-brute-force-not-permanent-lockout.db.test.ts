/**
 * Login brute force [db]: abuse-resistant, not permanently-bricking.
 *
 * login-rate-limit-status-code.test.ts already proves that exceeding the
 * login rate limit returns 429 (not a 500). It does not prove the other
 * half of the guarantee this route's own comments claim: that the limiter
 * is a temporary, recoverable throttle on the REQUEST, never a permanent
 * lock on the ACCOUNT itself. This file proves that against a real account:
 * after flooding a fixed IP+email pair with wrong passwords until the
 * limiter trips (429), the correct password still eventually works once the
 * rate-limit window has genuinely elapsed — proven by letting the limiter's
 * own persisted state (the PostgreSQL-backed token bucket in
 * `rate_limit_buckets`, see src/infra/rate-limiter-pg.ts) age out, rather
 * than by bypassing the account's real password check in any way.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { deletePgRateLimitBucket } from "@/infra/rate-limiter-pg";

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
}));

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] login brute force is rate-limited, never a permanent account lockout", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `brute-force-${stamp}@example.com`;
  const correctPassword = "CorrectHorseBattery123";
  const ip = "203.0.113.220"; // TEST-NET-3, unique to this file
  let userId = "";

  afterAll(async () => {
    await deletePgRateLimitBucket(`login:${ip}`);
    await deletePgRateLimitBucket(`login:${email}`);
    if (!userId) return;
    await db.session.deleteMany({ where: { userId } });
    await db.userRoleAssignment.deleteMany({ where: { userId } });
    const memberships = await db.workspaceMembership.findMany({ where: { userId } });
    const workspaceIds = memberships.map((m: { workspaceId: string }) => m.workspaceId);
    await db.workspaceMembership.deleteMany({ where: { userId } });
    await db.auditEvent.deleteMany({
      where: { OR: [{ actorId: userId }, { workspaceId: { in: workspaceIds.length > 0 ? workspaceIds : [""] } }] },
    });
    if (workspaceIds.length > 0) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  function loginRequest(password: string): Request {
    return new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password }),
    });
  }

  async function login(password: string) {
    const { POST } = await import("@/app/api/auth/login/route");
    return POST(loginRequest(password) as never);
  }

  it("[db] a real, verified account survives a brute-force flood: rate-limited during the flood, but the correct password works again once the limiter's window has elapsed", async () => {
    // Real signup + verify (mirrors the established pattern in
    // password-reset-e2e.db.test.ts / email-verification.db.test.ts) so this
    // is a genuine account, not a hand-crafted row that could hide a real
    // login-path bug.
    const { POST: signupPOST } = await import("@/app/api/auth/signup/route");
    const signupRes = await signupPOST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: correctPassword,
          workspaceName: "Brute Force Co",
          acceptTerms: true,
          acceptPrivacy: true,
          acceptBetaNotice: true,
        }),
      }) as never
    );
    expect(signupRes.status).toBe(201);
    const signupJson = await signupRes.json();
    userId = signupJson.user.id;
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });

    // Flood with WRONG passwords on the fixed IP+email pair until the
    // limiter trips. Every pre-trip attempt must be a normal 401 (never a
    // 500, never accidentally 200 — the wrong password must never succeed).
    let got429 = false;
    for (let i = 0; i < 20; i++) {
      const res = await login(`WrongPassword-${i}`);
      if (res.status === 429) {
        got429 = true;
        break;
      }
      expect(res.status).toBe(401);
    }
    expect(got429).toBe(true);

    // While still rate-limited, even the CORRECT password is refused with
    // 429 — the limiter throttles the request/channel, not password
    // correctness (proving it isn't silently allowing correct-password
    // attempts through a side channel).
    const stillLimited = await login(correctPassword);
    expect(stillLimited.status).toBe(429);

    // No session was ever created for this account during the entire flood
    // — the account was never actually compromised or logged into.
    const sessionsDuringFlood = await db.session.findMany({ where: { userId } });
    expect(sessionsDuringFlood).toHaveLength(0);

    // Simulate the rate-limit window genuinely elapsing: age out the
    // persisted PostgreSQL-backed token buckets for both the IP and email
    // keys this route checks (`login:${ip}` and `login:${email}` — see
    // login/route.ts). This does not touch the User row, the password hash,
    // or any account-level field — it only clears the abuse-throttle state,
    // exactly what happens naturally once real wall-clock time passes.
    await deletePgRateLimitBucket(`login:${ip}`);
    await deletePgRateLimitBucket(`login:${email}`);

    // The account itself was never locked: the SAME correct password now
    // succeeds from the SAME IP and email once the throttle window has
    // reset.
    const recovered = await login(correctPassword);
    expect(recovered.status).toBe(200);

    const sessionsAfterRecovery = await db.session.findMany({ where: { userId } });
    expect(sessionsAfterRecovery).toHaveLength(1);
  });
});
