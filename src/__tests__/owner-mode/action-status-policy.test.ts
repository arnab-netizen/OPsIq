/**
 * Action-status policy (§3) — the canonical safe action-status spectrum. Proves all 5 statuses are defined
 * and gated: high-risk / missing-data / owner-approval / professional-review can NEVER proceed; low-risk
 * routine SOP actions may proceed; reversible medium-risk actions may cautious_proceed only with
 * proof/reassessment + stop-loss; blocked/need_more_data never render as proceed.
 */
import { describe, it, expect } from "vitest";
import { decideActionStatus, isProceedSafe, isCautiousProceedSafe, type PolicySignals, type SafeActionSignals } from "@/domain/owner-mode/action-status-policy";
import { buildSupervisorSummary, type SupervisorInput } from "@/domain/owner-mode/supervisor-summary";

function signals(over: Partial<PolicySignals> = {}): PolicySignals {
  return {
    unsafe: false, complianceOrProofBoundaryWithoutReview: false, disputedOrFakeProof: false,
    badContractHighRisk: false, cashHardBlock: false, staffOrCustomerSafetyRisk: false,
    highRiskActionWithMissingData: false, likelyBadOutcomeIfFollowed: false,
    criticalDataMissing: false, confidenceNone: false, materialAssumptions: false,
    weakOrOneSidedSource: false, confidenceBelowThreshold: false, highImpactInsufficientEvidence: false,
    financiallyMaterial: false, changesStaffingPayroll: false, changesPricingMaterially: false,
    b2bContractTerms: false, brandComplianceLegalBoundary: false, reversibleButMaterial: false,
    ownerApprovalRequiredByStandingInstruction: false, highRiskFinancialConstraint: false,
    confidence: "high", ...over,
  };
}

function safe(over: Partial<SafeActionSignals> = {}): SafeActionSignals {
  return {
    riskLevel: "low", routine: true, reversible: true, withinApprovedSOP: true,
    ownerApprovalNotRequiredOrGranted: true, evidenceSufficient: true, cashImpactSafe: true,
    staffCapacityOk: true, customerQualityControlled: true, hasStopLoss: true,
    hasProofReassessment: true, noMaterialComplianceRisk: true, ...over,
  };
}

const decide = (o: Partial<PolicySignals>) => decideActionStatus(signals(o)).status;

describe("action-status policy (§3) — safe spectrum is gated", () => {
  it("1. a high-risk case cannot proceed", () => {
    const status = decide({ highRiskFinancialConstraint: true, financiallyMaterial: true, safeAction: safe({ riskLevel: "high" }) });
    expect(status).not.toBe("proceed");
    expect(status).not.toBe("cautious_proceed");
    expect(status).toBe("owner_decision_required");
  });

  it("2. a missing-data case cannot proceed (safe action cannot override need_more_data)", () => {
    expect(decide({ criticalDataMissing: true, safeAction: safe() })).toBe("need_more_data");
    expect(decide({ confidenceNone: true, safeAction: safe() })).toBe("need_more_data");
  });

  it("3. an owner-approval case cannot proceed without approval", () => {
    const status = decide({ ownerApprovalRequiredByStandingInstruction: true, safeAction: safe({ ownerApprovalNotRequiredOrGranted: false }) });
    expect(status).toBe("owner_decision_required");
    // and CAN proceed/cautious only once approval is granted
    expect(decide({ ownerApprovalRequiredByStandingInstruction: true, safeAction: safe({ ownerApprovalNotRequiredOrGranted: true }) })).toBe("proceed");
  });

  it("4. a professional-review boundary cannot proceed (blocked, even with a safe action)", () => {
    expect(decide({ complianceOrProofBoundaryWithoutReview: true, safeAction: safe() })).toBe("blocked");
    expect(decide({ brandComplianceLegalBoundary: true, safeAction: safe({ noMaterialComplianceRisk: false }) })).not.toBe("proceed");
  });

  it("5. a low-risk routine SOP case can proceed", () => {
    expect(decide({ financiallyMaterial: true, safeAction: safe() })).toBe("proceed");
    expect(isProceedSafe(safe())).toBe(true);
  });

  it("6. a reversible medium-risk case can cautious_proceed", () => {
    const status = decide({ financiallyMaterial: true, safeAction: safe({ riskLevel: "medium", routine: false }) });
    expect(status).toBe("cautious_proceed");
    expect(isCautiousProceedSafe(safe({ riskLevel: "medium", routine: false }))).toBe(true);
  });

  it("7. cautious_proceed requires proof/reassessment", () => {
    expect(isCautiousProceedSafe(safe({ riskLevel: "medium", hasProofReassessment: false }))).toBe(false);
    expect(decide({ financiallyMaterial: true, safeAction: safe({ riskLevel: "medium", hasProofReassessment: false }) })).toBe("owner_decision_required");
  });

  it("8. cautious_proceed requires a stop-loss threshold", () => {
    expect(isCautiousProceedSafe(safe({ riskLevel: "medium", hasStopLoss: false }))).toBe(false);
    expect(decide({ financiallyMaterial: true, safeAction: safe({ riskLevel: "medium", routine: false, hasStopLoss: false }) })).toBe("owner_decision_required");
  });

  it("9. proceed requires proof/reassessment", () => {
    expect(isProceedSafe(safe({ hasProofReassessment: false }))).toBe(false);
    expect(decide({ financiallyMaterial: true, safeAction: safe({ hasProofReassessment: false }) })).toBe("owner_decision_required");
  });

  it("10. blocked / need_more_data never render as proceed", () => {
    for (const blockedSig of [{ unsafe: true }, { cashHardBlock: true }, { disputedOrFakeProof: true }, { likelyBadOutcomeIfFollowed: true }, { staffOrCustomerSafetyRisk: true }, { badContractHighRisk: true }, { highRiskActionWithMissingData: true }]) {
      expect(decide({ ...blockedSig, safeAction: safe() })).toBe("blocked");
    }
    for (const needSig of [{ criticalDataMissing: true }, { materialAssumptions: true }, { weakOrOneSidedSource: true }, { confidenceBelowThreshold: true }, { highImpactInsufficientEvidence: true }]) {
      expect(decide({ ...needSig, safeAction: safe() })).toBe("need_more_data");
    }
  });
});

