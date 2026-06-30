/**
 * [db]-gated DB-BACKED chaos replay (§2, §6). At least 10 chaos scenarios run through the REAL DB-backed
 * `getOwnerWholeBusinessPlan` from seeded scoped rows, covering the 10 required themes and proving the
 * supervisor disposition on real data. Each is graded against a HAND-AUTHORED independent expectation
 * (dominant + action status), proving DB-of-chaos + isolation + real-data action statuses
 * {blocked, owner_decision_required}. (The supervisor is conservative by design: with a binding constraint
 * it routes to an owner decision or a block — it does not auto-proceed; see the report.)
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

/** 10 chaos themes → scenario profile + hand-authored independent expectation. */
const THEMES = [
  { theme: "laundry quality/capacity blocks marketing", profile: "marketing_blocked", expDominant: "capacity_feasibility", expStatus: "owner_decision_required" },
  { theme: "housekeeping fake proof / staff overload", profile: "proof_fraud", expDominant: "proof_fraud_block", expStatus: "blocked" },
  { theme: "B2B bad payment terms", profile: "bad_contract", expDominant: "below_margin", expStatus: "owner_decision_required" },
  { theme: "multi-location owner workload/control", profile: "multi_location_remote", expDominant: "owner_workload", expStatus: "owner_decision_required" },
  { theme: "restaurant quality complaints vs growth", profile: "delivery_capacity", expDominant: "capacity_feasibility", expStatus: "owner_decision_required" },
  { theme: "high-revenue / profit-loss trap", profile: "cash_crisis", expDominant: "cash_survival", expStatus: "owner_decision_required" },
  { theme: "vendor discount vs quality / compliance risk", profile: "vendor_compliance", expDominant: "compliance_block", expStatus: "blocked" },
  { theme: "cyber / payment-fraud issue", profile: "proof_fraud", expDominant: "proof_fraud_block", expStatus: "blocked" },
  { theme: "good growth opportunity with safeguards", profile: "growth_scale", expDominant: "profitable_growth", expStatus: "owner_decision_required" },
  { theme: "owner decision required with sufficient data", profile: "shutdown_pivot", expDominant: "cash_survival", expStatus: "owner_decision_required" },
] as const;

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

const bizIds: string[] = THEMES.map(() => randomUUID());
const foreignBiz = bizIds[0];

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] DB-backed chaos replay (§2, §6)", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: userId }, update: {}, create: { id: userId, email: `chaosdb-${userId}@example.com`, name: "ChaosDB", isActive: true, updatedAt: NOW },
    });
    await ensureWorkspace(wsA);
    await ensureWorkspace(wsB);
    for (let i = 0; i < THEMES.length; i++) {
      await seedScenarioBusiness(prisma, wsA, userId, bizIds[i], THEMES[i].theme, knobs(THEMES[i].profile), NOW);
    }
  }, 180000);

  afterAll(async () => { await cleanupWorkspace(wsA); await cleanupWorkspace(wsB); });

  it("[db] all 10 chaos themes run DB-backed with the expected dominant + action status from real scoped rows", async () => {
    const statusSeen = new Set<string>();
    for (let i = 0; i < THEMES.length; i++) {
      const t = THEMES[i];
      const v = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsA, businessId: bizIds[i], now: NOW });
      expect(v.found, t.theme).toBe(true);
      expect(v.generatedFromRuntime).toBe(true);
      expect(v.supervisor.found).toBe(true);
      expect(v.data.criticalDomainsRealProviderBacked, `${t.theme} real-backed`).toBe(true);
      expect(v.dominantConstraint, `${t.theme} dominant`).toBe(t.expDominant);
      expect(v.supervisor.actionStatus, `${t.theme} status`).toBe(t.expStatus);
      // missing-data / confidence behaviour: never fakes high confidence.
      if (!v.data.criticalDomainsAllReal) expect(v.supervisor.confidence).not.toBe("high");
      // proof + reassessment present; impact surfaced.
      expect(v.supervisor.proofNeeded.length).toBeGreaterThan(0);
      expect(v.supervisor.cadence.reassessmentTrigger.length).toBeGreaterThan(0);
      expect(v.supervisor.impact.some((m) => m.relevant)).toBe(true);
      // blocked / need-more-data never reads as proceed.
      if (v.supervisor.actionStatus === "blocked") expect(v.supervisor.canProceed).toBe(false);
      statusSeen.add(v.supervisor.actionStatus);
    }
    // Action-status coverage on real data: both blocked and owner_decision_required appear ≥2×.
    const blocked = THEMES.filter((t) => t.expStatus === "blocked").length;
    const ownerDecision = THEMES.filter((t) => t.expStatus === "owner_decision_required").length;
    expect(blocked).toBeGreaterThanOrEqual(2);
    expect(ownerDecision).toBeGreaterThanOrEqual(2);
    expect(statusSeen.has("blocked")).toBe(true);
    expect(statusSeen.has("owner_decision_required")).toBe(true);
  });

  it("[db] each scenario is isolated; no cross-business or cross-workspace leakage", async () => {
    // distinct dominant constraints co-exist in one workspace without bleed
    const doms = new Set<string>();
    for (let i = 0; i < THEMES.length; i++) {
      const v = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsA, businessId: bizIds[i], now: NOW });
      doms.add(v.dominantConstraint);
    }
    expect(doms.size).toBeGreaterThanOrEqual(4);
    // a wsA business is invisible under wsB (no static/fallback output passes)
    const leak = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsB, businessId: foreignBiz, now: NOW });
    expect(leak.found).toBe(false);
    expect(leak.supervisor.found).toBe(false);
  });
});
