import { describe, it, expect } from "vitest";
import { classifyAbstentionCoverage } from "@/services/governance/coverage-classifier";

describe("coverage-classifier — module contract assertions", () => {
  it("classifyAbstentionCoverage is a function", () => {
    expect(typeof classifyAbstentionCoverage).toBe("function");
  });
  it("classifyAbstentionCoverage returns a string", () => {
    const r = classifyAbstentionCoverage({ engineStatus: "SUCCESS", committed: true, evidence: [] });
    expect(typeof r).toBe("string");
  });
  it("returns NOT_APPLICABLE for committed=true, engineStatus=SUCCESS", () => {
    expect(classifyAbstentionCoverage({ engineStatus: "SUCCESS", committed: true, evidence: [] })).toBe("NOT_APPLICABLE");
  });
  it("returns INSUFFICIENT_EVIDENCE for committed=false, no evidence", () => {
    expect(classifyAbstentionCoverage({ engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [] })).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("result is a non-empty string", () => {
    const r = classifyAbstentionCoverage({ engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [] });
    expect(r.length).toBeGreaterThan(0);
  });
  it("returns INSUFFICIENT_MODEL_COVERAGE when only unsupported domains have evidence", () => {
    expect(classifyAbstentionCoverage({ engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [{ dimension: "financial_health", isCritical: true }, { dimension: "market_position", isCritical: true }] })).toBe("INSUFFICIENT_MODEL_COVERAGE");
  });
  it("returns INSUFFICIENT_EVIDENCE when supported domain has critical evidence", () => {
    expect(classifyAbstentionCoverage({ engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [{ dimension: "customer_retention", isCritical: true }] })).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("returns INSUFFICIENT_EVIDENCE for non-critical supported-domain evidence", () => {
    expect(classifyAbstentionCoverage({ engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [{ dimension: "customer_retention", isCritical: false }] })).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("SUCCESS engine status returns NOT_APPLICABLE regardless of committed", () => {
    const r = classifyAbstentionCoverage({ engineStatus: "SUCCESS", committed: false, evidence: [] });
    expect(r).toBe("NOT_APPLICABLE");
  });
  it("accepts empty evidence array without throwing", () => {
    expect(() => classifyAbstentionCoverage({ engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [] })).not.toThrow();
  });
  it("accepts evidence with multiple items without throwing", () => {
    expect(() => classifyAbstentionCoverage({ engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [{ dimension: "customer_retention", isCritical: true }, { dimension: "financial_health", isCritical: true }] })).not.toThrow();
  });
  it("NOT_APPLICABLE is returned for SUCCESS engine status", () => {
    const r1 = classifyAbstentionCoverage({ engineStatus: "SUCCESS", committed: true, evidence: [] });
    const r2 = classifyAbstentionCoverage({ engineStatus: "SUCCESS", committed: false, evidence: [] });
    expect(r1).toBe("NOT_APPLICABLE");
    expect(r2).toBe("NOT_APPLICABLE");
  });
  it("INSUFFICIENT_MODEL_COVERAGE only appears for unsupported domain evidence", () => {
    const r = classifyAbstentionCoverage({ engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [{ dimension: "financial_health", isCritical: true }, { dimension: "market_position", isCritical: true }] });
    expect(r).toBe("INSUFFICIENT_MODEL_COVERAGE");
  });
  it("result is one of the known classification strings", () => {
    const valid = new Set(["NOT_APPLICABLE", "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_MODEL_COVERAGE"]);
    for (const input of [
      { engineStatus: "SUCCESS", committed: true, evidence: [] },
      { engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [] },
      { engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [{ dimension: "financial_health", isCritical: true }] },
    ]) {
      expect(valid.has(classifyAbstentionCoverage(input))).toBe(true);
    }
  });
  it("classifyAbstentionCoverage accepts evidence without isCritical without throwing", () => {
    expect(() => classifyAbstentionCoverage({ engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [{ dimension: "customer_retention" }] })).not.toThrow();
  });
});

/** E0: honest abstention-reason relabel (reporting only). */
describe("coverage-classifier", () => {
  it("returns NOT_APPLICABLE for committed diagnoses", () => {
    expect(
      classifyAbstentionCoverage({ engineStatus: "SUCCESS", committed: true, evidence: [] })
    ).toBe("NOT_APPLICABLE");
  });

  it("returns INSUFFICIENT_EVIDENCE when no evidence at all", () => {
    expect(
      classifyAbstentionCoverage({ engineStatus: "INSUFFICIENT_EVIDENCE", committed: false, evidence: [] })
    ).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("returns INSUFFICIENT_MODEL_COVERAGE when evidence sits only in unsupported domains", () => {
    expect(
      classifyAbstentionCoverage({
        engineStatus: "INSUFFICIENT_EVIDENCE",
        committed: false,
        evidence: [
          { dimension: "financial_health", isCritical: true },
          { dimension: "market_position", isCritical: true },
        ],
      })
    ).toBe("INSUFFICIENT_MODEL_COVERAGE");
  });

  it("returns INSUFFICIENT_EVIDENCE when a supported domain has critical evidence (engine could diagnose)", () => {
    expect(
      classifyAbstentionCoverage({
        engineStatus: "INSUFFICIENT_EVIDENCE",
        committed: false,
        evidence: [
          { dimension: "customer_retention", isCritical: true },
          { dimension: "financial_health", isCritical: true },
        ],
      })
    ).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("returns INSUFFICIENT_EVIDENCE when supported-domain evidence is present but non-critical only", () => {
    expect(
      classifyAbstentionCoverage({
        engineStatus: "INSUFFICIENT_EVIDENCE",
        committed: false,
        evidence: [{ dimension: "customer_retention", isCritical: false }],
      })
    ).toBe("INSUFFICIENT_EVIDENCE");
  });
});
