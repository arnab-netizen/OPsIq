/**
 * P2-A runtime-readiness proof — quantified upside now reaches the owner (blocker B3).
 *
 * Before this slice the runtime computed real figures (cash runway, monthly net, receivables risk) inside
 * `deriveCalcs` and then DROPPED them at `runOwnerAdvice`'s boundary, so the owner only ever saw canned
 * qualitative strings. These tests prove: (1) the pure figure builder surfaces ONLY numbers derived from real
 * inputs and fabricates nothing — never the placeholder contract-margin / net-ROAS; (2) the numbers survive the
 * live `runOwnerAdvice` → SupervisorSummary path; (3) when the real inputs are absent, NO number appears.
 */
import { describe, it, expect } from "vitest";
import {
  buildSupportingFigures,
  buildSupervisorSummary,
  type SupervisorInput,
  type SupportingCalcInput,
} from "@/domain/owner-mode/supervisor-summary";
import { runOwnerAdvice } from "@/services/owner-mode/owner-advice-runtime.service";
import { caseToContext } from "@/behavioral-validation/whole-business/production-runner";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import { deriveCalcs } from "@/behavioral-validation/expert/business-math";
import type { BehavioralCase } from "@/behavioral-validation/schema";

const ALLOWED_KEYS = new Set(["cash_runway_days", "monthly_net", "receivables_risk", "capacity_utilization"]);

function baseInput(calcs?: SupportingCalcInput | null): SupervisorInput {
  return {
    found: true, dominantConstraint: "cash_survival", topPriorityLabel: "Cash survival", nextBestAction: "Recover cash",
    rootCause: "cash trapped", doNotDo: [], proofRequired: [], reassessmentTriggers: ["14 days"], successMetrics: ["cash"],
    redDomains: [], ownerApprovalRequired: false, ownerOffload: "—", delegatedWork: [], opsiqPreparedWork: [],
    growthScaleAllowed: false, growthBlockedBy: [], overallConfidence: "high", criticalDomainsAllReal: true,
    dataSourceMissing: [], realProviderDomains: [], assessedDomains: [], unsafeCount: 0,
    impact: { financeCash: "—", marginPricing: "—", equipmentCapacity: "—", staffWorkload: "—", customerQuality: "—" },
    ownerWorkloadOffload: "—", plan7Day: "", plan30Day: "", calcs,
  };
}

describe("P2-A supporting figures — quantified upside, never fabricated", () => {
  it("surfaces every real, non-null figure with correct value/unit", () => {
    const figs = buildSupportingFigures({
      cashRunwayDays: 42.6, monthlyRevenue: 320000, monthlyCost: 115000, receivablesRisk: 1.234, capacityUtilization: 0.6,
    });
    const byKey = Object.fromEntries(figs.map((f) => [f.key, f]));
    expect(byKey.cash_runway_days.value).toBe(43);
    expect(byKey.cash_runway_days.unit).toBe("days");
    expect(byKey.monthly_net.value).toBe(205000);
    expect(byKey.receivables_risk.value).toBe(1.23);
    expect(byKey.capacity_utilization.value).toBe(60);
    // Every key is from the allowed, real-input set — never a placeholder-contaminated contract-margin / ROAS.
    for (const f of figs) expect(ALLOWED_KEYS.has(f.key)).toBe(true);
  });

  it("omits any figure whose real input is absent (no fabricated numbers)", () => {
    expect(buildSupportingFigures(null)).toEqual([]);
    expect(buildSupportingFigures({ cashRunwayDays: null, monthlyRevenue: null, monthlyCost: null, receivablesRisk: null, capacityUtilization: null })).toEqual([]);
    // Monthly net requires BOTH sides — a missing cost must never read as zero.
    expect(buildSupportingFigures({ cashRunwayDays: null, monthlyRevenue: 320000, monthlyCost: null, receivablesRisk: null, capacityUtilization: null })).toEqual([]);
    // Non-finite guards.
    expect(buildSupportingFigures({ cashRunwayDays: Infinity, monthlyRevenue: null, monthlyCost: null, receivablesRisk: null, capacityUtilization: null })).toEqual([]);
  });

  it("buildSupervisorSummary threads calcs into supportingFigures, and emits none when calcs are absent", () => {
    const withCalcs = buildSupervisorSummary(baseInput({ cashRunwayDays: 30, monthlyRevenue: null, monthlyCost: null, receivablesRisk: null, capacityUtilization: null }));
    expect(withCalcs.supportingFigures.map((f) => f.key)).toEqual(["cash_runway_days"]);
    const withoutCalcs = buildSupervisorSummary(baseInput(undefined));
    expect(withoutCalcs.supportingFigures).toEqual([]);
  });

  it("live path: A1 (revenue up, cash trapped) surfaces the real monthly-net figure and NO fabricated margin/ROAS", async () => {
    const a1 = SEED_CASES.find((c) => c.id === "A1")!;
    const store = new InMemoryLearningStore();
    const r = await runOwnerAdvice({ workspaceId: "ws-fig", context: caseToContext(a1) }, { store });
    // Real numbers survive to the result (revenue 320000, cost = 25000+18000+8000+52000+12000).
    expect(r.supportingCalcs.monthlyRevenue).toBe(320000);
    expect(r.supportingCalcs.monthlyCost).toBe(115000);
    // A1 runs a paper surplus (rev > cost) so there is no positive burn → runway is honestly null, not invented.
    expect(r.supportingCalcs.cashRunwayDays).toBeNull();

    const figs = buildSupportingFigures({
      cashRunwayDays: r.supportingCalcs.cashRunwayDays,
      monthlyRevenue: r.supportingCalcs.monthlyRevenue,
      monthlyCost: r.supportingCalcs.monthlyCost,
      receivablesRisk: r.supportingCalcs.receivablesRisk,
      capacityUtilization: r.supportingCalcs.capacityUtilization,
    });
    const net = figs.find((f) => f.key === "monthly_net");
    expect(net?.value).toBe(205000);
    expect(figs.some((f) => f.key === "cash_runway_days")).toBe(false);
    // The placeholder-derived contract-margin (M3's 18/22/30) and default-laden net-ROAS never reach the owner.
    for (const f of figs) expect(ALLOWED_KEYS.has(f.key)).toBe(true);
  });
});

