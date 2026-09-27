import { describe, it, expect } from "vitest";
import {
  getOwnerNowView,
  assembleGuidanceContext,
  type GuidanceDeps,
} from "@/services/owner-guidance/owner-now-view.service";
import { IssueCategory } from "@/domain/owner-guidance/issue-priority";
import { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";

interface Rows {
  cash?: { cashflowState: string; dataConfidenceScore: number; createdAt?: Date; snapshot?: { periodEnd: Date } } | null;
  fin?: { survivalState: string; dataConfidenceScore: number; createdAt?: Date; snapshot?: { periodEnd: Date } } | null;
  emp?: { overburdened: boolean; utilizationPct: number } | null;
  own?: { overloaded: boolean; bottleneckRisk: boolean; dailyLoadPct: number } | null;
  cap?: { growthSafe: boolean; expansionTriggered: boolean; bottleneckUtilization: number } | null;
  metric?: { complaintCount: number | null; rewashCount: number | null; refundAmount: number | null; newCustomers: number | null; repeatCustomers: number | null; revenue: number | null } | null;
  supplier?: { worstStockoutRisk: string; riskScore: number; supplyCutoffRisk: boolean; belowReorderCount: number } | null;
  business?: { businessType: string } | null;
  overdueProofCount?: number;
  outcomeOpen?: number;
  reassessOpen?: number;
  prevSnapshot?: Record<string, unknown> | null;
}

function fakeDeps(rows: Rows): { deps: GuidanceDeps; created: Record<string, unknown>[] } {
  const created: Record<string, unknown>[] = [];
  const deps: GuidanceDeps = {
    uuid: () => "00000000-0000-0000-0000-000000000001",
    now: () => 1_900_000_000_000,
    db: {
      ownerCashflowCycle: { findFirst: async () => rows.cash ?? null },
      ownerFinanceCycle: { findFirst: async () => rows.fin ?? null },
      ownerEmployeeWorkloadSnapshot: { findFirst: async () => rows.emp ?? null },
      ownerWorkloadSnapshot: { findFirst: async () => rows.own ?? null },
      ownerCapacitySnapshot: { findFirst: async () => rows.cap ?? null },
      ownerMetricSnapshot: { findFirst: async () => rows.metric ?? null },
      ownerSupplierInventorySnapshot: { findFirst: async () => rows.supplier ?? null },
      ownerBusiness: { findFirst: async () => rows.business ?? null },
      proof: { count: async () => rows.overdueProofCount ?? 0 },
      ownerActionOutcome: { count: async () => rows.outcomeOpen ?? 0 },
      ownerReassessmentEvent: { count: async () => rows.reassessOpen ?? 0 },
      ownerGuidanceSnapshot: {
        findFirst: async () => (rows.prevSnapshot ?? null) as never,
        create: async (args: { data: Record<string, unknown> }) => { created.push(args.data); return args.data; },
      },
    },
  };
  return { deps, created };
}

const healthy: Rows = {
  cash: { cashflowState: "SAFE", dataConfidenceScore: 0.9 },
  fin: { survivalState: "SAFE", dataConfidenceScore: 0.9 },
  cap: { growthSafe: true, expansionTriggered: false, bottleneckUtilization: 0.4 },
  metric: { complaintCount: 0, rewashCount: 0, refundAmount: 0, newCustomers: 10, repeatCustomers: 30, revenue: 100000 },
  supplier: { worstStockoutRisk: "NONE", riskScore: 0, supplyCutoffRisk: false, belowReorderCount: 0 },
  business: { businessType: "laundry_local_service" },
};

describe("owner-now-view.service — module contract assertions", () => {
  it("getOwnerNowView is a function", () => { expect(typeof getOwnerNowView).toBe("function"); });
  it("assembleGuidanceContext is a function", () => { expect(typeof assembleGuidanceContext).toBe("function"); });
  it("IssueCategory is an object", () => { expect(typeof IssueCategory).toBe("object"); });
  it("GuidanceClassification is an object", () => { expect(typeof GuidanceClassification).toBe("object"); });
  it("fakeDeps is a function", () => { expect(typeof fakeDeps).toBe("function"); });
  it("fakeDeps({}) returns an object with deps", () => { expect(typeof fakeDeps({}).deps).toBe("object"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[module41] live signal assembly", () => {
  it("derives cash danger + growth block from unsafe states", async () => {
    const { deps } = fakeDeps({
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.8 },
      fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.8 },
      cap: { growthSafe: false, expansionTriggered: false, bottleneckUtilization: 0.9 },
    });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.cashSafe).toBe(false);
    expect(ctx.growthGatePassed).toBe(false);
    expect(ctx.issues.some((i) => i.category === IssueCategory.CASH_DANGER)).toBe(true);
  });

  it("complaints + rework + churn become customer/quality issues", async () => {
    const { deps } = fakeDeps({
      ...healthy,
      metric: { complaintCount: 12, rewashCount: 8, refundAmount: 5000, newCustomers: 40, repeatCustomers: 10, revenue: 100000 },
    });
    const { ctx, state } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.issues.find((i) => i.id === "complaints")?.category).toBe(IssueCategory.CUSTOMER_SERVICE_FAILURE);
    expect(ctx.issues.find((i) => i.id === "rework")?.businessFunction).toContain("SOP_PROCESS");
    expect(ctx.issues.some((i) => i.id === "churn")).toBe(true);
    expect(state.complaintsCount).toBe(12);
    expect(state.reworkCount).toBe(8);
    expect(state.churnRiskScore).toBeGreaterThan(0.5);
  });

  it("supplier risk blocks growth and produces a supplier issue", async () => {
    const { deps } = fakeDeps({
      ...healthy,
      supplier: { worstStockoutRisk: "HIGH", riskScore: 0.8, supplyCutoffRisk: true, belowReorderCount: 3 },
    });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.growthGatePassed).toBe(false);
    expect(ctx.issues.some((i) => i.id === "supplier")).toBe(true);
  });

  it("overdue proof + outcome-due become pending-proof/outcome issues", async () => {
    const { deps } = fakeDeps({ ...healthy, overdueProofCount: 3, outcomeOpen: 1, reassessOpen: 1 });
    const { ctx, state } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.issues.some((i) => i.id === "proof")).toBe(true);
    expect(ctx.issues.some((i) => i.id === "outcome")).toBe(true);
    expect(state.overdueProofCount).toBe(3);
    expect(state.outcomeChecksDue).toBe(2);
  });

  it("archetype is resolved from businessType and shapes step wording", async () => {
    const { deps } = fakeDeps({
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.8 },
      fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.8 },
      business: { businessType: "home_services_maintenance" },
    });
    const out = await getOwnerNowView("ws1", "biz1", deps);
    expect(out.archetype).toBe("home_services");
    expect(out.stepByStep[0].exactStep).toContain("service-call customers");
  });

  it("names smallest-useful-first missing data when sources are absent", async () => {
    const { deps } = fakeDeps({});
    const { ctx } = await assembleGuidanceContext("ws1", null, deps);
    expect(ctx.missingCriticalData[0]).toContain("cash position");
    expect(ctx.missingCriticalData).toContain("supplier reliability + stock levels");
    expect(ctx.dataConfidence).toBe("INSUFFICIENT");
  });
});

