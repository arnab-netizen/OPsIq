/**
 * Phases 24-30 — Domain Hardening integration proof.
 *
 * Proves each of the 7 required domains plugs into the wealth loop: a
 * domain-representative action flows through composeWealthCommandCenter (business
 * state → wealth path → next best move → Work Package → proof → owner-workload
 * transfer), AND the domain's own safety gate behaves correctly (reusing existing
 * engines — no domain re-implementation). Each domain's full behavioural suite is
 * cited in the evidence manifest; this file proves loop integration + safety.
 */
import { describe, it, expect } from "vitest";
import { composeWealthCommandCenter } from "@/domain/owner-strategy/command-center";
import type { ProposedAction, WealthCommandCenter } from "@/domain/owner-strategy/command-center.types";
import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { evaluateMarginSafety } from "@/domain/owner-finance/margin-safety-gate";
import { evaluateCashSafetyGate } from "@/domain/owner-finance/cash-safety-gate";
import { campaignRoiPct } from "@/domain/owner-marketing/metrics";
import { assessScaleReadiness } from "@/domain/execution/scale-readiness";
import { detectFakeCompletion } from "@/services/execution/verification-engine";
import { evaluateComplianceGate } from "@/domain/remote-operations/compliance-gate";

/** A domain action, when safe, must be fully prepared by the loop. */
function assertLoopIntegration(cc: WealthCommandCenter) {
  expect(cc.wealthPath, "wealth path (business state) used").not.toBeNull();
  expect(cc.nextBestMove, "next best move produced").toBeTruthy();
  if (cc.nextBestMove.decision === "DO_THIS" || cc.nextBestMove.decision === "VALIDATE_FIRST") {
    expect(cc.workPackage, "Work Package generated").not.toBeNull();
    expect(cc.proofRequirement, "proof requirement generated").toBeTruthy();
    expect(cc.ownerWorkloadTransfer, "owner workload transfer measured").not.toBeNull();
  }
}

function action(over: Partial<ProposedAction> & Pick<ProposedAction, "label" | "kind" | "workPackageKind">): ProposedAction {
  return { downsideRisk: "low", evidenceStrength: "medium", financialDecision: "APPROVED", assigneeRole: "staff", ...over };
}

