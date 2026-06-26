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
