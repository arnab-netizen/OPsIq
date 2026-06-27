/**
 * Archetype-Specific Budget Packs — deterministic logic + plan-integration proof.
 *
 * Proves the packs change ACTUAL budget recommendations (not just labels): laundry
 * vs housekeeping vs generic differ on the same finance; archetype leakage produces
 * consumable/vendor/scheduling actions before generic advice; hard economics gates
 * defer growth through the existing allocation; generic falls back safely; missing
 * archetype metrics downgrade confidence without overclaiming.
 */
import { describe, it, expect } from "vitest";
import {
  assessArchetypePack,
  resolveBudgetArchetype,
  type ArchetypePackInput,
} from "@/domain/owner-budget/archetype-packs";
import { composeUpdatedPlan } from "@/domain/owner-budget/updated-plan";
import { budgetActionSourceKey } from "@/domain/owner-budget/action-mapping";
import type { AllocationCandidate, BudgetAssessmentInput } from "@/domain/owner-budget/types";

// ---- helpers -------------------------------------------------------------
const fin = (over: Partial<BudgetAssessmentInput["finance"]> = {}): BudgetAssessmentInput["finance"] => ({
  periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
  revenue: 800000, costOfGoodsOrServices: 300000, fixedCosts: 200000, cashOnHand: 500000,
  ...over,
});

const growthCandidate: AllocationCandidate = {
  id: "g1", label: "Referral campaign", category: "growth_roi", amount: 20000,
  reversible: true, evidenceConfidence: "OPERATIONAL",
};

function plan(assessment: BudgetAssessmentInput) {
  return composeUpdatedPlan({
    assessment,
    candidates: [growthCandidate],
    allocationContext: { approvedBudget: 100000 },
  });
}

const sigTypes = (p: ReturnType<typeof plan>) => p.signals.map((s) => s.type);

// ---- resolver ------------------------------------------------------------
describe("resolveBudgetArchetype", () => {
  it("maps templates to the three budget packs (home_services ⇒ generic)", () => {
    expect(resolveBudgetArchetype("laundry_dry_cleaning_pickup_delivery")).toBe("laundry");
    expect(resolveBudgetArchetype("housekeeping")).toBe("housekeeping");
    expect(resolveBudgetArchetype("home_services_repair")).toBe("generic");
    expect(resolveBudgetArchetype("generic_service")).toBe("generic");
    expect(resolveBudgetArchetype(undefined)).toBe("generic");
  });
});

// ---- pure engine: laundry ------------------------------------------------
describe("assessArchetypePack — laundry", () => {
  const L = (laundry: ArchetypePackInput["laundry"]) => assessArchetypePack({ archetype: "laundry", laundry });

  it("chemical leakage ⇒ consumable-control action + fix-before-marketing restriction", () => {
    const r = L({ chemicalCost: 60000, orderVolume: 1000, chemicalCostBaselinePerOrder: 40 }); // 60/order vs 40 baseline
    expect(r.signals.map((s) => s.type)).toContain("laundry_consumable_leakage");
    expect(r.actions.some((a) => /chemical\/consumable usage leakage/i.test(a.title))).toBe(true);
    expect(r.spendRestrictions.some((x) => /before adding marketing or growth/i.test(x))).toBe(true);
  });

  it("delivery economics negative ⇒ block low-value delivery growth (growthBlocked)", () => {
    const r = L({ deliveryCost: 50000, deliveryRevenue: 30000 });
    expect(r.signals.map((s) => s.type)).toContain("laundry_delivery_uneconomic");
    expect(r.growthBlocked).toBe(true);
    expect(r.spendRestrictions.some((x) => /low-value.*delivery growth/i.test(x))).toBe(true);
  });

  it("poor B2B kg margin ⇒ reprice action", () => {
    const r = L({ b2bContributionMarginPct: 4 });
    expect(r.signals.map((s) => s.type)).toContain("laundry_b2b_margin_risk");
    expect(r.actions.some((a) => /reprice.*b2b/i.test(a.title))).toBe(true);
  });

  it("machine downtime ⇒ protect maintenance reserve (no reallocation to marketing)", () => {
    const r = L({ machineDowntimeHours: 12 });
    expect(r.signals.map((s) => s.type)).toContain("laundry_machine_downtime_risk");
    expect(r.spendRestrictions.some((x) => /maintenance reserve.*marketing|marketing.*maintenance reserve/i.test(x))).toBe(true);
  });

  it("discounts kill contribution ⇒ reduce-discount action", () => {
    const r = L({ contributionAfterDiscountPct: -3 });
    expect(r.signals.map((s) => s.type)).toContain("laundry_discount_contribution_risk");
    expect(r.actions.some((a) => a.decisionType === "REDUCE" && /discount/i.test(a.title))).toBe(true);
  });
});

