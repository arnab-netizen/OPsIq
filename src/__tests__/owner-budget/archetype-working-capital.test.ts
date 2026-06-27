/**
 * Working-Capital × Archetype Cross-Integration — deterministic logic proof.
 *
 * Proves the combined cash-cycle guidance through the real `composeUpdatedPlan`
 * (updated owner plan): laundry/housekeeping cash-cycle risk blocks growth despite
 * accounting profit, produces business-specific (not generic) actions, keeps the
 * generic fallback safe, and leaves each side's standalone behaviour unchanged when
 * the other input is absent.
 */
import { describe, it, expect } from "vitest";
import { composeUpdatedPlan } from "@/domain/owner-budget/updated-plan";
import { assessArchetypeWorkingCapital } from "@/domain/owner-budget/archetype-working-capital";
import { assessWorkingCapitalAgeing, type WorkingCapitalLineItem, type WorkingCapitalAgeingResult } from "@/domain/owner-budget/working-capital-ageing";
import { budgetActionSourceKey } from "@/domain/owner-budget/action-mapping";
import type { AllocationCandidate, BudgetAssessmentInput } from "@/domain/owner-budget/types";

const ASOF = new Date("2026-06-27T00:00:00Z");
const daysBefore = (n: number) => new Date(ASOF.getTime() - n * 86_400_000).toISOString();

const fin = (over: Partial<BudgetAssessmentInput["finance"]> = {}): BudgetAssessmentInput["finance"] => ({
  periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
  revenue: 800000, costOfGoodsOrServices: 300000, fixedCosts: 200000, cashOnHand: 500000,
  ...over,
});
const growthCandidate: AllocationCandidate = {
  id: "g1", label: "Referral campaign", category: "growth_roi", amount: 20000, reversible: true, evidenceConfidence: "OPERATIONAL",
};

/** Build a real ageing result via the engine. */
function ageing(items: WorkingCapitalLineItem[], opts: { freeCashAfterReserve?: number | null; netProfitable?: boolean | null } = {}): WorkingCapitalAgeingResult {
  return assessWorkingCapitalAgeing({ asOf: ASOF, items, freeCashAfterReserve: opts.freeCashAfterReserve ?? 100000, netProfitable: opts.netProfitable ?? true });
}
const overdueReceivable = (amount: number, daysOverdue: number): WorkingCapitalLineItem =>
  ({ kind: "receivable", amount, counterparty: "Client", status: "open", sourceType: "MANUAL", dueDate: daysBefore(daysOverdue), updatedAt: ASOF.toISOString() });

function plan(assessment: BudgetAssessmentInput) {
  return composeUpdatedPlan({ assessment, candidates: [growthCandidate], allocationContext: { approvedBudget: 100000 } });
}
const sigTypes = (p: ReturnType<typeof plan>) => p.signals.map((s) => s.type);
const growthDecision = (p: ReturnType<typeof plan>) => p.fundAllocationChanges.find((c) => c.includes("Referral campaign")) ?? "";

const GROW_BASE = { ownerGoal: "growth" as const, demandRepeatable: true, unitEconomicsPositive: true, capacityUtilizationPct: 70, dataConfidence: "VERIFIED" as const };

describe("assessArchetypeWorkingCapital — pure combine guards", () => {
  it("returns empty when ageing is absent (archetype behaviour unchanged)", () => {
    const r = assessArchetypeWorkingCapital({ archetype: "laundry", ageing: null, laundry: { b2bContributionMarginPct: 4 } });
    expect(r.signals).toHaveLength(0);
    expect(r.actions).toHaveLength(0);
    expect(r.growthBlocked).toBe(false);
  });
  it("returns empty for the generic archetype (working-capital behaviour unchanged)", () => {
    const r = assessArchetypeWorkingCapital({ archetype: "generic", ageing: ageing([overdueReceivable(50000, 100)]) });
    expect(r.signals).toHaveLength(0);
    expect(r.growthBlocked).toBe(false);
  });
});

