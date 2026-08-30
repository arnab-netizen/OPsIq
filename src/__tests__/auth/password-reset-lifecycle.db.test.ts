/**
 * Password-reset lifecycle — real PostgreSQL contract, real route handlers.
 *
 * Exercises POST /api/auth/forgot-password and POST /api/auth/reset-password directly
 * (no HTTP layer, no mocked db) to prove the full forgot->email->redeem->new-password
 * chain end to end: token creation, sha256-hashed-at-rest storage, enumeration
 * resistance (identical response for a real vs. a nonexistent email), one-time-use,
 * expiry, password-hash update, bulk session invalidation, and audit-event proof.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/auth/password-reset-lifecycle.db.test.ts
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID, createHash } from "crypto";
import * as bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { POST as forgotPasswordPOST } from "@/app/api/auth/forgot-password/route";
import { POST as resetPasswordPOST } from "@/app/api/auth/reset-password/route";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let _mockSend: ReturnType<typeof vi.fn> | null = null;
vi.mock("@/lib/integrations/email-provider", () => ({
  getEmailProvider: vi.fn(() => (_mockSend ? { send: _mockSend } : null)),
  resetEmailProvider: vi.fn(),
}));

function extractTokenFromEmailBody(body: string): string {
  const match = body.match(/token=([a-f0-9]{64})/);
  if (!match) throw new Error(`No reset token found in email body: ${body}`);
  return match[1];
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] password reset lifecycle — real route handlers", () => {
  const stamp = randomUUID().substring(0, 8);
  const originalPassword = "correct-horse-battery-staple";
  const email = `password-reset-${stamp}@test.local`;
  const workspaceId = randomUUID();
  let userId: string;

  const forgotRequest = (targetEmail: string, ip: string) =>
    new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: targetEmail }),
    }) as never;

  const resetRequest = (token: string, password: string, ip = "203.0.113.30") =>
    new Request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ token, password }),
    }) as never;

  const tokenCount = () => db.passwordResetToken.count({ where: { userId } });
  const requestedAuditCount = () =>
    db.auditEvent.count({ where: { actorId: userId, eventName: AUDIT_EVENTS.PASSWORD_RESET_REQUESTED } });
  const completedAuditCount = () =>
    db.auditEvent.count({ where: { actorId: userId, eventName: AUDIT_EVENTS.PASSWORD_RESET_COMPLETED } });

  beforeAll(async () => {
    userId = randomUUID();
    const hashedPassword = await bcrypt.hash(originalPassword, 10);
    await db.user.create({
      data: { id: userId, email, hashedPassword, isActive: true, updatedAt: new Date() },
    });
    await db.workspace.create({ data: { id: workspaceId, name: "Password Reset Test WS", slug: `password-reset-${stamp}` } });
    await db.workspaceMembership.create({
      data: { id: randomUUID(), workspaceId, userId, role: "owner" },
    });
  });

  afterAll(async () => {
    await db.session.deleteMany({ where: { userId } });
    await db.passwordResetToken.deleteMany({ where: { userId } });
    await db.auditEvent.deleteMany({ where: { actorId: userId } });
    await db.workspaceMembership.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  afterEach(async () => {
    await db.session.deleteMany({ where: { userId } });
    await db.passwordResetToken.deleteMany({ where: { userId } });
    await db.auditEvent.deleteMany({ where: { actorId: userId } });
    _mockSend = null;
    // Restore the known password so tests that ran a real reset don't leak
    // a changed hash into a later, independent test in this same file.
    const hashedPassword = await bcrypt.hash(originalPassword, 10);
    await db.user.update({ where: { id: userId }, data: { hashedPassword } });
  });

  it("[db] forgot-password creates exactly one token, sha256-hashed at rest, and emits one audit event", async () => {
    const captured: { html: string; text: string }[] = [];
    _mockSend = vi.fn(async (msg: { html: string; text: string }) => {
      captured.push(msg);
      return { accepted: true };
    });

    const res = await forgotPasswordPOST(forgotRequest(email, "203.0.113.31"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(await tokenCount()).toBe(1);
    expect(await requestedAuditCount()).toBe(1);
    expect(_mockSend).toHaveBeenCalledTimes(1);

    const rawToken = extractTokenFromEmailBody(captured[0].text);
    const expectedHash = createHash("sha256").update(rawToken).digest("hex");
    const stored = await db.passwordResetToken.findFirst({ where: { userId } });
    expect(stored?.tokenHash).toBe(expectedHash);
    // The raw token must never itself be persisted anywhere.
    expect(stored?.tokenHash).not.toBe(rawToken);
    expect(stored?.usedAt).toBeNull();
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("[db] ACCOUNT_ENUMERATION_RESISTANT: identical response for a real vs. a nonexistent email, and no token/audit for the nonexistent one", async () => {
    _mockSend = vi.fn(async () => ({ accepted: true }));
    const unknownEmail = `nobody-${randomUUID()}@test.local`;

    const [realRes, unknownRes] = await Promise.all([
      forgotPasswordPOST(forgotRequest(email, "203.0.113.32")),
      forgotPasswordPOST(forgotRequest(unknownEmail, "203.0.113.33")),
    ]);
    const [realBody, unknownBody] = await Promise.all([realRes.json(), unknownRes.json()]);

    expect(realRes.status).toBe(unknownRes.status);
    expect(realBody).toEqual(unknownBody);

    expect(await tokenCount()).toBe(1); // only the real email got a token
    expect(_mockSend).toHaveBeenCalledTimes(1); // only the real email got an email
  });

  it("[db] full redemption: password hash updates, token becomes one-time-used, all existing sessions revoked, one audit event", async () => {
    const captured: { text: string }[] = [];
    _mockSend = vi.fn(async (msg: { text: string }) => {
      captured.push(msg);
      return { accepted: true };
    });

    // A session that must not survive the reset.
    const sessionId = randomUUID();
    await db.session.create({
      data: { id: sessionId, userId, token: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) },
    });

    await forgotPasswordPOST(forgotRequest(email, "203.0.113.34"));
    const rawToken = extractTokenFromEmailBody(captured[0].text);

    const newPassword = "a-completely-different-passphrase-99";
    const res = await resetPasswordPOST(resetRequest(rawToken, newPassword, "203.0.113.130"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare(newPassword, user.hashedPassword!)).toBe(true);
    expect(await bcrypt.compare(originalPassword, user.hashedPassword!)).toBe(false);

    const tokenRow = await db.passwordResetToken.findFirst({ where: { userId } });
    expect(tokenRow?.usedAt).not.toBeNull();

    const session = await db.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.revokedAt).not.toBeNull();

    expect(await completedAuditCount()).toBe(1);
  });

  it("[db] TOKEN_ONE_TIME_USE: redeeming the same token twice fails the second time with no further mutation", async () => {
    _mockSend = vi.fn(async () => ({ accepted: true }));
    const captured: { text: string }[] = [];
    _mockSend = vi.fn(async (msg: { text: string }) => {
      captured.push(msg);
      return { accepted: true };
    });

    await forgotPasswordPOST(forgotRequest(email, "203.0.113.35"));
    const rawToken = extractTokenFromEmailBody(captured[0].text);

    const first = await resetPasswordPOST(resetRequest(rawToken, "first-new-password-abc", "203.0.113.131"));
    expect(first.status).toBe(200);

    const second = await resetPasswordPOST(resetRequest(rawToken, "second-new-password-xyz", "203.0.113.131"));
    expect(second.status).toBe(400);

    // Only the first redemption's password change took effect.
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare("first-new-password-abc", user.hashedPassword!)).toBe(true);
    expect(await bcrypt.compare("second-new-password-xyz", user.hashedPassword!)).toBe(false);

    // Exactly one completion audit event, not two.
    expect(await completedAuditCount()).toBe(1);
  });

  it("[db] two concurrent redemptions of the same token: exactly one succeeds, the other is rejected", async () => {
    _mockSend = vi.fn(async () => ({ accepted: true }));
    const captured: { text: string }[] = [];
    _mockSend = vi.fn(async (msg: { text: string }) => {
      captured.push(msg);
      return { accepted: true };
    });

    await forgotPasswordPOST(forgotRequest(email, "203.0.113.36"));
    const rawToken = extractTokenFromEmailBody(captured[0].text);

    const [r1, r2] = await Promise.all([
      resetPasswordPOST(resetRequest(rawToken, "racer-one-password", "203.0.113.132")),
      resetPasswordPOST(resetRequest(rawToken, "racer-two-password", "203.0.113.132")),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 400]);
    expect(await completedAuditCount()).toBe(1);
  });

  it("[db] RESET_TOKEN_EXPIRY: an expired token is rejected with the same generic message as an invalid one", async () => {
    const rawToken = "a".repeat(64);
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await db.passwordResetToken.create({
      data: {
        id: randomUUID(),
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });

    const res = await resetPasswordPOST(resetRequest(rawToken, "irrelevant-password-1", "203.0.113.133"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid or has expired/i);

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare(originalPassword, user.hashedPassword!)).toBe(true);
  });

  it("[db] a syntactically well-formed but never-issued token is rejected with the same generic message", async () => {
    const madeUpToken = "f".repeat(64);
    const res = await resetPasswordPOST(resetRequest(madeUpToken, "irrelevant-password-2", "203.0.113.134"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid or has expired/i);
  });

  it("[db] RATE_LIMITED: repeated forgot-password requests for the same email are throttled", async () => {
    _mockSend = vi.fn(async () => ({ accepted: true }));
    const rateLimitEmail = `rate-limit-${randomUUID()}@test.local`;
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await forgotPasswordPOST(forgotRequest(rateLimitEmail, `203.0.113.4${i}`));
      results.push(res.status);
    }
    expect(results.filter((s) => s === 429).length).toBeGreaterThan(0);
  });
});
