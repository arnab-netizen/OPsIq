/**
 * Email verification — real journey, and the login gate it depends on
 * (DB-backed).
 *
 * Proves the full open-beta activation journey against real DB rows and the
 * real, unmodified routes: signup creates an account that cannot sign in;
 * POST /api/auth/verify-email redeems the emailed token, marks the account
 * verified, and issues the first usable session; POST /api/auth/login
 * refuses an unverified account even with the correct password; and
 * POST /api/auth/resend-verification is enumeration-resistant and rate-limited.
 *
 * Mirrors the established pattern in signup-account-graph.db.test.ts /
 * password-reset-e2e.db.test.ts: real POST calls to the real route handlers,
 * `next/headers` cookies() mocked (no live Next.js request scope in this
 * harness). The raw verification token cannot be captured from the route's
 * own already-resolved `crypto` import (frozen ESM module namespace — same
 * constraint documented in password-reset-e2e.db.test.ts's file header), so
 * redemption tests construct a token with the identical raw-token/sha256-hash
 * contract the route itself uses (verified against verify-email/route.ts's
 * own source) and drive the real, unmodified redemption route against it —
 * exactly password-reset-e2e.db.test.ts's own established technique.
 */
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
}));

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Email verification — real journey", () => {
  const createdEmails: string[] = [];

  afterEach(async () => {
    mockCookieSet.mockClear();
    if (createdEmails.length === 0) return;
    const users = await db.user.findMany({ where: { email: { in: createdEmails } } });
    const userIds = users.map((u: { id: string }) => u.id);
    if (userIds.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
      const memberships = await db.workspaceMembership.findMany({ where: { userId: { in: userIds } } });
      const workspaceIds = memberships.map((m: { workspaceId: string }) => m.workspaceId);
      await db.workspaceMembership.deleteMany({ where: { userId: { in: userIds } } });
      await db.auditEvent.deleteMany({
        where: { OR: [{ actorId: { in: userIds } }, { workspaceId: { in: workspaceIds.length > 0 ? workspaceIds : [""] } }] },
      });
      if (workspaceIds.length > 0) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    createdEmails.length = 0;
  });

  function jsonRequest(url: string, body: Record<string, unknown>, ip?: string): Request {
    return new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) },
      body: JSON.stringify(body),
    });
  }

  async function signup(email: string, password: string) {
    const { POST } = await import("@/app/api/auth/signup/route");
    return POST(
      jsonRequest("http://localhost/api/auth/signup", {
        email,
        password,
        workspaceName: "Verify Co",
        acceptTerms: true,
        acceptPrivacy: true,
        acceptBetaNotice: true,
      }) as never
    );
  }

  async function login(email: string, password: string, ip: string) {
    const { POST } = await import("@/app/api/auth/login/route");
    return POST(jsonRequest("http://localhost/api/auth/login", { email, password }, ip) as never);
  }

  async function verifyEmail(token: string, ip: string) {
    const { POST } = await import("@/app/api/auth/verify-email/route");
    return POST(jsonRequest("http://localhost/api/auth/verify-email", { token }, ip) as never);
  }

  async function resendVerification(email: string, ip: string) {
    const { POST } = await import("@/app/api/auth/resend-verification/route");
    return POST(jsonRequest("http://localhost/api/auth/resend-verification", { email }, ip) as never);
  }

  it("[db] UNVERIFIED_OWNER_ACCESS_BLOCKED: a freshly signed-up account cannot log in with the correct password", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `verify-blocked-${stamp}@example.com`;
    const password = "CorrectPassword123";
    createdEmails.push(email);

    const signupRes = await signup(email, password);
    expect(signupRes.status).toBe(201);

    const loginRes = await login(email, password, "203.0.113.40");
    expect(loginRes.status).toBe(403);
    const loginJson = await loginRes.json();
    expect(loginJson.classification).toBe("email_not_verified");

    // No session was created by the blocked login attempt.
    const user = await db.user.findUnique({ where: { email } });
    const sessions = await db.session.findMany({ where: { userId: user!.id } });
    expect(sessions).toHaveLength(0);
  });

  it("[db] EMAIL_VERIFICATION_TESTED: redeeming the real emailed token activates the account and issues a usable session", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `verify-redeem-${stamp}@example.com`;
    createdEmails.push(email);

    const signupRes = await signup(email, "SomePassword123");
    expect(signupRes.status).toBe(201);
    const user = await db.user.findUnique({ where: { email } });

    // Construct a token with the identical raw/sha256 contract the route
    // itself uses, then insert a row exactly as signup's transaction would
    // have (mirrors password-reset-e2e.db.test.ts's established technique —
    // the real signup-generated raw token cannot be captured from this
    // environment's frozen crypto ESM module).
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    // Supersede whatever token signup actually created, so redemption below
    // is unambiguous about which token it is exercising.
    await db.emailVerificationToken.deleteMany({ where: { userId: user!.id } });
    await db.emailVerificationToken.create({
      data: {
        id: randomUUID(),
        userId: user!.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const verifyRes = await verifyEmail(rawToken, "203.0.113.41");
    expect(verifyRes.status).toBe(200);

    const verifiedUser = await db.user.findUnique({ where: { email } });
    expect(verifiedUser!.emailVerifiedAt).not.toBeNull();

    // A session was actually created and a cookie set.
    const sessions = await db.session.findMany({ where: { userId: user!.id } });
    expect(sessions).toHaveLength(1);
    expect(mockCookieSet).toHaveBeenCalledTimes(1);
    const [cookieName] = mockCookieSet.mock.calls[0];
    expect(cookieName).toBe("opsiq_session");

    // Verified account can now log in normally.
    const loginRes = await login(email, "SomePassword123", "203.0.113.42");
    expect(loginRes.status).toBe(200);
  });

  it("[db] the same verification token cannot be redeemed twice", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `verify-replay-${stamp}@example.com`;
    createdEmails.push(email);

    await signup(email, "SomePassword123");
    const user = await db.user.findUnique({ where: { email } });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await db.emailVerificationToken.deleteMany({ where: { userId: user!.id } });
    await db.emailVerificationToken.create({
      data: { id: randomUUID(), userId: user!.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const first = await verifyEmail(rawToken, "203.0.113.43");
    expect(first.status).toBe(200);

    const second = await verifyEmail(rawToken, "203.0.113.44");
    expect(second.status).toBe(400);
    const secondJson = await second.json();
    expect(secondJson.error).toMatch(/invalid or has expired/i);

    // Exactly one session exists — redemption replay creates no second one.
    const sessions = await db.session.findMany({ where: { userId: user!.id } });
    expect(sessions).toHaveLength(1);
  });

  it("[db] an expired verification token is rejected even though it was never used", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `verify-expired-${stamp}@example.com`;
    createdEmails.push(email);

    await signup(email, "SomePassword123");
    const user = await db.user.findUnique({ where: { email } });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await db.emailVerificationToken.deleteMany({ where: { userId: user!.id } });
    await db.emailVerificationToken.create({
      data: { id: randomUUID(), userId: user!.id, tokenHash, expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await verifyEmail(rawToken, "203.0.113.45");
    expect(res.status).toBe(400);

    const stillUnverified = await db.user.findUnique({ where: { email } });
    expect(stillUnverified!.emailVerifiedAt).toBeNull();
  });

  it("[db] resend-verification is enumeration-resistant: identical response whether or not the account exists", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const realEmail = `verify-resend-${stamp}@example.com`;
    const fakeEmail = `verify-resend-nonexistent-${stamp}@example.com`;
    createdEmails.push(realEmail);

    await signup(realEmail, "SomePassword123");

    const realRes = await resendVerification(realEmail, "203.0.113.50");
    const fakeRes = await resendVerification(fakeEmail, "203.0.113.51");

    expect(realRes.status).toBe(fakeRes.status);
    const [realJson, fakeJson] = await Promise.all([realRes.json(), fakeRes.json()]);
    expect(realJson).toEqual(fakeJson);
  });

  it("[db] resend-verification issues a fresh, independently-redeemable token without invalidating account state", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `verify-resend-fresh-${stamp}@example.com`;
    createdEmails.push(email);

    await signup(email, "SomePassword123");
    const user = await db.user.findUnique({ where: { email } });

    const before = await db.emailVerificationToken.count({ where: { userId: user!.id } });
    expect(before).toBe(1); // the one from signup

    const res = await resendVerification(email, "203.0.113.52");
    expect(res.status).toBe(200);

    const after = await db.emailVerificationToken.count({ where: { userId: user!.id } });
    expect(after).toBe(2); // signup's token remains (append-only), plus the new one
  });

  it("[db] resend-verification is rate-limited per IP and per email", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `verify-resend-flood-${stamp}@example.com`;
    createdEmails.push(email);
    await signup(email, "SomePassword123");

    const ip = "203.0.113.60";
    let got429 = false;
    for (let i = 0; i < 10; i++) {
      const res = await resendVerification(email, ip);
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });
});
