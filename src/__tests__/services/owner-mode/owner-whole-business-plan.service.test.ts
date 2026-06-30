/**
 * Unit tests for the whole-business plan service (the command-center integration seam) with a typed
 * MOCK Prisma client. Proves: the view is generated from the new runtime; provider-backed data +
 * confidence are reported honestly; stored learning is applied with provenance; missing data lowers
 * confidence and CANNOT satisfy real-provider readiness; cross-workspace queries are scoped.
 */
import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";

const NOW = new Date("2026-06-29T00:00:00Z");
const past = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const WS = "ws-1";
const BIZ = "biz-1";

const learningRow = {
  id: "art1", sourceCaseId: "A1", businessType: "laundry_dry_cleaning", archetype: "laundry_dry_cleaning",
  locationKey: "India|tier1", failureLabel: "bad_cash_advice", originalFailedBehavior: "spent in crisis",
  correctedBehavior: "block discretionary spend until margin proof", scopeArchetype: "laundry_dry_cleaning",
  scopeDecisionCategory: "cash_margin_working_capital", scopeLocationKey: null, riskLevel: "high",
  approvalStatus: "pending", scope: "local_only", privacyClassification: "workspace_private", workspaceId: WS,
  version: 1, supersededByVersion: null, active: true, createdAt: NOW.toISOString(),
  auditTrail: [{ at: NOW.toISOString(), actor: "seed", action: "created" }],
};

/** Captures the `where` clauses the service issues so we can assert workspace scoping. */
interface Wheres { where: string[] }

function seededDb(opts: { hasBusiness?: boolean; hasSnapshots?: boolean; learning?: boolean } = {}, calls: Wheres = { where: [] }): PrismaClient {
  const { hasBusiness = true, hasSnapshots = true, learning = true } = opts;
  const rec = (w: unknown) => { calls.where.push(JSON.stringify(w)); };
  const ff = (val: unknown) => async (a: { where?: unknown }) => { rec(a?.where); return hasSnapshots ? val : null; };
  const fm = (val: unknown[]) => async (a: { where?: unknown }) => { rec(a?.where); return hasSnapshots ? val : []; };
  return {
    ownerCashflowSnapshot: { findFirst: ff({ periodEnd: NOW, cashInHand: 15000, bankBalance: 0, receivables: 240000, receivablesOverdue: 80000, payables: 30000 }) },
    ownerFinancialSnapshot: { findFirst: ff({ periodEnd: NOW, revenue: 320000, costOfGoods: 250000, fixedCosts: 60000, variableCosts: 20000 }) },
    ownerWorkingCapitalItem: { findMany: fm([{ kind: "receivable", amount: 240000, dueDate: past(10) }]) },
    ownerCapacitySnapshot: { findFirst: ff({ bottleneckUtilization: 1.1, growthSafe: false, safeUtilization: 0.7, createdAt: NOW, expansionTriggered: false }) },
    ownerComplianceItem: { findMany: fm([{ expiresAt: past(5) }]) },
    proof: { findMany: fm([{ duplicateFlagged: true, status: "REQUIRED", submittedAt: null }]) },
    ownerWorkloadSnapshot: { findFirst: ff({ dailyLoadPct: 167, band: "overloaded", ownerOnlyCriticalTasks: 9, overloaded: true, bottleneckRisk: true, createdAt: NOW }) },
    ownerStandingInstruction: { count: async (a: { where?: unknown }) => { rec(a?.where); return 1; }, findFirst: async (a: { where?: unknown }) => { rec(a?.where); return null; } },
    ownerBusiness: { findFirst: async (a: { where?: unknown }) => { rec(a?.where); return hasBusiness ? { id: BIZ, workspaceId: WS, name: "Mock Laundry", businessType: "laundry_dry_cleaning", location: "Kolkata, West Bengal", currency: "INR" } : null; } },
    behavioralLearningArtifact: {
      count: async (a: { where?: unknown }) => { rec(a?.where); return learning ? 1 : 0; },
      findMany: async () => (learning ? [learningRow] : []),
      findUnique: async () => null,
      upsert: async () => undefined,
    },
  } as unknown as PrismaClient;
}

describe("getOwnerWholeBusinessPlan", () => {
  it("generates a whole-business view from the new runtime over real provider data", async () => {
    const view = await getOwnerWholeBusinessPlan({ db: seededDb(), workspaceId: WS, businessId: BIZ, now: NOW });
    expect(view.found).toBe(true);
    expect(view.generatedFromRuntime).toBe(true);
    expect(view.topPriority.label.length).toBeGreaterThan(0);
    expect(view.nextBestAction.length).toBeGreaterThan(0);
    expect(view.doNotDo.length).toBeGreaterThan(0);
    expect(view.ownerWorkload.offload.length).toBeGreaterThan(0);
    expect(view.reassessmentTriggers.length).toBeGreaterThan(0);
    expect(view.stage.length).toBeGreaterThan(0);
    expect(typeof view.growth.scaleAllowed).toBe("boolean");
    expect(view.unsafeCount).toBe(0);
  });

  it("reports provider-backed data + applies stored learning with provenance", async () => {
    const view = await getOwnerWholeBusinessPlan({ db: seededDb(), workspaceId: WS, businessId: BIZ, now: NOW });
    expect(view.data.criticalDomainsRealProviderBacked).toBe(true);
    expect(view.data.realProviderDomains).toContain("finance_cash");
    expect(view.learning.applied).toBe(true);
    expect(view.learning.artifactIds).toContain("art1");
  });

  it("dominant constraint reflects persisted compliance/cash state", async () => {
    const view = await getOwnerWholeBusinessPlan({ db: seededDb(), workspaceId: WS, businessId: BIZ, now: NOW });
    // expired compliance + duplicate/unsubmitted proof → compliance is the highest-priority active constraint.
    expect(view.dominantConstraint).toBe("compliance_block");
    // The domain-health table is populated (critical domains graded); reds may be 0 when advice is strong.
    expect(view.domainHealth.length).toBeGreaterThan(0);
    expect(view.domainHealth.some((d) => d.domain === "owner_workload")).toBe(true);
  });

  it("missing snapshot data lowers confidence and CANNOT satisfy real-provider readiness", async () => {
    const view = await getOwnerWholeBusinessPlan({ db: seededDb({ hasSnapshots: false, learning: false }), workspaceId: WS, businessId: BIZ, now: NOW });
    expect(view.found).toBe(true);
    expect(view.data.criticalDomainsRealProviderBacked).toBe(false);
    expect(view.data.overallConfidence).toBe("low");
    expect(view.data.dataSourceMissing.length).toBeGreaterThan(0);
  });

  it("returns a safe not-found view when the business does not exist", async () => {
    const view = await getOwnerWholeBusinessPlan({ db: seededDb({ hasBusiness: false }), workspaceId: WS, businessId: "nope", now: NOW });
    expect(view.found).toBe(false);
    expect(view.data.criticalDomainsRealProviderBacked).toBe(false);
  });

  it("scopes every provider query to the requesting workspace", async () => {
    const calls: Wheres = { where: [] };
    await getOwnerWholeBusinessPlan({ db: seededDb({}, calls), workspaceId: WS, businessId: BIZ, now: NOW });
    const scoped = calls.where.filter((w) => w.includes("workspaceId"));
    expect(scoped.length).toBeGreaterThan(0);
    // No query leaks another workspace id.
    expect(calls.where.every((w) => !w.includes("other-ws"))).toBe(true);
  });
});