describe("composeUpdatedPlan — laundry × working-capital", () => {
  it("profitable B2B + overdue receivable blocks growth despite positive margin", () => {
    const p = plan({
      finance: fin({ industryTemplate: "laundry" }), ...GROW_BASE,
      archetypeSignals: { laundry: { b2bContributionMarginPct: 25 } }, // healthy margin on paper
      workingCapital: { ageing: ageing([overdueReceivable(120000, 50)]) },
    });
    expect(sigTypes(p)).toContain("laundry_b2b_cash_conversion_risk");
    expect(growthDecision(p)).toMatch(/DEFER/);
    expect(p.whatNotToDo.some((w) => /free cash while their invoices are overdue/i.test(w))).toBe(true);
  });

  it("low kg margin + delayed receivable generates a price-AND-terms action (stronger than either alone)", () => {
    const p = plan({
      finance: fin({ industryTemplate: "laundry" }), ...GROW_BASE,
      archetypeSignals: { laundry: { b2bContributionMarginPct: 4 } },
      workingCapital: { ageing: ageing([overdueReceivable(80000, 40)]) },
    });
    expect(sigTypes(p)).toContain("laundry_b2b_payment_terms_risk");
    expect(p.generatedActions.some((a) => /reprice low-margin b2b laundry contract and fix payment terms/i.test(a.title))).toBe(true);
  });

  it("delivery expansion is deferred when receivables ageing is severe (90+)", () => {
    const p = plan({
      finance: fin({ industryTemplate: "laundry" }), ...GROW_BASE,
      archetypeSignals: { laundry: { deliveryCost: 50000, deliveryRevenue: 30000 } },
      workingCapital: { ageing: ageing([overdueReceivable(90000, 120)]) },
    });
    expect(growthDecision(p)).toMatch(/DEFER/);
    expect(p.spendRestrictions.some((x) => /defer delivery expansion/i.test(x))).toBe(true);
  });

  it("machine downtime + overdue receivables protects the maintenance reserve", () => {
    const p = plan({
      finance: fin({ industryTemplate: "laundry" }), ...GROW_BASE,
      archetypeSignals: { laundry: { machineDowntimeHours: 12 } },
      workingCapital: { ageing: ageing([overdueReceivable(40000, 20)]) },
    });
    expect(sigTypes(p)).toContain("laundry_reserve_protected_by_downtime_and_receivables");
    expect(p.spendRestrictions.some((x) => /maintenance reserve.*marketing\/growth|do not reallocate it to marketing\/growth/i.test(x))).toBe(true);
  });
});

describe("composeUpdatedPlan — housekeeping × working-capital", () => {
  it("recurring contract + slow payment produces a collection/cash warning and defers growth", () => {
    const p = plan({
      finance: fin({ industryTemplate: "housekeeping" }), ...GROW_BASE,
      archetypeSignals: { housekeeping: { recurringContractMarginPct: 20 } },
      workingCapital: { ageing: ageing([overdueReceivable(60000, 40)]) },
    });
    expect(sigTypes(p)).toContain("housekeeping_recurring_contract_cash_risk");
    expect(growthDecision(p)).toMatch(/DEFER/);
    expect(p.generatedActions.some((a) => /collect \/ renegotiate recurring contract payment terms/i.test(a.title))).toBe(true);
  });

  it("payroll pressure + overdue receivable produces a payroll/collection conflict warning", () => {
    const p = plan({
      finance: fin({ industryTemplate: "housekeeping", cashOnHand: 40000 }), ...GROW_BASE,
      archetypeSignals: { housekeeping: { recurringContractMarginPct: 20 } },
      workingCapital: { ageing: ageing([overdueReceivable(200000, 50)], { freeCashAfterReserve: -5000, netProfitable: true }) },
    });
    expect(sigTypes(p)).toContain("housekeeping_payroll_collection_conflict");
    expect(p.whatNotToDo.some((w) => /collect first/i.test(w))).toBe(true);
  });

  it("travel inefficiency + slow collection prioritises route/cash correction over growth", () => {
    const p = plan({
      finance: fin({ industryTemplate: "housekeeping" }), ...GROW_BASE,
      archetypeSignals: { housekeeping: { travelTimeSharePct: 35 } },
      workingCapital: { ageing: ageing([overdueReceivable(50000, 40)]) },
    });
    expect(growthDecision(p)).toMatch(/DEFER/);
    expect(p.spendRestrictions.some((x) => /cluster routes and collect overdue receivables/i.test(x))).toBe(true);
  });

  it("underpriced recurring contract + overdue receivable triggers a repricing/payment-term action", () => {
    const p = plan({
      finance: fin({ industryTemplate: "housekeeping" }), ...GROW_BASE,
      archetypeSignals: { housekeeping: { recurringContractMarginPct: 6 } },
      workingCapital: { ageing: ageing([overdueReceivable(50000, 40)]) },
    });
    expect(p.generatedActions.some((a) => /reprice underpriced recurring contract and fix payment terms/i.test(a.title))).toBe(true);
  });
});

