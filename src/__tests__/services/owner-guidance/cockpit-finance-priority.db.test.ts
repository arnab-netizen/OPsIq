/**
 * Cockpit ↔ Finance-diagnosis priority bridge — LIVE DB proof (F3, TEST_WITH_DB=true).
 *
 * Proves against a real Postgres:
 *  1. A workspace with exactly ONE business surfaces that business's latest fresh Finance-cycle top
 *     action (the unambiguous, no-selector-needed case documented in
 *     cockpit-finance-priority.service.ts).
 *  2. Cross-business isolation, matching the rigor PR #381 established for /owner/now
 *     (`scope = businessId ? {workspaceId,businessId} : {workspaceId}`): with an explicit businessId,
 *     ONLY that business's cycle is ever read — a second business's cycle in the SAME workspace never
 *     leaks onto it, and vice versa.
 *  3. With no explicit businessId AND two or more businesses in the workspace, the bridge fails
 *     CLOSED (returns null) rather than guessing business[0] — the exact cross-business leak class
 *     this task calls out.
 *  4. A stale cycle (older than the freshness window) is not surfaced as current.
 *  5. No cycle at all → null (no fabrication).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getCockpitFinancePriority } from "@/services/owner-guidance/cockpit-finance-priority.service";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-30T00:00:00Z");

async function seedFinanceCycle(opts: {
  workspaceId: string;
  businessId: string;
  userId: string;
  sequenceNumber: number;
  generatedAt: Date;
  actionTitle: string;
}) {
  const snapshotId = randomUUID();
  await prisma.ownerFinancialSnapshot.create({
    data: {
      id: snapshotId,
      workspaceId: opts.workspaceId,
      businessId: opts.businessId,
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-31"),
      currency: "USD",
      revenue: 100000,
      dataConfidenceScore: 0.8,
      missingCriticalData: [],
    },
  });
  const cycleId = randomUUID();
  await prisma.ownerFinanceCycle.create({
    data: {
      id: cycleId,
      workspaceId: opts.workspaceId,
      businessId: opts.businessId,
      snapshotId,
      sequenceNumber: opts.sequenceNumber,
      status: "open",
      overallHealthScore: 60,
      survivalRiskScore: 30,
      growthOpportunityScore: 40,
      dataConfidenceScore: 0.8,
      survivalState: "WATCH",
      generatedAt: opts.generatedAt,
    },
  });
  await prisma.ownerFinanceAction.create({
    data: {
      id: randomUUID(),
      workspaceId: opts.workspaceId,
      businessId: opts.businessId,
      cycleId,
      recommendationCode: "TEST_ACTION",
      findingCode: "TEST_FINDING",
      title: opts.actionTitle,
      description: "Test finance action description.",
      ownerRole: "owner",
      status: "proposed",
      priorityScore: 90,
      effortScore: 20,
      expectedImpactScore: 80,
      confidence: 0.8,
      verificationMetric: "revenue",
      verificationMethod: "manual",
      expectedTimeframeDays: 30,
    },
  });
  return { snapshotId, cycleId };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] cockpit finance priority — F3", () => {
  const userId = randomUUID();
  const singleBizWorkspaceId = randomUUID();
  const singleBizId = randomUUID();

  const multiBizWorkspaceId = randomUUID();
  const bizAId = randomUUID();
  const bizBId = randomUUID();

  const staleWorkspaceId = randomUUID();
  const staleBizId = randomUUID();

  const emptyWorkspaceId = randomUUID();
  const emptyBizId = randomUUID();

  const workspaceIds = [singleBizWorkspaceId, multiBizWorkspaceId, staleWorkspaceId, emptyWorkspaceId];

  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, email: `cockpit-fp-${userId}@example.com`, name: "Owner", isActive: true, updatedAt: NOW } });
    for (const wsId of workspaceIds) {
      await prisma.workspace.create({ data: { id: wsId, name: `WS ${wsId}`, slug: `ws-${wsId}`, createdBy: userId } });
    }

    // Case 1: single-business workspace with a fresh cycle.
    await prisma.ownerBusiness.create({ data: { id: singleBizId, workspaceId: singleBizWorkspaceId, name: "Single Biz", businessType: "generic_local_service", currency: "USD", createdBy: userId } });
    await seedFinanceCycle({ workspaceId: singleBizWorkspaceId, businessId: singleBizId, userId, sequenceNumber: 1, generatedAt: NOW, actionTitle: "Fix single-biz margin" });

    // Case 2: two-business workspace, each with its OWN fresh cycle (cross-business isolation).
    await prisma.ownerBusiness.create({ data: { id: bizAId, workspaceId: multiBizWorkspaceId, name: "Biz A", businessType: "generic_local_service", currency: "USD", createdBy: userId } });
    await prisma.ownerBusiness.create({ data: { id: bizBId, workspaceId: multiBizWorkspaceId, name: "Biz B", businessType: "generic_local_service", currency: "USD", createdBy: userId } });
    await seedFinanceCycle({ workspaceId: multiBizWorkspaceId, businessId: bizAId, userId, sequenceNumber: 1, generatedAt: NOW, actionTitle: "Fix Business A cash flow" });
    await seedFinanceCycle({ workspaceId: multiBizWorkspaceId, businessId: bizBId, userId, sequenceNumber: 1, generatedAt: NOW, actionTitle: "Fix Business B pricing" });

    // Case 3: single-business workspace with a STALE cycle only.
    await prisma.ownerBusiness.create({ data: { id: staleBizId, workspaceId: staleWorkspaceId, name: "Stale Biz", businessType: "generic_local_service", currency: "USD", createdBy: userId } });
    const staleDate = new Date(NOW.getTime() - 90 * 86_400_000); // 90 days ago, past the 35-day default window
    await seedFinanceCycle({ workspaceId: staleWorkspaceId, businessId: staleBizId, userId, sequenceNumber: 1, generatedAt: staleDate, actionTitle: "Old stale action" });

    // Case 4: single-business workspace with NO cycle at all.
    await prisma.ownerBusiness.create({ data: { id: emptyBizId, workspaceId: emptyWorkspaceId, name: "Empty Biz", businessType: "generic_local_service", currency: "USD", createdBy: userId } });
  });

  afterAll(async () => {
    await prisma.ownerFinanceAction.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.ownerFinanceFinding.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.ownerFinanceCycle.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.ownerFinancialSnapshot.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.ownerBusiness.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("[db] single-business workspace surfaces its own fresh top action with no businessId given", async () => {
    const result = await getCockpitFinancePriority(singleBizWorkspaceId, null, NOW);
    expect(result).not.toBeNull();
    expect(result!.businessId).toBe(singleBizId);
    expect(result!.topAction?.title).toBe("Fix single-biz margin");
  });

  it("[db] multi-business workspace with NO explicit businessId fails CLOSED (never guesses business[0])", async () => {
    const result = await getCockpitFinancePriority(multiBizWorkspaceId, null, NOW);
    expect(result).toBeNull();
  });

  it("[db] multi-business workspace with an explicit businessId returns ONLY that business's action — never the other business's", async () => {
    const forA = await getCockpitFinancePriority(multiBizWorkspaceId, bizAId, NOW);
    expect(forA).not.toBeNull();
    expect(forA!.businessId).toBe(bizAId);
    expect(forA!.topAction?.title).toBe("Fix Business A cash flow");
    expect(forA!.topAction?.title).not.toBe("Fix Business B pricing");

    const forB = await getCockpitFinancePriority(multiBizWorkspaceId, bizBId, NOW);
    expect(forB).not.toBeNull();
    expect(forB!.businessId).toBe(bizBId);
    expect(forB!.topAction?.title).toBe("Fix Business B pricing");
    expect(forB!.topAction?.title).not.toBe("Fix Business A cash flow");
  });

  it("[db] a stale cycle (past the freshness window) is not surfaced as current", async () => {
    const result = await getCockpitFinancePriority(staleWorkspaceId, null, NOW);
    expect(result).toBeNull();
  });

  it("[db] no cycle at all returns null — never fabricated", async () => {
    const result = await getCockpitFinancePriority(emptyWorkspaceId, emptyBizId, NOW);
    expect(result).toBeNull();
  });
});
