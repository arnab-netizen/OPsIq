/**
 * [db]-gated proof that the SAFE action-status spectrum is reachable AND correctly gated through the REAL
 * DB-backed `getOwnerWholeBusinessPlan` runtime (§5, §6). Seeds genuinely-healthy businesses with a
 * DELIBERATE `owner.safe-action-approved` standing instruction and proves:
 *
 *   - safe_proceed   (healthy + SOP riskClass=low)    → proceed
 *   - safe_cautious  (healthy + SOP riskClass=medium) → cautious_proceed
 *   - growth_scale   (healthy, NO SOP grant)          → owner_decision_required   (SOP gate matters)
 *   - vendor_compliance (compliance boundary, +SOP)   → blocked                   (SOP cannot bypass risk)
 *   - cash_crisis    (cash hard risk, +SOP low)       → owner_decision_required   (SOP cannot bypass risk)
 *   - missing finance/cash rows (+SOP low)            → need_more_data            (SOP cannot fake evidence)
 *
 * This is the DB counterpart to the in-process §3/§4 proofs: it shows the explicit owner grant is the ONLY
 * lever that unlocks proceed/cautious, and that every hard gate (compliance, cash, missing data) overrides
 * it. Requires TEST_WITH_DB=true with migrations applied + prisma generated (postgres:16).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { seedScenarioBusiness } from "../../../../scripts/seed-owner-scenarios";
import { SCENARIOS, SAFE_ACTION_SCENARIOS } from "@/services/owner-mode/owner-scenario-profiles";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const ws = randomUUID();
const wsOther = randomUUID();
const userId = randomUUID();

const knobsOf = (id: string) =>
  ([...SCENARIOS, ...SAFE_ACTION_SCENARIOS].find((s) => s.id === id)!.knobs);

// One business per disposition under test (distinct ids, co-seeded in one workspace → proves no bleed).
const BIZ = {
  proceed: randomUUID(),
  cautious: randomUUID(),
  ownerDecision: randomUUID(),
  blockedWithSop: randomUUID(),
  cashWithSop: randomUUID(),
  needData: randomUUID(),
};

const ensureWorkspace = (id: string) =>
  (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({
    where: { id }, update: {}, create: { id, name: `WS ${id}`, slug: `ws-${id}`, createdBy: userId },
  });

async function cleanupWorkspace(w: string) {
  await prisma.ownerCashflowSnapshot.deleteMany({ where: { workspaceId: w } });
  await prisma.ownerFinancialSnapshot.deleteMany({ where: { workspaceId: w } });
  await prisma.ownerWorkingCapitalItem.deleteMany({ where: { workspaceId: w } });
  await prisma.ownerCapacitySnapshot.deleteMany({ where: { workspaceId: w } });
  await prisma.ownerComplianceItem.deleteMany({ where: { workspaceId: w } });
  await prisma.proof.deleteMany({ where: { workspaceId: w } });
  await prisma.ownerWorkloadSnapshot.deleteMany({ where: { workspaceId: w } });
  await prisma.ownerStandingInstruction.deleteMany({ where: { workspaceId: w } });
  await prisma.behavioralLearningArtifact.deleteMany({ where: { workspaceId: w } });
  await prisma.ownerBusiness.deleteMany({ where: { workspaceId: w } });
}

const view = (workspaceId: string, businessId: string) =>
  getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId, now: NOW });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] cautious-proceed policy — all 5 statuses + hard gates (§5)", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: userId }, update: {}, create: { id: userId, email: `cpp-${userId}@example.com`, name: "CPP", isActive: true, updatedAt: NOW },
    });
    await ensureWorkspace(ws);
    await ensureWorkspace(wsOther);

    // proceed / cautious — healthy businesses WITH the deliberate explicit SOP grant (low / medium).
    await seedScenarioBusiness(prisma, ws, userId, BIZ.proceed, "Safe proceed", knobsOf("safe_proceed"), NOW, "low");
    await seedScenarioBusiness(prisma, ws, userId, BIZ.cautious, "Safe cautious", knobsOf("safe_cautious"), NOW, "medium");
    // owner_decision_required — IDENTICAL healthy business but NO SOP grant (proves the grant is the lever).
    await seedScenarioBusiness(prisma, ws, userId, BIZ.ownerDecision, "Growth (no SOP)", knobsOf("growth_scale"), NOW);
    // blocked — compliance boundary, even WITH an SOP grant (the grant must not bypass the block).
    await seedScenarioBusiness(prisma, ws, userId, BIZ.blockedWithSop, "Vendor compliance (+SOP)", knobsOf("vendor_compliance"), NOW, "low");
    // owner_decision — cash hard risk, even WITH an SOP grant (the grant must not bypass material cash risk).
    await seedScenarioBusiness(prisma, ws, userId, BIZ.cashWithSop, "Cash crisis (+SOP)", knobsOf("cash_crisis"), NOW, "low");
    // need_more_data — healthy + SOP, but finance/cash rows removed so critical evidence is missing.
    await seedScenarioBusiness(prisma, ws, userId, BIZ.needData, "Missing finance (+SOP)", knobsOf("safe_proceed"), NOW, "low");
    await prisma.ownerCashflowSnapshot.deleteMany({ where: { workspaceId: ws, businessId: BIZ.needData } });
    await prisma.ownerFinancialSnapshot.deleteMany({ where: { workspaceId: ws, businessId: BIZ.needData } });
    await prisma.ownerWorkingCapitalItem.deleteMany({ where: { workspaceId: ws, businessId: BIZ.needData } });
  }, 180000);

  afterAll(async () => { await cleanupWorkspace(ws); await cleanupWorkspace(wsOther); });

  it("[db] healthy + low-risk SOP grant → proceed", async () => {
    const v = await view(ws, BIZ.proceed);
    expect(v.found).toBe(true);
    expect(v.data.criticalDomainsRealProviderBacked).toBe(true);
    expect(v.dominantConstraint).toBe("profitable_growth");
    expect(v.supervisor.actionStatus).toBe("proceed");
    expect(v.supervisor.canProceed).toBe(true);
    // proceed never fakes evidence: proof + reassessment are still required.
    expect(v.supervisor.proofNeeded.length).toBeGreaterThan(0);
    expect(v.supervisor.cadence.reassessmentTrigger.length).toBeGreaterThan(0);
  });

  it("[db] healthy + medium-risk SOP grant → cautious_proceed", async () => {
    const v = await view(ws, BIZ.cautious);
    expect(v.dominantConstraint).toBe("profitable_growth");
    expect(v.supervisor.actionStatus).toBe("cautious_proceed");
    expect(v.supervisor.canProceed).toBe(true);
    expect(v.supervisor.proofNeeded.length).toBeGreaterThan(0);
    expect(v.supervisor.cadence.reassessmentTrigger.length).toBeGreaterThan(0);
  });

  it("[db] IDENTICAL healthy business WITHOUT an SOP grant → owner_decision_required (the grant is the only lever)", async () => {
    const v = await view(ws, BIZ.ownerDecision);
    expect(v.dominantConstraint).toBe("profitable_growth");
    expect(v.supervisor.actionStatus).toBe("owner_decision_required");
    expect(v.supervisor.canProceed).toBe(false);
  });

  it("[db] compliance boundary stays blocked even WITH an SOP grant (grant cannot bypass a block)", async () => {
    const v = await view(ws, BIZ.blockedWithSop);
    expect(v.dominantConstraint).toBe("compliance_block");
    expect(v.supervisor.actionStatus).toBe("blocked");
    expect(v.supervisor.canProceed).toBe(false);
  });

  it("[db] cash hard risk stays owner_decision even WITH an SOP grant (grant cannot bypass material cash risk)", async () => {
    const v = await view(ws, BIZ.cashWithSop);
    expect(v.dominantConstraint).toBe("cash_survival");
    expect(["owner_decision_required", "blocked"]).toContain(v.supervisor.actionStatus);
    expect(v.supervisor.canProceed).toBe(false);
  });

  it("[db] missing critical finance/cash evidence → need_more_data even WITH an SOP grant (grant cannot fake evidence)", async () => {
    const v = await view(ws, BIZ.needData);
    expect(v.data.criticalDomainsRealProviderBacked).toBe(false);
    expect(v.supervisor.actionStatus).toBe("need_more_data");
    expect(v.supervisor.canProceed).toBe(false);
    expect(v.supervisor.confidence).not.toBe("high");
  });

  it("[db] all five distinct statuses are reachable from real persisted state", async () => {
    const statuses = new Set<string>();
    for (const id of Object.values(BIZ)) {
      statuses.add((await view(ws, id)).supervisor.actionStatus);
    }
    for (const s of ["proceed", "cautious_proceed", "owner_decision_required", "blocked", "need_more_data"]) {
      expect(statuses.has(s), `status ${s} reachable`).toBe(true);
    }
  });

  it("[db] cross-workspace isolation — the proceed business is invisible (and never auto-proceeds) under another workspace", async () => {
    const leak = await view(wsOther, BIZ.proceed);
    expect(leak.found).toBe(false);
    expect(leak.supervisor.found).toBe(false);
    expect(["proceed", "cautious_proceed"]).not.toContain(leak.supervisor.actionStatus);
  });
});
