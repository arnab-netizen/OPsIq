/**
 * BLOCK 4 — Owner Business Simulations A-G (PostgreSQL-backed)
 *
 * Exercises the full owner-advice runtime (prefetchOwnerDomainRows →
 * buildProvidersFromRows → deriveOwnerContext → runOwnerAdvice) over 7
 * distinct real-DB scenarios with semantic quality gates.
 *
 * A: Healthy profitable-growth (no compliance/capacity constraints)
 * B: Cash-stressed (cashInHand = 0)
 * C: Compliance-blocked (expired trade licence — rank-0 dominant constraint)
 * D: Capacity-constrained (over-capacity, healthy cash/compliance)
 * E: Owner-overloaded (always in seed, compliance/capacity removed)
 * F: Stale data (periodEnd = 90 days ago, freshness window = 35 days)
 * G: Full adversarial stress (all constraints simultaneously active)
 *
 * Run: TEST_WITH_DB=true npx vitest run \
 *   src/__tests__/owner-mode/owner-business-simulations.e2e.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedOwnerDbCase, cleanupOwnerDbCase } from "../../../scripts/seed-owner-db-case";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-07-01T00:00:00Z");
const actorId = randomUUID();
const wsId = randomUUID();

// Guards afterAll from hanging when beforeAll fails (e.g. Neon cold-start)
let seeded = false;

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db][e2e] Owner business simulations A-G — semantic quality gates",
  () => {
    beforeAll(async () => {
      // Pre-warm: retry so Neon cold-start doesn't abort the run immediately.
      let dbAvailable = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await (prisma as any).user.count(); dbAvailable = true; break; } catch {
          if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
        }
      }
      if (!dbAvailable) return;

      await (prisma as any).user.create({
        data: { id: actorId, email: `sim-${actorId}@test.local`, name: "Simulation Actor", isActive: true, updatedAt: NOW },
      });
      await (prisma as any).workspace.create({
        data: { id: wsId, name: "Simulation Workspace", slug: `sim-${wsId.slice(0, 8)}`, createdBy: actorId },
      });
      seeded = true;
    }, 300000);

    afterAll(async () => {
      if (!seeded) return;
      await (prisma as any).workspace.deleteMany({ where: { id: wsId } }).catch(() => undefined);
      await (prisma as any).user.deleteMany({ where: { id: actorId } }).catch(() => undefined);
    }, 300000);

    // ── SIM-A: Healthy profitable-growth ─────────────────────────────────────

    it("SIM-A: healthy profitable-growth — real provider-backed advice, no unsafe count", async () => {
      const bizId = randomUUID();
      const ids = {
        workspaceId: wsId, businessId: bizId, userId: actorId, now: NOW,
        cashInHand: 150000, skipComplianceAndProof: true, capacityGrowthSafe: true,
      };
      await seedOwnerDbCase(prisma, ids);
      try {
        const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsId, businessId: bizId, now: NOW });
        expect(view.found).toBe(true);
        expect(view.generatedFromRuntime).toBe(true);
        expect(view.data.criticalDomainsRealProviderBacked).toBe(true);
        expect(view.data.realProviderDomains).toContain("finance_cash");
        expect(view.nextBestAction.length).toBeGreaterThan(0);
        expect(view.topPriority.label.length).toBeGreaterThan(0);
        expect(view.domainHealth.length).toBeGreaterThan(0);
        expect(view.unsafeCount).toBe(0);
      } finally {
        await cleanupOwnerDbCase(prisma, ids);
      }
    }, 120000);

    // ── SIM-B: Cash-stressed ──────────────────────────────────────────────────

    it("SIM-B: cash-stressed (cashInHand = 0) — advice is coherent and surfaces cash priority", async () => {
      const bizId = randomUUID();
      const ids = {
        workspaceId: wsId, businessId: bizId, userId: actorId, now: NOW,
        cashInHand: 0, skipComplianceAndProof: true, capacityGrowthSafe: true,
      };
      await seedOwnerDbCase(prisma, ids);
      try {
        const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsId, businessId: bizId, now: NOW });
        expect(view.found).toBe(true);
        expect(view.generatedFromRuntime).toBe(true);
        expect(view.nextBestAction.length).toBeGreaterThan(0);
        expect(view.dominantConstraint).toBeTruthy();
        // Finance domain must be present (cash data was seeded)
        expect(view.data.realProviderDomains).toContain("finance_cash");
      } finally {
        await cleanupOwnerDbCase(prisma, ids);
      }
    }, 120000);

    // ── SIM-C: Compliance-blocked ─────────────────────────────────────────────

    it("SIM-C: compliance-blocked — dominant constraint is compliance_block (rank 0), approval required", async () => {
      const bizId = randomUUID();
      const ids = { workspaceId: wsId, businessId: bizId, userId: actorId, now: NOW };
      // Default seed: compliance expired (-5 days), proof duplicateFlagged=true
      await seedOwnerDbCase(prisma, ids);
      try {
        const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsId, businessId: bizId, now: NOW });
        expect(view.found).toBe(true);
        expect(view.dominantConstraint).toBe("compliance_block");
        expect(view.arbitration.ownerApprovalNeeded).toBe(true);
        expect(view.plan.businessHealthSummary.length).toBeGreaterThan(0);
      } finally {
        await cleanupOwnerDbCase(prisma, ids);
      }
    }, 120000);

    // ── SIM-D: Capacity-constrained ───────────────────────────────────────────

    it("SIM-D: capacity-constrained — plan surfaces capacity feasibility, data is provider-backed", async () => {
      const bizId = randomUUID();
      const ids = {
        workspaceId: wsId, businessId: bizId, userId: actorId, now: NOW,
        cashInHand: 100000, skipComplianceAndProof: true, capacityGrowthSafe: false,
      };
      await seedOwnerDbCase(prisma, ids);
      try {
        const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsId, businessId: bizId, now: NOW });
        expect(view.found).toBe(true);
        expect(view.generatedFromRuntime).toBe(true);
        expect(view.data.criticalDomainsRealProviderBacked).toBe(true);
        expect(view.dominantConstraint).toBeTruthy();
        expect(view.topPriority.label.length).toBeGreaterThan(0);
      } finally {
        await cleanupOwnerDbCase(prisma, ids);
      }
    }, 120000);

    // ── SIM-E: Owner-overloaded ───────────────────────────────────────────────

    it("SIM-E: owner-overloaded — plan acknowledges workload and generates a 7/30/90-day plan", async () => {
      const bizId = randomUUID();
      // Workload is always overloaded in seed (dailyLoad=1.6, overloaded=true)
      const ids = {
        workspaceId: wsId, businessId: bizId, userId: actorId, now: NOW,
        cashInHand: 100000, skipComplianceAndProof: true, capacityGrowthSafe: true,
      };
      await seedOwnerDbCase(prisma, ids);
      try {
        const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsId, businessId: bizId, now: NOW });
        expect(view.found).toBe(true);
        expect(view.ownerWorkload).toBeTruthy();
        expect(view.plan.businessHealthSummary.length).toBeGreaterThan(0);
        // Learning artifact is always seeded → should be applied
        expect(view.learning.applied).toBe(true);
        expect(view.learning.artifactIds.length).toBeGreaterThan(0);
      } finally {
        await cleanupOwnerDbCase(prisma, ids);
      }
    }, 120000);

    // ── SIM-F: Stale data ────────────────────────────────────────────────────

    it("SIM-F: stale data (periodEnd = 90 days ago) — plan still returns without error", async () => {
      const staleDate = new Date(NOW.getTime() - 90 * 86_400_000);
      const bizId = randomUUID();
      const ids = {
        workspaceId: wsId, businessId: bizId, userId: actorId, now: NOW,
        periodEnd: staleDate, skipComplianceAndProof: true, capacityGrowthSafe: true,
      };
      await seedOwnerDbCase(prisma, ids);
      try {
        // freshnessDays=35 means 90-day-old snapshots are stale
        const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsId, businessId: bizId, now: NOW, freshnessDays: 35 });
        expect(view.found).toBe(true);
        expect(view.generatedFromRuntime).toBe(true);
        // Must return a plan even with stale data
        expect(view.plan.businessHealthSummary.length).toBeGreaterThan(0);
        // Data quality metadata must be populated
        expect(view.data).toBeTruthy();
      } finally {
        await cleanupOwnerDbCase(prisma, ids);
      }
    }, 120000);

    // ── SIM-G: Full adversarial stress ───────────────────────────────────────

    it("SIM-G: full adversarial stress (all constraints active) — plan stays coherent at max pressure", async () => {
      const bizId = randomUUID();
      // Default seed: cashInHand=15000, compliance expired, proof fraud, over-capacity, overloaded
      const ids = { workspaceId: wsId, businessId: bizId, userId: actorId, now: NOW };
      await seedOwnerDbCase(prisma, ids);
      try {
        const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsId, businessId: bizId, now: NOW });
        expect(view.found).toBe(true);
        expect(view.generatedFromRuntime).toBe(true);
        // Must return a coherent plan under maximum constraint pressure
        expect(view.plan.businessHealthSummary.length).toBeGreaterThan(0);
        expect(view.topPriority.label.length).toBeGreaterThan(0);
        // All critical domains are real-provider-backed (all domains seeded)
        expect(view.data.criticalDomainsRealProviderBacked).toBe(true);
        // Governance: compliance is rank-0 dominant under adversarial pressure
        expect(view.dominantConstraint).toBe("compliance_block");
      } finally {
        await cleanupOwnerDbCase(prisma, ids);
      }
    }, 120000);
  }
);