// ---- pure engine: housekeeping ------------------------------------------
describe("assessArchetypePack — housekeeping", () => {
  const H = (housekeeping: ArchetypePackInput["housekeeping"]) => assessArchetypePack({ archetype: "housekeeping", housekeeping });

  it("travel inefficiency ⇒ block expansion until clustering (growthBlocked)", () => {
    const r = H({ travelTimeSharePct: 35 });
    expect(r.signals.map((s) => s.type)).toContain("housekeeping_travel_inefficiency");
    expect(r.growthBlocked).toBe(true);
    expect(r.spendRestrictions.some((x) => /expansion until route clustering/i.test(x))).toBe(true);
  });

  it("overtime without output ⇒ scheduling/productivity action, NOT blind hiring", () => {
    const r = H({ overtimeCost: 40000, overtimeOutputGainPct: 1 });
    expect(r.signals.map((s) => s.type)).toContain("housekeeping_overtime_without_output");
    expect(r.actions.some((a) => /scheduling\/productivity/i.test(a.title))).toBe(true);
    expect(r.spendRestrictions.some((x) => /not fund new hiring/i.test(x))).toBe(true);
  });

  it("underpriced recurring contract ⇒ reprice", () => {
    const r = H({ recurringContractMarginPct: 6 });
    expect(r.signals.map((s) => s.type)).toContain("housekeeping_contract_underpriced");
    expect(r.actions.some((a) => /reprice underpriced recurring/i.test(a.title))).toBe(true);
  });

  it("supplies usage variance ⇒ supply-control action", () => {
    const r = H({ suppliesUsage: 30000, suppliesExpectedPerJob: 20, jobsCompleted: 1000 }); // 30000 > 20*1000*1.2
    expect(r.signals.map((s) => s.type)).toContain("housekeeping_supplies_variance");
    expect(r.actions.some((a) => /supplies usage variance/i.test(a.title))).toBe(true);
  });
});

// ---- fallback / safety ---------------------------------------------------
describe("assessArchetypePack — fallback safety", () => {
  it("generic archetype ⇒ safe, empty, non-overclaiming", () => {
    const r = assessArchetypePack({ archetype: "generic" });
    expect(r.applied).toBe(false);
    expect(r.signals).toHaveLength(0);
    expect(r.actions).toHaveLength(0);
    expect(r.growthBlocked).toBe(false);
  });

  it("specific archetype with NO metrics ⇒ data-insufficient (confidence downgrade), safe fallback", () => {
    const r = assessArchetypePack({ archetype: "laundry", laundry: null });
    expect(r.dataInsufficient).toBe(true);
    expect(r.applied).toBe(false);
    expect(r.signals.map((s) => s.type)).toContain("archetype_data_insufficient");
    expect(r.actions).toHaveLength(0);
  });

  it("is deterministic (stable action titles ⇒ stable idempotency keys, no duplicate actions)", () => {
    const input: ArchetypePackInput = { archetype: "laundry", laundry: { deliveryCost: 50000, deliveryRevenue: 30000 } };
    const a = assessArchetypePack(input);
    const b = assessArchetypePack(input);
    expect(a.actions.map((x) => budgetActionSourceKey(x))).toEqual(b.actions.map((x) => budgetActionSourceKey(x)));
  });
});

