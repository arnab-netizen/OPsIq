/**
 * DEC-TEN-01 / SCHEMA-01/03 regression [db]: ClientAccount and LeadRecord are workspace-anchored.
 *
 * Before: the models had no workspaceId column while the services already wrote/filtered by it,
 * so clients/leads routes threw (schema drift) and there was no tenant anchor. Now the column
 * exists (migration 20260704120000) and cross-workspace reads/writes are blocked; creates attach
 * the server-verified workspace (services take workspaceId as a param, never a client body field).
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createClient, getClientById } from "@/services/client-account";
import { createLead, getLeadById } from "@/services/lead";

const userId = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");
const authCtx = { verifiedActorId: userId } as any;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] DEC-TEN-01 ClientAccount/LeadRecord workspace anchor", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `ten-${userId}@e.com`, name: "t", isActive: true, updatedAt: NOW } });
    for (const id of [wsA, wsB]) {
      await db.workspace.upsert({ where: { id }, update: {}, create: { id, name: `WS ${id}`, slug: `ws-${id}`, createdBy: userId } });
    }
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { OR: [{ workspaceId: wsA }, { workspaceId: wsB }] } });
    await db.leadRecord.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.clientAccount.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.idempotencyRecord.deleteMany({ where: { operationName: { in: ["client_account.create", "lead_record.create"] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  it("ClientAccount create attaches the verified workspace; cross-workspace read is blocked", async () => {
    const { id } = await createClient({ name: `Acme ${randomUUID()}` }, authCtx, wsA);
    const row = await db.clientAccount.findUnique({ where: { id } });
    expect(row?.workspaceId).toBe(wsA);

    // same-workspace read succeeds; cross-workspace read is blocked (NotFoundError)
    expect(await getClientById(id, wsA, true)).not.toBeNull();
    await expect(getClientById(id, wsB, true)).rejects.toThrow(/ClientAccount/);
    // direct DB proof of workspace scoping
    expect(await db.clientAccount.findFirst({ where: { id, workspaceId: wsB } })).toBeNull();
  });

  it("LeadRecord create attaches the verified workspace; cross-workspace read is blocked", async () => {
    const { id } = await createLead({ companyName: `Lead ${randomUUID()}` }, authCtx, wsA);
    const row = await db.leadRecord.findUnique({ where: { id } });
    expect(row?.workspaceId).toBe(wsA);

    expect(await getLeadById(id, wsA)).not.toBeNull();
    await expect(getLeadById(id, wsB)).rejects.toThrow(/LeadRecord/);
    expect(await db.leadRecord.findFirst({ where: { id, workspaceId: wsB } })).toBeNull();
  });
});
