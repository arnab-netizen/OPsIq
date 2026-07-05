/**
 * Constraint / Bottleneck Engine — deterministic detection of the single binding
 * constraint from live signals, honest missing-data behaviour, and integration with
 * the opportunity decision (do not scale into a bottleneck). Pure domain — no DB.
 */
import { describe, it, expect } from "vitest";
import { identifyConstraints, type ConstraintSignals } from "@/domain/owner-mode/constraint-engine";
import { buildOpportunityEnvelope } from "@/domain/owner-mode/opportunity-decision-envelope";
import { screenOpportunity } from "@/domain/owner-mode/opportunity-contract-guardrails";

const AT = "2026-07-04T00:00:00.000Z";
const base = (over: Partial<ConstraintSignals> = {}): ConstraintSignals => ({
  workspaceId: "ws-1", evaluatedAt: AT, cashState: "SAFE", marginSafe: true, ...over,
});

const REQUIRED_FIELDS = [
  "workspaceId", "constraintType", "domain", "severity", "confidence", "evidence", "missingData",
  "businessImpact", "ownerExplanation", "recommendedAction", "ownerApprovalRequired", "riskLevel",
  "cashImpact", "operationalBurden", "successMetric", "stopLoss", "reassessmentTrigger", "evaluatedAt",
];

describe("constraint engine — detection", () => {
  it("every finding carries the full ConstraintFinding shape", () => {
    const top = identifyConstraints(base({ complaintsCount: 12 })).topConstraint!;
    for (const k of REQUIRED_FIELDS) expect(top).toHaveProperty(k);
  });

  it("OWNER bottleneck from owner workload signals", () => {
    const top = identifyConstraints(base({ ownerBottleneckItems: 3, ownerDecisionsRequired: 8, ownerReviewsRequired: 4 })).topConstraint!;
    expect(top.constraintType).toBe("OWNER");
    expect(top.ownerExplanation).toMatch(/bottleneck/i);
  });

  it("STAFF bottleneck from overdue/weak proof", () => {
    const top = identifyConstraints(base({ overdueProofCount: 9, weakProofCount: 3 })).topConstraint!;
    expect(top.constraintType).toBe("STAFF");
  });

  it("DELIVERY bottleneck from linked delivery/late-service complaints (per-event model)", () => {
    const a = identifyConstraints(base({ complaintDeliveryCount: 2 }));
    const d = a.constraints.find((c) => c.constraintType === "DELIVERY");
    expect(d).toBeTruthy();
    expect(d!.evidence.some((e) => /delivery\/late-service complaint/i.test(e))).toBe(true);
  });

  it("PRICING bottleneck from a billing/pricing complaint stays NEEDS_DATA without margin evidence (no fabricated margin)", () => {
    const p = identifyConstraints(base({ marginSafe: null, complaintPricingCount: 1 })).constraints.find((c) => c.constraintType === "PRICING");
    expect(p).toBeTruthy();
    expect(p!.confidence).toBe("NEEDS_DATA");
    expect(p!.missingData.some((m) => /gross margin/i.test(m))).toBe(true);
  });

  it("DELIVERY bottleneck from delivery-delay signal", () => {
    const a = identifyConstraints(base({ deliveryDelaySignal: true }));
    expect(a.constraints.some((c) => c.constraintType === "DELIVERY")).toBe(true);
  });

  it("PRICING/margin bottleneck from unsafe margin or discount leak", () => {
    const top = identifyConstraints(base({ marginSafe: false })).topConstraint!;
    expect(top.constraintType).toBe("PRICING");
    expect(top.ownerApprovalRequired).toBe(true);
  });

  it("CUSTOMER_RETENTION bottleneck from churn risk", () => {
    const a = identifyConstraints(base({ churnRiskScore: 0.7 }));
    expect(a.constraints.some((c) => c.constraintType === "CUSTOMER_RETENTION")).toBe(true);
  });

  it("B2B_ACCOUNT bottleneck from major client loss", () => {
    const a = identifyConstraints(base({ majorClientLoss: true }));
    expect(a.constraints.some((c) => c.constraintType === "B2B_ACCOUNT")).toBe(true);
  });

  it("CASH is the binding constraint and outranks everything else", () => {
    const a = identifyConstraints(base({ cashState: "CRITICAL", complaintsCount: 20, churnRiskScore: 0.9, marginSafe: false }));
    expect(a.topConstraint!.constraintType).toBe("CASH");
    expect(a.topConstraint!.severity).toBe("CRITICAL");
  });

  it("STARTUP_VALIDATION constraint when a startup idea is unvalidated", () => {
    const a = identifyConstraints(base({ startupUnvalidated: true }));
    expect(a.constraints.some((c) => c.constraintType === "STARTUP_VALIDATION")).toBe(true);
    const sv = a.constraints.find((c) => c.constraintType === "STARTUP_VALIDATION")!;
    expect(sv.missingData.length).toBeGreaterThan(0);
  });

  it("DATA_INSUFFICIENT with exact missing data when no signal is present", () => {
    const a = identifyConstraints(base({ cashState: null, marginSafe: null, missingCriticalData: ["latest cash position", "latest margin figures"] }));
    expect(a.topConstraint!.constraintType).toBe("DATA_INSUFFICIENT");
    expect(a.topConstraint!.confidence).toBe("NEEDS_DATA");
    expect(a.topConstraint!.missingData).toContain("latest cash position");
  });

  it("top constraint is deterministic and explainable (stable across calls)", () => {
    const sig = base({ cashState: "AT_RISK", complaintsCount: 12 });
    const t1 = identifyConstraints(sig).topConstraint!;
    const t2 = identifyConstraints(sig).topConstraint!;
    expect(t1.constraintType).toBe(t2.constraintType);
    expect(t1.bindingScore).toBe(t2.bindingScore);
    expect(t1.evidence.length).toBeGreaterThan(0);
  });

  it("workspaceId is echoed from the caller (no cross-workspace bleed in a pure fn)", () => {
    const top = identifyConstraints(base({ workspaceId: "ws-XYZ", marginSafe: false })).topConstraint!;
    expect(top.workspaceId).toBe("ws-XYZ");
  });
});

