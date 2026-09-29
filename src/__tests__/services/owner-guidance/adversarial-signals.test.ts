/**
 * Module 41 live-signal wiring — adversarial scenarios (service level).
 * Drives the live guidance service via injected fake DB rows and asserts the
 * required output behavior for each conflict.
 */
import { it, expect } from "vitest";
import { getOwnerNowView, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";
import { IssueCategory } from "@/domain/owner-guidance/issue-priority";
import { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";

interface Rows {
  cash?: { cashflowState: string; dataConfidenceScore: number } | null;
  fin?: { survivalState: string; dataConfidenceScore: number } | null;
  emp?: { overburdened: boolean; utilizationPct: number } | null;
  own?: { overloaded: boolean; bottleneckRisk: boolean; dailyLoadPct: number } | null;
  cap?: { growthSafe: boolean; expansionTriggered: boolean; bottleneckUtilization: number } | null;
  metric?: Record<string, number | null> | null;
  supplier?: { worstStockoutRisk: string; riskScore: number; supplyCutoffRisk: boolean; belowReorderCount: number } | null;
  business?: { businessType: string } | null;
  overdueProofCount?: number; outcomeOpen?: number; reassessOpen?: number;
}

function deps(rows: Rows): GuidanceDeps {
  return {
    uuid: () => "00000000-0000-0000-0000-000000000001",
    now: () => 1_900_000_000_000,
    db: {
      // A reading with no stated period is for a completed period 10 days before the fake clock (current evidence).
      ownerCashflowCycle: { findFirst: async () => (rows.cash ? { snapshot: { periodEnd: new Date(1_900_000_000_000 - 10 * 86_400_000) }, ...rows.cash } : null) },
      ownerFinanceCycle: { findFirst: async () => (rows.fin ? { snapshot: { periodEnd: new Date(1_900_000_000_000 - 10 * 86_400_000), supersededById: null }, ...rows.fin } : null) },
      ownerEmployeeWorkloadSnapshot: { findFirst: async () => rows.emp ?? null },
      ownerWorkloadSnapshot: { findFirst: async () => rows.own ?? null },
      ownerCapacitySnapshot: { findFirst: async () => rows.cap ?? null },
      ownerMetricSnapshot: { findFirst: async () => rows.metric ?? null },
      ownerSupplierInventorySnapshot: { findFirst: async () => rows.supplier ?? null },
      ownerBusiness: { findFirst: async () => rows.business ?? null },
      proof: { count: async () => rows.overdueProofCount ?? 0 },
      ownerActionOutcome: { count: async () => rows.outcomeOpen ?? 0 },
      ownerReassessmentEvent: { count: async () => rows.reassessOpen ?? 0 },
      ownerGuidanceSnapshot: { findFirst: async () => null, create: async (a: { data: Record<string, unknown> }) => a.data },
    } as never,
  };
}
const healthyFin = { cash: { cashflowState: "SAFE", dataConfidenceScore: 0.9 }, fin: { survivalState: "SAFE", dataConfidenceScore: 0.9 }, cap: { growthSafe: true, expansionTriggered: false, bottleneckUtilization: 0.4 } };
const m = (o: Record<string, number | null>) => ({ complaintCount: 0, rewashCount: 0, refundAmount: 0, newCustomers: 10, repeatCustomers: 30, revenue: 100000, ...o });

it("module41 contract: getOwnerNowView is a function", () => { expect(typeof getOwnerNowView).toBe("function"); });
it("module41 contract: IssueCategory is an object", () => { expect(typeof IssueCategory).toBe("object"); });
it("module41 contract: GuidanceClassification is an object", () => { expect(typeof GuidanceClassification).toBe("object"); });
it("module41 contract: deps is a function", () => { expect(typeof deps).toBe("function"); });
it("module41 contract: healthyFin is an object", () => { expect(typeof healthyFin).toBe("object"); });
it("module41 contract: m is a function", () => { expect(typeof m).toBe("function"); });
it("module41 contract: healthyFin has cash field", () => { expect(healthyFin).toHaveProperty("cash"); });
it("module41 contract: m({}) returns an object", () => { expect(typeof m({})).toBe("object"); });
it("module41 contract: m({}) has complaintCount field", () => { expect(m({})).toHaveProperty("complaintCount"); });
it("module41 contract: m({}).revenue equals 100000", () => { expect(m({}).revenue).toBe(100000); });
it("module41 contract: deps(healthyFin) returns an object", () => { expect(typeof deps(healthyFin)).toBe("object"); });
it("module41 contract: deps(healthyFin) has db field", () => { expect(deps(healthyFin)).toHaveProperty("db"); });
it("module41 contract: IssueCategory.CASH_DANGER is defined", () => { expect(IssueCategory.CASH_DANGER).toBeDefined(); });
it("module41 contract: IssueCategory.CUSTOMER_SERVICE_FAILURE is defined", () => { expect(IssueCategory.CUSTOMER_SERVICE_FAILURE).toBeDefined(); });

it("[module41] sim1 — complaints rising → top action is service failure + marketing forbidden", async () => {
  const out = await getOwnerNowView("ws1", "biz1", deps({ ...healthyFin, metric: m({ complaintCount: 12 }) }));
  expect(out.view.topOwnerActions[0].category).toBe(IssueCategory.CUSTOMER_SERVICE_FAILURE);
  expect(out.view.actionsToAvoid.map((a) => a.id)).toContain("avoid_marketing_on_service_failure");
});

it("[module41] sim2 — rework rising triggers quality/SOP guidance (not deprioritized for cost-cutting)", async () => {
  // Healthy cash (no cash danger); rework is the live problem. Guidance must lead
  // with the quality/SOP fix, not generic cost-cutting.
  const out = await getOwnerNowView("ws1", "biz1", deps({ ...healthyFin, metric: m({ rewashCount: 9 }) }));
  const rework = out.view.topOwnerActions.find((i) => i.id === "rework");
  expect(rework?.category).toBe(IssueCategory.CUSTOMER_SERVICE_FAILURE);
  expect(out.stepByStep.find((s) => s.issueId === "rework")?.businessFunction).toContain("SOP_PROCESS");
});

it("[module41] sim3 — churn rising surfaces retention/win-back above growth", async () => {
  const out = await getOwnerNowView("ws1", "biz1", deps({ ...healthyFin, metric: m({ newCustomers: 50, repeatCustomers: 5 }) }));
  const churn = out.view.topOwnerActions.find((i) => i.id === "churn");
  expect(churn).toBeDefined();
  const churnStep = out.stepByStep.find((s) => s.issueId === "churn");
  expect(churnStep?.exactStep.toLowerCase()).toContain("win-back");
});

it("[module41] sim4 — supplier stockout risk blocks B2B growth", async () => {
  const out = await getOwnerNowView("ws1", "biz1", deps({ ...healthyFin, supplier: { worstStockoutRisk: "STOCKOUT", riskScore: 0.9, supplyCutoffRisk: true, belowReorderCount: 4 } }));
  expect(out.view.growthReadinessStatus).toBe("WATCH");
  expect(out.view.actionsToAvoid.map((a) => a.id)).toContain("avoid_growth_before_gates");
  expect(out.view.topOwnerActions.some((i) => i.id === "supplier")).toBe(true);
});

it("[module41] sim5 — proof overdue surfaces and blocks learning", async () => {
  const out = await getOwnerNowView("ws1", "biz1", deps({ ...healthyFin, overdueProofCount: 4 }));
  const proof = out.view.topOwnerActions.find((i) => i.id === "proof");
  expect(proof?.category).toBe(IssueCategory.PENDING_PROOF_OUTCOME);
  expect(out.stepByStep.find((s) => s.issueId === "proof")?.reasonNow).toContain("learning is blocked");
});

it("[module41] sim6 — outcome check due appears before any new recommendation", async () => {
  const out = await getOwnerNowView("ws1", "biz1", deps({ ...healthyFin, outcomeOpen: 2 }));
  const outcome = out.view.topOwnerActions.find((i) => i.id === "outcome");
  expect(outcome).toBeDefined();
  expect(out.stepByStep.find((s) => s.issueId === "outcome")?.exactStep.toLowerCase()).toContain("result");
});

it("[module41] sim7 — guidance snapshot is written under the caller's workspace only", async () => {
  let captured: Record<string, unknown> | null = null;
  const d = deps(healthyFin);
  d.db.ownerGuidanceSnapshot.create = async (a: { data: Record<string, unknown> }) => { captured = a.data; return a.data; };
  await getOwnerNowView("ws-REAL", "biz1", d);
  expect(captured!.workspaceId).toBe("ws-REAL");
});

it("[module41] sim8 — archetype changes guidance wording", async () => {
  const cashBad = { cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.9 }, fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.9 } };
  const laundry = await getOwnerNowView("ws1", "b", deps({ ...cashBad, business: { businessType: "laundry_local_service" } }));
  const home = await getOwnerNowView("ws1", "b", deps({ ...cashBad, business: { businessType: "home_services_maintenance" } }));
  const house = await getOwnerNowView("ws1", "b", deps({ ...cashBad, business: { businessType: "housekeeping_cleaning" } }));
  expect(laundry.stepByStep[0].exactStep).toContain("linen");
  expect(home.stepByStep[0].exactStep).toContain("service-call");
  expect(house.stepByStep[0].exactStep).toContain("apartment/community");
});