// ── The supervisor reaches all 5 statuses via SupervisorInput (proves the runtime seam supports them) ──
function input(over: Partial<SupervisorInput> = {}): SupervisorInput {
  return {
    found: true, dominantConstraint: "optimization", topPriorityLabel: "Routine optimization",
    nextBestAction: "Reorder approved consumables within the budget threshold.", rootCause: "Stable.",
    doNotDo: [], proofRequired: ["consumable reorder log"], reassessmentTriggers: ["after the reorder is received"],
    successMetrics: ["stock level"], redDomains: [], ownerApprovalRequired: false,
    ownerOffload: "Supervisor handles routine reorders.", delegatedWork: ["Supervisor reorders within budget."],
    opsiqPreparedWork: ["Draft the reorder checklist."], growthScaleAllowed: true, growthBlockedBy: [],
    overallConfidence: "high", criticalDomainsAllReal: true, dataSourceMissing: [],
    realProviderDomains: ["finance_cash", "operations"], assessedDomains: ["finance_cash", "operations"],
    unsafeCount: 0,
    impact: { financeCash: "Within budget.", marginPricing: "No change.", equipmentCapacity: "No change.", staffWorkload: "No change.", customerQuality: "Maintained." },
    ownerWorkloadOffload: "Routine reorder delegated.", plan7Day: "Reorder and verify.", plan30Day: "Re-check stock.",
    ...over,
  };
}

const SAFE = {
  riskLevel: "low" as const, routine: true, reversible: true, withinApprovedSOP: true,
  ownerApprovalNotRequiredOrGranted: true, evidenceSufficient: true, cashImpactSafe: true,
  staffCapacityOk: true, customerQualityControlled: true, hasStopLoss: true, hasProofReassessment: true,
  noMaterialComplianceRisk: true,
};

describe("supervisor reaches all five action statuses", () => {
  it("blocked", () => { expect(buildSupervisorSummary(input({ dominantConstraint: "compliance_block" })).actionStatus).toBe("blocked"); });
  it("need_more_data", () => { expect(buildSupervisorSummary(input({ criticalDomainsAllReal: false, dataSourceMissing: ["finance_cash"] })).actionStatus).toBe("need_more_data"); });
  it("owner_decision_required", () => { expect(buildSupervisorSummary(input({ dominantConstraint: "cash_survival", ownerApprovalRequired: true })).actionStatus).toBe("owner_decision_required"); });
  it("cautious_proceed (safe medium-risk action)", () => {
    const s = buildSupervisorSummary(input({ safeAction: { ...SAFE, riskLevel: "medium", routine: false } }));
    expect(s.actionStatus).toBe("cautious_proceed");
    expect(s.canProceed).toBe(true);
    expect(s.proofNeeded.length).toBeGreaterThan(0);
  });
  it("proceed (safe low-risk routine SOP action)", () => {
    const s = buildSupervisorSummary(input({ safeAction: { ...SAFE } }));
    expect(s.actionStatus).toBe("proceed");
    expect(s.canProceed).toBe(true);
    expect(s.proofNeeded.length).toBeGreaterThan(0);
  });
  it("a safeAction NEVER overrides blocked or need_more_data", () => {
    expect(buildSupervisorSummary(input({ dominantConstraint: "compliance_block", safeAction: { ...SAFE } })).actionStatus).toBe("blocked");
    expect(buildSupervisorSummary(input({ criticalDomainsAllReal: false, safeAction: { ...SAFE } })).actionStatus).toBe("need_more_data");
  });
});
