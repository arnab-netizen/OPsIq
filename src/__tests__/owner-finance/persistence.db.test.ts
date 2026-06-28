/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * DB-backed persistence proof for Module 2 finance tables (Slice 5).
 *
 * Gated by the `[db]` tag → only runs under TEST_WITH_DB=true against a real
 * PostgreSQL that has the Module 2 finance migration applied. Normal `npm test`
 * skips these (vitest testNamePattern excludes `[db]`). No service layer exists
 * yet (Slice 6), so these write directly through the `db` proxy to assert the
 * schema: FKs, the unique [businessId, periodStart, periodEnd] constraint,
 * workspace-scoping columns, and the action/verification status strings.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-finance/persistence.db.test.ts
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";

async function makeBusiness(workspaceId: string) {
  const id = randomUUID();
  await db.ownerBusiness.create({
    data: {
      id,
      workspaceId,
      name: "Finance DB Test",
      businessType: "generic_local_service",
      currency: "INR",
      version: 1,
      updatedAt: new Date(),
    },
  });
  return id;
}

function snapshotData(workspaceId: string, businessId: string) {
  return {
    id: randomUUID(),
    workspaceId,
    businessId,
    periodStart: new Date("2026-04-01"),
    periodEnd: new Date("2026-04-30"),
    currency: "INR",
    businessModelType: "service",
    industryTemplate: "generic_local_service",
    revenue: 100000,
    fixedCosts: 35000,
    variableCosts: 30000,
    cashOnHand: 200000,
    dataConfidenceScore: 65,
    missingCriticalData: [] as string[],
    updatedAt: new Date(),
  };
}

describe("[db] Module 2 finance persistence", () => {
  it("[db] persists snapshot -> cycle -> finding -> action -> verification with FKs and scoping", async () => {
    const workspaceId = randomUUID();
    const businessId = await makeBusiness(workspaceId);

    const snap = await db.ownerFinancialSnapshot.create({ data: snapshotData(workspaceId, businessId) });
    expect(snap.id).toBeTruthy();
    expect(snap.workspaceId).toBe(workspaceId);
    expect(Array.isArray(snap.missingCriticalData)).toBe(true);

    const cycle = await db.ownerFinanceCycle.create({
      data: {
        id: randomUUID(), workspaceId, businessId, snapshotId: snap.id,
        sequenceNumber: 1, status: "open",
        overallHealthScore: 72, survivalRiskScore: 20, growthOpportunityScore: 30,
        dataConfidenceScore: 65, survivalState: "SAFE", generatedAt: new Date(), updatedAt: new Date(),
      },
    });

    const finding = await db.ownerFinanceFinding.create({
      data: {
        id: randomUUID(), workspaceId, businessId, cycleId: cycle.id,
        findingType: "risk", code: "FIN_DISCOUNT_LEAKAGE", title: "Discounts eroding revenue",
        summary: "x", sourceMetric: "discountLeakagePct", sourceValue: 15, threshold: 10,
        severity: "medium", confidence: 0.65, impactScore: 45, urgencyScore: 45,
        evidence: ["discountLeakagePct = 15%"], missingData: [], verificationMetric: "discountLeakagePct",
        updatedAt: new Date(),
      },
    });

    const action = await db.ownerFinanceAction.create({
      data: {
        id: randomUUID(), workspaceId, businessId, cycleId: cycle.id, findingId: finding.id,
        recommendationCode: "FINREC_REDUCE_LEAKAGE", findingCode: "FIN_DISCOUNT_LEAKAGE",
        title: "Tighten discounting", description: "Tighten discount policy", ownerRole: "owner",
        status: "proposed", priorityScore: 40, effortScore: 30, expectedImpactScore: 45,
        confidence: 0.65, verificationMetric: "discountLeakagePct", verificationMethod: "before/after",
        expectedTimeframeDays: 21, updatedAt: new Date(),
      },
    });

    const verification = await db.ownerFinanceVerification.create({
      data: {
        id: randomUUID(), workspaceId, businessId, actionId: action.id,
        verificationMetric: "discountLeakagePct", beforeValue: 15, afterValue: null,
        targetDirection: "down", status: "unverified", confidence: 0.65, evidence: [],
        updatedAt: new Date(),
      },
    });

    // Status strings persisted as expected.
    expect(action.status).toBe("proposed");
    expect(verification.status).toBe("unverified");

    // FK relations resolve.
    const cycleWithChildren = await db.ownerFinanceCycle.findUnique({
      where: { id: cycle.id },
      include: { findings: true, actions: true, snapshot: true },
    });
    expect(cycleWithChildren.snapshot.id).toBe(snap.id);
    expect(cycleWithChildren.findings.map((f: any) => f.id)).toContain(finding.id);
    expect(cycleWithChildren.actions.map((a: any) => a.id)).toContain(action.id);

    const actionWithVerifs = await db.ownerFinanceAction.findUnique({
      where: { id: action.id },
      include: { verifications: true, finding: true },
    });
    expect(actionWithVerifs.verifications.map((v: any) => v.id)).toContain(verification.id);
    expect(actionWithVerifs.finding.id).toBe(finding.id);

    // Cleanup (cascade from business removes finance children).
    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces the unique [businessId, periodStart, periodEnd] constraint", async () => {
    const workspaceId = randomUUID();
    const businessId = await makeBusiness(workspaceId);

    await db.ownerFinancialSnapshot.create({ data: snapshotData(workspaceId, businessId) });
    await expect(
      db.ownerFinancialSnapshot.create({ data: snapshotData(workspaceId, businessId) })
    ).rejects.toThrow();

    await teardownOwnerBusiness(businessId);
  });

  it("[db] cascades finance rows when the business is deleted", async () => {
    const workspaceId = randomUUID();
    const businessId = await makeBusiness(workspaceId);
    const snap = await db.ownerFinancialSnapshot.create({ data: snapshotData(workspaceId, businessId) });

    await teardownOwnerBusiness(businessId);
    const after = await db.ownerFinancialSnapshot.findUnique({ where: { id: snap.id } });
    expect(after).toBeNull();
  });
});
