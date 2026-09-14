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

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { listBetaRequestsForAdmin, markBetaRequestInvited } from "@/services/admin/admin-operability.service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const createdIds: string[] = [];

// AuditEvent.actorId carries a real FK to users.id (onDelete: Restrict).
// markBetaRequestInvited emits a pre-workspace audit event on every real
// transition (see infra/audit.ts's createUnchainedPlatformEvent) which, as
// of the Administration V1 pre-workspace-audit-durability fix, now genuinely
// persists instead of silently no-opping — so an actorId with no
// corresponding User row fails audit_events_actor_id_fkey. Two real,
// distinct User rows are seeded here (the idempotency test needs two
// distinct actors to prove a second call doesn't switch invitedBy) — same
// pattern as beta-request-invite-atomicity.db.test.ts.
const ACTOR_ID_A = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID_B = "33333333-3333-4333-8333-333333333333";

beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.user.upsert({
    where: { id: ACTOR_ID_A },
    update: {},
    create: { id: ACTOR_ID_A, email: `beta-request-db-test-actor-a-${ACTOR_ID_A}@example.com`, updatedAt: new Date() },
  });
  await db.user.upsert({
    where: { id: ACTOR_ID_B },
    update: {},
    create: { id: ACTOR_ID_B, email: `beta-request-db-test-actor-b-${ACTOR_ID_B}@example.com`, updatedAt: new Date() },
  });
});

afterAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  if (createdIds.length > 0) {
    await db.betaRequest.deleteMany({ where: { id: { in: createdIds } } });
  }
  await db.auditEvent.deleteMany({ where: { actorId: { in: [ACTOR_ID_A, ACTOR_ID_B] } } }).catch(() => undefined);
  await db.user.deleteMany({ where: { id: { in: [ACTOR_ID_A, ACTOR_ID_B] } } }).catch(() => undefined);
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

    const actorId = ACTOR_ID_A;
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

    const firstActor = ACTOR_ID_A;
    const secondActor = ACTOR_ID_B;

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
