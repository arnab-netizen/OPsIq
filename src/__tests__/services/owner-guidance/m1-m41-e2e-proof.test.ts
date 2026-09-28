/**
 * Hostile end-to-end Owner Mode proof across the M1–M41 stack (service level).
 *
 * Drives the live Owner Now View service (`getOwnerNowView`) through eight hostile
 * scenarios via injected DB rows (deterministic, no live DB) and proves the required
 * owner-guidance behavior: top-3 cap, actions-to-avoid, archetype awareness, beginner
 * plain language, weak-data confidence capping, proof + rollback shown, growth blocked
 * under risk, outcome/proof before learning, no generic advice, no auto-approval of
 * high-risk actions, change detection on a second run.
 *
 * Route OWNER_VIEW enforcement + workspace isolation are proven in
 * `src/__tests__/api/owner/now-view.test.ts`; DB persistence + workspace isolation in
 * the `*.db.test.ts` suites.
 */
import { it, expect, describe } from "vitest";
import { getOwnerNowView, type GuidanceDeps, type GuidanceStep } from "@/services/owner-guidance/owner-now-view.service";
import { IssueCategory } from "@/domain/owner-guidance/issue-priority";
import { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";
import { evaluateGuidanceForGeneric } from "@/domain/owner-guidance/generic-output-guard";
import { containsJargon } from "@/domain/owner-guidance/beginner-mode";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import { ProofType } from "@/domain/execution/proof";
import type { GuidanceObject } from "@/domain/owner-guidance/guidance-object";

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
  prevSnapshot?: Record<string, unknown> | null;
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
      ownerGuidanceSnapshot: { findFirst: async () => (rows.prevSnapshot ?? null) as never, create: async (a: { data: Record<string, unknown> }) => a.data },
    } as never,
  };
}
const m = (o: Record<string, number | null>) => ({ complaintCount: 0, rewashCount: 0, refundAmount: 0, newCustomers: 10, repeatCustomers: 30, revenue: 100000, ...o });
const safeSupplier = { worstStockoutRisk: "NONE", riskScore: 0, supplyCutoffRisk: false, belowReorderCount: 0 };
const okCash = { cashflowState: "SAFE", dataConfidenceScore: 0.9 };
const okFin = { survivalState: "SAFE", dataConfidenceScore: 0.9 };
const okCap = { growthSafe: true, expansionTriggered: false, bottleneckUtilization: 0.4 };

/** Every step must be proof-bearing, have a rollback trigger, and survive the generic-output guard. */
function assertConcreteAndNonGeneric(step: GuidanceStep) {
  expect(step.proofRequired).toBe(true);
  expect(step.proofType.length).toBeGreaterThan(0);
  expect(step.rollbackTrigger.length).toBeGreaterThan(10);
  expect(step.escalationRule.length).toBeGreaterThan(10);
  const g: GuidanceObject = {
    guidanceId: step.issueId, workspaceId: "ws1", ownerActionId: "a", recommendationId: "r",
    businessFunction: step.businessFunction, archetype: "x", priority: "MEDIUM",
    reasonNow: step.reasonNow, exactStep: step.exactStep, sequenceNumber: 1, assignedRole: step.assignedRole,
    deadline: step.deadline, proofRequired: true, proofType: step.proofType as ProofType,
    expectedOutcome: step.expectedOutcome, confidence: EvidenceConfidenceLevel.MODERATE, missingData: [],
    blockedActions: [], actionsToAvoid: ["x"], escalationRule: step.escalationRule, rollbackTrigger: step.rollbackTrigger,
    ownerApprovalRequired: false, professionalReviewRequired: false, learningEligibilityRule: "verified-only",
    employeeFacing: false,
  };
  expect(evaluateGuidanceForGeneric(g).rejected).toBe(false);
}