describe("Wave 3 S1 — specific missing-input request reaches the owner (never fabricated)", () => {
  it("buildSupervisorSummary surfaces the specific missing-quantification inputs, deduped + trimmed", () => {
    const summary = buildSupervisorSummary({
      ...baseInput(null),
      missingForQuantification: ["current cash balance", "  current cash balance  ", "", "fully-loaded cost/kg and quoted rate"],
    });
    expect(summary.missingForQuantification).toEqual(["current cash balance", "fully-loaded cost/kg and quoted rate"]);
  });

  it("emits an empty list when nothing is missing (no fabrication, distinct from generic domain missingData)", () => {
    const summary = buildSupervisorSummary(baseInput(null));
    expect(summary.missingForQuantification).toEqual([]);
  });

  it("deriveCalcs → summary: a marketing contract missing cost/rate + cash yields specific field requests", () => {
    // deriveCalcs reads only numbers/decisionCategory/flags; a minimal case exercises the real calculator.
    const missingCase = {
      decisionCategory: "marketing_opportunity_contract",
      flags: { cashRisk: true, capacityRisk: false, hostile: false, missingOrStaleData: false, complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false },
      numbers: {},
    } as unknown as BehavioralCase;
    const calcs = deriveCalcs(missingCase);
    // The runtime itself computed these specific missing inputs — we assert, not invent, them.
    expect(calcs.missingForDecision).toContain("fully-loaded cost/kg and quoted rate");
    expect(calcs.missingForDecision).toContain("current cash balance");
    const summary = buildSupervisorSummary({ ...baseInput(null), missingForQuantification: calcs.missingForDecision });
    expect(summary.missingForQuantification).toEqual(expect.arrayContaining(["fully-loaded cost/kg and quoted rate", "current cash balance"]));
    // Surfacing missing-inputs adds no numeric figure and no profit claim — it is a request, not a value.
    expect(summary.supportingFigures).toEqual([]);
  });

  it("live path: the owner-visible missing-inputs list is exactly what the runtime computed (faithful, non-fabricating)", async () => {
    const a1 = SEED_CASES.find((c) => c.id === "A1")!;
    const r = await runOwnerAdvice({ workspaceId: "ws-fig-missing", context: caseToContext(a1) }, { store: new InMemoryLearningStore() });
    const expected = Array.from(new Set((r.supportingCalcs.missingForDecision ?? []).map((s) => s.trim()).filter((s) => s.length > 0)));
    const summary = buildSupervisorSummary({ ...baseInput(null), missingForQuantification: r.supportingCalcs.missingForDecision });
    expect(summary.missingForQuantification).toEqual(expected);
  });
});
