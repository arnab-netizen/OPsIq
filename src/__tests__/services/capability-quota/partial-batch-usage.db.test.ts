/**
 * Partial-batch decision:create usage accounting, against a real database.
 *
 * Root cause proven here: POST /api/run reserved N decision:create units, then addItems wrote each decision
 * in its own transaction. A failure at item k (k decisions already committed) made withCapabilityQuota
 * return ALL N units, so the k persisted decisions were never counted (under-count). The fix settles each
 * unit inside the transaction that writes its decision; only the units of unwritten items are returned.
 *
 * Failures are real database failures (a foreign-key violation at item k), not mocks.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/capability-quota/partial-batch-usage.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";
import { addDecisionItemsWithinQuota, createDecisionsBulk, type VerifiedDecisionInput } from "@/services/decisions/decision-creation-service";
import { generateOperatorItems } from "@/services/operator/generate";
import type { OperatorItem } from "@/domain/operator/types";

const KEY = "decision:create";

interface Ws {
  workspaceId: string;
  actorId: string;
}

async function usageSum(workspaceId: string): Promise<number> {
  const agg = await db.usageEvent.aggregate({ _sum: { value: true }, where: { workspaceId, key: KEY } });
  return agg._sum.value ?? 0;
}

async function persisted(workspaceId: string): Promise<number> {
  return db.operatorItem.count({ where: { workspaceId } });
}

/**
 * N engine decisions as POST /api/run builds them; item `failAt` names a creator that does not exist, so its
 * insert fails on the created_by_user_id foreign key after the items before it have committed.
 */
function runItems(ws: Ws, n: number, failAt: number | null): OperatorItem[] {
  const items = generateOperatorItems(
    Array.from({ length: n }, (_, i) => ({
      problem: `Partial batch decision ${i}`,
      action: "Reprice the low-margin tier",
      impactMultiplier: 1,
      confidence: 0.6,
      ruleId: `partial-${i}`,
    })),
    { impactLow: 800, impactExpected: 1000, impactHigh: 1200, confidenceWeight: 0.6 },
    ws.workspaceId,
    ws.actorId,
    ws.actorId
  );
  if (failAt !== null) items[failAt] = { ...items[failAt], createdBy: randomUUID() };
  return items;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] decision:create usage equals the decisions actually persisted", () => {
  const stamp = randomUUID().slice(0, 8);
  const workspaces: Ws[] = [];
  const plans: PlanEntitlementFixture[] = [];

  async function freshWorkspace(limit: number | null): Promise<Ws> {
    const workspaceId = randomUUID();
    const actorId = randomUUID();
    const n = workspaces.length;
    await db.workspace.create({ data: { id: workspaceId, name: `Partial ${n}`, slug: `partial-${n}-${stamp}` } });
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
    plans.push(await seedPlanEntitlement([workspaceId], [KEY], { [KEY]: limit }));
    const ws = { workspaceId, actorId };
    workspaces.push(ws);
    return ws;
  }

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    const ids = workspaces.map((w) => w.workspaceId);
    if (ids.length > 0) {
      await db.usageEvent.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.operatorItem.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: ids } } });
    }
    for (const p of plans) await cleanupPlanEntitlement(p);
    if (ids.length > 0) {
      await db.user.deleteMany({ where: { id: { in: workspaces.map((w) => w.actorId) } } });
      await db.workspace.deleteMany({ where: { id: { in: ids } } });
    }
  });

  for (const failAt of [0, 2, 4]) {
    it(`POST /api/run write path: a failure at item ${failAt} of 5 leaves usage == persisted decisions == ${failAt}`, async () => {
      const ws = await freshWorkspace(10);
      await expect(addDecisionItemsWithinQuota(ws.workspaceId, runItems(ws, 5, failAt))).rejects.toBeDefined();
      expect(await persisted(ws.workspaceId)).toBe(failAt);
      expect(await usageSum(ws.workspaceId)).toBe(failAt);
      // The reservation is finalized: the expiry sweep has nothing to change.
      expect(await db.usageEvent.count({ where: { workspaceId: ws.workspaceId, reservationEntry: "release" } })).toBe(1);
    });
  }

  it("POST /api/run write path: a full batch keeps every unit, and (record-only) a run past the limit is never refused", async () => {
    const ws = await freshWorkspace(6);
    await addDecisionItemsWithinQuota(ws.workspaceId, runItems(ws, 4, null));
    expect(await persisted(ws.workspaceId)).toBe(4);
    expect(await usageSum(ws.workspaceId)).toBe(4);

    // /api/run was never plan-gated: usage is recorded, the limit never produces a 402.
    await addDecisionItemsWithinQuota(ws.workspaceId, runItems(ws, 3, null));
    expect(await persisted(ws.workspaceId)).toBe(7);
    expect(await usageSum(ws.workspaceId)).toBe(7);
  });

  it("bulk create path (createDecisionsBulk): usage equals the decisions persisted when item k fails in the database or at the limit", async () => {
    const ws = await freshWorkspace(4);
    const ok = (i: number): VerifiedDecisionInput => ({
      title: `Bulk decision ${i}`,
      type: "pricing",
      impact: 1000,
      confidence: 0.5,
      verifiedActorId: ws.actorId,
      verifiedWorkspaceId: ws.workspaceId,
    });
    // Item 1 fails inside its insert transaction (created_by_user_id FK to a user that does not exist).
    const failingInDb: VerifiedDecisionInput = { ...ok(1), verifiedActorId: randomUUID() };
    const result = await createDecisionsBulk({ decisions: [ok(0), failingInDb, ok(2), ok(3), ok(4), ok(5)] });

    // Limit 4: items 0, 2, 3, 4 persist; item 1 fails in the database; item 5 is refused at the limit.
    expect(result.summary).toEqual({ total: 6, succeeded: 4, failed: 2 });
    expect(await persisted(ws.workspaceId)).toBe(4);
    expect(await usageSum(ws.workspaceId)).toBe(4);
  });
});
