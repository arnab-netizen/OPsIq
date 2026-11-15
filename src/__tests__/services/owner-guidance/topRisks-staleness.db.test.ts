/**
 * Home `topRisks` staleness + multi-business masquerading gap — `[db]`-gated regression proof.
 *
 * buildBusinessOperatingSystem() (owner-now-view.service.ts), which feeds Home's
 * `view.businessOperatingSystem.topRisks`, queried BusinessRiskEntry with no gate on
 * whether the workspace currently has a real, active, non-fixture business. Because
 * BusinessRiskEntry has no businessId column at all (workspace-scoped only), a workspace
 * with zero real active businesses — or whose only business was archived, or which has
 * only an acceptance/QA fixture business — still returned any risk rows it happened to
 * have. That contradicted Home's own onboarding state (which correctly says "set up your
 * business") and is exactly the defect class listBusinessRisks() in business-risk.service.ts
 * was already fixed for (see hasAnyRealBusiness in founder-recovery/business.service.ts).
 *
 * D2 (controlled-beta launch-blocker closure) tightened the gate further: live production
 * browser acceptance proved that a workspace with MORE THAN ONE real active business also
 * leaks — Home showed the same workspace-wide risk record IDs regardless of which business was
 * selected, misattributing them. The gate is now hasExactlyOneRealBusiness(): topRisks is only
 * ever populated when workspace-wide data and "the selected business's" data are provably the
 * same set (exactly one real business exists), never inferred from "beta customers probably only
 * have one business".
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-guidance/topRisks-staleness.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { createBusinessRisk as createBusinessRiskInService } from "@/services/owner-mode/business-risk.service";

/**
 * A critical risk's alert is raised in the risk's own transaction (Round 9), and an alert belongs to a real
 * workspace: the risk's workspace row is ensured first (production risks always have one).
 */
async function createBusinessRisk(input: Parameters<typeof createBusinessRiskInService>[0]) {
  await db.workspace.upsert({
    where: { id: input.workspaceId },
    update: {},
    create: { id: input.workspaceId, name: "Risk QA", slug: `risk-qa-${input.workspaceId}`, isActive: true, updatedAt: new Date() },
  });
  return createBusinessRiskInService(input);
}


const actor = randomUUID();

// Workspaces, each with a critical-severity risk row already seeded, but differing in how many
// real active businesses currently exist for that workspace:
//   wsNoBusiness    — zero OwnerBusiness rows at all
//   wsFixtureOnly   — one OwnerBusiness row, but isFixtureBusiness: true (QA fixture)
//   wsArchived      — one OwnerBusiness row, but isActive: false (archived)
//   wsReal          — one real, active, non-fixture OwnerBusiness row (control — must still see the risk)
//   wsMultiBusiness — TWO real, active, non-fixture OwnerBusiness rows (D2 — must NOT see either risk)
const wsNoBusiness = randomUUID();
const wsFixtureOnly = randomUUID();
const wsArchived = randomUUID();
const wsReal = randomUUID();
const wsMultiBusiness = randomUUID();

async function seedCriticalRisk(workspaceId: string, riskCode: string) {
  return createBusinessRisk({
    workspaceId,
    actorId: actor,
    riskCode,
    title: `Stale risk fixture for ${riskCode}`,
    category: "FINANCIAL",
    likelihood: 90,
    impact: 90,
  });
}

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `topRisks-staleness-${actor}@example.com`, name: "topRisks Staleness Test", isActive: true, updatedAt: new Date() },
  });

  await db.ownerBusiness.create({
    data: {
      id: randomUUID(), workspaceId: wsFixtureOnly, name: "Fixture-only business", businessType: "generic_local_service",
      currency: "USD", isActive: true, isFixtureBusiness: true, createdBy: actor,
    },
  });
  await db.ownerBusiness.create({
    data: {
      id: randomUUID(), workspaceId: wsArchived, name: "Archived business", businessType: "generic_local_service",
      currency: "USD", isActive: false, isFixtureBusiness: false, createdBy: actor,
    },
  });
  await db.ownerBusiness.create({
    data: {
      id: randomUUID(), workspaceId: wsReal, name: "Real active business", businessType: "generic_local_service",
      currency: "USD", isActive: true, isFixtureBusiness: false, createdBy: actor,
    },
  });
  await db.ownerBusiness.create({
    data: {
      id: randomUUID(), workspaceId: wsMultiBusiness, name: "Multi-business A", businessType: "generic_local_service",
      currency: "USD", isActive: true, isFixtureBusiness: false, createdBy: actor,
    },
  });
  await db.ownerBusiness.create({
    data: {
      id: randomUUID(), workspaceId: wsMultiBusiness, name: "Multi-business B", businessType: "generic_local_service",
      currency: "USD", isActive: true, isFixtureBusiness: false, createdBy: actor,
    },
  });

  await seedCriticalRisk(wsNoBusiness, "TOPRISK_NO_BIZ");
  await seedCriticalRisk(wsFixtureOnly, "TOPRISK_FIXTURE_ONLY");
  await seedCriticalRisk(wsArchived, "TOPRISK_ARCHIVED");
  await seedCriticalRisk(wsReal, "TOPRISK_REAL");
  await seedCriticalRisk(wsMultiBusiness, "TOPRISK_MULTI_BIZ");
});

afterAll(async () => {
  const workspaceIds = [wsNoBusiness, wsFixtureOnly, wsArchived, wsReal, wsMultiBusiness];
  await db.businessRiskEntry.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

describe("[db] Home topRisks staleness + multi-business masquerading gap — hasExactlyOneRealBusiness parity", () => {
  it("[db] returns empty topRisks for a workspace with NO OwnerBusiness row at all", async () => {
    const out = await getOwnerNowView(wsNoBusiness, null);
    expect(out.businessOperatingSystem?.topRisks ?? []).toEqual([]);
  });

  it("[db] returns empty topRisks for a workspace whose only business is a QA fixture", async () => {
    const out = await getOwnerNowView(wsFixtureOnly, null);
    expect(out.businessOperatingSystem?.topRisks ?? []).toEqual([]);
  });

  it("[db] returns empty topRisks for a workspace whose only business is archived (isActive: false)", async () => {
    const out = await getOwnerNowView(wsArchived, null);
    expect(out.businessOperatingSystem?.topRisks ?? []).toEqual([]);
  });

  it("[db] still returns the risk for a workspace with exactly one real, active, non-fixture business (control)", async () => {
    const out = await getOwnerNowView(wsReal, null);
    const risks = out.businessOperatingSystem?.topRisks ?? [];
    expect(risks.length).toBeGreaterThan(0);
    expect(risks.some((r) => r.title.includes("TOPRISK_REAL"))).toBe(true);
  });

  it("[db] D2: returns empty topRisks for a workspace with TWO real, active, non-fixture businesses — never misattributes workspace-wide risk to whichever business is selected", async () => {
    const out = await getOwnerNowView(wsMultiBusiness, null);
    expect(out.businessOperatingSystem?.topRisks ?? []).toEqual([]);
  });
});
