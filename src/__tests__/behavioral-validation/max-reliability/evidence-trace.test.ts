/**
 * Maximum-reliability — evidence-to-claim trace tests.
 */
import { describe, it, expect } from "vitest";
import { validateEvidenceTrace, buildEvidenceTrace, effectiveConfidence, type EvidenceTrace } from "@/behavioral-validation/max-reliability/evidence-trace";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";

const good = (): EvidenceTrace => ({
  claim: "Recover overdue receivables before any discretionary spend",
  evidence: ["cashflow snapshot: cash <= 0"], references: ["SRC-SCORE-CASHFLOW"],
  calculation: ["cash runway = 12 days"], confidence: "high",
  missingData: [], staleData: [], conflictingData: [], whatWouldChange: "runway > 45 days", canProceedNow: true,
});

describe("evidence-to-claim traceability — module contract assertions", () => {
  it("validateEvidenceTrace is a function", () => { expect(typeof validateEvidenceTrace).toBe("function"); });
  it("buildEvidenceTrace is a function", () => { expect(typeof buildEvidenceTrace).toBe("function"); });
  it("effectiveConfidence is a function", () => { expect(typeof effectiveConfidence).toBe("function"); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("SEED_CASES is an array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); });
  it("good() returns an object", () => { expect(typeof good()).toBe("object"); });
  it("good() has claim field", () => { expect(good()).toHaveProperty("claim"); });
  it("good() has evidence field", () => { expect(good()).toHaveProperty("evidence"); });
  it("good() has confidence field", () => { expect(good()).toHaveProperty("confidence"); });
  it("good().confidence is 'high'", () => { expect(good().confidence).toBe("high"); });
  it("good().canProceedNow is true", () => { expect(good().canProceedNow).toBe(true); });
  it("validateEvidenceTrace(good()) returns ok:true", () => { expect(validateEvidenceTrace(good()).ok).toBe(true); });
  it("effectiveConfidence(good()) returns 'high'", () => { expect(effectiveConfidence(good())).toBe("high"); });
  it("SEED_CASES has at least 1 element", () => { expect(SEED_CASES.length).toBeGreaterThan(0); });
});

describe("evidence-to-claim traceability", () => {
  it("a recommendation without an evidence trace fails", () => {
    const r = validateEvidenceTrace({ ...good(), evidence: [], references: [] });
    expect(r.ok).toBe(false);
    expect(r.failures).toContain("recommendation without evidence trace");
  });

  it("a financial claim without a calculation trace fails", () => {
    const r = validateEvidenceTrace({ ...good(), calculation: undefined }, { financialClaim: true });
    expect(r.ok).toBe(false);
    expect(r.failures).toContain("financial claim without calculation trace");
  });

  it("a learning-based claim without artifact provenance fails", () => {
    const r = validateEvidenceTrace({ ...good(), learningArtifactId: undefined }, { learningBased: true });
    expect(r.ok).toBe(false);
    expect(r.failures).toContain("learning-based claim without artifact provenance");
  });

  it("high confidence on weak/missing evidence fails", () => {
    const r = validateEvidenceTrace({ ...good(), confidence: "high", missingData: ["no margin data"] });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /high confidence/.test(f))).toBe(true);
  });

  it("stale / conflicting data lowers the effective confidence", () => {
    expect(effectiveConfidence({ ...good(), confidence: "high", staleData: ["finance 60d old"] })).toBe("medium");
    expect(effectiveConfidence({ ...good(), confidence: "high", staleData: ["x"], conflictingData: ["y"] })).toBe("low");
  });

  it("a complete trace passes", () => {
    expect(validateEvidenceTrace(good(), { financialClaim: true }).ok).toBe(true);
  });

  it("the production runtime advice yields a non-empty evidence trace", () => {
    const c = SEED_CASES.find((x) => x.flags.cashRisk)!;
    const trace = buildEvidenceTrace(baseAdvise(c), { references: ["SRC-SCORE-CASHFLOW"] });
    expect(trace.evidence.length + trace.references.length).toBeGreaterThan(0);
    expect(trace.claim.length).toBeGreaterThan(0);
    expect(trace.whatWouldChange.length).toBeGreaterThan(0);
  });
});
