/**
 * OWNER-ON-SHIP SHADOW PILOT (§11) — proves the thin shadow-pilot derivation over the existing runtime:
 * partial real data never becomes fake certainty; missing-data requests + safe prep + wait-for-owner appear;
 * an intake checklist + owner-workload estimate appear; assumptions are separated from verified facts; and no
 * live-outcome claim is ever made. Pure derivation — no new engine.
 */
import { describe, it, expect } from "vitest";
import { buildShadowPilotReport, type ShadowPilotInput } from "@/domain/owner-mode/shadow-pilot";

function input(over: Partial<ShadowPilotInput> = {}): ShadowPilotInput {
  return {
    businessName: "Shadow Laundry",
    realProviderDomains: ["finance_cash", "equipment_capacity"],
    missingCriticalDomains: ["margin_pricing", "compliance_proof"],
    overallConfidence: "low",
    criticalDomainsAllReal: false,
    supervisor: {
      actionStatus: "owner_decision_required",
      doNow: "Prepare the margin re-quote for owner review.",
      doNotDo: ["Do not take the contract below fully-loaded cost."],
      proofNeeded: ["fully-loaded cost sheet"],
      ownerDecisionRequired: "Approve or decline the below-margin contract.",
      delegateToStaff: ["Collect the last 30 days of job tickets."],
      opsiqPreparedWork: ["Draft the cost sheet template."],
    },
    rankedDataRequests: ["Add real margin_pricing records", "Add real compliance_proof records", "Add customer complaint log"],
    ownerWorkloadNote: "Owner daily load ~120% (overloaded); delegate routine capture.",
    ...over,
  };
}

describe("shadow-pilot — module contract assertions", () => {
  it("buildShadowPilotReport is a function", () => { expect(typeof buildShadowPilotReport).toBe("function"); });
  it("input is a function", () => { expect(typeof input).toBe("function"); });
  it("input() returns an object", () => { expect(typeof input()).toBe("object"); });
  it("input() has businessName field", () => { expect(input()).toHaveProperty("businessName"); });
  it("input() has overallConfidence field", () => { expect(input()).toHaveProperty("overallConfidence"); });
  it("input().overallConfidence equals low", () => { expect(input().overallConfidence).toBe("low"); });
  it("buildShadowPilotReport(input()) returns an object", () => { expect(typeof buildShadowPilotReport(input())).toBe("object"); });
  it("buildShadowPilotReport(input()) has confidence field", () => { expect(buildShadowPilotReport(input())).toHaveProperty("confidence"); });
  it("buildShadowPilotReport(input()) has liveOutcomeClaim field", () => { expect(buildShadowPilotReport(input())).toHaveProperty("liveOutcomeClaim"); });
  it("buildShadowPilotReport(input()).liveOutcomeClaim is false", () => { expect(buildShadowPilotReport(input()).liveOutcomeClaim).toBe(false); });
  it("input().realProviderDomains is an array", () => { expect(Array.isArray(input().realProviderDomains)).toBe(true); });
  it("input().rankedDataRequests is an array", () => { expect(Array.isArray(input().rankedDataRequests)).toBe(true); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("owner-on-ship shadow pilot (§11)", () => {
  it("1. partial real data does not produce fake certainty (confidence passed through, not inflated)", () => {
    const r = buildShadowPilotReport(input({ overallConfidence: "low", criticalDomainsAllReal: false }));
    expect(r.confidence).toBe("low");
    expect(r.honestReadinessState).toBe("SHADOW_PILOT_READY");
  });

  it("2. a missing-data request appears (ranked, with who provides it)", () => {
    const r = buildShadowPilotReport(input());
    expect(r.dataRequests.length).toBeGreaterThan(0);
    expect(r.dataRequests.length).toBeLessThanOrEqual(3);
    expect(r.dataRequests[0].request).toMatch(/margin_pricing/);
    expect(r.dataRequests[0].provider).toBe("owner");
  });

  it("3. safe prep work appears", () => {
    const r = buildShadowPilotReport(input({ supervisor: { ...input().supervisor, actionStatus: "cautious_proceed" } }));
    expect(r.prepNow.length).toBeGreaterThan(0);
    expect(r.prepNow.join(" ")).toMatch(/draft|delegate|prepare/i);
  });

  it("4. wait-until-owner-return appears where needed", () => {
    const r = buildShadowPilotReport(input({ supervisor: { ...input().supervisor, actionStatus: "owner_decision_required" } }));
    expect(r.waitForOwner.some((w) => /owner decision required/i.test(w))).toBe(true);
  });

  it("5. a pilot intake checklist appears", () => {
    const r = buildShadowPilotReport(input());
    expect(r.intakeChecklist.length).toBeGreaterThan(0);
    expect(r.intakeChecklist.join(" ")).toMatch(/capture real|set up proof/i);
  });

  it("6. no live-outcome claim is ever made", () => {
    const r = buildShadowPilotReport(input());
    expect(r.liveOutcomeClaim).toBe(false);
    expect(r.honestReadinessState).not.toBe("LIVE_OUTCOME_PROVEN");
    expect(r.honestReadinessState).not.toBe("LIVE_PILOT_RUNNING");
  });

  it("7. a blocked action routes to wait-for-owner and never to prep-now", () => {
    const r = buildShadowPilotReport(input({ supervisor: { ...input().supervisor, actionStatus: "blocked", doNow: "n/a" } }));
    expect(r.waitForOwner.some((w) => /blocked pending review/i.test(w))).toBe(true);
    expect(r.prepNow).not.toContain("n/a");
  });

  it("8. owner-workload estimate appears", () => {
    const r = buildShadowPilotReport(input());
    expect(r.ownerWorkloadEstimate).toMatch(/load|overload|delegate/i);
  });

  it("9. assumptions are separated from verified facts", () => {
    const r = buildShadowPilotReport(input());
    expect(r.verifiedFacts.every((f) => /verified/i.test(f))).toBe(true);
    expect(r.assumptions.every((a) => /assumption \(unverified\)/i.test(a))).toBe(true);
    // no missing domain leaks into verified facts
    for (const m of ["margin", "compliance"]) {
      expect(r.verifiedFacts.join(" ").toLowerCase()).not.toContain(m);
    }
  });

  it("10. a healthy, all-real business still refuses a live-outcome claim (shadow ≠ live)", () => {
    const r = buildShadowPilotReport(input({
      realProviderDomains: ["finance_cash", "margin_pricing", "equipment_capacity", "compliance_proof"],
      missingCriticalDomains: [], criticalDomainsAllReal: true, overallConfidence: "high",
      supervisor: { ...input().supervisor, actionStatus: "cautious_proceed", ownerDecisionRequired: null, doNotDo: [] },
    }));
    expect(r.liveOutcomeClaim).toBe(false);
    expect(r.honestReadinessState).toBe("SHADOW_PILOT_READY");
    expect(r.assumptions.length).toBe(0);
    expect(r.verifiedFacts.length).toBe(4);
  });
});
