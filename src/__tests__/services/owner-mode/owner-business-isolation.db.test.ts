/**
 * [db]-gated proof that owner-mode data is isolated by businessId INSIDE one workspace (the businessId
 * migration). Three businesses co-seeded in ONE workspace each resolve their OWN dominant constraint with
 * no bleed; a fourth workspace sees none of them; and a business backed only by LEGACY workspace-only
 * (business_id IS NULL) capacity/workload/proof rows does NOT surface them as its real data. Also proves
 * the write paths store businessId and reject a cross-workspace businessId.
 *
 * Requires TEST_WITH_DB=true with migrations applied + prisma generated; intended for CI postgres:16.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { seedScenarioBusiness } from "../../../../scripts/seed-owner-scenarios";
import { SCENARIOS } from "@/services/owner-mode/owner-scenario-profiles";
import { prefetchOwnerDomainRows } from "@/services/owner-mode/owner-db-providers";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import { saveCapacitySnapshot } from "@/services/owner-operations/capacity-snapshot.service";
import { saveOwnerWorkloadSnapshot } from "@/services/owner-operations/owner-workload-snapshot.service";
import { recordStandingInstruction } from "@/services/owner-mode/owner-load.service";
import { BusinessScopeError } from "@/services/owner-mode/business-scope";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");

const wsA = randomUUID();
const wsB = randomUUID();
const userId = randomUUID();

const bizCash = randomUUID();          // wsA, cash_crisis      → cash_survival
const bizCompliance = randomUUID();    // wsA, vendor_compliance → compliance_block
const bizOverload = randomUUID();      // wsA, owner_overload    → owner_workload
const bizLegacy = randomUUID();        // wsA, only legacy workspace-only capacity/workload/proof
const bizGrowth = randomUUID();        // wsB, growth_scale      → profitable_growth

const knobs = (id: string) => SCENARIOS.find((s) => s.id === id)!.knobs;

async function ensureWorkspace(id: string) {
  await (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({
    where: { id }, update: {}, create: { id, name: `WS ${id}`, slug: `ws-${id}`, createdBy: userId },
  });
}

async function cleanupWorkspace(ws: string) {
  await prisma.ownerCapacitySnapshot.deleteMany({ where: { workspaceId: ws } });
  await prisma.ownerWorkloadSnapshot.deleteMany({ where: { workspaceId: ws } });
  await prisma.proof.deleteMany({ where: { workspaceId: ws } });
  await prisma.ownerStandingInstruction.deleteMany({ where: { workspaceId: ws } });
  await prisma.behavioralLearningArtifact.deleteMany({ where: { workspaceId: ws } });
  await prisma.ownerBusiness.deleteMany({ where: { workspaceId: ws } }); // cascades cashflow/finance/wc/compliance
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] owner-mode business isolation inside one workspace", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: userId }, update: {}, create: { id: userId, email: `iso-${userId}@example.com`, name: "Iso", isActive: true, updatedAt: NOW },
    });
    await ensureWorkspace(wsA);
    await ensureWorkspace(wsB);

    // Three distinct businesses in ONE workspace + one in a second workspace.
    await seedScenarioBusiness(prisma, wsA, userId, bizCash, "Cash crisis", knobs("cash_crisis"), NOW);
    await seedScenarioBusiness(prisma, wsA, userId, bizCompliance, "Vendor compliance", knobs("vendor_compliance"), NOW);
    await seedScenarioBusiness(prisma, wsA, userId, bizOverload, "Owner overload", knobs("owner_overload"), NOW);
    await seedScenarioBusiness(prisma, wsB, userId, bizGrowth, "Growth scale", knobs("growth_scale"), NOW);

    // Legacy business: a business row + business-scoped cashflow only; capacity/workload/proof are written
    // WORKSPACE-ONLY (business_id NULL), simulating pre-migration data. These must NOT back bizLegacy.
    await prisma.ownerBusiness.upsert({
      where: { id: bizLegacy }, update: {},
      create: { id: bizLegacy, workspaceId: wsA, name: "Legacy biz", businessType: "laundry_dry_cleaning", location: "Kolkata", currency: "INR", createdBy: userId },
    });
    await prisma.ownerCashflowSnapshot.create({
      data: { id: randomUUID(), workspaceId: wsA, businessId: bizLegacy, periodStart: NOW, periodEnd: NOW, currency: "INR", cashInHand: 50000, bankBalance: 0, receivables: 0, receivablesOverdue: 0, payables: 0, dataConfidenceScore: 0.8, missingCriticalData: [] },
    });
    await prisma.ownerCapacitySnapshot.create({
      data: { id: randomUUID(), workspaceId: wsA, businessId: null, currentRevenue: 100000, safeUtilization: 0.7, resources: {}, bottleneckUtilization: 1.5, growthCapacityRevenue: 0, availableBuffer: 0, expansionTriggered: true, growthSafe: false, createdAt: NOW },
    });
    await prisma.proof.create({
      data: { id: randomUUID(), workspaceId: wsA, businessId: null, proofType: "delivery", status: "ACCEPTED", duplicateFlagged: true, submittedAt: NOW, updatedAt: NOW },
    });
    await prisma.ownerWorkloadSnapshot.create({
      data: { id: randomUUID(), workspaceId: wsA, businessId: null, ownerMinutesPerDay: 600, sustainableMinutesPerDay: 360, ownerTasks: 8, ownerOnlyCriticalTasks: 9, dailyLoad: 1.67, dailyLoadPct: 167, band: "overloaded", bottleneckRisk: true, overloaded: true, recommendedPath: "delegate_with_proof", createdAt: NOW },
    });
  });

  afterAll(async () => {
    await cleanupWorkspace(wsA);
    await cleanupWorkspace(wsB);
  });

  it("[db] three co-seeded businesses each resolve their OWN dominant constraint (no bleed)", async () => {
    const cash = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsA, businessId: bizCash, now: NOW });
    const compliance = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsA, businessId: bizCompliance, now: NOW });
    const overload = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsA, businessId: bizOverload, now: NOW });

    expect(cash.dominantConstraint).toBe("cash_survival");
    expect(compliance.dominantConstraint).toBe("compliance_block");
    expect(overload.dominantConstraint).toBe("owner_workload");
    // distinct → no cross-business contamination inside one workspace
    expect(new Set([cash.dominantConstraint, compliance.dominantConstraint, overload.dominantConstraint]).size).toBe(3);
    for (const v of [cash, compliance, overload]) {
      expect(v.found).toBe(true);
      expect(v.data.criticalDomainsRealProviderBacked).toBe(true);
    }
  });

  it("[db] proof-fraud does NOT bleed: only the duplicate-proof business would block, others do not", async () => {
    // bizCompliance / bizCash / bizOverload all have a clean (non-duplicate) proof; none resolves proof_fraud_block.
    for (const businessId of [bizCash, bizCompliance, bizOverload]) {
      const v = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsA, businessId, now: NOW });
      expect(v.dominantConstraint).not.toBe("proof_fraud_block");
    }
  });

  it("[db] capacity/workload/proof reads are scoped to the business (legacy null-business rows excluded)", async () => {
    const rows = await prefetchOwnerDomainRows({ db: prisma, workspaceId: wsA, businessId: bizCash, now: NOW });
    // bizCash's OWN capacity is healthy (bottleneckUtilization 0.6) — NOT the legacy 1.5 row.
    expect(rows.capacity?.bottleneckUtilization).toBe(knobs("cash_crisis").bottleneckUtilization);
    // bizCash's OWN proof is not duplicate-flagged — the legacy duplicate proof must not appear.
    expect(rows.proofs.every((p) => p.businessId === bizCash)).toBe(true);
    expect(rows.proofs.some((p) => p.duplicateFlagged)).toBe(false);
  });

  it("[db] a business with ONLY legacy workspace-only rows is not backed by them", async () => {
    const rows = await prefetchOwnerDomainRows({ db: prisma, workspaceId: wsA, businessId: bizLegacy, now: NOW });
    // The legacy capacity/workload/proof rows have business_id NULL → excluded from this business's reads.
    expect(rows.capacity).toBeNull();
    expect(rows.workload).toBeNull();
    expect(rows.proofs.length).toBe(0);
    expect(rows.standingCount).toBe(0);
  });

  it("[db] cross-workspace isolation: wsB business is unaffected and wsA businesses are invisible in wsB", async () => {
    const growth = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsB, businessId: bizGrowth, now: NOW });
    expect(growth.dominantConstraint).toBe("profitable_growth");
    // a wsA business id queried under wsB must not be found
    const leak = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsB, businessId: bizCash, now: NOW });
    expect(leak.found).toBe(false);
  });

  it("[db] write paths store businessId and reject a cross-workspace businessId", async () => {
    // capacity write stores businessId
    await saveCapacitySnapshot(
      { workspaceId: wsA, businessId: bizCash, resources: [{ type: "machine", utilization: 0.5 }], currentRevenue: 100000 },
      { db: prisma as never, uuid: () => randomUUID() }
    );
    const caps = await prisma.ownerCapacitySnapshot.findMany({ where: { workspaceId: wsA, businessId: bizCash } });
    expect(caps.length).toBeGreaterThanOrEqual(1);
    expect(caps.every((c) => c.businessId === bizCash)).toBe(true);

    // workload write stores businessId
    await saveOwnerWorkloadSnapshot(
      { workspaceId: wsA, businessId: bizCash, ownerMinutesPerDay: 300, sustainableMinutesPerDay: 480 },
      { db: prisma as never, uuid: () => randomUUID() }
    );
    const wls = await prisma.ownerWorkloadSnapshot.findMany({ where: { workspaceId: wsA, businessId: bizCash } });
    expect(wls.some((w) => w.businessId === bizCash)).toBe(true);

    // standing instruction write stores businessId
    await recordStandingInstruction(
      { workspaceId: wsA, businessId: bizCash, actorId: userId, actorIsOwner: true, scope: "pricing.test", allowedActionTypes: ["routine_discount"], forbiddenActionTypes: [], riskClass: "low" },
      { db: prisma as never }
    );
    const si = await prisma.ownerStandingInstruction.findMany({ where: { workspaceId: wsA, businessId: bizCash, scope: "pricing.test" } });
    expect(si.some((s) => s.businessId === bizCash)).toBe(true);

    // cross-workspace businessId is rejected (bizGrowth belongs to wsB, not wsA)
    await expect(
      saveCapacitySnapshot(
        { workspaceId: wsA, businessId: bizGrowth, resources: [{ type: "machine", utilization: 0.5 }], currentRevenue: 1 },
        { db: prisma as never, uuid: () => randomUUID() }
      )
    ).rejects.toBeInstanceOf(BusinessScopeError);
  });
});
