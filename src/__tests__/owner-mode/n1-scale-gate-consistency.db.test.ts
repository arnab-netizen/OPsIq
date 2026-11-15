/**
 * N1 — real-Postgres proof that the legacy whole-business-plan / action-plan growth permission follows the
 * canonical owner scale gate. The fixture mirrors the #594 production AT_RISK shape: the LEGACY inputs
 * (cash, receivables, capacity, compliance) are healthy, while the persisted Finance diagnosis cycle is AT_RISK.
 *
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { seedOwnerDbCase, cleanupOwnerDbCase } from "../../../scripts/seed-owner-db-case";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import { getOwnerActionAssignment } from "@/services/owner-mode/owner-action-assignment.service";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const userId = randomUUID();
const wsMain = randomUUID();
const wsOther = randomUUID();
const BIZ = { safe: randomUUID(), atRisk: randomUUID(), noReading: randomUUID() };
const cycleIds: string[] = [];

const ensureWorkspace = (id: string) =>
  (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({
    where: { id }, update: {}, create: { id, name: `N1 WS ${id}`, slug: `n1-ws-${id}`, createdBy: userId },
  });

/** Healthy legacy inputs: positive cash, nothing overdue, safe capacity, no compliance/proof rows. */
async function seedHealthy(businessId: string): Promise<void> {
  await seedOwnerDbCase(prisma, { workspaceId: wsMain, businessId, userId, now: NOW, cashInHand: 250_000, capacityGrowthSafe: true, skipComplianceAndProof: true });
  await prisma.ownerWorkingCapitalItem.deleteMany({ where: { workspaceId: wsMain, businessId } });
  await prisma.ownerCashflowSnapshot.updateMany({ where: { workspaceId: wsMain, businessId }, data: { receivablesOverdue: 0 } });
}

async function addFinanceCycle(businessId: string, survivalState: string): Promise<void> {
  const snap = await prisma.ownerFinancialSnapshot.findFirst({ where: { workspaceId: wsMain, businessId } });
  const id = randomUUID();
  cycleIds.push(id);
  await prisma.ownerFinanceCycle.create({
    data: {
      id, workspaceId: wsMain, businessId, snapshotId: snap!.id, sequenceNumber: 1, status: "open",
      overallHealthScore: 60, survivalRiskScore: 40, growthOpportunityScore: 40, dataConfidenceScore: 90, survivalState, generatedAt: NOW,
    },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] N1 — legacy growth permission follows the canonical scale gate", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: userId }, update: {}, create: { id: userId, email: `n1-${userId}@test.local`, name: "N1", isActive: true, updatedAt: NOW },
    });
    await ensureWorkspace(wsMain);
    await ensureWorkspace(wsOther);
    await seedHealthy(BIZ.safe);
    await addFinanceCycle(BIZ.safe, "SAFE");
    await seedHealthy(BIZ.atRisk);
    await addFinanceCycle(BIZ.atRisk, "AT_RISK");
    await seedHealthy(BIZ.noReading);
  });

  afterAll(async () => {
    await prisma.ownerFinanceCycle.deleteMany({ where: { id: { in: cycleIds } } });
    for (const businessId of Object.values(BIZ)) {
      await cleanupOwnerDbCase(prisma, { workspaceId: wsMain, businessId, userId, now: NOW, skipComplianceAndProof: true });
    }
  });

  const plan = (businessId: string, workspaceId = wsMain) => getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId, now: NOW });
  const action = (businessId: string) => getOwnerActionAssignment({ db: prisma, workspaceId: wsMain, businessId, now: NOW });

  it("persisted Finance AT_RISK + healthy legacy inputs → scaleAllowed=false and no growth-spend recommendation (whole plan AND action plan)", async () => {
    const v = await plan(BIZ.atRisk);
    expect(v.found).toBe(true);
    expect(v.growth.scaleAllowed).toBe(false);
    expect(v.growth.canonicalGate.allowed).toBe(false);
    expect(v.growth.blockedBy).toContain("cash_safety_gate");
    expect(v.nextBestAction).not.toMatch(/Proceed: Spend on marketing/);
    const a = await action(BIZ.atRisk);
    expect(a.assignment?.actionTitle).toBe(v.nextBestAction);
  });

  it("persisted Finance SAFE + healthy inputs → the canonical gate permits (nothing unnecessarily blocked)", async () => {
    const v = await plan(BIZ.safe);
    expect(v.growth.canonicalGate.allowed).toBe(true);
    expect(v.growth.blockedBy.filter((b) => /_safety_gate|compliance_gate|reading_missing|unavailable/.test(b))).toEqual([]);
  });

  it("no diagnosed cash/Finance reading → scale is not affirmed (unknown is never safe)", async () => {
    const v = await plan(BIZ.noReading);
    expect(v.growth.scaleAllowed).toBe(false);
    expect(v.growth.blockedBy).toContain("cash_finance_reading_missing");
  });

  it("workspace isolation: another workspace sees no business and no growth permission", async () => {
    const v = await plan(BIZ.safe, wsOther);
    expect(v.found).toBe(false);
    expect(v.growth.scaleAllowed).toBe(false);
  });
});
