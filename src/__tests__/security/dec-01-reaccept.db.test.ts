/**
 * DEC-01 regression [db]: an already-accepted decision cannot be re-accepted.
 *
 * Before the fix, the validator allowed status "pending" OR "in_progress" and acceptDecision
 * set "in_progress", so accepting twice re-emitted DECISION_ACCEPTED and clobbered the record.
 * Now the validator allows only "pending" and acceptDecision uses a status-guarded updateMany,
 * so a second accept is rejected and concurrent accepts race-safely to exactly one winner.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { acceptDecision } from "@/services/decision-validation/decision-acceptance.service";

const userId = randomUUID();
const ws = randomUUID();
const clientId = randomUUID();
const engagementId = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");

async function seedDecision(): Promise<string> {
  const id = randomUUID();
  await db.operatorItem.create({
    data: {
      id, workspaceId: ws, ownerUserId: userId, createdByUserId: userId,
      problem: "p", action: "a", impactExpected: 1000, impactLow: 800, impactHigh: 1200,
      confidence: 0.7, priorityScore: 10, status: "pending", updatedAt: NOW,
    },
  });
  return id;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] DEC-01 decision re-accept is blocked", () => {
  const ids: string[] = [];

  beforeEach(async () => {
    await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `dec-${userId}@e.com`, name: "d", isActive: true, updatedAt: NOW } });
    await db.workspace.upsert({ where: { id: ws }, update: {}, create: { id: ws, name: "WS dec", slug: `ws-${ws}`, createdBy: userId } });
    await db.clientAccount.upsert({ where: { id: clientId }, update: {}, create: { id: clientId, name: "c", updatedAt: NOW } });
    await db.engagement.upsert({ where: { id: engagementId }, update: {}, create: { id: engagementId, workspaceId: ws, code: `E-${engagementId.slice(0, 8)}`, title: "e", clientId, serviceTier: "standard", engagementMode: "advisory", updatedAt: NOW } });
  });

  afterEach(async () => {
    await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
    if (ids.length) await db.operatorItem.deleteMany({ where: { id: { in: ids } } });
    ids.length = 0;
  });

  afterAll(async () => {
    await db.engagement.deleteMany({ where: { id: engagementId } });
    await db.clientAccount.deleteMany({ where: { id: clientId } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  it("accepts a pending decision once, then rejects a second accept", async () => {
    const decisionId = await seedDecision();
    ids.push(decisionId);
    const input = { decisionId, engagementId, verifiedWorkspaceId: ws, verifiedActorId: userId };

    await acceptDecision(input); // pending -> in_progress
    await expect(acceptDecision(input)).rejects.toThrow(/cannot accept|no longer pending/i);

    // exactly one DECISION_ACCEPTED audit event
    const events = await db.auditEvent.findMany({ where: { workspaceId: ws, entityId: decisionId, eventName: "decision.accepted" } });
    expect(events.length).toBe(1);
  });

  it("concurrent accepts of the same decision yield exactly one success", async () => {
    const decisionId = await seedDecision();
    ids.push(decisionId);
    const input = { decisionId, engagementId, verifiedWorkspaceId: ws, verifiedActorId: userId };

    const results = await Promise.allSettled([acceptDecision(input), acceptDecision(input), acceptDecision(input)]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(1);
    const row = await db.operatorItem.findUnique({ where: { id: decisionId } });
    expect(row?.status).toBe("in_progress");
  });
});