describe("Domain Hardening — each domain plugs into the wealth loop + safety gate", () => {
  it("FINANCE (Phase 24): action flows through loop; unsafe discount + spend blocked", () => {
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 12, grossMarginPct: 45 },
      proposedAction: action({ label: "Tighten cash controls", kind: "fix_operations", workPackageKind: "sop_creation" }),
      alternatives: [{ label: "Preserve cash", kind: "preserve_cash", downsideRisk: "low", evidenceStrength: "high" }],
    });
    assertLoopIntegration(cc);
    // Finance safety gates (existing engines): below-floor discount + cash-critical spend blocked.
    expect(evaluateMarginSafety(8, RecommendationSensitivity.PRICING_SENSITIVE).allowed).toBe(false);
    expect(evaluateCashSafetyGate("CRITICAL", "CRITICAL", RecommendationSensitivity.FINANCE_SENSITIVE).allowed).toBe(false);
  });

  it("SALES (Phase 25): reactivation flows through loop with a customer script + proof", () => {
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 14, repeatCustomerPct: 30 },
      proposedAction: action({ label: "Reactivate dormant customers", kind: "customer_retention", workPackageKind: "customer_reactivation" }),
    });
    assertLoopIntegration(cc);
    expect(cc.workPackage!.preparedArtifacts.some((a) => a.kind === "customer_script")).toBe(true);
    expect(cc.nextBestMove.decision).toBe("DO_THIS");
  });

  it("MARKETING (Phase 26): campaign flows through loop; losing ROI + unsafe growth gated", () => {
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 10 },
      proposedAction: action({ label: "Referral campaign", kind: "marketing", workPackageKind: "marketing_campaign" }),
    });
    assertLoopIntegration(cc);
    expect(campaignRoiPct({ marketingSpend: 50000, revenue: 20000 })!).toBeLessThan(0); // vanity signal
    expect(evaluateCashSafetyGate("AT_RISK", "AT_RISK", RecommendationSensitivity.GROWTH_SENSITIVE).allowed).toBe(false);
  });

  it("OPERATIONS (Phase 27): SOP action flows through loop; unstable ops not scale-ready", () => {
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 11 },
      proposedAction: action({ label: "Document opening/closing SOP", kind: "sop_creation", workPackageKind: "sop_creation" }),
    });
    assertLoopIntegration(cc);
    expect(cc.workPackage!.preparedArtifacts.some((a) => a.kind === "sop")).toBe(true);
    const scale = assessScaleReadiness({
      cashRunwayWeak: false, grossMarginClear: true, repeatCustomersStrong: true, staffQualityStable: false,
      ownerFirefightingDaily: true, sopManagerLayerWorking: false, complaintsOrReworkRising: true,
      capacityStressed: true, profitImpactVerified: true, revenueGrowing: true,
      managementLayerInPlace: false, operationsRepeatable: false,
    });
    expect(scale.allowed).toBe(false);
  });

  it("WORKFORCE (Phase 28): training flows through loop; fake completion detected", () => {
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 13 },
      proposedAction: action({ label: "Train staff on quality standard", kind: "staff_training", workPackageKind: "staff_training" }),
    });
    assertLoopIntegration(cc);
    expect(cc.workPackage!.preparedArtifacts.some((a) => a.kind === "training_plan")).toBe(true);
    // Fake-work resistance (existing proof engine).
    expect(detectFakeCompletion(true, false, false, true)).toBe(true);
  });

  it("COMPLIANCE (Phase 29): compliance-sensitive action escalates/blocks (no hallucination)", () => {
    const r = evaluateComplianceGate("ACTION_CREATION", {
      complianceSensitive: true, statusClear: false, requiresCertificationOrLicence: true,
      certificationPresentAndValid: false, verifiedExpertSource: false, safetyHazardOpen: false,
    });
    expect(r.verdict).toBe("BLOCKED_FAIL_CLOSED");
    expect(r.requiresOwnerOrExpertReview).toBe(true);
  });

  it("STRATEGY (Phase 30): weak model → stop/pivot/exit offered, high-risk blocked", () => {
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 1, grossMarginPct: 12, capitalIntensity: "high", workingCapitalPressure: "high", downsideRisk: "high", differentiation: "none", competitiveMoat: "none", expansionPath: "local" },
      proposedAction: action({ label: "Double down on the failing line", kind: "expansion", workPackageKind: "generic", downsideRisk: "high", evidenceStrength: "low" }),
      alternatives: [{ label: "Preserve cash", kind: "preserve_cash", downsideRisk: "low", evidenceStrength: "high" }],
    });
    expect(cc.wealthPath!.pathType).toBe("trap_business");
    expect(cc.wealthPath!.strategicOptions).toEqual(expect.arrayContaining(["pivot", "exit", "stop_investing"]));
    expect(cc.wealthPath!.blocksHighRiskExecution).toBe(true);
  });

  it("CROSS-DOMAIN (Phase 31): cash safety overrides an attractive growth push", () => {
    const cc = composeWealthCommandCenter({
      wealthPathInput: { netMarginPct: 22, grossMarginPct: 65, expansionPath: "multi_unit", differentiation: "strong", competitiveMoat: "strong" },
      proposedAction: action({
        label: "Scale across the city", kind: "expansion", workPackageKind: "generic",
        marketDemand: "high", grossMarginPotentialPct: 65, netMarginPotentialPct: 22, scalability: "high",
        pricingPower: "strong", differentiationPossibility: "strong", cashConversion: "high", repeatPurchasePotential: "high",
        downsideRisk: "medium", evidenceStrength: "high", riskSensitivity: RecommendationSensitivity.GROWTH_SENSITIVE,
      }),
      cash: { cashflowState: "INSOLVENT_RISK", survivalState: "CRITICAL" },
    });
    expect(cc.riskAdjustedScore!).toBeGreaterThan(40); // attractive in isolation
    expect(cc.nextBestMove.decision).toBe("BLOCKED"); // cash safety wins
  });
});