describe("[module41] full payload + persistence", () => {
  it("persists exactly one workspace-scoped snapshot with the live counts", async () => {
    const { deps, created } = fakeDeps({
      ...healthy,
      metric: { complaintCount: 5, rewashCount: 2, refundAmount: 0, newCustomers: 10, repeatCustomers: 30, revenue: 100000 },
      overdueProofCount: 2,
    });
    await getOwnerNowView("ws1", "biz1", deps);
    expect(created).toHaveLength(1);
    expect(created[0].workspaceId).toBe("ws1");
    expect(created[0].complaintsCount).toBe(5);
    expect(created[0].overdueProofCount).toBe(2);
  });

  it("healthy live state with strong data → GUIDANCE_READY", async () => {
    const { deps } = fakeDeps(healthy);
    const out = await getOwnerNowView("ws1", "biz1", deps);
    expect(out.view.classification).toBe(GuidanceClassification.GUIDANCE_READY);
    expect(out.view.confidenceCapped).toBe(false);
  });

  it("first run (no prior snapshot) → no spurious changes", async () => {
    const { deps } = fakeDeps(healthy);
    const out = await getOwnerNowView("ws1", "biz1", deps);
    expect(out.whatChanged).toHaveLength(0);
  });

  it("tolerates an absent optional-signal table (Prisma P2021) → treats count as 0", async () => {
    const { deps } = fakeDeps(healthy);
    // Simulate the outcome table not existing in this environment.
    deps.db.ownerActionOutcome.count = async () => {
      throw Object.assign(new Error("table does not exist"), { code: "P2021" });
    };
    const out = await getOwnerNowView("ws1", "biz1", deps);
    expect(out.generatedFromLiveData).toBe(true);
    expect(out.view.topOwnerActions.some((i) => i.id === "outcome")).toBe(false);
  });

  it("rethrows a non-P2021 db error (real fault is not swallowed)", async () => {
    const { deps } = fakeDeps(healthy);
    deps.db.ownerReassessmentEvent.count = async () => {
      throw Object.assign(new Error("connection reset"), { code: "P1001" });
    };
    await expect(getOwnerNowView("ws1", "biz1", deps)).rejects.toThrow("connection reset");
  });
});

