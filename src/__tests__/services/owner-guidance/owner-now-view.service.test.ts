import { describe, it, expect } from "vitest";
import {
  getOwnerNowView,
  assembleGuidanceContext,
  type GuidanceDeps,
} from "@/services/owner-guidance/owner-now-view.service";
import { IssueCategory } from "@/domain/owner-guidance/issue-priority";
import { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";

/** Build an injected fake DB with controllable latest rows + a capture of created snapshots. */
function fakeDeps(rows: {
  cash?: { cashflowState: string; dataConfidenceScore: number } | null;
  fin?: { survivalState: string; dataConfidenceScore: number } | null;
  emp?: { overburdened: boolean; utilizationPct: number } | null;
  own?: { overloaded: boolean; bottleneckRisk: boolean; dailyLoadPct: number } | null;
  cap?: { growthSafe: boolean; expansionTriggered: boolean; bottleneckUtilization: number } | null;
  prevSnapshot?: Record<string, unknown> | null;
}): { deps: GuidanceDeps; created: Record<string, unknown>[] } {
  const created: Record<string, unknown>[] = [];
  const deps: GuidanceDeps = {
    uuid: () => "00000000-0000-0000-0000-000000000001",
    db: {
      ownerCashflowCycle: { findFirst: async () => rows.cash ?? null },
      ownerFinanceCycle: { findFirst: async () => rows.fin ?? null },
      ownerEmployeeWorkloadSnapshot: { findFirst: async () => rows.emp ?? null },
      ownerWorkloadSnapshot: { findFirst: async () => rows.own ?? null },
      ownerCapacitySnapshot: { findFirst: async () => rows.cap ?? null },
      ownerGuidanceSnapshot: {
        findFirst: async () => (rows.prevSnapshot ?? null) as never,
        create: async (args: { data: Record<string, unknown> }) => { created.push(args.data); return args.data; },
      },
    },
  };
  return { deps, created };
}

describe("[module41] owner-now-view service — live context assembly", () => {
  it("derives cash danger + growth block from unsafe live states", async () => {
    const { deps } = fakeDeps({
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.8 },
      fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.8 },
      cap: { growthSafe: false, expansionTriggered: false, bottleneckUtilization: 0.9 },
    });
    const { ctx, state } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.cashSafe).toBe(false);
    expect(ctx.growthGatePassed).toBe(false);
    expect(ctx.issues.some((i) => i.category === IssueCategory.CASH_DANGER)).toBe(true);
    expect(ctx.issues.some((i) => i.category === IssueCategory.CAPACITY_BOTTLENECK)).toBe(true);
    expect(state.growthReadinessTier).toBe("STABILIZE_FIRST");
  });

  it("names smallest-useful missing data when cycles are absent", async () => {
    const { deps } = fakeDeps({ cash: null, fin: null });
    const { ctx } = await assembleGuidanceContext("ws1", null, deps);
    expect(ctx.missingCriticalData[0]).toContain("cash position");
    expect(ctx.dataConfidence).toBe("INSUFFICIENT");
  });

  it("flags staff + owner overload from snapshots", async () => {
    const { deps } = fakeDeps({
      cash: { cashflowState: "SAFE", dataConfidenceScore: 0.9 },
      fin: { survivalState: "SAFE", dataConfidenceScore: 0.9 },
      emp: { overburdened: true, utilizationPct: 130 },
      own: { overloaded: true, bottleneckRisk: false, dailyLoadPct: 120 },
    });
    const { ctx, state } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.staffOverloaded).toBe(true);
    expect(ctx.ownerOverloaded).toBe(true);
    expect(state.staffOverloadPct).toBe(130);
  });
});

describe("[module41] owner-now-view service — full payload + persistence", () => {
  it("returns top actions, avoids, beginner explanation, steps, and persists a snapshot", async () => {
    const { deps, created } = fakeDeps({
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.8 },
      fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.8 },
      emp: { overburdened: true, utilizationPct: 140 },
      cap: { growthSafe: false, expansionTriggered: true, bottleneckUtilization: 0.96 },
    });
    const out = await getOwnerNowView("ws1", "biz1", deps);

    expect(out.generatedFromLiveData).toBe(true);
    expect(out.view.topOwnerActions[0].category).toBe(IssueCategory.CASH_DANGER);
    expect(out.view.actionsToAvoid.map((a) => a.id)).toContain("avoid_growth_before_gates");
    expect(out.stepByStep[0].exactStep.length).toBeGreaterThan(20);
    expect(out.stepByStep[0].proofRequired).toBe(true);
    expect(out.beginnerExplanation.whatToDoFirst.length).toBeGreaterThan(0);
    expect(out.beginnerExplanation.whatNotToDo.length).toBeGreaterThan(0);
    // persisted exactly one snapshot, workspace-scoped
    expect(created).toHaveLength(1);
    expect(created[0].workspaceId).toBe("ws1");
    expect(created[0].businessId).toBe("biz1");
    expect(created[0].classification).toBeTruthy();
  });

  it("first run (no prior snapshot) → no spurious changes; second run detects deltas", async () => {
    // First run with a prior snapshot encoding a healthier cash state → cash worsened.
    const prev = {
      cashRunwayDays: 120, netMarginPct: 20, complaintsCount: 0, reworkCount: 0,
      capacityUtilizationPct: 50, staffOverloadPct: 60, ownerLoadPct: 50,
      churnRiskScore: 0, supplierInventoryRiskScore: 0, overdueProofCount: 0,
      outcomeChecksDue: 0, growthReadinessTier: "GROWTH_READY",
    };
    const { deps } = fakeDeps({
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.8 },
      fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.8 },
      prevSnapshot: prev,
    });
    const out = await getOwnerNowView("ws1", "biz1", deps);
    expect(out.whatChanged.some((c) => c.category === "CASH_WORSENED")).toBe(true);
    expect(out.whatChanged.some((c) => c.ownerAlert)).toBe(true);
  });

  it("no prior snapshot → empty change list (no false 'changed since last check')", async () => {
    const { deps } = fakeDeps({
      cash: { cashflowState: "SAFE", dataConfidenceScore: 0.9 },
      fin: { survivalState: "SAFE", dataConfidenceScore: 0.9 },
      cap: { growthSafe: true, expansionTriggered: false, bottleneckUtilization: 0.5 },
      prevSnapshot: null,
    });
    const out = await getOwnerNowView("ws1", "biz1", deps);
    expect(out.whatChanged).toHaveLength(0);
  });

  it("healthy live state with strong data → GUIDANCE_READY", async () => {
    const { deps } = fakeDeps({
      cash: { cashflowState: "SAFE", dataConfidenceScore: 0.9 },
      fin: { survivalState: "SAFE", dataConfidenceScore: 0.9 },
      cap: { growthSafe: true, expansionTriggered: false, bottleneckUtilization: 0.4 },
    });
    const out = await getOwnerNowView("ws1", "biz1", deps);
    expect(out.view.classification).toBe(GuidanceClassification.GUIDANCE_READY);
    expect(out.view.confidenceCapped).toBe(false);
  });
});
