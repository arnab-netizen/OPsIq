/**
 * Phase 26 — Full realistic wealth-loop simulation suite.
 *
 * Each scenario drives the real composed wealth loop (composeWealthCommandCenter,
 * which reuses every engine) and/or the real safety engines, and proves:
 *   business state used · missing data disclosed · wisdom+source tier ·
 *   financial governor applied · wealth/risk score with inputs · opportunity cost ·
 *   next best move selected/blocked · work package where safe · workload transfer ·
 *   proof requirement · outcome/learning rule · unsafe/uncertain blocked/downgraded.
 */
import { describe, it, expect } from "vitest";
import { composeWealthCommandCenter } from "@/domain/owner-strategy/command-center";
import type { ProposedAction } from "@/domain/owner-strategy/command-center.types";
import type { RiskAdjustedWealthInput } from "@/domain/owner-strategy/risk-adjusted-wealth.types";
import { detectFakeCompletion, verifyCompletion } from "@/services/execution/verification-engine";
import { assessCausality } from "@/domain/execution/outcome-causality";
import { assessScaleReadiness } from "@/domain/execution/scale-readiness";
import { evaluateComplianceGate } from "@/domain/remote-operations/compliance-gate";
import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";

const STABILIZE: RiskAdjustedWealthInput = {
  label: "Stabilize current operations",
  kind: "fix_operations",
  grossMarginPotentialPct: 55,
  netMarginPotentialPct: 15,
  cashConversion: "high",
  repeatPurchasePotential: "high",
  scalability: "low",
  competitionIntensity: "medium",
  differentiationPossibility: "moderate",
  staffProcessRepeatability: "high",
  capitalRequirement: "low",
  paybackPeriodMonths: 3,
  downsideRisk: "low",
  operationalComplexity: "low",
  timeToFirstRevenueMonths: 1,
  evidenceStrength: "high",
};

/** Common invariants that must hold whenever a safe action is recommended. */
function assertPreparedWhenSafe(cc: ReturnType<typeof composeWealthCommandCenter>) {
  if (cc.nextBestMove.decision === "DO_THIS" || cc.nextBestMove.decision === "VALIDATE_FIRST") {
    expect(cc.workPackage, "safe move must produce a Work Package").not.toBeNull();
    expect(cc.proofRequirement, "must define proof").toBeTruthy();
    expect(cc.ownerWorkloadTransfer, "must measure workload transfer").not.toBeNull();
    expect(cc.workPackage!.learningUpdateRule, "must define a learning rule").toMatch(/playbook|reliability/i);
  }
}