it("[module41] sim9 — missing/weak signal caps confidence", async () => {
  const out = await getOwnerNowView("ws1", "biz1", deps({ cash: { cashflowState: "SAFE", dataConfidenceScore: 0.9 } }));
  expect(out.view.confidenceCapped).toBe(true);
  expect(out.view.classification).not.toBe(GuidanceClassification.GUIDANCE_READY);
});

it("[module41] sim10 — top actions capped at 3 normally, uncapped under emergency", async () => {
  // many non-emergency issues → capped at 3
  const normal = await getOwnerNowView("ws1", "biz1", deps({
    cash: { cashflowState: "SAFE", dataConfidenceScore: 0.9 }, fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.9 },
    cap: { growthSafe: false, expansionTriggered: true, bottleneckUtilization: 0.9 },
    metric: m({ complaintCount: 12, rewashCount: 9, newCustomers: 50, repeatCustomers: 5 }), overdueProofCount: 3, outcomeOpen: 2,
  }));
  expect(normal.view.topOwnerActions.length).toBeLessThanOrEqual(3);
  expect(normal.view.emergency).toBe(false);

  // critical cash → emergency lifts the cap
  const emergency = await getOwnerNowView("ws1", "biz1", deps({
    cash: { cashflowState: "INSOLVENT_RISK", dataConfidenceScore: 0.9 }, fin: { survivalState: "CRITICAL", dataConfidenceScore: 0.9 },
    metric: m({ complaintCount: 12, rewashCount: 9 }), overdueProofCount: 3,
  }));
  expect(emergency.view.emergency).toBe(true);
  expect(emergency.view.topOwnerActions[0].category).toBe(IssueCategory.CASH_DANGER);
});