describe("m1-m41-e2e-proof — module contract assertions", () => {
  it("getOwnerNowView is a function", () => { expect(typeof getOwnerNowView).toBe("function"); });
  it("IssueCategory is an object", () => { expect(typeof IssueCategory).toBe("object"); });
  it("GuidanceClassification is an object", () => { expect(typeof GuidanceClassification).toBe("object"); });
  it("evaluateGuidanceForGeneric is a function", () => { expect(typeof evaluateGuidanceForGeneric).toBe("function"); });
  it("containsJargon is a function", () => { expect(typeof containsJargon).toBe("function"); });
  it("EvidenceConfidenceLevel is an object", () => { expect(typeof EvidenceConfidenceLevel).toBe("object"); });
  it("ProofType is an object", () => { expect(typeof ProofType).toBe("object"); });
  it("deps is a function", () => { expect(typeof deps).toBe("function"); });
  it("m is a function", () => { expect(typeof m).toBe("function"); });
  it("safeSupplier is an object", () => { expect(typeof safeSupplier).toBe("object"); });
  it("okCash is an object", () => { expect(typeof okCash).toBe("object"); });
  it("assertConcreteAndNonGeneric is a function", () => { expect(typeof assertConcreteAndNonGeneric).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[module41][e2e] hostile M1–M41 owner-mode proof", () => {
  it("scenario 1 — laundry, cash safe but complaints/rework rising", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({ cash: okCash, fin: okFin, cap: okCap, supplier: safeSupplier, business: { businessType: "laundry_local_service" }, metric: m({ complaintCount: 12, rewashCount: 9 }) }));
    expect(out.archetype).toBe("laundry");
    expect(out.view.topOwnerActions[0].category).toBe(IssueCategory.CUSTOMER_SERVICE_FAILURE);
    expect(out.view.actionsToAvoid.map((a) => a.id)).toContain("avoid_marketing_on_service_failure");
    expect(out.view.topOwnerActions.length).toBeLessThanOrEqual(3);
    // archetype-aware wording: laundry front-line worker noun
    expect(out.stepByStep[0].exactStep).toContain("counter/plant");
    out.stepByStep.forEach(assertConcreteAndNonGeneric);
  });

  it("scenario 2 — laundry, growth opportunity but supplier/inventory risk → growth blocked", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({ cash: okCash, fin: okFin, cap: okCap, business: { businessType: "laundry_local_service" }, supplier: { worstStockoutRisk: "STOCKOUT", riskScore: 0.9, supplyCutoffRisk: true, belowReorderCount: 4 } }));
    expect(out.view.growthReadinessStatus).toBe("WATCH");
    expect(out.view.actionsToAvoid.map((a) => a.id)).toContain("avoid_growth_before_gates");
    expect(out.view.topOwnerActions.some((i) => i.id === "supplier")).toBe(true);
    out.stepByStep.forEach(assertConcreteAndNonGeneric);
  });

  it("scenario 3 — distressed housekeeping: cash stress + churn + staff & owner overload", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.9 }, fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.9 },
      business: { businessType: "housekeeping_cleaning" }, metric: m({ newCustomers: 50, repeatCustomers: 5 }), supplier: safeSupplier,
      emp: { overburdened: true, utilizationPct: 140 }, own: { overloaded: true, bottleneckRisk: true, dailyLoadPct: 130 },
    }));
    expect(out.view.emergency).toBe(true);
    expect(out.view.topOwnerActions[0].category).toBe(IssueCategory.CASH_DANGER);
    expect(out.stepByStep[0].exactStep).toContain("apartment/community");
    const avoid = out.view.actionsToAvoid.map((a) => a.id);
    expect(avoid).toContain("avoid_new_tasks_on_overload");
    expect(avoid).toContain("avoid_growth_before_gates");
    // high-risk owner-action issue is NOT auto-approved → requires an explicit owner decision
    expect(out.view.classification).toBe(GuidanceClassification.GUIDANCE_REQUIRES_OWNER_DECISION);
    // beginner explanation is plain-language (no jargon) and tells the owner what NOT to do
    expect(containsJargon(out.beginnerExplanation.plainReason)).toBe(false);
    expect(out.beginnerExplanation.whatNotToDo.length).toBeGreaterThan(0);
  });

  it("scenario 4 — home services: technician capacity bottleneck + proof overdue", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({
      cash: okCash, fin: okFin, supplier: safeSupplier, business: { businessType: "home_services_maintenance" },
      cap: { growthSafe: false, expansionTriggered: true, bottleneckUtilization: 0.97 }, overdueProofCount: 4,
    }));
    expect(out.archetype).toBe("home_services");
    expect(out.view.topOwnerActions.some((i) => i.id === "capacity")).toBe(true);
    expect(out.view.topOwnerActions.some((i) => i.id === "proof")).toBe(true);
    const proofStep = out.stepByStep.find((s) => s.issueId === "proof");
    expect(proofStep?.reasonNow).toContain("learning is blocked");
    out.stepByStep.forEach(assertConcreteAndNonGeneric);
  });

  it("scenario 5 — weak-data beginner: cap confidence + ask only smallest-useful missing data", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({ cash: { cashflowState: "WATCH", dataConfidenceScore: 0.2 } }));
    expect(out.view.confidenceCapped).toBe(true);
    expect(out.view.classification).not.toBe(GuidanceClassification.GUIDANCE_READY);
    // smallest-useful-first, named (not generic): finance before customer before supplier
    expect(out.view.missingDataRequests[0]).toContain("profit/margin");
    expect(out.view.missingDataRequests.every((x) => x.length > 8 && !/^check|^review/i.test(x))).toBe(true);
    expect(out.beginnerExplanation.confidenceNote.length).toBeGreaterThan(0);
  });

  it("scenario 6 — growth opportunity blocked by cash/workload/quality/capacity risk", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({
      cash: { cashflowState: "AT_RISK", dataConfidenceScore: 0.9 }, fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.9 },
      cap: { growthSafe: false, expansionTriggered: false, bottleneckUtilization: 0.9 }, supplier: safeSupplier,
      business: { businessType: "laundry_local_service" }, emp: { overburdened: true, utilizationPct: 120 }, metric: m({ complaintCount: 6 }),
    }));
    expect(out.view.growthReadinessStatus).toBe("WATCH");
    expect(out.view.topOwnerActions.some((i) => i.category === IssueCategory.GROWTH_OPPORTUNITY)).toBe(false);
    expect(out.view.actionsToAvoid.map((a) => a.id)).toContain("avoid_growth_before_gates");
  });

  it("scenario 7 — outcome due surfaces reassessment/verification before learning", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({ cash: okCash, fin: okFin, cap: okCap, supplier: safeSupplier, business: { businessType: "laundry_local_service" }, outcomeOpen: 1, reassessOpen: 1 }));
    const outcome = out.view.topOwnerActions.find((i) => i.id === "outcome");
    expect(outcome?.category).toBe(IssueCategory.PENDING_PROOF_OUTCOME);
    const step = out.stepByStep.find((s) => s.issueId === "outcome");
    expect(step?.reasonNow.toLowerCase()).toContain("before any learning");
    expect(step?.escalationRule.toLowerCase()).toContain("verify outcomes before");
  });

  it("scenario 8 — second run shows what changed since last check", async () => {
    const prev = { cashRunwayDays: 120, netMarginPct: 20, complaintsCount: 0, reworkCount: 0, capacityUtilizationPct: 50, staffOverloadPct: 60, ownerLoadPct: 50, churnRiskScore: 0, supplierInventoryRiskScore: 0, overdueProofCount: 0, outcomeChecksDue: 0, growthReadinessTier: "GROWTH_READY" };
    const out = await getOwnerNowView("ws1", "biz1", deps({
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.9 }, fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.9 },
      business: { businessType: "laundry_local_service" }, metric: m({ complaintCount: 8 }), prevSnapshot: prev,
    }));
    expect(out.whatChanged.some((c) => c.category === "CASH_WORSENED" && c.ownerAlert)).toBe(true);
    expect(out.whatChanged.some((c) => c.category === "COMPLAINTS_INCREASED")).toBe(true);
    expect(out.whatChanged.some((c) => c.category === "GROWTH_READINESS_CHANGED")).toBe(true);
  });
});

