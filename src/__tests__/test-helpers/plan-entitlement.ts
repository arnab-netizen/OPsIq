/**
 * DB test fixture: give workspaces a real, active plan subscription carrying the listed capability
 * keys, so services gated by entitlement.service assertCapability (e.g. createEngagement →
 * "create_engagement") run their governed path instead of failing closed with PlanLimitError.
 * This seeds real rows; it does not bypass the plan check.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

export interface PlanEntitlementFixture {
  planId: string;
  billingAccountIds: string[];
  subscriptionIds: string[];
}

export async function seedPlanEntitlement(workspaceIds: string[], capabilityKeys: string[]): Promise<PlanEntitlementFixture> {
  const now = new Date();
  const planId = randomUUID();
  await db.plan.create({ data: { id: planId, name: `Test plan ${planId.slice(0, 8)}`, priceMonthly: 0, priceYearly: 0, updatedAt: now } });
  await db.planCapability.createMany({ data: capabilityKeys.map((key) => ({ id: randomUUID(), planId, key, limit: null })) });
  const fixture: PlanEntitlementFixture = { planId, billingAccountIds: [], subscriptionIds: [] };
  for (const workspaceId of workspaceIds) {
    const billingAccountId = randomUUID();
    const subscriptionId = randomUUID();
    await db.billingAccount.create({ data: { id: billingAccountId, workspaceId, providerCustomerId: `cus_${billingAccountId}`, updatedAt: now } });
    await db.subscription.create({
      data: {
        id: subscriptionId, billingAccountId, planId, status: "active",
        currentPeriodStart: new Date(now.getTime() - 86_400_000),
        currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
        updatedAt: now,
      },
    });
    fixture.billingAccountIds.push(billingAccountId);
    fixture.subscriptionIds.push(subscriptionId);
  }
  return fixture;
}

export async function cleanupPlanEntitlement(fixture: PlanEntitlementFixture | undefined): Promise<void> {
  if (!fixture) return;
  await db.subscription.deleteMany({ where: { id: { in: fixture.subscriptionIds } } });
  await db.billingAccount.deleteMany({ where: { id: { in: fixture.billingAccountIds } } });
  await db.plan.deleteMany({ where: { id: fixture.planId } });
}