// ---- plan integration ----------------------------------------------------
describe("composeUpdatedPlan — archetype integration", () => {
  it("laundry recommendation differs from generic on the SAME finance", () => {
    const finance = fin();
    const generic = plan({ finance: { ...finance, industryTemplate: "generic_service" }, dataConfidence: "OPERATIONAL" });
    const laundry = plan({
      finance: { ...finance, industryTemplate: "laundry" },
      dataConfidence: "OPERATIONAL",
      archetypeSignals: { laundry: { chemicalCost: 60000, orderVolume: 1000, chemicalCostBaselinePerOrder: 40 } },
    });
    expect(sigTypes(generic)).not.toContain("laundry_consumable_leakage");
    expect(sigTypes(laundry)).toContain("laundry_consumable_leakage");
    expect(laundry.generatedActions.some((a) => /chemical\/consumable/i.test(a.title))).toBe(true);
    expect(generic.generatedActions.some((a) => /chemical\/consumable/i.test(a.title))).toBe(false);
  });

  it("housekeeping recommendation differs from generic on the SAME finance", () => {
    const finance = fin();
    const generic = plan({ finance: { ...finance, industryTemplate: "generic_service" }, dataConfidence: "OPERATIONAL" });
    const hk = plan({
      finance: { ...finance, industryTemplate: "housekeeping" },
      dataConfidence: "OPERATIONAL",
      archetypeSignals: { housekeeping: { travelTimeSharePct: 35 } },
    });
    expect(sigTypes(hk)).toContain("housekeeping_travel_inefficiency");
    expect(sigTypes(generic)).not.toContain("housekeeping_travel_inefficiency");
  });

  it("laundry delivery economics defer growth through the existing allocation (vs funded generic)", () => {
    const finance = fin();
    const base = { finance: { ...finance, industryTemplate: "laundry" }, ownerGoal: "growth" as const, demandRepeatable: true, unitEconomicsPositive: true, capacityUtilizationPct: 70, dataConfidence: "VERIFIED" as const };
    const funded = plan(base); // no archetype signals → growth fundable
    const blocked = plan({ ...base, archetypeSignals: { laundry: { deliveryCost: 50000, deliveryRevenue: 30000 } } });

    const fundedGrowth = funded.fundAllocationChanges.find((c) => c.includes("Referral campaign"));
    const blockedGrowth = blocked.fundAllocationChanges.find((c) => c.includes("Referral campaign"));
    expect(fundedGrowth).toMatch(/FUND/);
    expect(blockedGrowth).toMatch(/DEFER/);
    expect(sigTypes(blocked)).toContain("laundry_delivery_uneconomic");
  });

  it("REGRESSION: generic finance plan is unchanged by archetype logic (no archetype signals/actions)", () => {
    const p = plan({ finance: fin({ industryTemplate: "generic_service" }), dataConfidence: "OPERATIONAL" });
    const archetypeSigs = sigTypes(p).filter((t) => t.startsWith("laundry_") || t.startsWith("housekeeping_") || t === "archetype_data_insufficient");
    expect(archetypeSigs).toHaveLength(0);
    expect(p.mode).toBeTruthy(); // still produces a normal plan
  });

  it("laundry archetype with no operational metrics falls back safely with a data-insufficient signal", () => {
    const p = plan({ finance: fin({ industryTemplate: "laundry" }), dataConfidence: "OPERATIONAL" });
    expect(sigTypes(p)).toContain("archetype_data_insufficient");
    // No archetype-specific leakage actions are fabricated without data.
    expect(p.generatedActions.some((a) => /chemical|delivery economics|reprice/i.test(a.title))).toBe(false);
  });
});
