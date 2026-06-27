/**
 * Slice 5 engines — underinvestment detection (Section 24) and collusion/fraud
 * risk (Section 25), plus their integration into the updated owner plan.
 * Deterministic, DB-free. Asserts exact classifications and signals.
 */
import { describe, it, expect } from "vitest";
import {
  detectUnderinvestment,
  detectCollusionRisk,
  composeUpdatedPlan,
} from "@/domain/owner-budget";

describe("Underinvestment Detection", () => {
  it("flags harmful underinvestment when cash is safe and a trend is adverse", () => {
    const r = detectUnderinvestment({ cashSafe: true, marketingUnderfunded: true, revenueTargetMissed: true, maintenanceUnderfunded: true, downtimeRising: true });
    expect(r.hasHarmful).toBe(true);
    expect(r.findings.find((f) => f.area === "marketing")?.classification).toBe("harmful_underinvestment");
    expect(r.findings.find((f) => f.area === "maintenance")?.classification).toBe("harmful_underinvestment");
  });

  it("treats underspend during cash stress as cash preservation, not harmful", () => {
    const r = detectUnderinvestment({ cashSafe: false, maintenanceUnderfunded: true, downtimeRising: true });
    expect(r.hasHarmful).toBe(false);
    expect(r.findings[0].classification).toBe("delayed_necessary_spend");
  });

  it("treats underspend with no adverse trend as good savings", () => {
    const r = detectUnderinvestment({ cashSafe: true, trainingUnderfunded: true, reworkRising: false });
    expect(r.findings[0].classification).toBe("good_savings");
  });
});

describe("Collusion / fraud risk", () => {
  it("flags repeated self-approval as a high-severity owner-review pattern", () => {
    const r = detectCollusionRisk({ selfApprovalCount: 3 });
    expect(r.hasRisk).toBe(true);
    expect(r.requiresOwnerReview).toBe(true);
    expect(r.findings.some((f) => f.pattern === "self_approval_pattern")).toBe(true);
  });

  it("flags split-spend clusters and approver concentration", () => {
    expect(detectCollusionRisk({ splitSpendClusterCount: 4 }).findings.some((f) => f.pattern === "split_spend_cluster")).toBe(true);
    expect(detectCollusionRisk({ sameApproverEmployeePairCount: 6 }).findings.some((f) => f.pattern === "approver_employee_concentration")).toBe(true);
  });

  it("reports no risk on clean data and never accuses", () => {
    const r = detectCollusionRisk({ selfApprovalCount: 1, splitSpendClusterCount: 1 });
    expect(r.hasRisk).toBe(false);
  });
});

describe("Updated plan integrates Slice 5 engines", () => {
  const finance = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", revenue: 500000, costOfGoodsOrServices: 250000, fixedCosts: 150000, cashOnHand: 400000 };

  it("emits underinvestment_detected + an INCREASE action", () => {
    const plan = composeUpdatedPlan({
      assessment: {
        finance, dataConfidence: "OPERATIONAL",
        underinvestment: { marketingUnderfunded: true, revenueTargetMissed: true },
      },
    });
    expect(plan.signals.some((s) => s.type === "underinvestment_detected")).toBe(true);
    expect(plan.generatedActions.some((a) => a.decisionType === "INCREASE" && a.title.toLowerCase().includes("marketing"))).toBe(true);
  });

  it("emits an approval-bypass signal + owner-review restriction on self-approval pattern", () => {
    const plan = composeUpdatedPlan({
      assessment: {
        finance, dataConfidence: "OPERATIONAL",
        collusion: { selfApprovalCount: 3 },
      },
    });
    expect(plan.signals.some((s) => s.type === "approval_bypass_risk")).toBe(true);
    expect(plan.spendRestrictions.some((r) => r.toLowerCase().includes("owner review required"))).toBe(true);
  });
});
