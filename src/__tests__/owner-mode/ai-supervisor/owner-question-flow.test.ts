/**
 * Owner QUESTION FLOW — safety proof over the EXISTING structured decision seams (no new advice, no
 * parallel NL brain). The canonical owner questions map to proven pure screens:
 *   "Should I accept this B2B contract?" → screenContractQuote
 *   "Should I spend on marketing this week?" → shouldRunMarketing
 *   "Should I expand / take this opportunity?" → screenOpportunity
 *   "Should I discount?" → screenContractQuote (below-floor price)
 *   "What data do you need?" / "Why is OpsIQ blocking this?" → buildSupervisorSummary (need_more_data /
 *     blocked, with the specific missing data + what-would-change).
 *
 * Proves: a bad idea is challenged (reject/defer, never silent accept); high payment risk / over-capacity
 * defers; a risky contract requires owner approval; missing data yields a specific data request; a blocked
 * action gives a reason. A natural-language "ask anything" flow is intentionally NOT built (parallel brain)
 * and is staged honestly in the report.
 */
import { describe, it, expect } from "vitest";
import {
  screenOpportunity,
  screenContractQuote,
  shouldRunMarketing,
} from "@/domain/owner-mode/opportunity-contract-guardrails";
import { buildSupervisorSummary, type SupervisorInput } from "@/domain/owner-mode/supervisor-summary";

function sup(over: Partial<SupervisorInput>): SupervisorInput {
  return {
    found: true, dominantConstraint: "optimization", topPriorityLabel: "Optimisation", nextBestAction: "Tune within safe bounds.",
    rootCause: "", doNotDo: [], proofRequired: ["completion proof"], reassessmentTriggers: ["KPI breach"], successMetrics: ["margin %"],
    redDomains: [], ownerApprovalRequired: false, ownerOffload: "—", delegatedWork: [], opsiqPreparedWork: [],
    growthScaleAllowed: true, growthBlockedBy: [], overallConfidence: "high", criticalDomainsAllReal: true,
    dataSourceMissing: [], realProviderDomains: ["finance_cash"], assessedDomains: ["finance_cash"], unsafeCount: 0,
    impact: { financeCash: "—", marginPricing: "—", equipmentCapacity: "—", staffWorkload: "—", customerQuality: "—" },
    ownerWorkloadOffload: "—", plan7Day: "", plan30Day: "", ...over,
  };
}

describe("owner question flow — Should I accept this B2B contract?", () => {
  it("challenges a below-margin contract (reject, not accept)", () => {
    const r = screenContractQuote({ price: 80, directCost: 90, marginFloorPct: 0.2, paymentTermsDays: 30, capacityStatus: "safe" });
    expect(r.verdict).toBe("reject");
    expect(r.reasons.join(" ")).toMatch(/below the margin-floor/i);
  });
  it("defers a contract with bad payment terms", () => {
    const r = screenContractQuote({ price: 200, directCost: 100, marginFloorPct: 0.2, paymentTermsDays: 90, capacityStatus: "safe" });
    expect(r.verdict).toBe("defer");
    expect(r.reasons.join(" ")).toMatch(/payment terms/i);
  });
  it("requires owner approval for an acceptable but long-dated contract", () => {
    const r = screenContractQuote({ price: 300, directCost: 100, marginFloorPct: 0.2, paymentTermsDays: 45, capacityStatus: "safe" });
    expect(r.verdict).toBe("accept");
    expect(r.ownerApprovalRequired).toBe(true);
  });
});

describe("owner question flow — Should I spend on marketing this week?", () => {
  it("says NO when cash is unsafe", () => {
    const d = shouldRunMarketing({ financialState: "AT_RISK", capacityStatus: "safe", qualityRed: false, reputationRed: false });
    expect(d.run).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/cash/i);
  });
  it("says NO when quality is red (would amplify a broken experience)", () => {
    const d = shouldRunMarketing({ financialState: "SAFE", capacityStatus: "safe", qualityRed: true, reputationRed: false });
    expect(d.run).toBe(false);
  });
  it("says YES with a stop-loss when cash/capacity/quality permit", () => {
    const d = shouldRunMarketing({ financialState: "SAFE", capacityStatus: "safe", qualityRed: false, reputationRed: false });
    expect(d.run).toBe(true);
    expect(d.stopLossRequired).toBe(true);
  });
});

describe("owner question flow — Should I expand / take this opportunity? Should I discount?", () => {
  it("rejects an over-discounted (below-margin) opportunity", () => {
    const r = screenOpportunity({ fitScore: 0.8, marginPct: 0.05, marginFloorPct: 0.2, capacityStatus: "safe", paymentRisk: "low" });
    expect(r.verdict).toBe("reject");
  });
  it("defers expansion when capacity is saturated or payment risk is high", () => {
    expect(screenOpportunity({ fitScore: 0.8, marginPct: 0.4, marginFloorPct: 0.2, capacityStatus: "blocked", paymentRisk: "low" }).verdict).toBe("defer");
    expect(screenOpportunity({ fitScore: 0.8, marginPct: 0.4, marginFloorPct: 0.2, capacityStatus: "safe", paymentRisk: "high" }).verdict).toBe("defer");
  });
  it("accepts a profitable, fulfillable, low-risk opportunity", () => {
    expect(screenOpportunity({ fitScore: 0.8, marginPct: 0.4, marginFloorPct: 0.2, capacityStatus: "safe", paymentRisk: "low" }).verdict).toBe("accept");
  });
});

describe("owner question flow — What data do you need? Why is OpsIQ blocking this?", () => {
  it("missing data → need_more_data with the specific missing inputs + what-would-change", () => {
    const s = buildSupervisorSummary(sup({ criticalDomainsAllReal: false, dataSourceMissing: ["finance_cash", "working_capital"] }));
    expect(s.actionStatus).toBe("need_more_data");
    expect(s.ledger.missingData).toContain("finance_cash");
    expect(s.ledger.whatWouldChange).toMatch(/finance_cash|working_capital/);
  });
  it("a blocked action gives a reason and never reads as proceed", () => {
    const s = buildSupervisorSummary(sup({ dominantConstraint: "compliance_block" }));
    expect(s.actionStatus).toBe("blocked");
    expect(s.canProceed).toBe(false);
    expect(s.whyItMatters.length).toBeGreaterThan(0);
  });
  it("a risky financial decision requires owner approval (no autonomous execution)", () => {
    const s = buildSupervisorSummary(sup({ dominantConstraint: "cash_survival", ownerApprovalRequired: true }));
    expect(s.actionStatus).toBe("owner_decision_required");
    expect(s.ownerDecisionRequired).not.toBeNull();
  });
});
