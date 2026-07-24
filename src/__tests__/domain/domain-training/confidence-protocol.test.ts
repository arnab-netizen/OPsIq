import { describe, it, expect } from "vitest";
import {
  classifyConfidence,
  allowsExecution,
  reversibleOnly,
  requiresEscalation,
  type ConfidenceInput,
} from "@/domain/domain-training/confidence-protocol";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";

const base = (over: Partial<ConfidenceInput> = {}): ConfidenceInput => ({
  dataConfidence: EvidenceConfidenceLevel.STRONG,
  blockedByContradiction: false,
  missingCritical: false,
  complianceSensitive: false,
  ...over,
});

describe("[F4] confidence protocol — module contract assertions", () => {
  it("classifyConfidence is a function", () => { expect(typeof classifyConfidence).toBe("function"); });
  it("allowsExecution is a function", () => { expect(typeof allowsExecution).toBe("function"); });
  it("reversibleOnly is a function", () => { expect(typeof reversibleOnly).toBe("function"); });
  it("requiresEscalation is a function", () => { expect(typeof requiresEscalation).toBe("function"); });
  it("EvidenceConfidenceLevel.STRONG is defined", () => { expect(EvidenceConfidenceLevel.STRONG).toBeDefined(); });
  it("EvidenceConfidenceLevel.VERIFIED is defined", () => { expect(EvidenceConfidenceLevel.VERIFIED).toBeDefined(); });
  it("EvidenceConfidenceLevel.MODERATE is defined", () => { expect(EvidenceConfidenceLevel.MODERATE).toBeDefined(); });
  it("EvidenceConfidenceLevel.WEAK is defined", () => { expect(EvidenceConfidenceLevel.WEAK).toBeDefined(); });
  it("EvidenceConfidenceLevel.INSUFFICIENT is defined", () => { expect(EvidenceConfidenceLevel.INSUFFICIENT).toBeDefined(); });
  it("base() returns an object with dataConfidence field", () => { expect(base()).toHaveProperty("dataConfidence"); });
  it("classifyConfidence(base()) returns a string", () => { expect(typeof classifyConfidence(base())).toBe("string"); });
  it("classifyConfidence(base()) returns 'HIGH' for STRONG data", () => { expect(classifyConfidence(base())).toBe("HIGH"); });
  it("allowsExecution('HIGH') returns true", () => { expect(allowsExecution("HIGH")).toBe(true); });
  it("allowsExecution('BLOCKED') returns false", () => { expect(allowsExecution("BLOCKED")).toBe(false); });
});

describe("[F4] confidence protocol", () => {
  it("compliance uncertainty returns ESCALATE (or BLOCKED)", () => {
    expect(classifyConfidence(base({ complianceSensitive: true }))).toBe("ESCALATE");
    expect(requiresEscalation(classifyConfidence(base({ complianceSensitive: true })))).toBe(true);
    // a verified expert source lifts the escalation
    expect(classifyConfidence(base({ complianceSensitive: true, verifiedExpertSource: true }))).toBe("HIGH");
  });

  it("missing critical proof returns BLOCKED (a LOW/BLOCKED outcome)", () => {
    const c = classifyConfidence(base({ missingCritical: true }));
    expect(["LOW", "BLOCKED"]).toContain(c);
    expect(c).toBe("BLOCKED");
    expect(allowsExecution(c)).toBe(false);
  });

  it("strong/verified evidence can return HIGH", () => {
    expect(classifyConfidence(base({ dataConfidence: EvidenceConfidenceLevel.VERIFIED }))).toBe("HIGH");
    expect(classifyConfidence(base({ dataConfidence: EvidenceConfidenceLevel.STRONG }))).toBe("HIGH");
  });

  it("contradictory evidence cannot return HIGH", () => {
    const c = classifyConfidence(base({ blockedByContradiction: true }));
    expect(c).not.toBe("HIGH");
    expect(c).toBe("BLOCKED");
  });

  it("moderate→MEDIUM, weak→LOW (reversible only)", () => {
    expect(classifyConfidence(base({ dataConfidence: EvidenceConfidenceLevel.MODERATE }))).toBe("MEDIUM");
    const low = classifyConfidence(base({ dataConfidence: EvidenceConfidenceLevel.WEAK }));
    expect(low).toBe("LOW");
    expect(reversibleOnly(low)).toBe(true);
    expect(allowsExecution(low)).toBe(true);
  });

  it("insufficient data → BLOCKED", () => {
    expect(classifyConfidence(base({ dataConfidence: EvidenceConfidenceLevel.INSUFFICIENT }))).toBe("BLOCKED");
  });
});