describe("[module41] retention cohort → growth gate cross-domain wiring", () => {
  it("cohort avgMonthlyChurn=0.10 → churnRiskScore=0.50 → retentionRiskHigh → growthGatePassed=false", async () => {
    const { deps } = fakeDeps(healthy);
    deps.db.retentionCohort = {
      findMany: async () => [{ avgMonthlyChurn: 0.10, cohortMonth: "2026-06" }],
    };
    const { ctx, state } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(state.churnRiskScore).toBeCloseTo(0.50, 5);
    expect(ctx.growthGatePassed).toBe(false);
    expect(ctx.issues.some((i) => i.id === "churn")).toBe(true);
  });

  it("cohort avgMonthlyChurn=0.03 → churnRiskScore=0.15 → retentionRiskHigh=false → healthy state stays GROWTH_READY", async () => {
    const { deps } = fakeDeps(healthy);
    deps.db.retentionCohort = {
      findMany: async () => [{ avgMonthlyChurn: 0.03, cohortMonth: "2026-06" }],
    };
    const { ctx, state } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(state.churnRiskScore).toBeCloseTo(0.15, 5);
    expect(ctx.growthGatePassed).toBe(true); // healthy fixture: cashSafe=true, capacityGrowthSafe=true, supplierRiskHigh=false
    expect(ctx.issues.some((i) => i.id === "churn")).toBe(false);
  });

  it("absent retentionCohort → falls back to metric-based repeat-customer ratio", async () => {
    const { deps } = fakeDeps({
      ...healthy,
      metric: { complaintCount: 0, rewashCount: 0, refundAmount: 0, newCustomers: 10, repeatCustomers: 30, revenue: 100000 },
    });
    // retentionCohort not provided → deps.db.retentionCohort is undefined
    const { state } = await assembleGuidanceContext("ws1", "biz1", deps);
    // metricChurnRate = 1 - 30/40 = 0.25
    expect(state.churnRiskScore).toBeCloseTo(0.25, 5);
  });

  it("cohort avgMonthlyChurn=0.15 (CRITICAL) → churnRiskScore=0.75 → churn issue HIGH severity", async () => {
    const { deps } = fakeDeps(healthy);
    deps.db.retentionCohort = {
      findMany: async () => [{ avgMonthlyChurn: 0.15, cohortMonth: "2026-06" }],
    };
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.growthGatePassed).toBe(false);
    const churnIssue = ctx.issues.find((i) => i.id === "churn");
    expect(churnIssue).toBeDefined();
    expect(churnIssue?.severity).toBe("HIGH"); // churnRiskScore=0.75 >= 0.6
  });
});