describe("Phase 26 — wealth-loop simulations", () => {
  it("1. laundry/local service — SURVIVAL (thin margin, short runway)", () => {
    const cc = composeWealthCommandCenter({
      businessName: "Sparkle Laundry",
      wealthPathInput: { netMarginPct: 3, grossMarginPct: 40, cashRunwayMonths: 2, expansionPath: "local", revenueFrequency: "recurring" },
      proposedAction: { ...STABILIZE, workPackageKind: "sop_creation", assigneeRole: "staff", financialDecision: "APPROVED", problem: "Stabilize thin-margin operation" } as ProposedAction,
      alternatives: [{ label: "Preserve cash", kind: "preserve_cash", downsideRisk: "low", capitalRequirement: "low", evidenceStrength: "high" }],
    });
    expect(cc.wealthPath).not.toBeNull(); // business state used
    expect(cc.wealthPath!.missingInputs.length).toBeGreaterThan(0); // missing data disclosed
    expect(cc.businessModelQuality).not.toBeNull(); // wealth/BMQ score exposed
    expect(cc.wealthPath!.quality.inputsUsed.length).toBeGreaterThan(0); // score inputs exposed
    expect(cc.opportunityCost).not.toBeNull(); // opportunity cost considered
    expect(cc.nextBestMove.decision).toBe("DO_THIS");
    assertPreparedWhenSafe(cc);
  });

  it("2. laundry GROWTH — exciting low-evidence growth loses to stabilize", () => {
    const growth: ProposedAction = {
      label: "Launch paid ads push", kind: "marketing", workPackageKind: "marketing_campaign",
      marketDemand: "high", grossMarginPotentialPct: 60, scalability: "high",
      competitionIntensity: "high", downsideRisk: "high", evidenceStrength: "low",
    };
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 14, grossMarginPct: 55, expansionPath: "local" },
      proposedAction: growth,
      alternatives: [STABILIZE],
    });
    expect(cc.nextBestMove.decision).toBe("CHOOSE_ALTERNATIVE");
    expect(cc.nextBestMove.actionLabel).toBe("Stabilize current operations");
    expect(cc.opportunityCost!.betterAlternativeExists).toBe(true);
  });

  it("3. beginner STARTUP validation — validate-first, launch not authorized", () => {
    const cc = composeWealthCommandCenter({
      mode: "startup",
      startupIntake: { capitalAvailable: 300000, monthlySurvivalNeed: 40000, fastCashVsScale: "fast_cash" },
      startupIdeas: [{
        name: "Local laundry", industry: "laundry",
        structural: { grossMarginPct: 55, netMarginPct: 18, expansionPath: "local", capitalIntensity: "medium", downsideRisk: "low" },
        estimatedStartupCost: 120000, estimatedMonthlyRevenue: 90000, estimatedMonthlyCost: 65000,
      }],
    });
    expect(cc.mode).toBe("startup");
    expect(cc.nextBestMove.decision).toBe("VALIDATE_FIRST");
    expect(cc.startupValidation).not.toBeNull();
    expect(cc.startupValidation!.launchAllowed).toBe(false);
    expect(cc.workPackage!.actionKind).toBe("startup_validation");
    expect(cc.proofRequirement).toBeTruthy();
    expect(cc.ownerWorkloadTransfer).not.toBeNull();
  });

  it("4. STAFF FAKE COMPLETION fails closed (proof validation)", () => {
    // Claimed complete, no evidence, KPI did not move, empty notes → fake.
    expect(detectFakeCompletion(true, false, false, true)).toBe(true);
    const v = verifyCompletion("exec-1", true, false, 0.0, 100, 100, 20, "", false);
    expect(v.outcome_quality).toBe("UNVERIFIED");
    expect(v.fake_completion_risk).toBe(true);
    expect(v.success).toBe(false);
  });

  it("5. MARKETING WASTE — paid ads while cash AT_RISK is blocked", () => {
    const ads: ProposedAction = {
      label: "Paid ads blast", kind: "marketing", workPackageKind: "marketing_campaign",
      marketDemand: "medium", downsideRisk: "high", evidenceStrength: "low",
      riskSensitivity: RecommendationSensitivity.GROWTH_SENSITIVE,
    };
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 6, expansionPath: "local" },
      proposedAction: ads,
      cash: { cashflowState: "AT_RISK", survivalState: "AT_RISK" },
    });
    expect(cc.cashSafety).not.toBeNull();
    expect(cc.cashSafety!.allowed).toBe(false);
    expect(cc.nextBestMove.decision).toBe("BLOCKED");
  });

  it("6. PREMATURE EXPANSION — blocked while cash unsafe", () => {
    const expand: ProposedAction = {
      label: "Open a second branch", kind: "expansion", workPackageKind: "generic",
      marketDemand: "high", capitalRequirement: "high", downsideRisk: "high", evidenceStrength: "low",
      riskSensitivity: RecommendationSensitivity.GROWTH_SENSITIVE,
    };
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 10, expansionPath: "multi_unit" },
      proposedAction: expand,
      cash: { cashflowState: "AT_RISK", survivalState: "SAFE" },
    });
    expect(cc.nextBestMove.decision).toBe("BLOCKED");
    expect(cc.cashSafety!.allowed).toBe(false);
  });

  it("7. WEAK BUSINESS MODEL — trap → stop/pivot/exit offered", () => {
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 1, grossMarginPct: 15, expansionPath: "local", capitalIntensity: "high", workingCapitalPressure: "high", downsideRisk: "high", differentiation: "none", competitiveMoat: "none" },
      proposedAction: { ...STABILIZE, workPackageKind: "sop_creation" } as ProposedAction,
      alternatives: [STABILIZE],
    });
    expect(cc.wealthPath!.pathType).toBe("trap_business");
    expect(cc.wealthPath!.strategicOptions).toEqual(expect.arrayContaining(["stop_investing", "exit"]));
    expect(cc.wealthPath!.blocksHighRiskExecution).toBe(true);
  });

  it("8. CAPITAL ALLOCATION under cash pressure — offensive spend deferred", () => {
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 8 },
      proposedAction: { ...STABILIZE, workPackageKind: "sop_creation" } as ProposedAction,
      capital: {
        approvedBudget: 100000,
        reserveRequired: 80000,
        mode: "EMERGENCY",
        confidence: "LOW",
        candidates: [
          { id: "c1", label: "Survival reserve", category: "survival_reserve", amount: 80000, reversible: false },
          { id: "c2", label: "Growth spend", category: "growth_roi", amount: 50000, reversible: true, expectedReturnPct: 30 },
        ],
      },
    });
    expect(cc.capitalAllocation).not.toBeNull();
    const growth = cc.capitalAllocation!.ranked.find((r) => r.candidate.category === "growth_roi");
    expect(growth).toBeDefined();
    expect(["DEFER", "BLOCK"]).toContain(growth!.decision);
  });

  it("9. COMPLIANCE-SENSITIVE action w/ no local authority → escalate/block", () => {
    const r = evaluateComplianceGate("ACTION_CREATION", {
      complianceSensitive: true, statusClear: false, requiresCertificationOrLicence: true,
      certificationPresentAndValid: false, verifiedExpertSource: false, safetyHazardOpen: false,
    });
    expect(["BLOCKED_FAIL_CLOSED", "ESCALATE_EXPERT", "COMPLIANCE_FLAGGED"]).toContain(r.verdict);
    expect(r.requiresOwnerOrExpertReview).toBe(true);
  });

  it("10. OWNER OVERRIDES FINANCIAL GUARDRAIL — self-approved over-threshold not auto-cleared", () => {
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 12 },
      proposedAction: { ...STABILIZE, workPackageKind: "equipment_purchase", label: "Buy new machine" } as ProposedAction,
      spend: { amount: 200000, category: "equipment", requestedByUserId: "owner", approvedByUserId: "owner", ownerApprovalThreshold: 50000 },
    });
    expect(cc.financialGovernor).not.toBeNull();
    expect(cc.financialGovernor!.requiresOwnerApproval).toBe(true);
    expect(cc.financialGovernor!.decision).not.toBe("AUTO_LOG");
  });

  it("11. CROSS-DOMAIN CONFLICT — attractive growth vs cash safety → cash safety wins", () => {
    const growth: ProposedAction = {
      label: "Aggressive growth push", kind: "expansion", workPackageKind: "generic",
      marketDemand: "high", grossMarginPotentialPct: 75, netMarginPotentialPct: 30, scalability: "high",
      pricingPower: "strong", differentiationPossibility: "strong", downsideRisk: "medium", evidenceStrength: "high",
      riskSensitivity: RecommendationSensitivity.GROWTH_SENSITIVE,
    };
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 25, grossMarginPct: 70, expansionPath: "multi_unit" },
      proposedAction: growth,
      cash: { cashflowState: "INSOLVENT_RISK", survivalState: "CRITICAL" },
    });
    // Even a high-quality growth action is blocked when cash is existential.
    expect(cc.riskAdjustedScore).toBeGreaterThan(40); // it IS attractive on its own
    expect(cc.cashSafety!.allowed).toBe(false);
    expect(cc.nextBestMove.decision).toBe("BLOCKED");
  });

  it("bonus. causality + scale-readiness guards (Phases 9 & 13)", () => {
    // Correlation-only outcome must not be treated as proven.
    const spurious = assessCausality({ hasBaseline: false, temporalOrderCorrect: true, confoundersControlled: false, sampleAdequate: false, alternativeExplanations: 4 });
    expect(spurious.verdict).toBe("SPURIOUS_RISK");
    // Scaling an unstable unit is blocked.
    const scale = assessScaleReadiness({
      cashRunwayWeak: true, grossMarginClear: false, repeatCustomersStrong: false, staffQualityStable: false,
      ownerFirefightingDaily: true, sopManagerLayerWorking: false, complaintsOrReworkRising: true,
      capacityStressed: true, profitImpactVerified: false, revenueGrowing: false,
      managementLayerInPlace: false, operationsRepeatable: false,
    });
    expect(scale.allowed).toBe(false);
    expect(scale.blockedReasons.length).toBeGreaterThan(0);
  });
});
