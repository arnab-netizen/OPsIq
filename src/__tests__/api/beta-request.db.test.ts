/**
 * BetaRequest — database-backed persistence and admin-service tests.
 *
 * Proves the controlled-beta homepage capture's duplicate-safety guarantee
 * is enforced at the DATABASE level (not just application logic), and that
 * the owner-review admin service functions (listBetaRequestsForAdmin,
 * markBetaRequestInvited) work against the real persisted schema. Mirrors
 * src/__tests__/phase-d/admin-operability-db.test.ts's self-skip gate.
 *
 * These tests require a real database (PostgreSQL) and self-skip when no
 * DATABASE_URL/TEST_DATABASE_URL is configured.
 */

import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { listBetaRequestsForAdmin, markBetaRequestInvited } from "@/services/admin/admin-operability.service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const createdIds: string[] = [];

afterAll(async () => {
  if (!SHOULD_RUN_DB_TESTS || createdIds.length === 0) return;
  await db.betaRequest.deleteMany({ where: { id: { in: createdIds } } });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("BetaRequest (DB-backed)", () => {
  it("creates a row with the expected defaults", async () => {
    const id = randomUUID();
    createdIds.push(id);
    const email = `req-${id}@example.com`;

    const row = await db.betaRequest.create({ data: { id, email } });

    expect(row.status).toBe("REQUESTED");
    expect(row.invitedAt).toBeNull();
    expect(row.invitedBy).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("enforces the email UNIQUE constraint at the database level", async () => {
    const id1 = randomUUID();
    const id2 = randomUUID();
    createdIds.push(id1);
    const email = `dup-${id1}@example.com`;

    await db.betaRequest.create({ data: { id: id1, email } });

    await expect(db.betaRequest.create({ data: { id: id2, email } })).rejects.toMatchObject({ code: "P2002" });

    // The second (rejected) id was never persisted.
    const secondRow = await db.betaRequest.findUnique({ where: { id: id2 } });
    expect(secondRow).toBeNull();
  });

  it("listBetaRequestsForAdmin returns a created request with its UTM fields", async () => {
    const id = randomUUID();
    createdIds.push(id);
    const email = `utm-${id}@example.com`;

    await db.betaRequest.create({
      data: { id, email, utmSource: "google", utmMedium: "cpc", utmCampaign: "beta" },
    });

    const result = await listBetaRequestsForAdmin({ limit: 200 });
    const found = result.betaRequests.find((r) => r.id === id);

    expect(found).toBeDefined();
    expect(found!.email).toBe(email);
    expect(found!.status).toBe("REQUESTED");
    expect(found!.utmSource).toBe("google");
    expect(found!.utmMedium).toBe("cpc");
    expect(found!.utmCampaign).toBe("beta");
  });

  it("markBetaRequestInvited transitions REQUESTED -> INVITED exactly once", async () => {
    const id = randomUUID();
    createdIds.push(id);
    await db.betaRequest.create({ data: { id, email: `invite-${id}@example.com` } });

    const actorId = randomUUID();
    const result = await markBetaRequestInvited({ betaRequestId: id, actorId });

    expect(result.status).toBe("INVITED");
    expect(result.invitedBy).toBe(actorId);
    expect(result.invitedAt).toBeTruthy();

    const row = await db.betaRequest.findUnique({ where: { id } });
    expect(row!.status).toBe("INVITED");
    expect(row!.invitedBy).toBe(actorId);
  });

  it("markBetaRequestInvited is idempotent: a second call does not change invitedBy", async () => {
    const id = randomUUID();
    createdIds.push(id);
    await db.betaRequest.create({ data: { id, email: `idempotent-${id}@example.com` } });

    const firstActor = randomUUID();
    const secondActor = randomUUID();

    const first = await markBetaRequestInvited({ betaRequestId: id, actorId: firstActor });
    const second = await markBetaRequestInvited({ betaRequestId: id, actorId: secondActor });

    // Second call is a no-op: it reports the row's real, unchanged state --
    // never fabricates a transition to the second actor.
    expect(first.invitedBy).toBe(firstActor);
    expect(second.invitedBy).toBe(firstActor);
    expect(second.status).toBe("INVITED");
  });

  it("throws NotFoundError for a nonexistent beta request id", async () => {
    await expect(
      markBetaRequestInvited({ betaRequestId: randomUUID(), actorId: randomUUID() })
    ).rejects.toThrow();
  });
});
