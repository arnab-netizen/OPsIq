/**
 * BILL-01 regression [db]: subscription tier must be resolved SERVER-SIDE from the
 * workspace's active subscription, never from a client-supplied x-tier header.
 *
 * resolveWorkspaceTier takes ONLY a workspaceId (no request/headers), so a client cannot
 * influence it. A workspace with no active subscription fails safe to "free" (least
 * privilege); an active enterprise plan resolves to "enterprise".
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { resolveWorkspaceTier } from "@/services/entitlement.service";

const userId = randomUUID();
const wsFree = randomUUID(); // no subscription
const wsEnt = randomUUID(); // active enterprise plan
const planId = randomUUID();
const subId = randomUUID();
const billingId = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] BILL-01 server-side tier resolution", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `bill-${userId}@e.com`, name: "b", isActive: true, updatedAt: NOW } });
    for (const id of [wsFree, wsEnt]) {
      await db.workspace.upsert({ where: { id }, update: {}, create: { id, name: `WS ${id}`, slug: `ws-${id}`, createdBy: userId } });
    }
    await db.plan.create({ data: { id: planId, name: "Enterprise", priceMonthly: 999, priceYearly: 9990, updatedAt: NOW } });
    await db.billingAccount.create({ data: { id: billingId, workspaceId: wsEnt, providerCustomerId: `cus_${billingId}`, updatedAt: NOW } });
    await db.subscription.create({
      data: {
        id: subId, billingAccountId: billingId, planId, status: "active",
        currentPeriodStart: NOW, currentPeriodEnd: new Date("2027-07-04T00:00:00Z"), updatedAt: NOW,
      },
    });
  });

  afterAll(async () => {
    await db.subscription.deleteMany({ where: { id: subId } });
    await db.billingAccount.deleteMany({ where: { id: billingId } });
    await db.plan.deleteMany({ where: { id: planId } });
    await db.workspace.deleteMany({ where: { id: { in: [wsFree, wsEnt] } } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  it("resolves 'free' (least privilege) for a workspace with no active subscription", async () => {
    expect(await resolveWorkspaceTier(wsFree)).toBe("free");
  });

  it("resolves 'enterprise' from an active enterprise subscription", async () => {
    expect(await resolveWorkspaceTier(wsEnt)).toBe("enterprise");
  });

  it("takes only a workspaceId — there is no header input to spoof", () => {
    expect(resolveWorkspaceTier.length).toBe(1);
  });
});
