/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * [db] ADMISSION_FLOOD — the real POST /api/auth/signup route, repeated from one trusted source address with distinct
 * emails. The repaired signup writes no PolicyAcceptance, so the per-source pending bound must be attributed through the
 * first verification token's recorded address. Proves: refusal after PENDING_SIGNUPS_PER_SOURCE_LIMIT with the
 * pending-from-source refusal (NOT the IP rate limiter), invited emails exempt, another source unaffected, a verified
 * account frees the slot, and a rotation by another source cannot move a user to a different source.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/auth/signup-pending-source-flood.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { PENDING_SIGNUPS_PER_SOURCE_LIMIT, countCapacityUsage, countPendingFromSource } from "@/services/beta/platform-settings.service";

vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn() }) }));

let seq = 0;
/** x-real-ip is the trusted platform address; x-forwarded-for varies per call so the per-IP rate limiter never trips. */
function signupRequest(email: string, trustedIp: string): Request {
  seq += 1;
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": trustedIp, "x-forwarded-for": `10.200.${Math.floor(seq / 250) % 250}.${(seq % 250) + 1}` },
    body: JSON.stringify({ email, workspaceName: "Flood Co" }),
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] per-source pending signup bound through the real signup route", () => {
  const emails: string[] = [];
  const sourceA = `198.51.100.${Math.floor(Math.random() * 100) + 1}`;
  const sourceB = `198.51.100.${Math.floor(Math.random() * 100) + 120}`;
  const newEmail = () => {
    const e = `flood-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  beforeEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    const base = await countCapacityUsage();
    await db.platformSetting.create({ data: { id: "global", admissionMode: "OPEN_BETA", capacityLimit: base.consumed + 40, updatedBy: "test-seed" } });
  });

  afterEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    const users = await db.user.findMany({ where: { email: { in: emails } } });
    const userIds = users.map((u: { id: string }) => u.id);
    if (userIds.length > 0) {
      await db.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
      const memberships = await db.workspaceMembership.findMany({ where: { userId: { in: userIds } } });
      const workspaceIds = memberships.map((m: { workspaceId: string }) => m.workspaceId);
      await db.workspaceMembership.deleteMany({ where: { userId: { in: userIds } } });
      await db.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { workspaceId: { in: workspaceIds.length > 0 ? workspaceIds : [randomUUID()] } }] } });
      if (workspaceIds.length > 0) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await db.betaRequest.deleteMany({ where: { email: { in: emails } } });
    emails.length = 0;
  });

  it("[db] a flood from one trusted source is refused after the limit with the pending-from-source refusal, not the rate limiter", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const refusalsBefore = await db.auditEvent.count({ where: { eventName: "signup.refused_beta_cap" } });
    const first: string[] = [];
    for (let i = 0; i < PENDING_SIGNUPS_PER_SOURCE_LIMIT; i++) {
      const email = newEmail();
      first.push(email);
      const res = await POST(signupRequest(email, sourceA) as never);
      expect(res.status).toBe(201);
    }
    expect(await countPendingFromSource(db as never, sourceA)).toBe(PENDING_SIGNUPS_PER_SOURCE_LIMIT);

    for (let i = 0; i < 4; i++) {
      const res = await POST(signupRequest(newEmail(), sourceA) as never);
      expect(res.status).toBe(403); // 429 would mean the IP limiter, not the bound, refused
      const body = await res.json();
      expect(body.reason).toBe("beta_cap_reached");
    }
    // the refusal is the pending-from-source one, recorded as such, and created no account
    const refusals = await db.auditEvent.findMany({ where: { eventName: "signup.refused_beta_cap" }, orderBy: { occurredAt: "desc" }, take: 4 });
    expect(refusals).toHaveLength(4);
    for (const r of refusals as Array<{ payload: { reason?: string } }>) expect(r.payload.reason).toBe("pending_from_source");
    expect(await db.auditEvent.count({ where: { eventName: "signup.refused_beta_cap" } })).toBe(refusalsBefore + 4);
    expect(await db.user.count({ where: { email: { in: emails.slice(first.length) } } })).toBe(0);
    expect(await countPendingFromSource(db as never, sourceA)).toBe(PENDING_SIGNUPS_PER_SOURCE_LIMIT);

    // a different source address is unaffected
    expect((await POST(signupRequest(newEmail(), sourceB) as never)).status).toBe(201);

    // an invited email stays exempt on the flooded source
    const invited = newEmail();
    await db.betaRequest.create({ data: { id: randomUUID(), email: invited, status: "INVITED", invitedAt: new Date() } });
    expect((await POST(signupRequest(invited, sourceA) as never)).status).toBe(201);

    // a verified account frees the slot (the invited one is also pending from that source, so verify two)
    expect((await POST(signupRequest(newEmail(), sourceA) as never)).status).toBe(403);
    await db.user.updateMany({ where: { email: { in: [first[0], invited] } }, data: { emailVerifiedAt: new Date() } });
    expect(await countPendingFromSource(db as never, sourceA)).toBe(PENDING_SIGNUPS_PER_SOURCE_LIMIT - 1);
    expect((await POST(signupRequest(newEmail(), sourceA) as never)).status).toBe(201);

    // a lapsed 24h hold frees the slots too: nothing is deleted, the source simply stops being charged for them
    const aged = new Date(Date.now() - 25 * 3600 * 1000);
    await db.user.updateMany({ where: { email: { in: emails } }, data: { createdAt: aged } });
    expect(await countPendingFromSource(db as never, sourceA)).toBe(0);
    expect((await POST(signupRequest(newEmail(), sourceA) as never)).status).toBe(201);
  });

  it("[db] a rotation token issued from another source does not move the user to that source", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const email = newEmail();
    expect((await POST(signupRequest(email, sourceA) as never)).status).toBe(201);
    // repeated signup for the same pending email from another address rotates the verification link
    expect((await POST(signupRequest(email, sourceB) as never)).status).toBe(201);
    const user: any = await db.user.findUnique({ where: { email } });
    const tokens = await db.emailVerificationToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(await countPendingFromSource(db as never, sourceA)).toBe(1);
    expect(await countPendingFromSource(db as never, sourceB)).toBe(0);
  });

  it("[db] an unknown source address (no trusted header in production) skips the bound", async () => {
    expect(await countPendingFromSource(db as never, null)).toBe(0);
  });
});
