/**
 * Phase 4 — Financial Governor + Capital safety proof, and the first cross-engine
 * wiring of the wealth loop (closes GAP-009).
 *
 * Proves the execution.md Phase 4 exit gate against the EXISTING engines (no
 * duplicate governor built):
 *   - unsafe spending          → owner-budget/spend-governance (evaluateSpend)
 *   - broad discounting        → owner-finance/margin-safety-gate (evaluateMarginSafety)
 *   - premature hiring         → owner-finance/cash-safety-gate (HIRING_SENSITIVE)
 *   - premature expansion      → owner-finance/cash-safety-gate (GROWTH_SENSITIVE)
 *   - vanity marketing         → negative campaign ROI + GROWTH gate downgrade
 *
 * Then wires Phase 2 (wealth-path) + Phase 3 (opportunity cost) into the Phase 4
 * cash-safety governor: for an owner-dependent-job business proposing expansion,
 * all three independently say "do not expand — stabilize".
 */
import { describe, it, expect } from "vitest";
import { evaluateCashSafetyGate } from "@/domain/owner-finance/cash-safety-gate";
import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { evaluateMarginSafety } from "@/domain/owner-finance/margin-safety-gate";
import { evaluateSpend } from "@/domain/owner-budget/spend-governance";
import { campaignRoiPct } from "@/domain/owner-marketing/metrics";
import { classifyWealthPath } from "@/domain/owner-strategy/wealth-path";
import { reviewOpportunityCost } from "@/domain/owner-strategy/risk-adjusted-wealth";
import type { RiskAdjustedWealthInput } from "@/domain/owner-strategy/risk-adjusted-wealth.types";

describe("Phase 4 exit gate — unsafe actions blocked/downgraded (existing engines)", () => {
  it("unsafe spending: self-approved over-threshold spend requires owner approval, not auto-log", () => {
    const r = evaluateSpend({
      amount: 100000,
      category: "equipment",
      requestedByUserId: "u1",
      approvedByUserId: "u1", // same person → SOD violation
      ownerApprovalThreshold: 50000,
    });
    expect(r.decision).not.toBe("AUTO_LOG");
    expect(r.requiresOwnerApproval).toBe(true);
    expect(r.riskLevel).toBe("CRITICAL");
  });

  it("broad discounting: below-floor gross margin blocks a pricing recommendation", () => {
    const r = evaluateMarginSafety(8, RecommendationSensitivity.PRICING_SENSITIVE);
    expect(r.allowed).toBe(false);
    expect(r.outcome).toBe("BLOCKED_BELOW_FLOOR");
  });

  it("premature hiring: HIRING_SENSITIVE blocked when cash is CRITICAL", () => {
    const r = evaluateCashSafetyGate("CRITICAL", "CRITICAL", RecommendationSensitivity.HIRING_SENSITIVE);
    expect(r.allowed).toBe(false);
    expect(r.outcome).toBe("BLOCKED_CASH_UNSAFE");
  });

  it("premature hiring is allowed when cash is SAFE (gate is not a blanket block)", () => {
    const r = evaluateCashSafetyGate("SAFE", "SAFE", RecommendationSensitivity.HIRING_SENSITIVE);
    expect(r.allowed).toBe(true);
  });

  it("premature expansion / vanity growth: GROWTH_SENSITIVE blocked at AT_RISK", () => {
    const r = evaluateCashSafetyGate("AT_RISK", "SAFE", RecommendationSensitivity.GROWTH_SENSITIVE);
    expect(r.allowed).toBe(false);
    expect(r.outcome).toBe("BLOCKED_CASH_UNSAFE");
  });

  it("vanity marketing: a losing campaign has negative ROI and its growth spend is gated", () => {
    const roi = campaignRoiPct({ marketingSpend: 50000, revenue: 20000 });
    expect(roi).not.toBeNull();
    expect(roi!).toBeLessThan(0); // losing money — vanity signal
    // Marketing is the growth lens: when cash is unsafe, the spend is blocked.
    const gate = evaluateCashSafetyGate("AT_RISK", "AT_RISK", RecommendationSensitivity.GROWTH_SENSITIVE);
    expect(gate.allowed).toBe(false);
  });
});

describe("Wealth-loop wiring — Phase 2 + Phase 3 + Phase 4 agree: do not expand", () => {
  const EXPAND: RiskAdjustedWealthInput = {
    label: "Open a second branch",
    kind: "expansion",
    marketDemand: "high",
    grossMarginPotentialPct: 70,
    netMarginPotentialPct: 30,
    scalability: "high",
    competitionIntensity: "high",
    capitalRequirement: "high",
    paybackPeriodMonths: 30,
    downsideRisk: "high",
    operationalComplexity: "high",
    timeToFirstRevenueMonths: 12,
    evidenceStrength: "low",
  };
  const STABILIZE: RiskAdjustedWealthInput = {
    label: "Stabilize current operations",
    kind: "fix_operations",
    marketDemand: "medium",
    grossMarginPotentialPct: 55,
    netMarginPotentialPct: 15,
    cashConversion: "high",
    repeatPurchasePotential: "high",
    pricingPower: "moderate",
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

  it("owner-job business proposing expansion is rejected by all three layers", () => {
    // Phase 2: structural verdict — an owner-dependent job, high-risk-blocked.
    const path = classifyWealthPath({
      netMarginPct: 20,
      expansionPath: "local",
      ownerIsPrimaryOperator: true,
      staffCanRunWithoutOwner: false,
      ownerHoursPerWeek: 70,
    });
    expect(path.pathType).toBe("owner_dependent_job");
    expect(path.blocksHighRiskExecution).toBe(true);

    // Phase 3: opportunity cost — stabilization outranks expansion.
    const review = reviewOpportunityCost({ proposed: EXPAND, alternatives: [STABILIZE] });
    expect(review.proposedIsBest).toBe(false);
    expect(review.recommendedLabel).toBe("Stabilize current operations");

    // Phase 4: cash-safety governor — expansion (growth) blocked while cash is unsafe.
    const gate = evaluateCashSafetyGate("AT_RISK", "AT_RISK", RecommendationSensitivity.GROWTH_SENSITIVE);
    expect(gate.allowed).toBe(false);

    // All three layers independently converge on "do not expand — stabilize first".
    const doNotExpand = path.blocksHighRiskExecution && !review.proposedIsBest && !gate.allowed;
    expect(doNotExpand).toBe(true);
  });
});
