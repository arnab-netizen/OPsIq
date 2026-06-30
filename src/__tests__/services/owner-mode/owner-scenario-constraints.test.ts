/**
 * Mock-DB proof that each representative scenario profile resolves its EXPECTED dominant constraint
 * through the full production path (`getOwnerWholeBusinessPlan` → providers + deriveOwnerContext +
 * runOwnerAdvice) and is provider-backed. De-risks the browser run: the constraints are proven at the
 * service level before any browser/seed work. No weakening — the real service does the resolving.
 */
import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import { SCENARIOS, scenarioRows } from "@/services/owner-mode/owner-scenario-profiles";

const NOW = new Date("2026-06-29T00:00:00Z");
const WS = "scenario-ws";
const BIZ = "scenario-biz";

const learningRow = {
  id: "art1", sourceCaseId: "A1", businessType: "laundry_dry_cleaning", archetype: "laundry_dry_cleaning",
  locationKey: "India|tier1", failureLabel: "bad_cash_advice", originalFailedBehavior: "spent in crisis",
  correctedBehavior: "block discretionary spend until margin proof", scopeArchetype: "laundry_dry_cleaning",
  scopeDecisionCategory: "cash_margin_working_capital", scopeLocationKey: null, riskLevel: "high",
  approvalStatus: "pending", scope: "local_only", privacyClassification: "workspace_private", workspaceId: WS,
  version: 1, supersededByVersion: null, active: true, createdAt: NOW.toISOString(),
  auditTrail: [{ at: NOW.toISOString(), actor: "seed", action: "created" }],
};

function mockDb(rows: ReturnType<typeof scenarioRows>): PrismaClient {
  return {
    ownerCashflowSnapshot: { findFirst: async () => rows.cashflow },
    ownerFinancialSnapshot: { findFirst: async () => rows.finance },
    ownerWorkingCapitalItem: { findMany: async () => rows.wcItems },
    ownerCapacitySnapshot: { findFirst: async () => rows.capacity },
    ownerComplianceItem: { findMany: async () => rows.compliance },
    proof: { findMany: async () => rows.proofs },
    ownerWorkloadSnapshot: { findFirst: async () => rows.workload },
    ownerStandingInstruction: { count: async () => rows.standingCount, findFirst: async () => null },
    ownerBusiness: { findFirst: async () => rows.business },
    behavioralLearningArtifact: { count: async () => rows.learningCount, findMany: async () => [learningRow], findUnique: async () => null, upsert: async () => undefined },
  } as unknown as PrismaClient;
}

describe("representative scenario profiles → expected dominant constraint (full service path)", () => {
  for (const s of SCENARIOS) {
    it(`[${s.id}] resolves ${s.expectedConstraint} and is provider-backed`, async () => {
      const rows = scenarioRows(s.knobs, { workspaceId: WS, businessId: BIZ, now: NOW });
      const view = await getOwnerWholeBusinessPlan({ db: mockDb(rows), workspaceId: WS, businessId: BIZ, now: NOW });
      expect(view.found).toBe(true);
      expect(view.dominantConstraint, `${s.id} expected ${s.expectedConstraint}`).toBe(s.expectedConstraint);
      expect(view.data.criticalDomainsRealProviderBacked, `${s.id} provider-backed`).toBe(true);
      expect(view.doNotDo.length).toBeGreaterThan(0);
      expect(view.nextBestAction.length).toBeGreaterThan(0);
      expect(view.ownerWorkload.offload.length).toBeGreaterThan(0);
      expect(view.proofRequired.length + view.reassessmentTriggers.length).toBeGreaterThan(0);
      expect(view.unsafeCount).toBe(0);
    });
  }

  it("exercises >= 7 distinct dominant constraints across the 10 flows", () => {
    expect(new Set(SCENARIOS.map((s) => s.expectedConstraint)).size).toBeGreaterThanOrEqual(7);
  });
});
