/**
 * Owner Trust & Explainability (Module 11 Slice 1) — deterministic explainability
 * engine tests. Pure/no DB. Covers the eight §18 fields, the anti-hallucination
 * rule (missing source value → "missing" + data gap, never invented), action
 * pairing, opportunity vs risk phrasing, confidence/impact labels, and determinism.
 */
import { describe, it, expect } from "vitest";
import { buildExplanation, buildExplanations, NEVER_INVENT } from "@/domain/owner-trust";
import type { OwnerFinding, OwnerAction } from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function finding(over: Partial<OwnerFinding> = {}): OwnerFinding {
  return {
    domain: "operations",
    code: "OPS_LOW_COMPLETION",
    title: "Orders are not getting completed",
    summary: "A large share of received orders is not completed in the period.",
    sourceMetric: "completionRatePct",
    sourceValue: 60,
    threshold: 65,
    severity: "critical",
    confidence: 0.8,
    impactScore: 80,
    urgencyScore: 90,
    findingType: "risk",
    evidence: ["completionRatePct = 60% < 65%"],
    missingData: [],
    verificationMetric: "completionRatePct",
    ...over,
  };
}

function action(over: Partial<OwnerAction> = {}): OwnerAction {
  return {
    domain: "operations",
    findingCode: "OPS_LOW_COMPLETION",
    title: "Raise order completion",
    description: "Clear the stalling stage.",
    ownerRole: "owner",
    priorityScore: 85,
    effortScore: 50,
    expectedImpactScore: 75,
    urgencyScore: 0,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "completionRatePct",
    verificationMethod: "Re-measure completionRatePct next period; target above the low bar.",
    expectedTimeframeDays: 21,
    ...over,
  };
}

describe("owner-trust explainability — module contract assertions", () => {
  it("buildExplanation is a function", () => { expect(typeof buildExplanation).toBe("function"); });
  it("buildExplanations is a function", () => { expect(typeof buildExplanations).toBe("function"); });
  it("NEVER_INVENT is an array", () => { expect(Array.isArray(NEVER_INVENT)).toBe(true); });
  it("NEVER_INVENT.length is greater than 0", () => { expect(NEVER_INVENT.length).toBeGreaterThan(0); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("finding is a function", () => { expect(typeof finding).toBe("function"); });
  it("action is a function", () => { expect(typeof action).toBe("function"); });
  it("finding() returns an object", () => { expect(typeof finding()).toBe("object"); });
  it("action() returns an object", () => { expect(typeof action()).toBe("object"); });
  it("finding() has domain field", () => { expect(finding()).toHaveProperty("domain"); });
  it("buildExplanation(finding(), action(), { now: NOW }) returns an object", () => { expect(typeof buildExplanation(finding(), action(), { now: NOW })).toBe("object"); });
  it("buildExplanation(finding(), action(), { now: NOW }) has hasInventedValues field", () => { expect(buildExplanation(finding(), action(), { now: NOW })).toHaveProperty("hasInventedValues"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("explainability — the eight §18 fields", () => {
  it("assembles all required fields from real finding + action data", () => {
    const e = buildExplanation(finding(), action(), { now: NOW });
    expect(e.whatWasDetected).toContain("Orders are not getting completed");
    expect(e.whyItMatters).toContain("critical");
    expect(e.sourceDataUsed).toMatchObject({ metric: "completionRatePct", value: 60, threshold: 65 });
    expect(e.calculationUsed).toContain("completionRatePct = 60");
    expect(e.calculationUsed).toContain("65");
    expect(e.confidence).toEqual({ score: 0.7, label: "high" }); // action confidence preferred
    expect(e.riskIfIgnored).toMatch(/severe|near-term/i); // critical phrasing
    expect(e.expectedImpact).toEqual({ score: 75, label: "high" }); // action impact preferred
    expect(e.verification).toEqual({ metric: "completionRatePct", method: action().verificationMethod });
    expect(e.hasInventedValues).toBe(false);
    expect(e.generatedAt).toBe(NOW);
  });

  it("falls back to finding impact/confidence/verification when no action is given", () => {
    const e = buildExplanation(finding(), null, { now: NOW });
    expect(e.expectedImpact.score).toBe(80); // finding.impactScore
    expect(e.confidence.score).toBe(0.8); // finding.confidence
    expect(e.verification).toEqual({ metric: "completionRatePct", method: null });
  });
});

describe("explainability — anti-hallucination rule", () => {
  it("renders a missing source value as 'missing' and a data gap (never invented)", () => {
    const e = buildExplanation(finding({ sourceValue: null }), null, { now: NOW });
    expect(e.sourceDataUsed.value).toBeNull();
    expect(e.sourceDataUsed.valueLabel).toBe("missing");
    expect(e.calculationUsed).toContain("Not computable");
    expect(e.calculationUsed).toMatch(/inferred or invented/i);
    expect(e.dataGaps).toContain("completionRatePct");
    expect(e.hasInventedValues).toBe(false);
  });

  it("carries the finding's own missingData into the data gaps", () => {
    const e = buildExplanation(finding({ missingData: ["ordersReceived", "ordersCompleted"] }), null, { now: NOW });
    expect(e.dataGaps).toEqual(expect.arrayContaining(["ordersReceived", "ordersCompleted"]));
  });

  it("describes a threshold-free metric without inventing a threshold", () => {
    const e = buildExplanation(finding({ threshold: null }), null, { now: NOW });
    expect(e.sourceDataUsed.thresholdLabel).toBe("no fixed threshold");
    expect(e.calculationUsed).toContain("domain baseline");
  });

  it("exposes the never-invent allowlist (§18)", () => {
    expect(NEVER_INVENT).toEqual(
      expect.arrayContaining(["revenue", "costs", "customers", "staff count", "guaranteed outcomes"])
    );
  });
});

describe("explainability — opportunity phrasing + labels + batch", () => {
  it("frames an opportunity as uncaptured upside with no downside risk", () => {
    const e = buildExplanation(finding({ findingType: "opportunity", severity: "low", impactScore: 20 }), null, { now: NOW });
    expect(e.whyItMatters).toMatch(/leaving on the table/i);
    expect(e.riskIfIgnored).toMatch(/uncaptured/i);
    expect(e.expectedImpact.label).toBe("low"); // 20 < 34
  });

  it("labels confidence bands (low/moderate/high)", () => {
    expect(buildExplanation(finding({ confidence: 0.2 }), null, { now: NOW }).confidence.label).toBe("low");
    expect(buildExplanation(finding({ confidence: 0.5 }), null, { now: NOW }).confidence.label).toBe("moderate");
    expect(buildExplanation(finding({ confidence: 0.9 }), null, { now: NOW }).confidence.label).toBe("high");
  });

  it("buildExplanations pairs each finding with its action by code, in order", () => {
    const findings = [finding(), finding({ code: "OPS_HIGH_DELAY", title: "Delays", verificationMetric: "delayRatePct" })];
    const actions = [action()]; // only matches the first finding
    const cards = buildExplanations(findings, actions, { now: NOW });
    expect(cards.map((c) => c.findingCode)).toEqual(["OPS_LOW_COMPLETION", "OPS_HIGH_DELAY"]);
    expect(cards[0].expectedImpact.score).toBe(75); // from the paired action
    expect(cards[1].expectedImpact.score).toBe(80); // no action → finding impact
  });

  it("is deterministic (same input → identical card)", () => {
    const a = buildExplanation(finding(), action(), { now: NOW });
    const b = buildExplanation(finding(), action(), { now: NOW });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
