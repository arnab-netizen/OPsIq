/**
 * A1 amendment — Budget offensive posture requires COMPLETE liquidity.
 * Unknown total liquidity is neither zero (no EMERGENCY / invented breach / invented short runway) nor
 * safe (no GROW / SCALE, no offensive funding). The existing defensive-mode allocation barrier does the
 * deferring; there is no parallel funding gate.
 */
import { describe, it, expect } from "vitest";
import {
  classifyBudgetMode,
  composeUpdatedPlan,
  rankCapitalAllocation,
  type AllocationCandidate,
  type BudgetAssessmentInput,
} from "@/domain/owner-budget";
import { BANK_BALANCE_UNCONFIRMED_REASON } from "@/domain/owner-budget/mode-classifier";

const base = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR" } as const;
// Healthy, profitable business: every OTHER gate qualifies for GROW and SCALE.
const healthy = (finance: Record<string, number | undefined>): BudgetAssessmentInput => ({
  finance: { ...base, revenue: 900000, costOfGoodsOrServices: 400000, fixedCosts: 300000, ...finance },
  unitEconomicsPositive: true, demandRepeatable: true, ownerDependencyHigh: false, dataConfidence: "VERIFIED",
});

const candidates: AllocationCandidate[] = [
  { id: "ads", label: "Paid ads", category: "growth_roi", amount: 40000, reversible: true, expectedReturnPct: 25 },
  { id: "scale", label: "Second branch", category: "scale_after_readiness", amount: 50000, reversible: false, expectedReturnPct: 30 },
  { id: "exp", label: "New channel test", category: "strategic_experiment", amount: 20000, reversible: true },
  { id: "disc", label: "Office refresh", category: "discretionary", amount: 15000, reversible: true },
  { id: "tax", label: "GST", category: "statutory_payroll_tax", amount: 30000, reversible: false },
];
const fund = (assessment: BudgetAssessmentInput, mode: Parameters<typeof rankCapitalAllocation>[0]["mode"]) =>
  rankCapitalAllocation({ approvedBudget: 500000, candidates, mode, confidence: assessment.dataConfidence ?? "VERIFIED" });

describe("A1 amendment — Budget liquidity gate", () => {
  it("A: profitable, cash in hand known, bank UNKNOWN → not GROW, not SCALE, no offensive funding", () => {
    const a = healthy({ cashOnHand: 800000 });
    const r = classifyBudgetMode(a);
    expect(r.cash.liquidityComplete).toBe(false);
    expect(r.primaryMode).not.toBe("GROW");
    expect(r.primaryMode).not.toBe("SCALE");
    expect(r.activeModes).not.toContain("GROW");
    expect(r.activeModes).not.toContain("SCALE");
    const alloc = fund(a, r.primaryMode);
    for (const x of alloc.ranked.filter((x) => ["growth_roi", "scale_after_readiness", "strategic_experiment", "discretionary"].includes(x.candidate.category))) {
      expect(x.decision, x.candidate.category).not.toBe("FUND");
      expect(x.decision, x.candidate.category).not.toBe("PARTIAL_FUND");
      expect(x.fundedAmount).toBe(0);
    }
    // Mandatory tier is still funded (no new parallel gate).
    expect(alloc.ranked.find((x) => x.candidate.category === "statutory_payroll_tax")?.decision).toBe("FUND");
  });

  it("A2: the composed plan holds offensive spend too (real plan path, not just the classifier)", () => {
    const plan = composeUpdatedPlan({ assessment: healthy({ cashOnHand: 800000 }), candidates, allocationContext: { approvedBudget: 500000 } });
    expect(["GROW", "SCALE"]).not.toContain(plan.mode);
    expect(plan.mode).toBe("STABILIZE");
    expect(plan.decisionType).toBe("COLLECT_EVIDENCE");
    expect(plan.nextBestAction.toLowerCase()).toContain("bank balance");
    expect(plan.nextBestAction.toLowerCase()).not.toContain("rebuild cash");
    expect(plan.runwayImpact.toLowerCase()).toContain("bank balance");
  });

  it("B: profitable, cash in hand + bank 0 KNOWN → the existing GROW/SCALE logic works", () => {
    const r = classifyBudgetMode(healthy({ cashOnHand: 800000, bankBalance: 0 }));
    expect(r.cash.liquidityComplete).toBe(true);
    expect(r.primaryMode).toBe("SCALE");
  });

  it("C: profitable, cash in hand + positive bank → offensive posture works when qualified", () => {
    const a = healthy({ cashOnHand: 100000, bankBalance: 700000 });
    const r = classifyBudgetMode(a);
    expect(r.cash.cashOnHand).toBe(800000);
    expect(r.primaryMode).toBe("SCALE");
    const grow = classifyBudgetMode({ ...a, dataConfidence: "OPERATIONAL", demandRepeatable: false });
    expect(grow.primaryMode).toBe("GROW");
    expect(fund(a, r.primaryMode).ranked.find((x) => x.candidate.category === "growth_roi")?.decision).toBe("FUND");
  });

  it("D: incomplete liquidity is NOT distress — never EMERGENCY, no invented breach or short runway", () => {
    const r = classifyBudgetMode({ ...healthy({ cashOnHand: 0 }), statutoryReserveRequired: 50000 });
    expect(r.primaryMode).not.toBe("EMERGENCY");
    expect(r.cash.reserveBreached).toBe(false);
    expect(r.cash.runwayDays).toBeNull();
    expect(r.cash.cashOnHand).toBeNull();
  });

  it("E: incomplete liquidity states the evidence limitation directly", () => {
    const r = classifyBudgetMode(healthy({ cashOnHand: 800000 }));
    expect(r.reasons).toContain(BANK_BALANCE_UNCONFIRMED_REASON);
    expect(BANK_BALANCE_UNCONFIRMED_REASON).toMatch(/Confirm the bank balance before OpsIQ clears growth or scale spending/);
    expect(r.missingCriticalData).toContain("bankBalance");
    expect(r.reasons.join(" ")).not.toMatch(/stabilize first|weak/i);
    // And a complete position carries no such limitation.
    const done = classifyBudgetMode(healthy({ cashOnHand: 800000, bankBalance: 0 }));
    expect(done.reasons).not.toContain(BANK_BALANCE_UNCONFIRMED_REASON);
    expect(done.missingCriticalData).not.toContain("bankBalance");
  });

  it("H: reserve breach with COMPLETE liquidity still fires", () => {
    const r = classifyBudgetMode({ ...healthy({ cashOnHand: 10000, bankBalance: 10000 }), statutoryReserveRequired: 50000 });
    expect(r.cash.reserveBreached).toBe(true);
    expect(r.primaryMode).toBe("EMERGENCY");
  });

  it("I: genuine short runway with COMPLETE liquidity still fires", () => {
    const r = classifyBudgetMode({
      finance: { ...base, revenue: 100000, fixedCosts: 130000, cashOnHand: 2000, bankBalance: 3000 },
      dataConfidence: "OPERATIONAL",
    });
    expect(r.cash.runwayDays).toBeLessThan(14);
    expect(r.primaryMode).toBe("EMERGENCY");
  });

  it("legacy-semantics snapshot (cashOnHand taken as entered) counts as complete", () => {
    const h = healthy({ cashOnHand: 800000 });
    const r = classifyBudgetMode({ ...h, finance: { ...h.finance, cashSemantics: "LEGACY_AMBIGUOUS" } });
    expect(r.cash.liquidityComplete).toBe(true);
  });
});