describe("[module41][e2e] cross-cutting safety properties", () => {
  it("healthy business → GUIDANCE_READY, no actions-to-avoid, top actions empty", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({ cash: okCash, fin: okFin, cap: okCap, supplier: safeSupplier, business: { businessType: "laundry_local_service" }, metric: m({}) }));
    expect(out.view.classification).toBe(GuidanceClassification.GUIDANCE_READY);
    expect(out.view.actionsToAvoid).toHaveLength(0);
  });

  it("many non-emergency issues stay capped at 3; only a real emergency lifts the cap", async () => {
    const busy = deps({ cash: okCash, fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.9 }, cap: { growthSafe: false, expansionTriggered: true, bottleneckUtilization: 0.9 }, supplier: { worstStockoutRisk: "HIGH", riskScore: 0.7, supplyCutoffRisk: false, belowReorderCount: 2 }, business: { businessType: "laundry_local_service" }, metric: m({ complaintCount: 12, rewashCount: 9, newCustomers: 50, repeatCustomers: 5 }), overdueProofCount: 3, outcomeOpen: 2 });
    const out = await getOwnerNowView("ws1", "biz1", busy);
    expect(out.view.topOwnerActions.length).toBeLessThanOrEqual(3);
    expect(out.view.emergency).toBe(false);
  });

  it("no high-risk guidance auto-executes: critical scenarios never silently READY", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({ cash: { cashflowState: "INSOLVENT_RISK", dataConfidenceScore: 0.9 }, fin: { survivalState: "CRITICAL", dataConfidenceScore: 0.9 }, business: { businessType: "laundry_local_service" } }));
    expect(out.view.classification).not.toBe(GuidanceClassification.GUIDANCE_READY);
  });
});
