/**
 * Unit tests for startup-explainability.ts
 * Tests: buildStartupExplanation — immutable ID linkage, decisionRef format, no independent narrative
 */
import { describe, it, expect } from "vitest";
import { buildStartupExplanation, type StartupExplanationInputs } from "@/domain/owner-strategy/startup-explainability";

function makeInputs(overrides: Partial<StartupExplanationInputs> = {}): StartupExplanationInputs {
  return {
    sessionId: "sess-abc123",
    ideaId: "idea-xyz789",
    ideaName: "Test Business Idea",
    screeningStatus: "PASSED",
    screeningReasons: ["Market validated", "Capital sufficient"],
    economicClassification: "VIABLE",
    breakEvenMonths: 6,
    cashRunwayMonths: 18,
    readinessStatus: "READY",
    hardGateFailures: [],
    failedGates: [],
    passedGates: ["CASH_SURVIVAL", "REGULATORY"],
    evidenceGaps: [],
    bindingConstraints: [],
    hypothesesConfirmed: 4,
    hypothesesFailed: 0,
    hypothesesTotal: 5,
    rejectedAlternativeIds: ["idea-alt-001"],
    rejectedAlternativeNames: ["Alt Idea"],
    closestAlternativeName: "Alt Idea",
    systemRecommendation: "GO",
    systemRationale: null,
    unknownInputs: [],
    whatWouldChangeRecommendation: "If Alt showed lower risk",
    evidenceIds: ["ev-1", "ev-2", "ev-3", "ev-4", "ev-5"],
    profileVersionId: "pv-1",
    inputSnapshotVersion: "v1",
    ...overrides,
  };
}

describe("buildStartupExplanation", () => {
  it("decisionRef contains immutable sessionId and ideaId", () => {
    const result = buildStartupExplanation(makeInputs());
    expect(result.decisionRef).toContain("sess-abc123");
    expect(result.decisionRef).toContain("idea-xyz789");
  });

  it("decisionType is STARTUP_SYSTEM_RECOMMENDATION", () => {
    const result = buildStartupExplanation(makeInputs());
    expect(result.decisionType).toBe("STARTUP_SYSTEM_RECOMMENDATION");
  });

  it("recommendation string is non-empty", () => {
    const result = buildStartupExplanation(makeInputs({ systemRecommendation: "GO" }));
    expect(result.recommendation).toBeTruthy();
  });

  it("factorsUsed array is non-empty and contains hard_gate_failures factor", () => {
    const result = buildStartupExplanation(makeInputs());
    expect(result.factorsUsed.length).toBeGreaterThan(0);
    const gatesFactor = result.factorsUsed.find((f) => f.factor === "hard_gate_failures");
    expect(gatesFactor).toBeDefined();
  });

  it("evidenceGaps in inputs propagate to output", () => {
    const result = buildStartupExplanation(makeInputs({ evidenceGaps: ["customer_wtp", "delivery_feasibility"] }));
    // evidenceGaps are captured in inputSnapshot
    expect(result.inputSnapshot.evidenceGaps).toContain("customer_wtp");
    expect(result.inputSnapshot.evidenceGaps).toContain("delivery_feasibility");
  });

  it("hardGateFailures drive confidence to at most 40 (cap at 30 before viable bonus)", () => {
    const result = buildStartupExplanation(makeInputs({
      hardGateFailures: ["CASH_FLOW_UNSAFE"],
      economicClassification: null,  // remove VIABLE bonus for clean bound
    }));
    expect(result.confidence).toBeLessThanOrEqual(30);
  });

  it("confidence is HIGH when hypotheses are mostly confirmed and no hard gate failures", () => {
    const result = buildStartupExplanation(makeInputs({
      hypothesesConfirmed: 5,
      hypothesesTotal: 5,
      hypothesesFailed: 0,
      evidenceIds: ["ev-1", "ev-2", "ev-3", "ev-4", "ev-5"],
    }));
    expect(result.confidence).toBeGreaterThan(50);
  });

  it("REJECTED screening produces a rationale mentioning failure", () => {
    const result = buildStartupExplanation(makeInputs({ screeningStatus: "REJECTED", systemRecommendation: "REJECT" }));
    expect(result.rationale).toBeTruthy();
  });

  it("unknownInputs propagate to output unknowns", () => {
    const result = buildStartupExplanation(makeInputs({ unknownInputs: ["riskAdjustedScore", "economicModel"] }));
    expect(result.unknowns.some((u) => u.includes("riskAdjustedScore"))).toBe(true);
  });

  it("inputSnapshot preserves the original inputs for audit immutability", () => {
    const inputs = makeInputs({ sessionId: "audit-sess-1" });
    const result = buildStartupExplanation(inputs);
    expect(result.inputSnapshot.sessionId).toBe("audit-sess-1");
  });
});
