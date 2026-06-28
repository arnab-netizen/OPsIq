/**
 * Jarvis 360 Slice 1 — evidence-disclosure + rollup data-sufficiency tests.
 * Pure; no DB.
 */
import { describe, it, expect } from "vitest";
import { buildEvidenceDisclosure } from "@/domain/owner-mode/evidence-disclosure";
import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { buildBusinessConditionProfile } from "@/domain/owner-spine/contracts";
import type { DomainScore } from "@/domain/owner-spine/contracts";

function score(domain: DomainScore["domain"], dataConfidenceScore: number, riskScore = 10): DomainScore {
  return {
    domain,
    healthScore: 80,
    riskScore,
    opportunityScore: 20,
    dataConfidenceScore,
    topFindingCodes: [],
    topActionCodes: [],
    generatedAt: new Date("2026-06-28T00:00:00Z"),
  };
}

describe("buildEvidenceDisclosure", () => {
  it("allows a GENERAL decision on complete data", () => {
    const d = buildEvidenceDisclosure({
      sensitivity: RecommendationSensitivity.GENERAL,
      inputQualityStatus: "complete",
      dataSources: ["finance snapshot"],
      missingRequiredInputs: [],
    });
    expect(d.status).toBe("allowed");
    expect(d.staleProminent).toBe(false);
  });

  it("blocks a material (finance) decision when input quality is critical_missing", () => {
    const d = buildEvidenceDisclosure({
      sensitivity: RecommendationSensitivity.FINANCE_SENSITIVE,
      inputQualityStatus: "critical_missing",
      dataSources: [],
      missingRequiredInputs: ["cash_balance"],
    });
    expect(d.status).toBe("blocked");
    expect(d.reasons.join(" ")).toMatch(/cash_balance/);
  });

  it("cautions a low-risk decision when no assessment exists (data_limited default)", () => {
    const d = buildEvidenceDisclosure({
      sensitivity: RecommendationSensitivity.GENERAL,
      inputQualityStatus: null,
      dataSources: [],
      missingRequiredInputs: [],
    });
    expect(d.status).toBe("caution");
  });

  it("downgrades a material decision to high_risk on weak (data_limited) evidence", () => {
    const d = buildEvidenceDisclosure({
      sensitivity: RecommendationSensitivity.GROWTH_SENSITIVE,
      inputQualityStatus: "data_limited",
      dataSources: [],
      missingRequiredInputs: [],
    });
    expect(d.status).toBe("high_risk");
  });

  it("makes stale data prominent and blocks growth when cash is unsafe", () => {
    const d = buildEvidenceDisclosure({
      sensitivity: RecommendationSensitivity.GROWTH_SENSITIVE,
      inputQualityStatus: "complete",
      financialState: "AT_RISK",
      dataSources: ["bank"],
      missingRequiredInputs: [],
      staleFields: ["cash_balance"],
    });
    expect(d.staleProminent).toBe(true);
    expect(d.status).toBe("blocked");
  });
});

describe("buildBusinessConditionProfile data sufficiency (Slice 1)", () => {
  it("surfaces the WORST domain confidence, not the average", () => {
    const p = buildBusinessConditionProfile({
      domainScores: [score("finance", 95), score("cashflow", 30)],
    });
    // average would be ~63 ('caution'); the lowest is 30 ('insufficient').
    expect(p.lowestDataConfidenceScore).toBe(30);
    expect(p.dataSufficiencyStatus).toBe("insufficient");
    expect(p.lowConfidenceDomains).toContain("cashflow");
  });

  it("is 'sufficient' only when every domain has strong confidence", () => {
    const p = buildBusinessConditionProfile({
      domainScores: [score("finance", 90), score("cashflow", 85)],
    });
    expect(p.dataSufficiencyStatus).toBe("sufficient");
    expect(p.lowConfidenceDomains).toHaveLength(0);
  });

  it("is 'insufficient' when missing-critical-data is present even at high confidence", () => {
    const p = buildBusinessConditionProfile({
      domainScores: [score("finance", 90)],
      missingCriticalData: ["cash_runway"],
    });
    expect(p.dataSufficiencyStatus).toBe("insufficient");
  });
});
