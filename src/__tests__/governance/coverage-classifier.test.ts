import { describe, it, expect } from "vitest";
import { classifyAbstentionCoverage } from "@/services/governance/coverage-classifier";

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
