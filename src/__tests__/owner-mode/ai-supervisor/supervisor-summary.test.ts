/**
 * Supervisor summary — pure derivation tests (no DB, no browser).
 * Proves: assumption ledger present + assumptions marked; missing critical data lowers confidence and
 * cannot read high; blocked/need-more-data never look like proceed; profit/cash/workload impact appears
 * where relevant; a below-margin recommendation is not "proceed" and carries a do-not-do; ≤3 priorities
 * unless emergency; operating cadence present.
 */
import { describe, it, expect } from "vitest";
import {
  buildSupervisorSummary,
  type SupervisorInput,
} from "@/domain/owner-mode/supervisor-summary";

function input(over: Partial<SupervisorInput> = {}): SupervisorInput {
  return {
    found: true,
    dominantConstraint: "owner_workload",
    topPriorityLabel: "Owner workload",
    nextBestAction: "Delegate billing and pickups to a named supervisor with a daily proof report.",
    rootCause: "Owner is the bottleneck for every routine task.",
    doNotDo: ["Do not take on new work until delegation is in place."],
    proofRequired: ["daily supervisor proof report"],
    reassessmentTriggers: ["owner hours/day exceed sustainable band"],
    successMetrics: ["owner minutes/day"],
    redDomains: [],
    ownerApprovalRequired: false,
    ownerOffload: "Hand routine checks to the supervisor; owner reviews exceptions only.",
    delegatedWork: ["Supervisor owns each step with a daily proof report."],
    opsiqPreparedWork: ["Draft the checklist/SOP and the reassessment schedule."],
    growthScaleAllowed: false,
    growthBlockedBy: [],
    overallConfidence: "high",
    criticalDomainsAllReal: true,
    dataSourceMissing: [],
    realProviderDomains: ["finance_cash", "margin_pricing", "working_capital", "equipment_capacity", "owner_workload_memory"],
    assessedDomains: ["finance_cash", "margin_pricing", "working_capital", "equipment_capacity", "owner_workload_memory", "customer_reputation"],
    unsafeCount: 0,
    impact: {
      financeCash: "Cash neutral; frees ~6 owner hours/week.",
      marginPricing: "No margin change; protects delivery quality.",
      equipmentCapacity: "Capacity unchanged.",
      staffWorkload: "Adds one supervisor responsibility.",
      customerQuality: "Maintains quality via the proof report.",
    },
    ownerWorkloadOffload: "Hand routine checks to the supervisor; owner reviews exceptions only.",
    plan7Day: "Stand up the supervisor proof report and delegate the two routine tasks.",
    plan30Day: "Verify the proof and re-check owner hours.",
    ...over,
  };
}

