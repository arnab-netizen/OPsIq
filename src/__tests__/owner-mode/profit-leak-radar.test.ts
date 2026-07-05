/**
 * Profit-Leak Radar — deterministic detection of the highest-value profit leak from live
 * signals, honest missing-data / no-fabricated-ROI behaviour, constraint linkage, and
 * opportunity gating (do not scale volume through a cash/margin leak). Pure — no DB.
 */
import { describe, it, expect } from "vitest";
import { identifyProfitLeaks, type ProfitLeakSignals } from "@/domain/owner-mode/profit-leak-radar";
import { buildOpportunityEnvelope } from "@/domain/owner-mode/opportunity-decision-envelope";
import { screenOpportunity } from "@/domain/owner-mode/opportunity-contract-guardrails";

const AT = "2026-07-04T00:00:00.000Z";
const base = (over: Partial<ProfitLeakSignals> = {}): ProfitLeakSignals => ({
  workspaceId: "ws-1", currency: "USD", evaluatedAt: AT, ...over,
});
const REQUIRED = [
  "workspaceId", "leakType", "domain", "severity", "confidence", "evidence", "missingData",
  "estimatedImpact", "cashImpact", "marginImpact", "ownerExplanation", "recommendedAction",
  "ownerApprovalRequired", "riskLevel", "operationalBurden", "successMetric", "stopLoss",
  "reassessmentTrigger", "relatedConstraint", "evaluatedAt",
];

