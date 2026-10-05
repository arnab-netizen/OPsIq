/**
 * Dynamic Budget pure-engine unit tests (Sections 5,6,7,10,18,19,4,42A).
 *
 * Deterministic, DB-free. Asserts exact classifications and key recommendations —
 * not merely that functions return something. Includes the hostile fixture pack.
 */
import { describe, it, expect } from "vitest";
import {
  classifyBudgetMode,
  rankCapitalAllocation,
  evaluateSpend,
  checkConfidenceGate,
  expressAllocation,
  classifyMaterialChange,
  composeUpdatedPlan,
  type AllocationCandidate,
} from "@/domain/owner-budget";
import { HOSTILE_BUDGET_SCENARIOS } from "../../../tests/fixtures/owner-mode/budget-hostile-scenarios";

describe("Budget Mode Classifier", () => {
  it("classifies EMERGENCY on reserve breach", () => {
    const r = classifyBudgetMode({
      finance: { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", revenue: 100000, cashOnHand: 20000, bankBalance: 0 },
      statutoryReserveRequired: 50000,
      dataConfidence: "OPERATIONAL",
    });
    expect(r.primaryMode).toBe("EMERGENCY");
    expect(r.cash.reserveBreached).toBe(true);
  });

  it("classifies DATA_INSUFFICIENT and never fabricates a plan", () => {
    const r = classifyBudgetMode({
      finance: { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR" },
      criticalMissingInputs: ["revenue", "cashOnHand", "fixedCosts"],
      dataConfidence: "UNVERIFIED",
    });
    expect(r.primaryMode).toBe("DATA_INSUFFICIENT");
    expect(r.missingCriticalData.length).toBeGreaterThanOrEqual(3);
  });

  it("requires VERIFIED confidence for SCALE (OPERATIONAL data cannot scale)", () => {
    const operational = classifyBudgetMode({
      finance: { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", revenue: 900000, costOfGoodsOrServices: 400000, fixedCosts: 300000, cashOnHand: 800000, bankBalance: 0 },
      unitEconomicsPositive: true, demandRepeatable: true, ownerDependencyHigh: false, dataConfidence: "OPERATIONAL",
    });
    expect(operational.primaryMode).not.toBe("SCALE");
  });
});

describe("Confidence Gate", () => {
  it("blocks scale/hiring/capex below VERIFIED", () => {
    for (const rec of ["scale", "hiring", "capex", "new_branch", "major_marketing"] as const) {
      expect(checkConfidenceGate(rec, "OPERATIONAL").allowed).toBe(false);
      expect(checkConfidenceGate(rec, "VERIFIED").allowed).toBe(true);
    }
  });
  it("allows capped tests at PARTIAL but not controlled growth", () => {
    expect(checkConfidenceGate("capped_test", "PARTIAL").allowed).toBe(true);
    expect(checkConfidenceGate("controlled_growth", "PARTIAL").allowed).toBe(false);
  });
  it("expresses discretionary amounts as capped ranges below VERIFIED, precise for fixed obligations", () => {
    const disc = expressAllocation(10000, "PARTIAL", false);
    expect(disc.precise).toBeNull();
    expect(disc.range).not.toBeNull();
    const fixed = expressAllocation(10000, "PARTIAL", true);
    expect(fixed.precise).toBe(10000);
  });
});

describe("Capital Allocation Engine", () => {
  const candidates: AllocationCandidate[] = [
    { id: "tax", label: "GST reserve", category: "statutory_payroll_tax", amount: 30000, reversible: false },
    { id: "ads", label: "Paid ads expansion", category: "growth_roi", amount: 40000, reversible: true, expectedReturnPct: 25 },
    { id: "exp", label: "New channel experiment", category: "strategic_experiment", amount: 20000, reversible: true },
  ];

  it("funds statutory/survival first and defers growth in STABILIZE mode", () => {
    const r = rankCapitalAllocation({
      approvedBudget: 50000, reserveRequired: 0, obligationsDueSoon: 0,
      candidates, mode: "STABILIZE", confidence: "OPERATIONAL",
    });
    const tax = r.ranked.find((x) => x.candidate.id === "tax")!;
    const ads = r.ranked.find((x) => x.candidate.id === "ads")!;
    expect(tax.rank).toBeLessThan(ads.rank); // statutory ranked above growth
    expect(tax.decision).toBe("FUND");
    expect(["DEFER", "BLOCK"]).toContain(ads.decision); // growth not funded while stabilizing
  });

  it("blocks scale spend below VERIFIED confidence via the gate", () => {
    const r = rankCapitalAllocation({
      approvedBudget: 100000, candidates: [{ id: "hire", label: "Hire ops lead", category: "scale_after_readiness", amount: 50000, reversible: false }],
      mode: "GROW", confidence: "OPERATIONAL",
    });
    expect(r.ranked[0].decision).toBe("BLOCK");
  });

  it("computes free-to-allocate net of reserves and obligations", () => {
    const r = rankCapitalAllocation({
      approvedBudget: 100000, committedSpend: 20000, paidSpend: 10000, reserveRequired: 30000, obligationsDueSoon: 15000,
      candidates: [], mode: "GROW", confidence: "VERIFIED",
    });
    expect(r.available.freeToAllocate).toBe(25000);
  });
});

describe("Spend Governance Engine", () => {
  const baseSpend = { amount: 5000, category: "supplies", requestedByUserId: "u1", ownerApprovalThreshold: 10000 };

  it("flags self-approval as SOD risk → owner approval", () => {
    const r = evaluateSpend({ ...baseSpend, amount: 4000, approvedByUserId: "u1" });
    expect(r.flags.some((f) => f.includes("SOD_RISK"))).toBe(true);
    expect(r.riskLevel).toBe("CRITICAL");
  });

  it("holds payment on vendor bank change even under emergency", () => {
    const r = evaluateSpend({ ...baseSpend, vendorBankChanged: true, emergency: true });
    expect(r.decision).toBe("HOLD");
    expect(r.flags.some((f) => f.includes("VENDOR_BANK_CHANGE"))).toBe(true);
  });

  it("detects split spend below threshold", () => {
    const r = evaluateSpend({ ...baseSpend, amount: 8000, recentSameCategoryAmounts: [8000, 9000] });
    expect(r.flags.some((f) => f.includes("SPLIT_SPEND_SUSPECTED"))).toBe(true);
  });

  it("auto-logs a small trusted recurring spend", () => {
    const r = evaluateSpend({ ...baseSpend, amount: 800, proofStatus: "reconciled" });
    expect(r.decision).toBe("AUTO_LOG");
    expect(r.riskLevel).toBe("LOW");
  });
});

describe("Reassessment Trigger Classifier", () => {
  it("treats core financial/budget/revenue/proof/cash changes as material + immediate", () => {
    for (const kind of ["budget_line_amount_changed", "spend_entry_added", "spend_proof_disputed", "revenue_changed", "cash_balance_changed"] as const) {
      const r = classifyMaterialChange(kind);
      expect(r.requiresReassessment).toBe(true);
      expect(r.immediate).toBe(true);
    }
  });
  it("treats notes/renames as non-material", () => {
    expect(classifyMaterialChange("note_edited").requiresReassessment).toBe(false);
    expect(classifyMaterialChange("label_renamed").requiresReassessment).toBe(false);
  });
  it("[M8] treats a scheduled cadence review as material planning-class, but not immediate", () => {
    const r = classifyMaterialChange("scheduled_review_due");
    expect(r.requiresReassessment).toBe(true);
    expect(r.triggerClass).toBe("EXTERNAL_PLANNING");
    expect(r.immediate).toBe(false);
  });
});

describe("Updated Owner Plan Composer", () => {
  it("produces a specific, non-generic plan with actions and signals", () => {
    const plan = composeUpdatedPlan({
      assessment: {
        finance: { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", revenue: 300000, costOfGoodsOrServices: 150000, fixedCosts: 100000, cashOnHand: 120000, bankBalance: 0 },
        statutoryReserveRequired: 60000,
        obligations: [{ label: "Payroll", amount: 90000, dueInDays: 5, kind: "payroll" }],
        dataConfidence: "OPERATIONAL",
      },
      change: { field: "obligations", newValue: "payroll_added" },
    });
    expect(plan.mode).toBe("EMERGENCY");
    expect(plan.decisionType).toBe("BLOCK");
    expect(plan.generatedActions.length).toBeGreaterThan(0);
    expect(plan.signals.some((s) => s.type === "updated_plan_ready")).toBe(true);
    expect(plan.nextBestAction.toLowerCase()).not.toBe("review expenses");
  });

  it("blocks high-risk recommendations in DATA_INSUFFICIENT mode", () => {
    const plan = composeUpdatedPlan({
      assessment: {
        finance: { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR" },
        criticalMissingInputs: ["revenue", "cashOnHand", "fixedCosts"],
        dataConfidence: "UNVERIFIED",
      },
    });
    expect(plan.mode).toBe("DATA_INSUFFICIENT");
    expect(plan.highRiskBlocked).toBe(true);
    expect(plan.decisionType).toBe("COLLECT_EVIDENCE");
  });
});

describe("Hostile budget scenario fixture pack", () => {
  for (const s of HOSTILE_BUDGET_SCENARIOS) {
    it(`[hostile] ${s.id}: ${s.description}`, () => {
      const plan = composeUpdatedPlan({ assessment: s.input });
      expect(plan.mode, `${s.id} mode`).toBe(s.expectedMode);
      expect(plan.nextBestAction.toLowerCase(), `${s.id} nextBestAction`).toContain(
        s.expectedNextActionIncludes.toLowerCase()
      );
      // No scenario may approve scale/growth without the right mode.
      if (s.expectedMode !== "SCALE") {
        expect(plan.mode).not.toBe("SCALE");
      }
    });
  }
});

describe("Owner budget plan mode contract", () => {
  it("EMERGENCY mode plan blocks high-risk decisions (decisionType is BLOCK)", () => {
    const plan = composeUpdatedPlan({
      assessment: {
        finance: { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", revenue: 300000, costOfGoodsOrServices: 150000, fixedCosts: 100000, cashOnHand: 120000, bankBalance: 0 },
        statutoryReserveRequired: 60000,
        obligations: [{ label: "Payroll", amount: 90000, dueInDays: 5, kind: "payroll" }],
        dataConfidence: "OPERATIONAL",
      },
    });
    expect(plan.mode).toBe("EMERGENCY");
    expect(plan.decisionType).toBe("BLOCK");
  });
});