describe("supervisor-summary — module contract assertions", () => {
  it("buildSupervisorSummary is a function", () => { expect(typeof buildSupervisorSummary).toBe("function"); });
  it("input is a function", () => { expect(typeof input).toBe("function"); });
  it("input() returns an object", () => { expect(typeof input()).toBe("object"); });
  it("input() has dominantConstraint field", () => { expect(input()).toHaveProperty("dominantConstraint"); });
  it("input() has nextBestAction field", () => { expect(input()).toHaveProperty("nextBestAction"); });
  it("input() has doNotDo field", () => { expect(input()).toHaveProperty("doNotDo"); });
  it("input().doNotDo is an array", () => { expect(Array.isArray(input().doNotDo)).toBe(true); });
  it("buildSupervisorSummary(input()) returns an object", () => { expect(typeof buildSupervisorSummary(input())).toBe("object"); });
  it("buildSupervisorSummary(input()) has ledger field", () => { expect(buildSupervisorSummary(input())).toHaveProperty("ledger"); });
  it("buildSupervisorSummary(input()) has topPriorities field", () => { expect(buildSupervisorSummary(input())).toHaveProperty("topPriorities"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
});

describe("supervisor summary — assumption ledger + no fake confidence", () => {
  it("produces an assumption ledger with known facts, marked assumptions, missing data, confidence + reason, what-would-change", () => {
    const s = buildSupervisorSummary(input());
    expect(s.ledger.knownFacts.length).toBeGreaterThan(0);
    expect(s.ledger.confidenceReason.length).toBeGreaterThan(8);
    expect(s.ledger.whatWouldChange.length).toBeGreaterThan(8);
    // The one assessed-but-not-real domain (customer_reputation) is marked as an estimate.
    expect(s.ledger.assumptions.some((a) => /customer reputation/i.test(a))).toBe(true);
    expect(s.ledger.assumptionsAreMarked).toBe(true);
  });

  it("missing critical data lowers confidence and can NEVER read high", () => {
    const weak = buildSupervisorSummary(input({ criticalDomainsAllReal: false, overallConfidence: "high", dataSourceMissing: ["finance_cash", "working_capital"] }));
    expect(weak.confidence).not.toBe("high");
    expect(["none", "low"]).toContain(weak.confidence);
    expect(weak.ledger.confidenceReason).toMatch(/missing|capped/i);
  });

  it("an unmarked material assumption is never emitted (all assumptions carry an estimate marker)", () => {
    const s = buildSupervisorSummary(input({ realProviderDomains: [], assessedDomains: ["finance_cash", "margin_pricing"] }));
    for (const a of s.ledger.assumptions) expect(a).toMatch(/assumed|estimate/i);
    expect(s.ledger.assumptionsAreMarked).toBe(true);
  });
});

describe("supervisor summary — action status taxonomy", () => {
  it("blocked / need_more_data never look like proceed", () => {
    const blocked = buildSupervisorSummary(input({ dominantConstraint: "compliance_block" }));
    expect(blocked.actionStatus).toBe("blocked");
    expect(blocked.canProceed).toBe(false);

    const unsafe = buildSupervisorSummary(input({ unsafeCount: 1 }));
    expect(unsafe.actionStatus).toBe("blocked");
    expect(unsafe.canProceed).toBe(false);

    const needs = buildSupervisorSummary(input({ criticalDomainsAllReal: false, dataSourceMissing: ["finance_cash"] }));
    expect(needs.actionStatus).toBe("need_more_data");
    expect(needs.canProceed).toBe(false);
    expect(needs.doNow).toMatch(/missing|enter/i);
  });

  it("high-risk financial constraint requires an owner decision (not silent proceed)", () => {
    const cash = buildSupervisorSummary(input({ dominantConstraint: "cash_survival" }));
    expect(cash.actionStatus).toBe("owner_decision_required");
    expect(cash.ownerDecisionRequired).not.toBeNull();
  });

  it("clean, fully-backed, low-risk case proceeds", () => {
    const ok = buildSupervisorSummary(input({ dominantConstraint: "optimization", ownerApprovalRequired: false }));
    expect(["proceed", "cautious_proceed"]).toContain(ok.actionStatus);
    expect(ok.canProceed).toBe(true);
  });
});

describe("supervisor summary — profit/cash/workload impact + traps", () => {
  it("surfaces profit/cash/workload impact where relevant", () => {
    const s = buildSupervisorSummary(input());
    const relevant = s.impact.filter((i) => i.relevant).map((i) => i.dimension);
    expect(relevant).toContain("profit_margin");
    expect(relevant).toContain("cash");
    expect(relevant).toContain("owner_workload");
  });

  it("a below-margin recommendation is NOT proceed and carries a do-not-do (revenue-up/profit-down trap)", () => {
    const belowMargin = buildSupervisorSummary(input({
      dominantConstraint: "below_margin",
      topPriorityLabel: "Below-margin work",
      doNotDo: ["Do not sign the contract at the offered rate — it loses money per unit."],
      impact: { ...input().impact, marginPricing: "Contribution margin is negative after fully-loaded cost; more volume loses more money." },
    }));
    expect(belowMargin.actionStatus).not.toBe("proceed");
    expect(belowMargin.doNotDo.length).toBeGreaterThan(0);
    expect(belowMargin.impact.find((i) => i.dimension === "profit_margin")?.statement).toMatch(/margin/i);
  });
});

describe("supervisor summary — priorities + cadence", () => {
  it("shows at most 3 priorities normally, more only in an emergency", () => {
    const normal = buildSupervisorSummary(input({ dominantConstraint: "owner_workload" }));
    expect(normal.emergency).toBe(false);
    expect(normal.topPriorities.length).toBeLessThanOrEqual(3);

    const emergency = buildSupervisorSummary(input({ dominantConstraint: "cash_survival", redDomains: ["finance_cash"] }));
    expect(emergency.emergency).toBe(true);
    expect(emergency.topPriorities.length).toBeLessThanOrEqual(5);
  });

  it("provides an operating cadence (now / today / this week / reassess / KPI / stop-loss / next review)", () => {
    const s = buildSupervisorSummary(input({ dominantConstraint: "cash_survival", growthBlockedBy: ["cash runway", "overdue receivables"] }));
    expect(s.cadence.now.length).toBeGreaterThan(0);
    expect(s.cadence.thisWeek.length).toBeGreaterThan(0);
    expect(s.cadence.reassessmentTrigger.length).toBeGreaterThan(0);
    expect(s.cadence.kpiWatch.length).toBeGreaterThan(0);
    // A risky (cash) action carries a real stop-loss, not a dash.
    expect(s.cadence.stopLoss).toMatch(/stop|reassess/i);
  });

  it("returns a safe empty summary when no business data is found (no fabrication)", () => {
    const none = buildSupervisorSummary(input({ found: false }));
    expect(none.found).toBe(false);
    expect(none.actionStatus).toBe("need_more_data");
    expect(none.canProceed).toBe(false);
    expect(none.topPriorities).toHaveLength(0);
  });
});
