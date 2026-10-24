/**
 * Owner Portfolio (Module 9 Slice 2) — service-layer aggregation proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the proven domain migrations applied. Proves the portfolio service reads every
 * business in the workspace, resolves each one's condition profile, and aggregates
 * deterministically — including a business with a real finance cycle (hasData) and
 * one without (no-data, never invented). Read-only; owns no table.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-portfolio/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import type { FinancialSnapshotCreateInput } from "@/domain/owner-finance/validation";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { ownerMaterialCommitmentGuard } from "@/domain/owner-spine/owner-advice-policy";
import { getPortfolio } from "@/services/owner-portfolio/portfolio.service";

const actor = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `portfolio-test-${actor}@example.com`, name: "Portfolio Test", isActive: true, updatedAt: new Date() },
  });
});

async function newBusiness(workspaceId: string, name: string) {
  const b = await createBusiness(
    { name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

describe("[db] Owner Portfolio service", () => {
  it("[db] aggregates businesses with and without data deterministically", async () => {
    const workspaceId = randomUUID();
    const withDataId = await newBusiness(workspaceId, "Alpha");
    const noDataId = await newBusiness(workspaceId, "Bravo");

    // Give Alpha a real, distressed finance cycle so it has a condition profile.
    const snap = await createFinancialSnapshot(
      withDataId,
      {
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        currency: "INR",
        revenue: 100000,
        costOfGoodsOrServices: 70000,
        fixedCosts: 60000,
        cashOnHand: 20000,
      } satisfies FinancialSnapshotCreateInput,
      actor,
      workspaceId
    );
    await runFinanceDiagnosis(withDataId, snap.id, actor, workspaceId);

    const view = await getPortfolio(workspaceId);
    expect(view.businessCount).toBe(2);
    expect(view.hasData).toBe(true);

    const alpha = view.businesses.find((b) => b.businessId === withDataId)!;
    const bravo = view.businesses.find((b) => b.businessId === noDataId)!;
    expect(alpha.hasData).toBe(true);
    expect(alpha.financialScore).not.toBeNull();
    expect(bravo.hasData).toBe(false);
    expect(bravo.overallHealthScore).toBe(0);

    // Determinism: a second call yields an identical view (bar generatedAt).
    const again = await getPortfolio(workspaceId, { now: view.generatedAt });
    expect(JSON.stringify(again)).toEqual(JSON.stringify(view));

    await db.ownerBusiness.delete({ where: { id: withDataId } });
    await db.ownerBusiness.delete({ where: { id: noDataId } });
  });

  it("[db] investment recommendation never contradicts the business's canonical decision and is withheld on stale evidence", async () => {
    const workspaceId = randomUUID();
    const bizId = await newBusiness(workspaceId, "Alpha");
    const snap = await createFinancialSnapshot(
      bizId,
      { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", revenue: 100000, costOfGoodsOrServices: 40000, fixedCosts: 20000, cashOnHand: 90000 } satisfies FinancialSnapshotCreateInput,
      actor,
      workspaceId
    );
    await runFinanceDiagnosis(bizId, snap.id, actor, workspaceId);

    const fresh = await getPortfolio(workspaceId);
    expect(fresh.investmentAssessment).toBeDefined();
    if (fresh.investmentRecommendation) {
      const home = await getOwnerHome(workspaceId, bizId);
      expect(ownerMaterialCommitmentGuard(home.currentOwnerDecision!.advicePolicy)).toBeNull();
    }

    // Long after the evidence period every domain is out of date (canonical staleDomains): never a recommendation.
    const later = await getPortfolio(workspaceId, { now: new Date("2027-12-01T00:00:00.000Z") });
    expect(later.investmentRecommendation).toBeNull();

    await db.ownerBusiness.delete({ where: { id: bizId } });
  });

  it("[db] returns an explicit empty view for a workspace with no businesses", async () => {
    const view = await getPortfolio(randomUUID());
    expect(view.hasData).toBe(false);
    expect(view.businessCount).toBe(0);
    expect(view.ranking.mostUrgentBusinessId).toBeNull();
  });
});
