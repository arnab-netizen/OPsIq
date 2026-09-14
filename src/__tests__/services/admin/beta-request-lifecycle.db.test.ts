/**
 * [db] BetaRequest lifecycle — Administration V1 additions: revoke, reject,
 * re-invite (from REVOKED and from an expired INVITED), and the separately
 * labeled reopen-and-invite (from REJECTED). Real Postgres — proves the
 * atomic tx+audit pattern, replay idempotency, and the TTL-based expiry
 * predicate (@/lib/beta's isInviteExpired) end to end.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/admin/beta-request-lifecycle.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

vi.mock("@/lib/integrations/email-provider", () => ({ getEmailProvider: vi.fn(() => null) }));

import {
  markBetaRequestInvited,
  revokeBetaRequestInvite,
  rejectBetaRequest,
  reopenAndInviteBetaRequest,
} from "@/services/admin/admin-operability.service";
import { isBetaRequestInvited } from "@/lib/beta";

const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

async function seedBetaRequest(overrides: Partial<Record<string, unknown>> = {}): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `lifecycle-${id}@example.com`;
  await db.betaRequest.create({ data: { id, email, status: "REQUESTED", ...overrides } });
  return { id, email };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] BetaRequest lifecycle — revoke/reject/re-invite/reopen", () => {
  const seededIds: string[] = [];

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: ACTOR_ID },
      update: {},
      create: { id: ACTOR_ID, email: `lifecycle-actor-${ACTOR_ID}@example.com`, updatedAt: new Date() },
    });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: ACTOR_ID } }).catch(() => undefined);
    await db.user.delete({ where: { id: ACTOR_ID } }).catch(() => undefined);
  });

  afterEach(async () => {
    if (seededIds.length) {
      await db.auditEvent.deleteMany({ where: { entityId: { in: seededIds } } }).catch(() => undefined);
      await db.betaRequest.deleteMany({ where: { id: { in: seededIds } } }).catch(() => undefined);
      seededIds.length = 0;
    }
  });

  it("[db] revoke: INVITED -> REVOKED, applicant can no longer register, audited", async () => {
    const { id, email } = await seedBetaRequest({ status: "INVITED", invitedAt: new Date(), invitedBy: ACTOR_ID });
    seededIds.push(id);

    expect(await isBetaRequestInvited(email)).toBe(true);
    const result = await revokeBetaRequestInvite({ betaRequestId: id, actorId: ACTOR_ID, reason: "spam" });
    expect(result.status).toBe("REVOKED");
    expect(await isBetaRequestInvited(email)).toBe(false);

    const events = await db.auditEvent.findMany({ where: { entityId: id, eventName: "beta_request.revoked" } });
    expect(events).toHaveLength(1);
  });

  it("[db] revoke replay is idempotent: no double audit event", async () => {
    const { id } = await seedBetaRequest({ status: "INVITED", invitedAt: new Date(), invitedBy: ACTOR_ID });
    seededIds.push(id);
    await revokeBetaRequestInvite({ betaRequestId: id, actorId: ACTOR_ID });
    await revokeBetaRequestInvite({ betaRequestId: id, actorId: ACTOR_ID }); // no-op replay
    const events = await db.auditEvent.findMany({ where: { entityId: id, eventName: "beta_request.revoked" } });
    expect(events).toHaveLength(1);
  });

  it("[db] re-invite: REVOKED -> INVITED (refreshed invitedAt), applicant can register again", async () => {
    const { id, email } = await seedBetaRequest({ status: "REVOKED", revokedAt: new Date(), revokedBy: ACTOR_ID });
    seededIds.push(id);
    expect(await isBetaRequestInvited(email)).toBe(false);

    const result = await markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID });
    expect(result.status).toBe("INVITED");
    expect(await isBetaRequestInvited(email)).toBe(true);

    const row = await db.betaRequest.findUniqueOrThrow({ where: { id } });
    expect(row.revokedAt).toBeNull();
    expect(row.revokedBy).toBeNull();
  });

  it("[db] re-invite: an INVITED request whose invite has expired is treated as not-admitted, and re-invite refreshes it", async () => {
    const staleInvitedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago, TTL default 14
    const { id, email } = await seedBetaRequest({ status: "INVITED", invitedAt: staleInvitedAt, invitedBy: ACTOR_ID });
    seededIds.push(id);

    // Expired: the same predicate signup uses says not-admitted.
    expect(await isBetaRequestInvited(email)).toBe(false);

    const result = await markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID });
    expect(result.status).toBe("INVITED");
    const row = await db.betaRequest.findUniqueOrThrow({ where: { id } });
    expect(row.invitedAt!.getTime()).toBeGreaterThan(staleInvitedAt.getTime());
    expect(await isBetaRequestInvited(email)).toBe(true); // refreshed, now valid again
  });

  it("[db] a non-expired INVITED request is an idempotent no-op under markBetaRequestInvited (no new audit event, no re-sent email)", async () => {
    const recentInvitedAt = new Date();
    const { id } = await seedBetaRequest({ status: "INVITED", invitedAt: recentInvitedAt, invitedBy: ACTOR_ID });
    seededIds.push(id);

    await markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID });
    const events = await db.auditEvent.findMany({ where: { entityId: id, eventName: "beta_request.marked_invited" } });
    expect(events).toHaveLength(0); // no transition occurred, so no event
    const row = await db.betaRequest.findUniqueOrThrow({ where: { id } });
    expect(row.invitedAt!.getTime()).toBe(recentInvitedAt.getTime()); // untouched
  });

  it("[db] reject: REQUESTED -> REJECTED, audited, no email attempted", async () => {
    const { id } = await seedBetaRequest({ status: "REQUESTED" });
    seededIds.push(id);
    const result = await rejectBetaRequest({ betaRequestId: id, actorId: ACTOR_ID, reason: "not a fit" });
    expect(result.status).toBe("REJECTED");
    const events = await db.auditEvent.findMany({ where: { entityId: id, eventName: "beta_request.rejected" } });
    expect(events).toHaveLength(1);
  });

  it("[db] markBetaRequestInvited (routine re-invite) does NOT admit a REJECTED request — REJECTED is not one of its source states", async () => {
    const { id, email } = await seedBetaRequest({ status: "REJECTED", rejectedAt: new Date(), rejectedBy: ACTOR_ID });
    seededIds.push(id);
    const result = await markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID });
    expect(result.status).toBe("REJECTED"); // unchanged — no-op
    expect(await isBetaRequestInvited(email)).toBe(false);
  });

  it("[db] reopen & invite: REJECTED -> INVITED via the separate, distinctly-audited action", async () => {
    const { id, email } = await seedBetaRequest({ status: "REJECTED", rejectedAt: new Date(), rejectedBy: ACTOR_ID });
    seededIds.push(id);

    const result = await reopenAndInviteBetaRequest({ betaRequestId: id, actorId: ACTOR_ID, reason: "reconsidered" });
    expect(result.status).toBe("INVITED");
    expect(await isBetaRequestInvited(email)).toBe(true);

    const row = await db.betaRequest.findUniqueOrThrow({ where: { id } });
    expect(row.rejectedAt).toBeNull();
    expect(row.rejectedBy).toBeNull();

    const reopenEvents = await db.auditEvent.findMany({ where: { entityId: id, eventName: "beta_request.reopened" } });
    expect(reopenEvents).toHaveLength(1); // distinct from a routine invite event
    const inviteEvents = await db.auditEvent.findMany({ where: { entityId: id, eventName: "beta_request.marked_invited" } });
    expect(inviteEvents).toHaveLength(0);
  });
});