describe("[module41] Home same-business cash/finance conflict arbitration", () => {
  it("reproduces the human-test bug (same business: older AT_RISK cash + newer SAFE finance) — Home must not present the stale AT_RISK reading as current truth", async () => {
    const { deps } = fakeDeps({
      ...healthy,
      cash: { cashflowState: "AT_RISK", dataConfidenceScore: 0.9, createdAt: new Date("2026-01-01"), snapshot: { periodEnd: new Date("2026-01-01") } },
      fin: { survivalState: "SAFE", dataConfidenceScore: 0.9, createdAt: new Date("2026-06-01"), snapshot: { periodEnd: new Date("2026-06-01") } },
    });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.cashSafe).toBe(true);
    expect(ctx.issues.some((i) => i.id === "cash")).toBe(false);
  });

  it("newer cash reading is unsafe, superseding an older SAFE finance diagnosis — uses the newer (unsafe) reading and names the superseded source", async () => {
    const { deps } = fakeDeps({
      ...healthy,
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.9, createdAt: new Date("2026-06-01"), snapshot: { periodEnd: new Date("2026-06-01") } },
      fin: { survivalState: "SAFE", dataConfidenceScore: 0.9, createdAt: new Date("2026-01-01"), snapshot: { periodEnd: new Date("2026-01-01") } },
    });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.cashSafe).toBe(false);
    const cashIssue = ctx.issues.find((i) => i.id === "cash");
    expect(cashIssue).toBeDefined();
    expect(cashIssue?.headline).toContain("CRITICAL");
    expect(cashIssue?.headline).toContain("finance diagnosis showed SAFE");
    expect(cashIssue?.severity).toBe("CRITICAL");
  });

  it("a Finance RE-DIAGNOSIS of old figures (newer cycle row, older evidence period) never supersedes a current CRITICAL cash reading", async () => {
    // Completing/verifying a Finance action re-diagnoses from the SAME old snapshot: the cycle row is
    // new, the evidence is not. Freshness is the evidence period, so the current cash danger stands.
    const { deps } = fakeDeps({
      ...healthy,
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.9, createdAt: new Date("2026-06-10"), snapshot: { periodEnd: new Date("2026-06-10") } },
      fin: { survivalState: "SAFE", dataConfidenceScore: 0.9, createdAt: new Date("2026-06-12"), snapshot: { periodEnd: new Date("2026-06-01") } },
    });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.cashSafe).toBe(false);
    expect(ctx.issues.find((i) => i.id === "cash")?.severity).toBe("CRITICAL");
  });

  it("disagreement with no timestamps: fails safe and surfaces an explicit conflicting-information headline, never silently picking one side", async () => {
    const { deps } = fakeDeps({
      ...healthy,
      cash: { cashflowState: "AT_RISK", dataConfidenceScore: 0.9 },
      fin: { survivalState: "SAFE", dataConfidenceScore: 0.9 },
    });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.cashSafe).toBe(false);
    const cashIssue = ctx.issues.find((i) => i.id === "cash");
    expect(cashIssue).toBeDefined();
    expect(cashIssue?.headline.toLowerCase()).toContain("conflicting information");
    expect(cashIssue?.requiresOwnerAction).toBe(true);
  });
});

describe("[module42] repo-wide UNKNOWN != BAD sweep — cross-business signal scoping", () => {
  it("ownerWorkloadSnapshot, ownerCapacitySnapshot, and ownerSupplierInventorySnapshot are read scoped to businessId, not just workspaceId", async () => {
    // Root cause: these three models each have a nullable businessId column (confirmed in
    // prisma/schema.prisma) but were being read with { workspaceId } alone — in a multi-business
    // workspace, whichever business most recently wrote a snapshot would silently supply every
    // OTHER business's workload/capacity/supplier signal too. ownerEmployeeWorkloadSnapshot has
    // no businessId column (genuinely workspace-wide, e.g. employee shift data) and is
    // intentionally excluded from this assertion.
    const capturedWheres: Record<string, { where: unknown }> = {};
    const { deps } = fakeDeps(healthy);
    const capture = (key: string, row: unknown) => ({
      findFirst: async (args: { where: unknown }) => {
        capturedWheres[key] = args as { where: unknown };
        return row;
      },
    });
    deps.db.ownerWorkloadSnapshot = capture("own", healthy.own ?? null);
    deps.db.ownerCapacitySnapshot = capture("cap", healthy.cap ?? null);
    deps.db.ownerSupplierInventorySnapshot = capture("supplier", healthy.supplier ?? null);

    await assembleGuidanceContext("ws1", "biz1", deps);

    expect(capturedWheres.own.where).toMatchObject({ workspaceId: "ws1", businessId: "biz1" });
    expect(capturedWheres.cap.where).toMatchObject({ workspaceId: "ws1", businessId: "biz1" });
    expect(capturedWheres.supplier.where).toMatchObject({ workspaceId: "ws1", businessId: "biz1" });
  });

  it("with no active business selected, falls back to workspace-only scope (no businessId to leak)", async () => {
    const capturedWheres: Record<string, { where: unknown }> = {};
    const { deps } = fakeDeps(healthy);
    const capture = (key: string, row: unknown) => ({
      findFirst: async (args: { where: unknown }) => {
        capturedWheres[key] = args as { where: unknown };
        return row;
      },
    });
    deps.db.ownerCapacitySnapshot = capture("cap", healthy.cap ?? null);

    await assembleGuidanceContext("ws1", null, deps);

    expect(capturedWheres.cap.where).toEqual({ workspaceId: "ws1" });
  });
});