describe("composeUpdatedPlan — safety / isolation of the two slices", () => {
  it("generic fallback emits safe working-capital warnings without laundry/housekeeping assumptions", () => {
    const p = plan({
      finance: fin({ industryTemplate: "generic_service" }), dataConfidence: "OPERATIONAL",
      workingCapital: { ageing: ageing([overdueReceivable(50000, 100)]) },
    });
    expect(sigTypes(p)).toContain("receivables_ageing_risk"); // working-capital warning still present
    expect(sigTypes(p).some((t) => t.startsWith("laundry_") || t.startsWith("housekeeping_"))).toBe(false);
  });

  it("missing archetype metrics downgrades archetype confidence but does NOT suppress working-capital risk", () => {
    const p = plan({
      finance: fin({ industryTemplate: "laundry" }), dataConfidence: "OPERATIONAL",
      workingCapital: { ageing: ageing([overdueReceivable(50000, 100)]) },
      // no archetypeSignals.laundry provided
    });
    expect(sigTypes(p)).toContain("archetype_data_insufficient"); // archetype confidence downgraded
    expect(sigTypes(p)).toContain("receivables_ageing_risk");     // working-capital risk NOT suppressed
  });

  it("no working-capital ageing ⇒ archetype-pack behaviour unchanged (no cross signals)", () => {
    const p = plan({
      finance: fin({ industryTemplate: "laundry" }), dataConfidence: "OPERATIONAL",
      archetypeSignals: { laundry: { deliveryCost: 50000, deliveryRevenue: 30000 } },
    });
    expect(sigTypes(p)).toContain("laundry_delivery_uneconomic"); // archetype pack still fires
    expect(sigTypes(p).some((t) => t.endsWith("_cash_conversion_risk") || t.endsWith("_cash_risk"))).toBe(false);
  });

  it("no archetype data ⇒ working-capital behaviour unchanged", () => {
    const p = plan({
      finance: fin({ industryTemplate: "generic_service" }), dataConfidence: "OPERATIONAL",
      workingCapital: { ageing: ageing([overdueReceivable(50000, 100)]) },
    });
    expect(sigTypes(p)).toContain("collection_first_required");
    expect(sigTypes(p)).toContain("receivables_ageing_risk");
  });

  it("combined actions use deterministic source keys (action-linkage compatible — no duplicates)", () => {
    const assessment: BudgetAssessmentInput = {
      finance: fin({ industryTemplate: "laundry" }), ...GROW_BASE,
      archetypeSignals: { laundry: { b2bContributionMarginPct: 4 } },
      workingCapital: { ageing: ageing([overdueReceivable(80000, 40)]) },
    };
    const a = plan(assessment).generatedActions.map((x) => budgetActionSourceKey(x));
    const b = plan(assessment).generatedActions.map((x) => budgetActionSourceKey(x));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // no duplicate source keys
  });
});
