/**
 * Owner Home (Module 12 Slice 2) — service-layer proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with the
 * proven owner-domain migrations applied. Proves the §19 owner-home summary is built
 * from a real persisted finance diagnosis cycle (business health, danger surfaces,
 * top risks, today's required actions) and that a recorded verified improvement is
 * surfaced. Owns no table.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-home/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { updateFinanceAction } from "@/services/owner-finance/action.service";
import { recordFinanceVerification } from "@/services/owner-finance/verification.service";
import { getOwnerHome } from "@/services/owner-home/home.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `home-test-${actor}@example.com`, name: "Home Test", isActive: true, updatedAt: new Date() },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Home Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function leakySnapshot() {
  return {
    periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
    revenue: 100000, fixedCosts: 40000, variableCosts: 40000, discountAmount: 15000, cashOnHand: 50000,
  };
}

describe("[db] Owner Home service", () => {
  it("[db] builds the §19 owner-home summary from a real finance cycle", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.findings.length).toBeGreaterThan(0);

    const home = await getOwnerHome(workspaceId, businessId);
    expect(home.hasData).toBe(true);
    expect(home.domainsWired).toContain("finance");
    const s = home.summary!;
    expect(typeof s.businessHealthScore).toBe("number");
    // finance has no cashflow/sales/operations diagnosis → those dangers are unknown.
    expect(s.cashDanger.level).toBe("unknown");
    expect(s.salesDanger.level).toBe("unknown");
    // a leaky finance snapshot produces at least one risk + at least one required action.
    expect(s.top3Risks.length).toBeGreaterThan(0);
    expect(s.top3Risks.length).toBeLessThanOrEqual(3);
    expect(s.requiredActions.length).toBeGreaterThan(0);
    expect(s.requiredActions.length).toBeLessThanOrEqual(5);
    expect(s.lastVerifiedImprovement).toBeNull();

    await teardownOwnerBusiness(businessId);
  });

  it("[db] surfaces the last verified improvement after a verified action", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    await updateFinanceAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateFinanceAction(action.id, { status: "in_progress" }, actor, workspaceId);
    await recordFinanceVerification(
      action.id,
      { beforeValue: 15, afterValue: 8, targetDirection: "down", targetValue: 10 },
      actor,
      workspaceId
    );

    const home = await getOwnerHome(workspaceId, businessId);
    const last = home.summary!.lastVerifiedImprovement;
    expect(last).not.toBeNull();
    expect(last!.domain).toBe("finance");
    expect(last!.beforeValue).toBe(15);
    expect(last!.afterValue).toBe(8);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] empty business has no summary (nothing invented)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const home = await getOwnerHome(workspaceId, businessId);
    expect(home.hasData).toBe(false);
    expect(home.summary).toBeNull();
    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (cross-workspace business is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);

    // A different workspace requesting this business id falls back to its own (none) →
    // never returns the foreign business's data.
    const foreign = await getOwnerHome(ws(), businessId);
    expect(foreign.selectedBusinessId).toBeNull();
    expect(foreign.hasData).toBe(false);

    await teardownOwnerBusiness(businessId);
  });
});