describe("profit-leak radar — detection", () => {
  it("every finding carries the full ProfitLeakFinding shape", () => {
    const top = identifyProfitLeaks(base({ complaintsCount: 12 })).topLeak!;
    for (const k of REQUIRED) expect(top).toHaveProperty(k);
    expect(top.recommendedAction.length).toBeGreaterThan(0);
    expect(top.successMetric.length).toBeGreaterThan(0);
    expect(top.stopLoss.length).toBeGreaterThan(0);
    expect(top.reassessmentTrigger.length).toBeGreaterThan(0);
  });

  it("DISCOUNT_LEAK from a real discount amount reports the figure and never fabricates savings", () => {
    const top = identifyProfitLeaks(base({ revenue: 20000, discountAmount: 4000 })).topLeak!;
    expect(top.leakType).toBe("DISCOUNT_LEAK");
    expect(top.estimatedImpact.rangeHigh).toBe(4000); // the real discount figure
    expect(top.estimatedImpact.rangeLow).toBe(0);
    expect(top.estimatedImpact.note).toMatch(/recoverable|not a guaranteed/i);
    expect(top.ownerApprovalRequired).toBe(true);
  });

  it("missing margin downgrades discount-leak confidence and discloses the gap", () => {
    const top = identifyProfitLeaks(base({ revenue: 20000, discountAmount: 4000, marginPct: null })).topLeak!;
    expect(top.confidence).toBe("LOW");
    expect(top.missingData.join(" ")).toMatch(/margin/i);
  });

  it("LOW_MARGIN_B2B returns NEEDS_DATA when margin is unknown", () => {
    const l = identifyProfitLeaks(base({ lowMarginB2BAccount: true, marginPct: null }));
    const b2b = l.leaks.find((x) => x.leakType === "LOW_MARGIN_B2B")!;
    expect(b2b.confidence).toBe("NEEDS_DATA");
    expect(b2b.estimatedImpact.tier).toBe("NEEDS_DATA");
    expect(b2b.missingData.length).toBeGreaterThan(0);
  });

  it("REPEAT_CUSTOMER_DECLINE from weak repeat share", () => {
    const l = identifyProfitLeaks(base({ newCustomers: 40, repeatCustomers: 8 }));
    expect(l.leaks.some((x) => x.leakType === "REPEAT_CUSTOMER_DECLINE")).toBe(true);
  });

  it("COMPLAINT_REVENUE_RISK from a complaint spike", () => {
    const l = identifyProfitLeaks(base({ complaintsCount: 12 }));
    expect(l.leaks.some((x) => x.leakType === "COMPLAINT_REVENUE_RISK")).toBe(true);
  });

  it("staff signal creates a productivity/weak-proof leak", () => {
    const weak = identifyProfitLeaks(base({ weakProofCount: 3 })).leaks;
    expect(weak.some((x) => x.leakType === "WEAK_PROOF_REWORK_RISK")).toBe(true);
    const slow = identifyProfitLeaks(base({ overdueProofCount: 5 })).leaks;
    expect(slow.some((x) => x.leakType === "STAFF_PRODUCTIVITY_DROP")).toBe(true);
  });

  it("DELIVERY_DELAY_COST from a linked delivery complaint; measured only when an amount is supplied", () => {
    const qual = identifyProfitLeaks(base({ deliveryComplaintCount: 2 })).leaks.find((x) => x.leakType === "DELIVERY_DELAY_COST");
    expect(qual).toBeTruthy();
    expect(qual!.estimatedImpact.rangeHigh).toBeUndefined(); // no fabricated figure
    const measured = identifyProfitLeaks(base({ deliveryComplaintCount: 2, deliveryComplaintImpactAmount: 75 })).leaks.find((x) => x.leakType === "DELIVERY_DELAY_COST");
    expect(measured!.estimatedImpact.rangeHigh).toBe(75);
    expect(measured!.confidence).toBe("HIGH");
  });

  it("a pricing complaint drives a PRICING leak that stays NEEDS_DATA without an amount (no fabricated undercharge)", () => {
    const noAmt = identifyProfitLeaks(base({ pricingComplaintCount: 1 })).leaks.find((x) => x.leakType === "PRICING_UNDERCHARGE");
    expect(noAmt).toBeTruthy();
    expect(noAmt!.estimatedImpact.tier).toBe("NEEDS_DATA");
    expect(noAmt!.confidence).toBe("NEEDS_DATA");
    expect(noAmt!.missingData.length).toBeGreaterThan(0);
    const amt = identifyProfitLeaks(base({ pricingComplaintCount: 1, pricingComplaintImpactAmount: 120 })).leaks.find((x) => x.leakType === "PRICING_UNDERCHARGE");
    expect(amt!.estimatedImpact.rangeHigh).toBe(120);
  });

  it("DELIVERY_DELAY_COST when the delivery signal exists", () => {
    const l = identifyProfitLeaks(base({ deliveryDelaySignal: true }));
    expect(l.leaks.some((x) => x.leakType === "DELIVERY_DELAY_COST")).toBe(true);
  });

  it("OWNER_BOTTLENECK_COST from owner workload signals", () => {
    const l = identifyProfitLeaks(base({ ownerBottleneckItems: 2, ownerDecisionsRequired: 8, ownerReviewsRequired: 4 }));
    expect(l.leaks.some((x) => x.leakType === "OWNER_BOTTLENECK_COST")).toBe(true);
  });

  it("CASH_RISK_GROWTH is the top leak, owner-gated, and outranks softer leaks", () => {
    const top = identifyProfitLeaks(base({ cashRiskGrowth: true, complaintsCount: 20 })).topLeak!;
    expect(top.leakType).toBe("CASH_RISK_GROWTH");
    expect(top.ownerApprovalRequired).toBe(true);
    expect(top.riskLevel).toBe("HIGH");
  });

  it("DATA_INSUFFICIENT with exact missing data when no signal is present", () => {
    const top = identifyProfitLeaks(base({ missingCriticalData: ["revenue + discount amount", "gross margin %"] })).topLeak!;
    expect(top.leakType).toBe("DATA_INSUFFICIENT");
    expect(top.confidence).toBe("NEEDS_DATA");
    expect(top.estimatedImpact.tier).toBe("NEEDS_DATA");
    expect(top.missingData).toContain("revenue + discount amount");
  });

  it("top leak is deterministic and explainable, and links the current constraint", () => {
    const sig = base({ complaintsCount: 12, currentConstraint: "QUALITY" });
    const a = identifyProfitLeaks(sig).topLeak!;
    const b = identifyProfitLeaks(sig).topLeak!;
    expect(a.leakType).toBe(b.leakType);
    expect(a.leakScore).toBe(b.leakScore);
    expect(a.relatedConstraint).toBe("QUALITY");
    expect(a.evidence.length).toBeGreaterThan(0);
  });

  it("echoes the caller workspaceId (pure fn — no cross-workspace bleed)", () => {
    const top = identifyProfitLeaks(base({ workspaceId: "ws-XYZ", complaintsCount: 12 })).topLeak!;
    expect(top.workspaceId).toBe("ws-XYZ");
  });
});

