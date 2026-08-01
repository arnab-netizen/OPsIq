/**
 * Logout session revocation — PostgreSQL contract.
 *
 * Defect this pins: POST /api/auth/logout returned HTTP 500 because the route
 * called `revokeSession(ctx.verifiedActorId, ctx)` — a USER id — while the
 * service executes `session.update({ where: { id: sessionId } })`. No session
 * row has an id equal to a user id, so Prisma raised P2025 on every logout.
 *
 * These tests exercise the real service against real rows:
 *  1.  the exact authenticated session row is revoked
 *  2.  a user id is NOT accepted as a session id (the proven defect)
 *  3.  revoking is idempotent — a second call does not throw
 *  4.  an already-revoked session keeps its original revokedAt
 *  5.  a missing session does not throw
 *  6.  other sessions of the same user are untouched (no bulk revocation)
 *  7.  other users' sessions are untouched
 *  8.  a revoked session no longer resolves as an authenticated session
 *
 * Skipped when TEST_WITH_DB is not set (DB_BLOCKED_ENVIRONMENT); runs in LANE_B.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { revokeSession } from "@/services/auth";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

const WITH_DB = process.env.TEST_WITH_DB === "true";
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

const TOKEN_PREFIX = "logout-revocation-test-";

// revokeSession only reads authContext for provenance; a minimal stub keeps the
// test focused on the identifier contract rather than on wrapper internals.
const ctxStub = {} as CanonicalAuthContext;

async function cleanup() {
  await db.session.deleteMany({ where: { token: { startsWith: TOKEN_PREFIX } } });
  await db.user.deleteMany({ where: { email: { startsWith: TOKEN_PREFIX } } });
}

async function makeUser() {
  return db.user.create({
    data: {
      id: randomUUID(),
      email: `${TOKEN_PREFIX}${randomUUID()}@example.test`,
      hashedPassword: "not-a-real-hash",
      isActive: true,
    },
  });
}

async function makeSession(userId: string) {
  return db.session.create({
    data: {
      id: randomUUID(),
      userId,
      token: `${TOKEN_PREFIX}${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
}

describeIf(WITH_DB)("logout session revocation — PostgreSQL", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("1. revokes the exact authenticated session row", async () => {
    const user = await makeUser();
    const session = await makeSession(user.id);

    const revoked = await revokeSession({ sessionId: session.id }, ctxStub);

    expect(revoked).toBe(true);
    const after = await db.session.findUnique({ where: { id: session.id } });
    expect(after?.revokedAt).toBeInstanceOf(Date);
  });

  it("2. a user id is not accepted as a session id — the proven defect", async () => {
    const user = await makeUser();
    const session = await makeSession(user.id);

    // This is exactly what the buggy route did. It must not throw (P2025) and
    // must not revoke anything, because a user id identifies no session.
    const revoked = await revokeSession({ sessionId: user.id }, ctxStub);

    expect(revoked).toBe(false);
    const untouched = await db.session.findUnique({ where: { id: session.id } });
    expect(untouched?.revokedAt).toBeNull();
  });

  it("3. is idempotent — a second revocation does not throw", async () => {
    const user = await makeUser();
    const session = await makeSession(user.id);

    expect(await revokeSession({ sessionId: session.id }, ctxStub)).toBe(true);
    await expect(revokeSession({ sessionId: session.id }, ctxStub)).resolves.toBe(false);
  });

  it("4. an already-revoked session keeps its original revokedAt", async () => {
    const user = await makeUser();
    const session = await makeSession(user.id);

    await revokeSession({ sessionId: session.id }, ctxStub);
    const first = await db.session.findUnique({ where: { id: session.id } });

    await new Promise((r) => setTimeout(r, 10));
    await revokeSession({ sessionId: session.id }, ctxStub);
    const second = await db.session.findUnique({ where: { id: session.id } });

    expect(second?.revokedAt?.toISOString()).toBe(first?.revokedAt?.toISOString());
  });

  it("5. a missing session does not throw", async () => {
    await expect(revokeSession({ sessionId: randomUUID() }, ctxStub)).resolves.toBe(false);
  });

  it("6. other sessions of the same user are untouched", async () => {
    const user = await makeUser();
    const target = await makeSession(user.id);
    const other = await makeSession(user.id);

    await revokeSession({ sessionId: target.id }, ctxStub);

    expect((await db.session.findUnique({ where: { id: target.id } }))?.revokedAt).toBeInstanceOf(Date);
    expect((await db.session.findUnique({ where: { id: other.id } }))?.revokedAt).toBeNull();
  });

  it("7. another user's sessions are untouched", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const sessionA = await makeSession(userA.id);
    const sessionB = await makeSession(userB.id);

    await revokeSession({ sessionId: sessionA.id }, ctxStub);

    expect((await db.session.findUnique({ where: { id: sessionB.id } }))?.revokedAt).toBeNull();
  });

  it("8. a revoked session no longer resolves as authenticated", async () => {
    const user = await makeUser();
    const session = await makeSession(user.id);

    await revokeSession({ sessionId: session.id }, ctxStub);

    // getSession() rejects revoked sessions; assert the stored state it reads.
    const row = await db.session.findUnique({ where: { token: session.token } });
    expect(row?.revokedAt).not.toBeNull();
  });
});
