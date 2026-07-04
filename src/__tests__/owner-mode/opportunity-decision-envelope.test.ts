/**
 * Wealth / Opportunity / Profit Generation Mode hardening — the owner-decision envelope.
 *
 * Proves each opportunity recommendation carries the Wealth Standard fields and that the
 * envelope is honest under adversarial inputs: it never fabricates upside when margin is
 * unknown, forces owner approval for risky/data-blind/high-capital moves, and always
 * offers a bounded first *test* action with a success metric, stop-loss, and reassessment
 * trigger. Pure domain — no DB.
 */
import { describe, it, expect } from "vitest";
import { buildOpportunityEnvelope } from "@/domain/owner-mode/opportunity-decision-envelope";
import { screenOpportunity } from "@/domain/owner-mode/opportunity-contract-guardrails";

const FLOOR = 0.3;
const mk = (over: Partial<Parameters<typeof buildOpportunityEnvelope>[0]> = {}) => {
  const marginPct = over.marginPct === undefined ? 0.5 : over.marginPct;
  const capacityStatus = over.capacityStatus ?? ("safe" as any);
  const paymentRisk = over.paymentRisk ?? "low";
  const fitScore = over.fitScore ?? 0.8;
  const screen = over.screen ?? screenOpportunity({ fitScore, marginPct, marginFloorPct: FLOOR, capacityStatus, paymentRisk });
  return buildOpportunityEnvelope({
    opportunityType: over.opportunityType ?? "B2B contract",
    screen, marginPct, marginFloorPct: FLOOR, capacityStatus, paymentRisk, fitScore,
    estimatedCapitalOutlay: over.estimatedCapitalOutlay ?? null,
    capitalApprovalThreshold: over.capitalApprovalThreshold,
  });
};

describe("opportunity decision envelope (Wealth Standard)", () => {
  it("carries every required owner-decision field", () => {
    const e = mk();
    for (const k of [
      "opportunityType", "verdict", "upsideBand", "confidence", "riskClass", "requiredData",
      "missingData", "downsideRisk", "cashImpact", "operationalBurden", "ownerApprovalRequired",
      "firstTestAction", "successMetric", "stopLossCondition", "reassessmentTrigger",
    ]) {
      expect(e).toHaveProperty(k);
    }
    expect(e.firstTestAction.length).toBeGreaterThan(0);
    expect(e.successMetric.length).toBeGreaterThan(0);
    expect(e.stopLossCondition.length).toBeGreaterThan(0);
    expect(e.reassessmentTrigger.length).toBeGreaterThan(0);
  });

  it("a clean, high-fit, healthy-capacity, low-risk deal is STRONG/HIGH and needs no approval", () => {
    const e = mk({ marginPct: 0.5, fitScore: 0.85, paymentRisk: "low" });
    expect(e.verdict).toBe("accept");
    expect(e.confidence).toBe("HIGH");
    expect(e.upsideBand).toBe("STRONG");
    expect(e.ownerApprovalRequired).toBe(false);
    expect(e.firstTestAction).toMatch(/pilot/i);
  });

  it("MISSING margin never fabricates upside — LOW confidence, discloses gap, forces owner approval", () => {
    const e = mk({ marginPct: null });
    expect(e.confidence).toBe("LOW");
    expect(e.upsideBand).toBe("UNKNOWN_INSUFFICIENT_DATA");
    expect(e.missingData.join(" ")).toMatch(/margin/i);
    expect(e.riskClass).toBe("HIGH");
    expect(e.ownerApprovalRequired).toBe(true);
    expect(e.cashImpact).toMatch(/unknown/i);
  });

  it("HIGH payment risk forces owner approval and flags working-capital downside", () => {
    const e = mk({ paymentRisk: "high" });
    // screenOpportunity defers high payment risk
    expect(e.verdict).toBe("defer");
    expect(e.ownerApprovalRequired).toBe(true);
    expect(e.ownerApprovalReasons.join(" ")).toMatch(/payment/i);
    expect(e.firstTestAction).toMatch(/hold|pilot only after/i);
  });

  it("margin below the floor is REJECTED and not dressed up with upside", () => {
    const e = mk({ marginPct: 0.1 });
    expect(e.verdict).toBe("reject");
    expect(e.upsideBand).toBe("MARGINAL");
    expect(e.firstTestAction).toMatch(/do not pursue/i);
  });

  it("large capital outlay forces owner approval even when the screen accepts", () => {
    const e = mk({ estimatedCapitalOutlay: 100000, capitalApprovalThreshold: 25000 });
    expect(e.verdict).toBe("accept");
    expect(e.riskClass).toBe("HIGH");
    expect(e.ownerApprovalRequired).toBe(true);
    expect(e.ownerApprovalReasons.join(" ")).toMatch(/capital outlay/i);
    expect(e.cashImpact).toMatch(/capital|runway/i);
  });

  it("thin margin (just above floor) is owner-gated and only MARGINAL upside", () => {
    const e = mk({ marginPct: FLOOR + 0.02, fitScore: 0.85 });
    expect(e.verdict).toBe("accept");
    expect(e.upsideBand).toBe("MARGINAL");
    expect(e.ownerApprovalRequired).toBe(true);
    expect(e.ownerApprovalReasons.join(" ")).toMatch(/thin-margin|floor/i);
  });
});
