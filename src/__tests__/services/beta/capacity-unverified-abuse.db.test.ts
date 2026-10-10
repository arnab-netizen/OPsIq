/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * BETA_CAP_UNVERIFIED_ABUSE — unverified signups (addresses nobody proved they own) must not be able to fill the beta.
 * Capacity = verified accounts + unverified signups inside a short pending hold, with the pending part bounded.
 * Real Postgres, real admission function (reservePublicBetaCapacity, advisory-locked), real verify-email route.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  PENDING_SIGNUP_HOLD_MS,
  PENDING_SIGNUPS_PER_SOURCE_LIMIT,
  countCapacityUsage,
  countPendingFromSource,
  hasSignupCapacity,
  updatePlatformSettings,
} from "@/services/beta/platform-settings.service";
import {
  BetaCapExceededError,
  BetaPendingFromSourceError,
  reservePublicBetaCapacity,
  reserveCapacityForLateVerification,
} from "@/services/auth/beta-cap";
import { ValidationError } from "@/infra/errors";

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }) }));

const ADMIN = "33333333-3333-4333-8333-333333333331";

describe("capacity definition (pure)", () => {
  it("admission compares verified + still-pending places to the limit", () => {
    expect(hasSignupCapacity({ verified: 4, pending: 4, consumed: 8, ledger: 8 }, 10)).toBe(true);
    expect(hasSignupCapacity({ verified: 6, pending: 4, consumed: 10, ledger: 12 }, 10)).toBe(false);
    // lapsed unverified signups appear in the ledger only
    expect(hasSignupCapacity({ verified: 2, pending: 0, consumed: 2, ledger: 50 }, 10)).toBe(true);
  });
  it("a pending place lapses after 24 hours and one source may hold three at once", () => {
    expect(PENDING_SIGNUP_HOLD_MS).toBe(24 * 3600 * 1000);
    expect(PENDING_SIGNUPS_PER_SOURCE_LIMIT).toBe(3);
  });
  it("an unknown source address skips the per-source bound (nothing to attribute)", async () => {
    const client = { $queryRaw: async () => { throw new Error("must not query without a source address"); } } as never;
    expect(await countPendingFromSource(client, null)).toBe(0);
    expect(await countPendingFromSource(client, "unknown")).toBe(0);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] beta capacity — unverified signups cannot exhaust the beta", () => {
  const users: string[] = [];
  const workspaces: string[] = [];

  beforeEach(async () => {
    await db.user.upsert({ where: { id: ADMIN }, update: {}, create: { id: ADMIN, email: `cap-admin-${ADMIN}@example.com`, updatedAt: new Date() } });
    await db.platformSetting.deleteMany({ where: { id: "global" } });
  });

  afterEach(async () => {
    mockCookieSet.mockClear();
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    if (users.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: users } } });
      await db.emailVerificationToken.deleteMany({ where: { userId: { in: users } } });
      await db.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: users } }, { workspaceId: { in: workspaces.length ? workspaces : [randomUUID()] } }] } });
    }
    if (workspaces.length > 0) await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
    if (users.length > 0) await db.user.deleteMany({ where: { id: { in: users } } });
    users.length = 0;
    workspaces.length = 0;
  });

  /** One signup the way the route makes it: admission under the lock, then an UNVERIFIED user + external-beta workspace. */
  async function signup(opts: { ageMs?: number; verified?: boolean; invited?: boolean; ip?: string } = {}) {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    await db.$transaction(async (tx: any) => {
      await reservePublicBetaCapacity(tx, opts.invited ?? false, opts.invited ? null : (opts.ip ?? null)); // the route skips the source bound for invited emails
      await tx.user.create({
        data: {
          id: userId, email: `cap-${userId}@example.com`, requiresEmailVerification: true, updatedAt: new Date(),
          createdAt: new Date(Date.now() - (opts.ageMs ?? 0)),
          ...(opts.verified ? { emailVerifiedAt: new Date() } : {}),
        },
      });
      await tx.workspace.create({
        data: {
          id: workspaceId, name: "Cap Co", slug: `cap-${workspaceId.slice(0, 8)}`, createdBy: userId,
          signupSource: opts.invited ? "CONTROLLED_BETA_INVITE" : "PUBLIC_BETA",
          createdAt: new Date(Date.now() - (opts.ageMs ?? 0)),
        },
      });
      if (opts.ip) {
        await tx.policyAcceptance.create({ data: { id: randomUUID(), userId, policyType: "TERMS", version: "test", ipAddress: opts.ip } });
      }
    });
    users.push(userId);
    workspaces.push(workspaceId);
    return { userId, workspaceId };
  }

  async function setCapacity(limit: number, mode = "OPEN_BETA") {
    await db.platformSetting.create({ data: { id: "global", admissionMode: mode, capacityLimit: limit, updatedBy: "test-seed" } });
  }

  const ipN = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

  it("[db] BETA_CAP_UNVERIFIED_ABUSE: a burst of unverified signups can fill the places only temporarily — verified places are untouched and the hold lapses", async () => {
    const base = await countCapacityUsage();
    const limit = base.consumed + 6;
    await setCapacity(limit);
    const verified = await signup({ verified: true }); // a real customer who is already in
    const burst: string[] = [];
    for (let i = 0; i < 5; i++) burst.push((await signup({ ip: `198.51.100.${i + 1}` })).userId); // five junk signups from five addresses
    await expect(signup({ ip: "198.51.100.200" })).rejects.toBeInstanceOf(BetaCapExceededError); // full for now
    const full = await countCapacityUsage();
    expect(full.verified - base.verified).toBe(1);
    expect(full.pending - base.pending).toBe(5);
    // 25 hours later nobody verified: the junk no longer holds anything, yet no row was deleted, and the real customer still does.
    const aged = new Date(Date.now() - 25 * 3600 * 1000);
    await db.user.updateMany({ where: { id: { in: burst } }, data: { createdAt: aged } });
    await db.workspace.updateMany({ where: { createdBy: { in: burst } }, data: { createdAt: aged } });
    const after = await countCapacityUsage();
    expect(after.pending - base.pending).toBe(0);
    expect(after.verified - base.verified).toBe(1);
    expect(after.ledger - base.ledger).toBe(6);
    await expect(signup({ ip: "198.51.100.201" })).resolves.toBeTruthy(); // a real person can sign up again
    expect(await db.user.count({ where: { id: { in: [verified.userId, ...burst] } } })).toBe(6);
  });

  it("[db] one source address may hold only three pending places; another address is unaffected and the limit is released by verification", async () => {
    const base = await countCapacityUsage();
    await setCapacity(base.consumed + 20);
    const ip = ipN();
    const mine: string[] = [];
    for (let i = 0; i < PENDING_SIGNUPS_PER_SOURCE_LIMIT; i++) mine.push((await signup({ ip })).userId);
    await expect(signup({ ip })).rejects.toBeInstanceOf(BetaPendingFromSourceError);
    await expect(signup({ ip })).rejects.toBeInstanceOf(BetaCapExceededError); // handled by the same refusal path/response
    await expect(signup({ ip: `${ip}-other` })).resolves.toBeTruthy(); // a different address is fine
    await expect(signup()).resolves.toBeTruthy(); // an unknown address skips the per-source bound
    await db.user.update({ where: { id: mine[0] }, data: { emailVerifiedAt: new Date() } }); // one verifies
    await expect(signup({ ip })).resolves.toBeTruthy();
    // lapsed signups from that address stop counting too
    const aged = new Date(Date.now() - 25 * 3600 * 1000);
    await db.user.updateMany({ where: { id: { in: mine } }, data: { createdAt: aged } });
    expect(await countPendingFromSource(db as never, ip)).toBeLessThanOrEqual(1);
  });

  it("[db] a lapsed pending hold stops counting without any row being deleted", async () => {
    const base = await countCapacityUsage();
    await setCapacity(base.consumed + 10);
    const fresh = await signup();
    const stale = await signup({ ageMs: PENDING_SIGNUP_HOLD_MS + 60_000 });
    const usage = await countCapacityUsage();
    expect(usage.pending - base.pending).toBe(1); // only the fresh one holds a place
    expect(usage.ledger - base.ledger).toBe(2); // both rows still exist
    expect(await db.workspace.count({ where: { id: { in: [fresh.workspaceId, stale.workspaceId] } } })).toBe(2);
    expect(await db.user.count({ where: { id: { in: [fresh.userId, stale.userId] } } })).toBe(2);
  });

  it("[db] verified accounts hold a place permanently and an invited (controlled-beta) signup is counted the same way", async () => {
    const base = await countCapacityUsage();
    await setCapacity(base.consumed + 10);
    await signup({ verified: true, ageMs: 10 * PENDING_SIGNUP_HOLD_MS });
    await signup({ invited: true });
    const usage = await countCapacityUsage();
    expect(usage.verified - base.verified).toBe(1);
    expect(usage.pending - base.pending).toBe(1);
  });

  it("[db] admin capacity floor uses the same definition: a lapsed pending signup does not block lowering, verified accounts do", async () => {
    const base = await countCapacityUsage();
    await setCapacity(base.consumed + 10);
    await signup({ ageMs: PENDING_SIGNUP_HOLD_MS + 60_000 }); // in the ledger, holds nothing
    await signup({ verified: true });
    await signup({ verified: true });
    // usage is base + 2: lowering to exactly that is allowed even though the ledger is base + 3
    await expect(updatePlatformSettings({ actorId: ADMIN, capacityLimit: base.consumed + 2 })).resolves.toBeTruthy();
    // one below the real usage is refused
    await expect(updatePlatformSettings({ actorId: ADMIN, capacityLimit: base.consumed + 1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("[db] reserveCapacityForLateVerification refuses when the beta is full and passes when there is room", async () => {
    const base = await countCapacityUsage();
    await setCapacity(base.consumed + 1);
    await db.$transaction(async (tx: any) => { await expect(reserveCapacityForLateVerification(tx)).resolves.toBeUndefined(); });
    await signup({ verified: true }); // now full
    await db.$transaction(async (tx: any) => { await expect(reserveCapacityForLateVerification(tx)).rejects.toBeInstanceOf(BetaCapExceededError); });
  });

  it("[db] the verify-email route: a LATE verifier on a full beta gets a 409, the link is not consumed and the account stays unverified; with room it verifies", async () => {
    const base = await countCapacityUsage();
    await setCapacity(base.consumed + 1);
    const late = await signup({ ageMs: PENDING_SIGNUP_HOLD_MS + 60_000 });
    await signup({ verified: true }); // someone else took the last place while the hold had lapsed
    const raw = randomBytes(32).toString("hex");
    await db.emailVerificationToken.create({
      data: { id: randomUUID(), userId: late.userId, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const { POST } = await import("@/app/api/auth/verify-email/route");
    const post = () =>
      POST(new Request("http://localhost/api/auth/verify-email", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ token: raw }) }) as never);

    const full = await post();
    expect(full.status).toBe(409);
    expect((await full.json()).error).toMatch(/beta is full/i);
    expect(mockCookieSet).not.toHaveBeenCalled();
    const tokenRow: any = await db.emailVerificationToken.findFirst({ where: { userId: late.userId } });
    expect(tokenRow.usedAt).toBeNull();
    expect(((await db.user.findFirst({ where: { id: late.userId } })) as any).emailVerifiedAt).toBeNull();

    await db.platformSetting.update({ where: { id: "global" }, data: { capacityLimit: base.consumed + 5 } });
    const ok = await post();
    expect(ok.status).toBe(200);
    expect(((await db.user.findFirst({ where: { id: late.userId } })) as any).emailVerifiedAt).not.toBeNull();
    expect((await countCapacityUsage()).consumed - base.consumed).toBe(2);
  });

  it("[db] a user verifying INSIDE the hold needs no new place, even when the beta is exactly full", async () => {
    const base = await countCapacityUsage();
    await setCapacity(base.consumed + 1);
    const inHold = await signup(); // holds the last place
    const raw = randomBytes(32).toString("hex");
    await db.emailVerificationToken.create({
      data: { id: randomUUID(), userId: inHold.userId, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const { POST } = await import("@/app/api/auth/verify-email/route");
    const res = await POST(new Request("http://localhost/api/auth/verify-email", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.8.1.1" }, body: JSON.stringify({ token: raw }) }) as never);
    expect(res.status).toBe(200);
    expect((await countCapacityUsage()).consumed - base.consumed).toBe(1);
  });

  it("[db] a signup refused because registration is closed leaves an audit event the operator view counts (not just the rare race)", async () => {
    await setCapacity(500, "CLOSED");
    const before = await db.auditEvent.count({ where: { eventName: "signup.refused_beta_disabled" } });
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify({ email: `closed-${randomUUID()}@example.com`, password: "password123", workspaceName: "Closed Co", acceptTerms: true, acceptPrivacy: true, acceptBetaNotice: true }),
    }) as never);
    expect(res.status).toBe(403);
    expect(await db.auditEvent.count({ where: { eventName: "signup.refused_beta_disabled" } })).toBe(before + 1);
  });

  it("[db] an invited (controlled-beta) signup is not blocked by the per-source bound on shared addresses", async () => {
    const base = await countCapacityUsage();
    await setCapacity(base.consumed + 20);
    const ip = ipN();
    for (let i = 0; i < PENDING_SIGNUPS_PER_SOURCE_LIMIT; i++) await signup({ ip });
    await expect(signup({ ip })).rejects.toBeInstanceOf(BetaPendingFromSourceError);
    await expect(signup({ ip, invited: true })).resolves.toBeTruthy();
  });
});