describe("constraint engine — opportunity integration (do not scale into a bottleneck)", () => {
  const FLOOR = 0.3;
  const envelope = (currentConstraint: any) =>
    buildOpportunityEnvelope({
      opportunityType: "expand B2B volume", marginPct: 0.5, marginFloorPct: FLOOR,
      capacityStatus: "safe" as any, paymentRisk: "low", fitScore: 0.85,
      screen: screenOpportunity({ fitScore: 0.85, marginPct: 0.5, marginFloorPct: FLOOR, capacityStatus: "safe" as any, paymentRisk: "low" }),
      currentConstraint,
    });

  it("a clean deal with NO binding growth constraint stays STRONG and unapproved", () => {
    const e = envelope(null);
    expect(e.verdict).toBe("accept");
    expect(e.upsideBand).toBe("STRONG");
    expect(e.ownerApprovalRequired).toBe(false);
  });

  it("the same deal is owner-gated and capped when a growth-blocking constraint (CAPACITY) is active", () => {
    const e = envelope("CAPACITY");
    expect(e.verdict).toBe("accept");
    expect(e.ownerApprovalRequired).toBe(true);
    expect(e.upsideBand).not.toBe("STRONG"); // capped
    expect(e.ownerApprovalReasons.join(" ")).toMatch(/CAPACITY|constraint/i);
  });

  it("a non-growth-blocking constraint (CUSTOMER_RETENTION) does not gate the deal", () => {
    const e = envelope("CUSTOMER_RETENTION");
    expect(e.ownerApprovalRequired).toBe(false);
    expect(e.upsideBand).toBe("STRONG");
  });
});

describe("constraint engine — dispute-derived constraints", () => {
  it("quality disputes fire a QUALITY constraint", () => {
    const c = identifyConstraints(base({ disputeQualityCount: 2 }));
    expect(c.constraints.some((x) => x.constraintType === "QUALITY" && x.evidence.join(" ").match(/disputed for quality/i))).toBe(true);
  });

  it("staff-attributed disputes fire a STAFF constraint; manager-review-error fires MANAGER", () => {
    expect(identifyConstraints(base({ disputeStaffCount: 2 })).constraints.some((x) => x.constraintType === "STAFF")).toBe(true);
    expect(identifyConstraints(base({ disputeManagerCount: 2 })).constraints.some((x) => x.constraintType === "MANAGER")).toBe(true);
  });

  it("repeated quality disputes can become the binding (top) constraint on an otherwise-safe business", () => {
    const top = identifyConstraints(base({ disputeQualityCount: 3 })).topConstraint!;
    expect(top.constraintType).toBe("QUALITY");
    expect(top.severity).toBe("HIGH");
  });

  it("no disputes → no dispute-derived constraint fabricated", () => {
    expect(identifyConstraints(base()).constraints.some((x) => x.evidence.join(" ").match(/disputed/i))).toBe(false);
  });
});
