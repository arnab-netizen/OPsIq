/**
 * [db]-gated chaos replay DB proof (§7, §13). Each chaos scenario is replayed in its OWN isolated
 * workspace+business through the REAL production DB runtime (`getOwnerWholeBusinessPlan`, which composes
 * the DB providers + advice runtime + supervisor summary). Each business resolves its own dominant
 * constraint and a safe supervisor disposition from REAL scoped rows; no cross-workspace / cross-business
 * leakage occurs; a faked-high-confidence or blocked-reads-proceed output cannot appear.
 *
 * Requires TEST_WITH_DB=true with migrations applied + prisma generated (postgres:16).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { seedScenarioBusiness } from "../../../../scripts/seed-owner-scenarios";
import { SCENARIOS } from "@/services/owner-mode/owner-scenario-profiles";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");

const wsA = randomUUID();
const wsB = randomUUID();
const userId = randomUUID();

// One isolated business per chaos-flavoured scenario (good/bad/ugly spread of dominant constraints).
const bizCash = randomUUID();        // wsA cash_crisis        → cash_survival (ugly: cash crisis)
const bizCompliance = randomUUID();  // wsA vendor_compliance  → compliance_block (ugly: stop/reject)
const bizOverload = randomUUID();    // wsA owner_overload     → owner_workload (bad)
const bizGrowth = randomUUID();      // wsB growth_scale       → profitable_growth (good w/ safeguards)

const knobs = (id: string) => SCENARIOS.find((s) => s.id === id)!.knobs;
const ensureWorkspace = (id: string) =>
  (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({
    where: { id }, update: {}, create: { id, name: `WS ${id}`, slug: `ws-${id}`, createdBy: userId },
  });

async function cleanupWorkspace(ws: string) {
  await prisma.ownerCapacitySnapshot.deleteMany({ where: { workspaceId: ws } });
  await prisma.ownerWorkloadSnapshot.deleteMany({ where: { workspaceId: ws } });
  await prisma.proof.deleteMany({ where: { workspaceId: ws } });
  await prisma.ownerStandingInstruction.deleteMany({ where: { workspaceId: ws } });
  await prisma.behavioralLearningArtifact.deleteMany({ where: { workspaceId: ws } });
  await prisma.ownerBusiness.deleteMany({ where: { workspaceId: ws } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] chaos replay DB isolation + supervisor safety", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: userId }, update: {}, create: { id: userId, email: `chaos-${userId}@example.com`, name: "Chaos", isActive: true, updatedAt: NOW },
    });
    await ensureWorkspace(wsA);
    await ensureWorkspace(wsB);
    await seedScenarioBusiness(prisma, wsA, userId, bizCash, "Cash crisis", knobs("cash_crisis"), NOW);
    await seedScenarioBusiness(prisma, wsA, userId, bizCompliance, "Vendor compliance", knobs("vendor_compliance"), NOW);
    await seedScenarioBusiness(prisma, wsA, userId, bizOverload, "Owner overload", knobs("owner_overload"), NOW);
    await seedScenarioBusiness(prisma, wsB, userId, bizGrowth, "Growth scale", knobs("growth_scale"), NOW);
  }, 120000);

  afterAll(async () => { await cleanupWorkspace(wsA); await cleanupWorkspace(wsB); });

  it("[db] each isolated business resolves its OWN dominant + a runtime-fed supervisor summary", async () => {
    const cash = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsA, businessId: bizCash, now: NOW });
    const compliance = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsA, businessId: bizCompliance, now: NOW });
    const overload = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsA, businessId: bizOverload, now: NOW });

    expect(cash.dominantConstraint).toBe("cash_survival");
    expect(compliance.dominantConstraint).toBe("compliance_block");
    expect(overload.dominantConstraint).toBe("owner_workload");
    for (const v of [cash, compliance, overload]) {
      expect(v.found).toBe(true);
      expect(v.generatedFromRuntime).toBe(true);
      expect(v.supervisor.found).toBe(true);
      expect(v.data.criticalDomainsRealProviderBacked).toBe(true);
    }
    // distinct dominants inside one workspace → no cross-business bleed
    expect(new Set([cash.dominantConstraint, compliance.dominantConstraint, overload.dominantConstraint]).size).toBe(3);
  });

  it("[db] the supervisor never fakes confidence and a blocked case never reads as proceed", async () => {
    for (const businessId of [bizCash, bizCompliance, bizOverload]) {
      const v = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsA, businessId, now: NOW });
      const s = v.supervisor;
      // confidence honesty
      if (!v.data.criticalDomainsAllReal) expect(s.confidence).not.toBe("high");
      // blocked / need-more-data never present as proceed
      if (s.actionStatus === "blocked" || s.actionStatus === "need_more_data") expect(s.canProceed).toBe(false);
      // a compliance/proof block carries a do-not-do and is not a clean proceed
      if (v.dominantConstraint === "compliance_block") {
        expect(s.actionStatus).toBe("blocked");
        expect(s.canProceed).toBe(false);
        expect(s.doNotDo.length).toBeGreaterThan(0);
      }
    }
  });

  it("[db] cross-workspace isolation: wsB business is unaffected and a wsA business is invisible in wsB", async () => {
    const growth = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsB, businessId: bizGrowth, now: NOW });
    expect(growth.found).toBe(true);
    expect(growth.supervisor.found).toBe(true);
    // a wsA business id queried under wsB must NOT be found (no cross-tenant leakage)
    const leak = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsB, businessId: bizCash, now: NOW });
    expect(leak.found).toBe(false);
    expect(leak.supervisor.found).toBe(false);
  });
});
