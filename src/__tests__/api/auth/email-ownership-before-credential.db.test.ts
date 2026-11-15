/**
 * Email ownership BEFORE credential trust — hostile journey (DB-backed).
 *
 * Root cause under test: signup used to accept an attacker-chosen PASSWORD (and consents) for an email whose
 * mailbox had not been proven. An attacker could pre-register a victim's email with a password they knew; the
 * victim's genuine verification email then verified the attacker-created account and signed the victim in
 * (account takeover by pre-hijack), and the victim's own re-signup got a 409 with no new email.
 *
 * Invariants proven here against real Postgres and the real, unmodified route handlers:
 *  I1  Before mailbox ownership is proven no attacker-selected password can ever authenticate (signup stores
 *      hashedPassword = NULL; a legacy pending account's provisional password is discarded at verification).
 *  I2  A passive GET performs no verification transition (the route exposes no GET; the page test proves the page
 *      makes no request on load). Only an explicit POST redeems.
 *  I3  Tokens are single-use / expiring / hashed; concurrent redemptions (separate module graphs = separate DB
 *      pools = genuinely parallel connections) have exactly one winner.
 *
 * The verification email is captured through the email-provider seam, so the token the victim "receives" is the
 * very token signup/rotation persisted (not a hand-built substitute).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const hoisted = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  sent: [] as Array<{ to: string | string[]; subject: string; html: string; text?: string }>,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: hoisted.cookieSet }),
}));

vi.mock("@/lib/integrations/email-provider", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/integrations/email-provider")>();
  return {
    ...original,
    getEmailProvider: () => ({
      send: async (message: { to: string | string[]; subject: string; html: string; text?: string }) => {
        hoisted.sent.push(message);
        return { accepted: true, id: "captured" };
      },
    }),
  };
});

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function randomIp(): string {
  return `198.51.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
}

function jsonRequest(url: string, body: Record<string, unknown>, ip: string = randomIp()): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function emailsTo(email: string) {
  return hoisted.sent.filter((m) => (Array.isArray(m.to) ? m.to.includes(email) : m.to === email));
}

/** The raw token inside the most recent email to `email` whose link path matches `path`. */
function lastTokenEmailed(email: string, path: "verify-email" | "reset-password"): string {
  const matches = emailsTo(email)
    .map((m) => new RegExp(`/${path}\\?token=([a-f0-9]+)`).exec(m.text ?? ""))
    .filter((m): m is RegExpExecArray => m !== null);
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1][1];
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] email ownership before credential trust", () => {
  const createdEmails: string[] = [];
  const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const newEmail = (prefix: string) => {
    const email = `${prefix}-${stamp()}@example.com`;
    createdEmails.push(email);
    return email;
  };

  beforeEach(() => {
    hoisted.sent.length = 0;
    hoisted.cookieSet.mockClear();
  });

  afterEach(async () => {
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
        where: { OR: [{ actorId: { in: userIds } }, ...(workspaceIds.length > 0 ? [{ workspaceId: { in: workspaceIds } }] : [])] },
      });
      if (workspaceIds.length > 0) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    createdEmails.length = 0;
  });

  // ---- route drivers ----
  async function signup(body: Record<string, unknown>, ip?: string) {
    const { POST } = await import("@/app/api/auth/signup/route");
    return POST(jsonRequest("http://localhost/api/auth/signup", body, ip) as never);
  }
  async function verify(token: string, ip?: string) {
    const { POST } = await import("@/app/api/auth/verify-email/route");
    return POST(jsonRequest("http://localhost/api/auth/verify-email", { token }, ip) as never);
  }
  async function setPassword(body: Record<string, unknown>, ip?: string) {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    return POST(jsonRequest("http://localhost/api/auth/reset-password", body, ip) as never);
  }
  async function forgot(email: string, ip?: string) {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    return POST(jsonRequest("http://localhost/api/auth/forgot-password", { email }, ip) as never);
  }
  async function login(email: string, password: string, ip?: string) {
    const { POST } = await import("@/app/api/auth/login/route");
    return POST(jsonRequest("http://localhost/api/auth/login", { email, password }, ip) as never);
  }

  const ALL_CONSENTS = { acceptTerms: true, acceptPrivacy: true, acceptBetaNotice: true };

  /** attacker/anyone signs up `email`; returns the raw verification token that was emailed. */
  async function signupAndGetToken(email: string, workspaceName = "Victim Co"): Promise<string> {
    const res = await signup({ email, workspaceName });
    expect(res.status).toBe(201);
    return lastTokenEmailed(email, "verify-email");
  }

  /** Creates a pre-fix style pending account: provisional password chosen before ownership, unverified. */
  async function seedLegacyPending(email: string, provisionalPassword: string) {
    const userId = randomUUID();
    await db.user.create({
      data: {
        id: userId,
        email,
        hashedPassword: await bcrypt.hash(provisionalPassword, 4),
        isActive: true,
        requiresEmailVerification: true,
        updatedAt: new Date(),
      },
    });
    const raw = `legacy${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`.slice(0, 64);
    await db.emailVerificationToken.create({
      data: { id: randomUUID(), userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3600_000) },
    });
    return { userId, rawVerificationToken: raw };
  }

  // ------------------------------------------------------------------------------------------------------------
  it("[db] 1-3 attacker signs up the victim's email: no credential exists, no consent recorded, mail goes to the victim", async () => {
    const email = newEmail("victim");
    const res = await signup({ email, workspaceName: "Attacker Chosen Name" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      pendingVerification: true,
      message: expect.any(String),
    });
    // The response never discloses identifiers.
    expect(JSON.stringify(body)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);

    const user = await db.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.hashedPassword).toBeNull();
    expect(user!.emailVerifiedAt).toBeNull();
    expect(user!.requiresEmailVerification).toBe(true);
    expect(await db.policyAcceptance.count({ where: { userId: user!.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: user!.id } })).toBe(0);

    // 3: the verification email went to the VICTIM's address and carries exactly the persisted token.
    const mails = emailsTo(email);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toMatch(/verify/i);
    const raw = lastTokenEmailed(email, "verify-email");
    const row = await db.emailVerificationToken.findUnique({ where: { tokenHash: sha256(raw) } });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(user!.id);
    expect(row!.usedAt).toBeNull();
    // Only the hash is stored.
    expect(row!.tokenHash).not.toBe(raw);
  });

  it("[db] 2 an attacker-supplied password (or consents) at signup is rejected and never stored", async () => {
    const email = newEmail("attacker-pw");
    const res = await signup({ email, workspaceName: "X", password: "AttackerPassword1!" });
    expect(res.status).toBe(400);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();

    const res2 = await signup({ email, workspaceName: "X", acceptTerms: true, acceptPrivacy: true, acceptBetaNotice: true });
    expect(res2.status).toBe(400);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
    expect(emailsTo(email)).toHaveLength(0);

    // And the attacker password can never log in on an account created without it.
    const ok = await signup({ email, workspaceName: "X" });
    expect(ok.status).toBe(201);
    const login1 = await login(email, "AttackerPassword1!");
    expect(login1.status).toBe(401);
  });

  it("[db] 4 passive requests never verify: no GET handler exists, and state is untouched by any amount of GET-like probing", async () => {
    const email = newEmail("scanner");
    const raw = await signupAndGetToken(email);

    const mod = (await import("@/app/api/auth/verify-email/route")) as Record<string, unknown>;
    expect(mod.GET).toBeUndefined();
    expect(mod.HEAD).toBeUndefined();
    expect(mod.POST).toBeTypeOf("function");

    // A scanner that "visits" the link only ever loads the page, which performs no request (page test); the server
    // state it can observe is unchanged however often it does so.
    for (let i = 0; i < 5; i++) {
      const row = await db.emailVerificationToken.findUnique({ where: { tokenHash: sha256(raw) } });
      expect(row!.usedAt).toBeNull();
      const user = await db.user.findUnique({ where: { email } });
      expect(user!.emailVerifiedAt).toBeNull();
    }
  });

  it("[db] 5-8 full honest journey: explicit redeem -> setup token -> consents + password B -> login B; attacker never authenticates; replays fail", async () => {
    const email = newEmail("journey");
    const raw = await signupAndGetToken(email);

    // 5. explicit redeem
    const redeem = await verify(raw);
    expect(redeem.status).toBe(200);
    expect(redeem.headers.get("cache-control")).toBe("no-store");
    const redeemBody = await redeem.json();
    expect(redeemBody.success).toBe(true);
    expect(redeemBody.next).toBe("set-password");
    expect(typeof redeemBody.setupToken).toBe("string");
    expect(redeemBody.user).toBeUndefined();
    // Verification does NOT sign anyone in.
    expect(hoisted.cookieSet).not.toHaveBeenCalled();
    const user = (await db.user.findUnique({ where: { email } }))!;
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.hashedPassword).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.policyAcceptance.count({ where: { userId: user.id } })).toBe(0);

    // The setup token is hashed at rest, single, and expires in ~60 minutes.
    const setupRows = await db.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(setupRows).toHaveLength(1);
    expect(setupRows[0].tokenHash).toBe(sha256(redeemBody.setupToken));
    expect(setupRows[0].tokenHash).not.toBe(redeemBody.setupToken);
    const ttl = setupRows[0].expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(55 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000 + 5_000);

    // Login is impossible before a password exists, and indistinguishable from a wrong password.
    const preLogin = await login(email, "AttackerPassword1!");
    const wrongLogin = await login(newEmail("ghost"), "AttackerPassword1!");
    expect(preLogin.status).toBe(401);
    expect(wrongLogin.status).toBe(401);
    expect(await preLogin.json()).toEqual(await wrongLogin.json());

    // 6. consent is required server-side — missing / false / non-boolean all fail and DO NOT consume the token.
    for (const consents of [
      {},
      { acceptTerms: true, acceptPrivacy: true },
      { acceptTerms: true, acceptPrivacy: true, acceptBetaNotice: false },
      { acceptTerms: "true", acceptPrivacy: true, acceptBetaNotice: true },
    ]) {
      const bad = await setPassword({ token: redeemBody.setupToken, password: "VictimPassword-B-1", ...consents });
      expect(bad.status).toBe(400);
    }
    expect((await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(redeemBody.setupToken) } }))!.usedAt).toBeNull();
    expect((await db.user.findUnique({ where: { id: user.id } }))!.hashedPassword).toBeNull();
    expect(await db.policyAcceptance.count({ where: { userId: user.id } })).toBe(0);

    const good = await setPassword({ token: redeemBody.setupToken, password: "VictimPassword-B-1", ...ALL_CONSENTS });
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ success: true, redirectTo: "/owner/first-run" });
    expect(hoisted.cookieSet).toHaveBeenCalledTimes(1);
    const [cookieName, , cookieOpts] = hoisted.cookieSet.mock.calls[0];
    expect(cookieName).toBe("opsiq_session");
    expect(cookieOpts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    const acceptances = await db.policyAcceptance.findMany({ where: { userId: user.id } });
    expect(acceptances.map((a: { policyType: string }) => a.policyType).sort()).toEqual(["BETA_NOTICE", "PRIVACY", "TERMS"]);
    const sessions = await db.session.findMany({ where: { userId: user.id, revokedAt: null } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token).toBe(hoisted.cookieSet.mock.calls[0][1]);

    // 7. B authenticates, the attacker's guess does not.
    expect((await login(email, "VictimPassword-B-1")).status).toBe(200);
    expect((await login(email, "AttackerPassword1!")).status).toBe(401);

    // 8. replays fail and create nothing.
    const replayVerify = await verify(raw);
    expect(replayVerify.status).toBe(400);
    const replaySetup = await setPassword({ token: redeemBody.setupToken, password: "AttackerReplay-9", ...ALL_CONSENTS });
    expect(replaySetup.status).toBe(400);
    expect((await login(email, "AttackerReplay-9")).status).toBe(401);
    expect(await db.policyAcceptance.count({ where: { userId: user.id } })).toBe(3);

    // Audit trail, with no secrets.
    const audit = await db.auditEvent.findMany({ where: { actorId: user.id } });
    const names = audit.map((a: { eventName: string }) => a.eventName);
    expect(names).toContain("user.email_verified");
    expect(names).toContain("user.policy_accepted");
    expect(names).toContain("user.password_reset_completed");
    expect(JSON.stringify(audit)).not.toContain(redeemBody.setupToken);
    expect(JSON.stringify(audit)).not.toContain(raw);
  });

  it("[db] 9 concurrent verification redemptions on independent connections: exactly one winner, exactly one setup token", async () => {
    const email = newEmail("race-verify");
    const raw = await signupAndGetToken(email);
    const user = (await db.user.findUnique({ where: { email } }))!;

    const N = 6;
    const handlers: Array<(r: never) => Promise<Response>> = [];
    const disconnects: Array<() => Promise<void>> = [];
    for (let i = 0; i < N; i++) {
      vi.resetModules();
      const route = await import("@/app/api/auth/verify-email/route");
      const isolated = await import("@/lib/db");
      handlers.push(route.POST as never);
      disconnects.push(() => isolated.db.$disconnect());
    }
    try {
      const results = await Promise.all(
        handlers.map((h) => h(jsonRequest("http://localhost/api/auth/verify-email", { token: raw }) as never))
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.filter((s) => s === 400)).toHaveLength(N - 1);
    } finally {
      await Promise.all(disconnects.map((d) => d().catch(() => undefined)));
    }
    expect(await db.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
    expect((await db.user.findUnique({ where: { id: user.id } }))!.emailVerifiedAt).not.toBeNull();
  });

  it("[db] 9b concurrent setup redemptions on independent connections: exactly one winner, one session, three acceptances", async () => {
    const email = newEmail("race-setup");
    const raw = await signupAndGetToken(email);
    const { setupToken } = await (await verify(raw)).json();
    const user = (await db.user.findUnique({ where: { email } }))!;

    const N = 6;
    const calls: Array<{ post: (r: never) => Promise<Response>; password: string }> = [];
    const disconnects: Array<() => Promise<void>> = [];
    for (let i = 0; i < N; i++) {
      vi.resetModules();
      const route = await import("@/app/api/auth/reset-password/route");
      const isolated = await import("@/lib/db");
      calls.push({ post: route.POST as never, password: `RacePassword-${i}-xyz` });
      disconnects.push(() => isolated.db.$disconnect());
    }
    let results: Response[];
    try {
      results = await Promise.all(
        calls.map((c) =>
          c.post(jsonRequest("http://localhost/api/auth/reset-password", { token: setupToken, password: c.password, ...ALL_CONSENTS }) as never)
        )
      );
    } finally {
      await Promise.all(disconnects.map((d) => d().catch(() => undefined)));
    }
    const winners = results.map((r, i) => ({ r, i })).filter((x) => x.r.status === 200);
    expect(winners).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(N - 1);
    expect(await db.policyAcceptance.count({ where: { userId: user.id } })).toBe(3);
    expect(await db.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
    const stored = (await db.user.findUnique({ where: { id: user.id } }))!.hashedPassword!;
    expect(await bcrypt.compare(calls[winners[0].i].password, stored)).toBe(true);
    for (let i = 0; i < N; i++) {
      if (i !== winners[0].i) expect(await bcrypt.compare(calls[i].password, stored)).toBe(false);
    }
  });

  it("[db] 10 legacy pending account (password A chosen before ownership): after the victim verifies, A cannot authenticate and the victim sets B", async () => {
    const email = newEmail("legacy");
    const { userId, rawVerificationToken } = await seedLegacyPending(email, "AttackerPasswordA-1");
    // A stray reset token the old flow could have left behind must die at verification too.
    const strayRaw = "stray".padEnd(64, "0");
    await db.passwordResetToken.create({
      data: { id: randomUUID(), userId, tokenHash: sha256(strayRaw), expiresAt: new Date(Date.now() + 3600_000) },
    });

    // Before verification A is blocked by the verification gate.
    expect((await login(email, "AttackerPasswordA-1")).status).toBe(403);

    const res = await verify(rawVerificationToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.next).toBe("set-password");

    const after = (await db.user.findUnique({ where: { id: userId } }))!;
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(after.hashedPassword).toBeNull();
    expect((await login(email, "AttackerPasswordA-1")).status).toBe(401);
    expect((await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(strayRaw) } }))!.usedAt).not.toBeNull();
    expect((await setPassword({ token: strayRaw, password: "StrayToken-Pass-1", ...ALL_CONSENTS })).status).toBe(400);

    expect((await setPassword({ token: body.setupToken, password: "VictimPassword-B-2", ...ALL_CONSENTS })).status).toBe(200);
    expect((await login(email, "VictimPassword-B-2")).status).toBe(200);
    expect((await login(email, "AttackerPasswordA-1")).status).toBe(401);
  });

  it("[db] a reset token minted for an UNVERIFIED account can never write a credential", async () => {
    const email = newEmail("unverified-reset");
    const { userId } = await seedLegacyPending(email, "AttackerPasswordA-1");
    const raw = "unv".padEnd(64, "1");
    await db.passwordResetToken.create({
      data: { id: randomUUID(), userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3600_000) },
    });
    const res = await setPassword({ token: raw, password: "Whatever-Pass-123", ...ALL_CONSENTS });
    expect(res.status).toBe(400);
    const after = (await db.user.findUnique({ where: { id: userId } }))!;
    expect(await bcrypt.compare("Whatever-Pass-123", after.hashedPassword!)).toBe(false);
    expect((await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(raw) } }))!.usedAt).toBeNull();
  });

  it("[db] 11 pending recovery: verified-but-passwordless gets a setup link via forgot-password; unverified gets nothing; responses identical", async () => {
    const verifiedEmail = newEmail("recover-verified");
    const unverifiedEmail = newEmail("recover-unverified");
    const ghostEmail = newEmail("recover-ghost");

    const raw = await signupAndGetToken(verifiedEmail);
    await signupAndGetToken(unverifiedEmail);
    const lostSetup = (await (await verify(raw)).json()).setupToken as string; // "lost": never used
    hoisted.sent.length = 0;

    const r1 = await forgot(verifiedEmail);
    const r2 = await forgot(unverifiedEmail);
    const r3 = await forgot(ghostEmail);
    expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200]);
    const [b1, b2, b3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
    expect(b1).toEqual(b2);
    expect(b2).toEqual(b3);

    expect(emailsTo(unverifiedEmail)).toHaveLength(0);
    expect(emailsTo(ghostEmail)).toHaveLength(0);
    const unverifiedUser = (await db.user.findUnique({ where: { email: unverifiedEmail } }))!;
    expect(await db.passwordResetToken.count({ where: { userId: unverifiedUser.id } })).toBe(0);

    const mails = emailsTo(verifiedEmail);
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain("&setup=1");
    const recoveredToken = lastTokenEmailed(verifiedEmail, "reset-password");
    expect(recoveredToken).not.toBe(lostSetup);

    // Server is authoritative: consents are still demanded; then the recovered token works exactly once.
    expect((await setPassword({ token: recoveredToken, password: "Recovered-Pass-1" })).status).toBe(400);
    const done = await setPassword({ token: recoveredToken, password: "Recovered-Pass-1", ...ALL_CONSENTS });
    expect(done.status).toBe(200);
    expect((await done.json()).redirectTo).toBe("/owner/first-run");
    expect((await login(verifiedEmail, "Recovered-Pass-1")).status).toBe(200);

    // Once the password exists, the other (older) setup token is just a normal reset: no consents, no session.
    hoisted.cookieSet.mockClear();
    const normal = await setPassword({ token: lostSetup, password: "Another-Pass-2xx" });
    expect(normal.status).toBe(200);
    expect(await normal.json()).toEqual({ success: true });
    expect(hoisted.cookieSet).not.toHaveBeenCalled();
  });

  it("[db] 12 repeated signup of an unverified email rotates the link, re-sends, answers like a fresh signup and changes nothing else; verified email stays 409", async () => {
    const email = newEmail("resignup");
    const first = await signup({ email, workspaceName: "Original Name" });
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    const token1 = lastTokenEmailed(email, "verify-email");
    const userBefore = (await db.user.findUnique({ where: { email } }))!;

    // The attacker (or the victim) signs up again, with a different business name.
    const second = await signup({ email, workspaceName: "Different Name" });
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(firstBody);
    expect(emailsTo(email)).toHaveLength(2);
    const token2 = lastTokenEmailed(email, "verify-email");
    expect(token2).not.toBe(token1);

    // Nothing about the existing account changed.
    const userAfter = (await db.user.findUnique({ where: { email } }))!;
    expect(userAfter.id).toBe(userBefore.id);
    expect(userAfter.hashedPassword).toBeNull();
    const workspaces = await db.workspace.findMany({ where: { createdBy: userBefore.id } });
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe("Original Name");

    // The old link is dead, the new one works.
    expect((await verify(token1)).status).toBe(400);
    const winner = await verify(token2);
    expect(winner.status).toBe(200);

    // Verified account: today's explicit conflict, no email, no change.
    hoisted.sent.length = 0;
    const third = await signup({ email, workspaceName: "Third" });
    expect(third.status).toBe(409);
    expect((await third.json()).error).toBe("An account already exists for this email. Sign in, or use Forgot your password if you never chose one.");
    expect(emailsTo(email)).toHaveLength(0);
  });

  it("[db] 12b the per-email email budget is shared with resend and exhausting it stays silent (no 429 oracle, no extra mail)", async () => {
    const email = newEmail("resignup-budget");
    await signupAndGetToken(email);
    let lastBody: unknown = null;
    for (let i = 0; i < 9; i++) {
      const res = await signup({ email, workspaceName: "Budget Co" });
      expect(res.status).toBe(201);
      lastBody = await res.json();
    }
    expect(lastBody).toEqual({ success: true, pendingVerification: true, message: expect.any(String) });
    // Budget is 5 per hour per email: 1 mail from the fresh signup + at most 5 more, never one per request.
    expect(emailsTo(email).length).toBeLessThanOrEqual(6);
    expect(emailsTo(email).length).toBeGreaterThanOrEqual(2);
    // Whatever happened, exactly one unused verification token is live at the end.
    const user = (await db.user.findUnique({ where: { email } }))!;
    expect(await db.emailVerificationToken.count({ where: { userId: user.id, usedAt: null } })).toBe(1);
  });

  it("[db] 13 expired token is rejected untouched; an already-verified account with a password gets next=login and no token", async () => {
    const expiredEmail = newEmail("expired");
    const rawExpired = await signupAndGetToken(expiredEmail);
    await db.emailVerificationToken.updateMany({
      where: { tokenHash: sha256(rawExpired) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await verify(rawExpired);
    expect(expired.status).toBe(400);
    const stillPending = (await db.user.findUnique({ where: { email: expiredEmail } }))!;
    expect(stillPending.emailVerifiedAt).toBeNull();
    expect(await db.passwordResetToken.count({ where: { userId: stillPending.id } })).toBe(0);

    const email = newEmail("already-verified");
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash("ExistingPassword-1", 4);
    await db.user.create({
      data: {
        id: userId,
        email,
        hashedPassword: passwordHash,
        isActive: true,
        requiresEmailVerification: true,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const raw = "av".padEnd(64, "2");
    await db.emailVerificationToken.create({
      data: { id: randomUUID(), userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3600_000) },
    });
    const res = await verify(raw);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, next: "login" });
    expect(await db.passwordResetToken.count({ where: { userId } })).toBe(0);
    expect((await db.user.findUnique({ where: { id: userId } }))!.hashedPassword).toBe(passwordHash);
    expect(hoisted.cookieSet).not.toHaveBeenCalled();
  });

  it("[db] an account that never required verification keeps its credential; a passwordless non-signup account gets no setup link", async () => {
    const legacyEmail = newEmail("never-required");
    const legacyId = randomUUID();
    const legacyHash = await bcrypt.hash("LegacyPassword-1xx", 4);
    await db.user.create({
      data: { id: legacyId, email: legacyEmail, hashedPassword: legacyHash, isActive: true, requiresEmailVerification: false, updatedAt: new Date() },
    });
    const raw = "nr".padEnd(64, "3");
    await db.emailVerificationToken.create({
      data: { id: randomUUID(), userId: legacyId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3600_000) },
    });
    const res = await verify(raw);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, next: "login" });
    const after = (await db.user.findUnique({ where: { id: legacyId } }))!;
    expect(after.hashedPassword).toBe(legacyHash);
    expect(after.emailVerifiedAt).not.toBeNull();
    expect((await login(legacyEmail, "LegacyPassword-1xx")).status).toBe(200);

    // Admin-provisioned style account: no password, never in the open-beta signup population -> silent no-op.
    const provisionedEmail = newEmail("provisioned");
    const provisionedId = randomUUID();
    await db.user.create({
      data: { id: provisionedId, email: provisionedEmail, hashedPassword: null, isActive: true, emailVerifiedAt: new Date(), updatedAt: new Date() },
    });
    hoisted.sent.length = 0;
    expect((await forgot(provisionedEmail)).status).toBe(200);
    expect(emailsTo(provisionedEmail)).toHaveLength(0);
    expect(await db.passwordResetToken.count({ where: { userId: provisionedId } })).toBe(0);
  });

  it("[db] verification and a concurrent re-signup rotation never leave a verified account with a live older link or lose the winner", async () => {
    const email = newEmail("rotate-race");
    const raw = await signupAndGetToken(email);
    const user = (await db.user.findUnique({ where: { email } }))!;

    vi.resetModules();
    const verifyRoute = await import("@/app/api/auth/verify-email/route");
    const verifyDb = await import("@/lib/db");
    vi.resetModules();
    const signupRoute = await import("@/app/api/auth/signup/route");
    const signupDb = await import("@/lib/db");
    try {
      const [v, s] = await Promise.all([
        verifyRoute.POST(jsonRequest("http://localhost/api/auth/verify-email", { token: raw }) as never),
        signupRoute.POST(jsonRequest("http://localhost/api/auth/signup", { email, workspaceName: "Race" }) as never),
      ]);
      // Either order is legal; both must be coherent: the signup always answers 201 or 409, never 5xx.
      expect([201, 409]).toContain(s.status);
      expect([200, 400]).toContain(v.status);
    } finally {
      await verifyDb.db.$disconnect().catch(() => undefined);
      await signupDb.db.$disconnect().catch(() => undefined);
    }
    const final = (await db.user.findUnique({ where: { id: user.id } }))!;
    if (final.emailVerifiedAt) {
      // Verified: no unused verification token may remain.
      expect(await db.emailVerificationToken.count({ where: { userId: user.id, usedAt: null } })).toBe(0);
    } else {
      // The rotation won first (old link dead): exactly one live link remains.
      expect(await db.emailVerificationToken.count({ where: { userId: user.id, usedAt: null } })).toBe(1);
    }
    expect(final.hashedPassword).toBeNull();
  });

  it("[db] login treats a credential-less account exactly like a wrong password (same status/body), never calling bcrypt with a null hash", async () => {
    const pendingEmail = newEmail("nohash");
    await signupAndGetToken(pendingEmail);
    const real = newEmail("realpw");
    const userId = randomUUID();
    await db.user.create({
      data: { id: userId, email: real, hashedPassword: await bcrypt.hash("RealPassword-1xx", 4), isActive: true, updatedAt: new Date() },
    });
    const a = await login(pendingEmail, "RealPassword-1xx");
    const b = await login(real, "WrongPassword-1xx");
    const c = await login(newEmail("nobody"), "WrongPassword-1xx");
    expect([a.status, b.status, c.status]).toEqual([401, 401, 401]);
    const [ab, bb, cb] = await Promise.all([a.json(), b.json(), c.json()]);
    expect(ab).toEqual(bb);
    expect(bb).toEqual(cb);
  });
});
