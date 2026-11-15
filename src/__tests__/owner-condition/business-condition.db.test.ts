/**
 * Owner Command Center (Module 2 Slice 8) — Business Condition (DB-backed).
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a migrated DB. Proves
 * the rollup reads persisted finance data and surfaces a prioritized next action,
 * and that workspace isolation holds.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-condition/business-condition.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createSnapshot } from "@/services/founder-recovery/snapshot.service";
import { runCycle } from "@/services/founder-recovery/cycle.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `condition-test-${actor}@example.com`, name: "Condition Test", isActive: true, updatedAt: new Date() },
  });
});

async function seeded(workspaceId: string) {
  const b = await createBusiness(
    { name: "Condition DB Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  const snap = await createFinancialSnapshot(
    b.id,
    { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", revenue: 100000, fixedCosts: 40000, variableCosts: 40000, discountAmount: 15000, cashOnHand: 50000 },
    actor,
    workspaceId
  );
  await runFinanceDiagnosis(b.id, snap.id, actor, workspaceId);
  return b.id;
}

describe("[db] Owner Business Condition", () => {
  it("[db] rolls up the finance domain and surfaces a prioritized next action", async () => {
    const workspaceId = ws();
    const businessId = await seeded(workspaceId);

    const res = await getBusinessCondition(workspaceId, businessId);
    expect(res.hasData).toBe(true);
    expect(res.domainsWired).toContain("finance");
    expect(res.profile).not.toBeNull();
    expect(res.profile!.domainScores.some((d) => d.domain === "finance")).toBe(true);
    // The profile no longer elects a next action; the ONE main target is the canonical decision.
    expect(res.profile).not.toHaveProperty("recommendedNextAction");
    expect(res.profile!.topActions.length).toBeGreaterThan(0);
    const { getOwnerHome } = await import("@/services/owner-home/home.service");
    expect((await getOwnerHome(workspaceId, businessId)).currentOwnerDecision?.primaryTarget).toBeTruthy();
    expect(res.profile!.overallHealthScore).toBeGreaterThanOrEqual(0);
    expect(res.profile!.overallHealthScore).toBeLessThanOrEqual(100);

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("[db] rolls up BOTH finance and recovery domains for one business", async () => {
    const workspaceId = ws();
    const businessId = await seeded(workspaceId); // finance snapshot + diagnosis

    // Seed a recovery cycle for the same business (Module 1 services).
    const recSnap = await createSnapshot(
      businessId,
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", revenue: 100000, totalCosts: 95000, orderCount: 1000, newCustomers: 70, repeatCustomers: 30, deliveryCost: 12000 },
      actor,
      workspaceId
    );
    await runCycle(businessId, recSnap.id, actor, workspaceId);

    const res = await getBusinessCondition(workspaceId, businessId);
    expect(res.hasData).toBe(true);
    expect(res.domainsWired).toContain("finance");
    expect(res.domainsWired).toContain("recovery");
    expect(res.profile!.domainScores.length).toBeGreaterThanOrEqual(2);
    // The profile no longer elects a next action; the ONE main target is the canonical decision.
    expect(res.profile).not.toHaveProperty("recommendedNextAction");
    expect(res.profile!.topActions.length).toBeGreaterThan(0);
    const { getOwnerHome } = await import("@/services/owner-home/home.service");
    expect((await getOwnerHome(workspaceId, businessId)).currentOwnerDecision?.primaryTarget).toBeTruthy();

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("[db] enforces workspace isolation (foreign workspace sees no profile)", async () => {
    const workspaceId = ws();
    const businessId = await seeded(workspaceId);

    const res = await getBusinessCondition(ws(), businessId);
    expect(res.selectedBusinessId).toBeNull();
    expect(res.hasData).toBe(false);
    expect(res.profile).toBeNull();

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });
});