describe("profit-leak radar — opportunity integration (do not scale through a cash/margin leak)", () => {
  const FLOOR = 0.3;
  const envelope = (activeProfitLeak: any) =>
    buildOpportunityEnvelope({
      opportunityType: "scale B2B volume", marginPct: 0.5, marginFloorPct: FLOOR,
      capacityStatus: "safe" as any, paymentRisk: "low", fitScore: 0.85,
      screen: screenOpportunity({ fitScore: 0.85, marginPct: 0.5, marginFloorPct: FLOOR, capacityStatus: "safe" as any, paymentRisk: "low" }),
      activeProfitLeak,
    });

  it("no active leak → clean deal stays STRONG and unapproved", () => {
    const e = envelope(null);
    expect(e.upsideBand).toBe("STRONG");
    expect(e.ownerApprovalRequired).toBe(false);
  });

  it("an active DISCOUNT_LEAK owner-gates and caps the deal", () => {
    const e = envelope("DISCOUNT_LEAK");
    expect(e.ownerApprovalRequired).toBe(true);
    expect(e.upsideBand).not.toBe("STRONG");
    expect(e.ownerApprovalReasons.join(" ")).toMatch(/profit leak|DISCOUNT_LEAK/i);
  });

  it("a soft leak (COMPLAINT_REVENUE_RISK) does not gate the deal", () => {
    const e = envelope("COMPLAINT_REVENUE_RISK");
    expect(e.ownerApprovalRequired).toBe(false);
    expect(e.upsideBand).toBe("STRONG");
  });
});

describe("profit-leak radar — dispute-derived leaks", () => {
  it("a rework/quality dispute fires REWORK_REDO_COST with qualitative (NEEDS_DATA) impact", () => {
    const l = identifyProfitLeaks(base({ disputeReworkCount: 2 }));
    const leak = l.leaks.find((x) => x.leakType === "REWORK_REDO_COST")!;
    expect(leak).toBeTruthy();
    expect(leak.evidence.join(" ")).toMatch(/disputed as rework/i);
    expect(leak.estimatedImpact.tier).toBe("NEEDS_DATA"); // no fabricated redo cost
    expect(leak.relatedConstraint).toBe("QUALITY");
  });

  it("a customer-complaint dispute fires COMPLAINT_REVENUE_RISK, disclosing the missing complaint model", () => {
    const leak = identifyProfitLeaks(base({ disputeComplaintCount: 1 })).leaks.find((x) => x.leakType === "COMPLAINT_REVENUE_RISK")!;
    expect(leak).toBeTruthy();
    expect(leak.missingData.join(" ")).toMatch(/qualitative/i);
    expect(leak.estimatedImpact.rangeLow).toBeUndefined(); // no fabricated revenue figure

    // With a real measured amount, the impact is quantified (not fabricated).
    const measured = identifyProfitLeaks(base({ disputeComplaintCount: 1, disputeComplaintImpactAmount: 250 })).leaks.find((x) => x.leakType === "COMPLAINT_REVENUE_RISK")!;
    expect(measured.estimatedImpact.rangeLow).toBe(250);
  });

  it("a wrong/fake/manager-error dispute fires WEAK_PROOF_REWORK_RISK and can be the top leak", () => {
    const top = identifyProfitLeaks(base({ disputeWeakProofCount: 4 })).topLeak!;
    expect(top.leakType).toBe("WEAK_PROOF_REWORK_RISK");
    expect(top.severity).toBe("HIGH");
  });

  it("no disputes → no dispute-derived leak fabricated", () => {
    const leaks = identifyProfitLeaks(base()).leaks;
    expect(leaks.some((x) => x.evidence.join(" ").match(/disputed/i))).toBe(false);
  });
});
