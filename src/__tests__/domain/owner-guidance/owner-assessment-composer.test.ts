import { describe, it, expect } from "vitest";
import {
  composeOwnerAssessment,
  type OwnerAssessmentNarrative,
} from "@/domain/owner-guidance/owner-assessment-composer";
import type {
  CanonicalOwnerAssessment,
  CanonicalOwnerAssessmentAreaStatus,
} from "@/domain/owner-guidance/owner-assessment-reconciliation";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";
import { IssueCategory, type BusinessIssue } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import type { DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";

function issue(
  id: string,
  category: IssueCategory,
  severity: BusinessIssue["severity"] = "MEDIUM",
): BusinessIssue {
  return {
    id,
    category,
    severity,
    headline: `${id} headline`,
    requiresOwnerAction: true,
    businessFunction: [BusinessFunction.STRATEGY],
  };
}

const ALL_OK_AREA_STATUS: CanonicalOwnerAssessmentAreaStatus = {
  cash: "OK",
  profit: "OK",
  staffLoad: "OK",
  ownerLoad: "OK",
  quality: "OK",
  customerRetention: "OK",
  supplierInventory: "OK",
  capacity: "OK",
  growthReadiness: "OK",
};

const ALL_NULL_AREA_STATUS: CanonicalOwnerAssessmentAreaStatus = {
  cash: null,
  profit: null,
  staffLoad: null,
  ownerLoad: null,
  quality: null,
  customerRetention: null,
  supplierInventory: null,
  capacity: null,
  growthReadiness: null,
};

const ALL_KNOWN_CONDITION_DIMENSIONS: DerivedBusinessConditionSignals = {
  cashPressureLevel: "LOW",
  marginPressureLevel: "LOW",
  clientConcentrationRisk: "LOW",
  ownerDependencyRisk: "LOW",
  keyPersonDependencyRisk: "LOW",
  processMaturityLevel: "HIGH",
  managementMaturityLevel: "HIGH",
  executionCapacityLevel: "HIGH",
  moralFragilityLevel: "LOW",
  resilienceLevel: "HIGH",
  growthReadinessLevel: "HIGH",
};

function baseAssessment(overrides: Partial<CanonicalOwnerAssessment> = {}): CanonicalOwnerAssessment {
  return {
    businessId: "biz-secret-id-1",
    source: "OWNER_NOW_VIEW",
    readiness: "AVAILABLE",
    health: "OK",
    confidence: EvidenceConfidenceLevel.STRONG,
    confidenceCapped: false,
    guidanceClassification: GuidanceClassification.GUIDANCE_READY,
    missingData: [],
    primaryIssue: null,
    urgentRisks: [],
    areaStatus: ALL_OK_AREA_STATUS,
    conditionDimensions: ALL_KNOWN_CONDITION_DIMENSIONS,
    knownConditionDimensionCount: 11,
    unknownConditionDimensionCount: 0,
    ...overrides,
  };
}

function narrativeStrings(n: OwnerAssessmentNarrative): string[] {
  return [n.headline, n.primaryConcern, n.confidenceLabel, n.confidenceMessage, n.nextDataStep].filter(
    (v): v is string => v !== null,
  );
}

const FORBIDDEN_HEALTH_WORDS = ["healthy", "stable", "safe", "good"];

describe("owner-assessment-composer — UX-02B owner-facing narrative", () => {
  it("1. INSUFFICIENT produces the exact insufficient-evidence headline", () => {
    const result = composeOwnerAssessment(
      baseAssessment({ readiness: "INSUFFICIENT", health: null, areaStatus: ALL_NULL_AREA_STATUS }),
    );
    expect(result.headline).toBe("There isn't enough evidence to assess this business yet.");
  });

  it("2. INSUFFICIENT never claims healthy/stable/safe/good", () => {
    const result = composeOwnerAssessment(
      baseAssessment({ readiness: "INSUFFICIENT", health: null, areaStatus: ALL_NULL_AREA_STATUS }),
    );
    const haystack = narrativeStrings(result).join(" ").toLowerCase();
    for (const word of FORBIDDEN_HEALTH_WORDS) {
      expect(haystack).not.toContain(word);
    }
  });

  it("3. INSUFFICIENT + named missing data returns the first named next-data step", () => {
    const result = composeOwnerAssessment(
      baseAssessment({
        readiness: "INSUFFICIENT",
        health: null,
        areaStatus: ALL_NULL_AREA_STATUS,
        missingData: ["latest cash position (cash on hand + obligations)", "latest profit/margin figures"],
      }),
    );
    expect(result.nextDataStep).toBe("Add or update latest cash position (cash on hand + obligations).");
  });

  it("4. INSUFFICIENT + no named missing data returns the generic operating-data request", () => {
    const result = composeOwnerAssessment(
      baseAssessment({ readiness: "INSUFFICIENT", health: null, areaStatus: ALL_NULL_AREA_STATUS, missingData: [] }),
    );
    expect(result.nextDataStep).toBe("Add recent operating data for this business.");
  });

  it("5. LIMITED + health OK produces the no-major-problem headline and Limited confidence label", () => {
    const result = composeOwnerAssessment(baseAssessment({ readiness: "LIMITED", health: "OK", confidenceCapped: true }));
    expect(result.headline).toBe("No major problem is showing in the current evidence.");
    expect(result.confidenceLabel).toBe("Limited confidence");
  });

  it("6. LIMITED + health OK + missing data does not turn the headline into WATCH/DANGER/CRITICAL language", () => {
    const result = composeOwnerAssessment(
      baseAssessment({ readiness: "LIMITED", health: "OK", missingData: ["latest payroll"] }),
    );
    expect(result.headline).toBe("No major problem is showing in the current evidence.");
    expect(result.headline).not.toMatch(/watch|attention/i);
  });

  it("7. AVAILABLE + OK exact headline", () => {
    const result = composeOwnerAssessment(baseAssessment({ readiness: "AVAILABLE", health: "OK" }));
    expect(result.headline).toBe("No major problem is showing in the current evidence.");
  });

  it("8. AVAILABLE + WATCH exact headline", () => {
    const result = composeOwnerAssessment(baseAssessment({ readiness: "AVAILABLE", health: "WATCH" }));
    expect(result.headline).toBe("There are areas of the business to watch.");
  });

  it("9. AVAILABLE + DANGER exact headline", () => {
    const result = composeOwnerAssessment(baseAssessment({ readiness: "AVAILABLE", health: "DANGER" }));
    expect(result.headline).toBe("The business needs attention.");
  });

  it("10. AVAILABLE + CRITICAL exact headline", () => {
    const result = composeOwnerAssessment(baseAssessment({ readiness: "AVAILABLE", health: "CRITICAL" }));
    expect(result.headline).toBe("The business needs urgent attention.");
  });

  it("11. LIMITED + CRITICAL keeps the CRITICAL headline while confidence is limited", () => {
    const result = composeOwnerAssessment(
      baseAssessment({ readiness: "LIMITED", health: "CRITICAL", confidenceCapped: true }),
    );
    expect(result.headline).toBe("The business needs urgent attention.");
    expect(result.confidenceLabel).toBe("Limited confidence");
  });

  const CATEGORY_CASES: Array<[IssueCategory, string]> = [
    [IssueCategory.CASH_DANGER, "Cash flow is the first issue to address."],
    [IssueCategory.CUSTOMER_SERVICE_FAILURE, "Customer service or quality is the first issue to address."],
    [IssueCategory.OVERLOAD, "Staff or owner workload is the first issue to address."],
    [IssueCategory.PROFIT_LEAK, "Profitability is the first issue to address."],
    [IssueCategory.CAPACITY_BOTTLENECK, "Capacity or supply constraints are the first issue to address."],
    [IssueCategory.COMPLIANCE_SAFETY_RISK, "Compliance or safety is the first issue to address."],
    [IssueCategory.BLOCKED_EXECUTION, "Work that cannot move forward is the first issue to address."],
    [IssueCategory.PENDING_PROOF_OUTCOME, "Missing proof or an outcome check is the first issue to address."],
    [IssueCategory.GROWTH_OPPORTUNITY, "Growth is the first opportunity to consider."],
    [IssueCategory.PROCESS_IMPROVEMENT, "Process improvement is the first opportunity to consider."],
  ];

  it.each(CATEGORY_CASES)("12. IssueCategory %s maps to its approved plain-language primaryConcern", (category, expected) => {
    const result = composeOwnerAssessment(baseAssessment({ primaryIssue: issue("i1", category) }));
    expect(result.primaryConcern).toBe(expected);
  });

  it("13. primaryIssue === null produces primaryConcern === null", () => {
    const result = composeOwnerAssessment(baseAssessment({ primaryIssue: null }));
    expect(result.primaryConcern).toBeNull();
  });

  it("14. composer uses primaryIssue and does not replace it with a more severe urgentRisk", () => {
    const primaryIssue = issue("low-growth", IssueCategory.GROWTH_OPPORTUNITY, "LOW");
    const urgentRisks = [issue("critical-cash", IssueCategory.CASH_DANGER, "CRITICAL")];
    const result = composeOwnerAssessment(baseAssessment({ primaryIssue, urgentRisks }));
    expect(result.primaryConcern).toBe("Growth is the first opportunity to consider.");
  });

  it("15. AVAILABLE confidence labels: VERIFIED/STRONG/MODERATE", () => {
    expect(
      composeOwnerAssessment(baseAssessment({ confidence: EvidenceConfidenceLevel.VERIFIED })).confidenceLabel,
    ).toBe("Verified evidence");
    expect(
      composeOwnerAssessment(baseAssessment({ confidence: EvidenceConfidenceLevel.STRONG })).confidenceLabel,
    ).toBe("Strong evidence");
    expect(
      composeOwnerAssessment(baseAssessment({ confidence: EvidenceConfidenceLevel.MODERATE })).confidenceLabel,
    ).toBe("Moderate evidence");
  });

  it("16. defensive AVAILABLE WEAK/INSUFFICIENT confidence maps to 'Limited evidence' without changing readiness", () => {
    const weak = composeOwnerAssessment(baseAssessment({ confidence: EvidenceConfidenceLevel.WEAK }));
    expect(weak.confidenceLabel).toBe("Limited evidence");
    const insufficientConfidenceButAvailable = composeOwnerAssessment(
      baseAssessment({ confidence: EvidenceConfidenceLevel.INSUFFICIENT }),
    );
    expect(insufficientConfidenceButAvailable.confidenceLabel).toBe("Limited evidence");
  });

  it("17. LIMITED + missing data confidenceMessage exact string", () => {
    const result = composeOwnerAssessment(baseAssessment({ readiness: "LIMITED", missingData: ["latest payroll"] }));
    expect(result.confidenceMessage).toBe("Some important data is missing, so this assessment is provisional.");
  });

  it("18. LIMITED + no missing data + unknown dimensions confidenceMessage exact string", () => {
    const result = composeOwnerAssessment(
      baseAssessment({ readiness: "LIMITED", missingData: [], unknownConditionDimensionCount: 2 }),
    );
    expect(result.confidenceMessage).toBe("Some business signals are still unknown, so this assessment is provisional.");
  });

  it("19. LIMITED + neither condition produces the generic limited-confidence message", () => {
    const result = composeOwnerAssessment(
      baseAssessment({ readiness: "LIMITED", missingData: [], unknownConditionDimensionCount: 0, confidenceCapped: true }),
    );
    expect(result.confidenceMessage).toBe("The available evidence limits how certain this assessment can be.");
  });

  it("20. AVAILABLE confidenceMessage exact string", () => {
    const result = composeOwnerAssessment(baseAssessment({ readiness: "AVAILABLE" }));
    expect(result.confidenceMessage).toBe("The assessment is supported by the available evidence.");
  });

  it("21. only missingData[0] is used for nextDataStep; later entries do not appear", () => {
    const result = composeOwnerAssessment(
      baseAssessment({
        readiness: "LIMITED",
        missingData: ["latest cash position", "latest profit/margin figures", "latest payroll"],
      }),
    );
    expect(result.nextDataStep).toBe("Add or update latest cash position.");
    expect(result.nextDataStep).not.toContain("profit/margin");
    expect(result.nextDataStep).not.toContain("payroll");
  });

  it("22. trailing period on missingData[0] does not produce a double period", () => {
    const result = composeOwnerAssessment(
      baseAssessment({ readiness: "LIMITED", missingData: ["latest profit/margin figures."] }),
    );
    expect(result.nextDataStep).toBe("Add or update latest profit/margin figures.");
    expect(result.nextDataStep).not.toMatch(/\.\./);
  });

  it("23. conditionDimensions cannot override health", () => {
    const critical: DerivedBusinessConditionSignals = {
      ...ALL_KNOWN_CONDITION_DIMENSIONS,
      cashPressureLevel: "CRITICAL",
    };
    const result = composeOwnerAssessment(baseAssessment({ health: "OK", conditionDimensions: critical }));
    expect(result.headline).toBe("No major problem is showing in the current evidence.");
  });

  it("24. composer does not mutate the assessment object or nested arrays", () => {
    const risks = [issue("r1", IssueCategory.CASH_DANGER)];
    const missing = ["latest payroll"];
    const assessment = baseAssessment({ readiness: "LIMITED", urgentRisks: risks, missingData: missing });
    const snapshotBefore = JSON.parse(JSON.stringify(assessment));
    composeOwnerAssessment(assessment);
    expect(JSON.parse(JSON.stringify(assessment))).toEqual(snapshotBefore);
    expect(assessment.urgentRisks).toBe(risks);
    expect(assessment.missingData).toBe(missing);
  });

  it("25. same input twice returns deeply equal output (determinism)", () => {
    const assessment = baseAssessment({
      readiness: "LIMITED",
      health: "WATCH",
      primaryIssue: issue("i1", IssueCategory.PROFIT_LEAK),
      missingData: ["latest cash position"],
    });
    const first = composeOwnerAssessment(assessment);
    const second = composeOwnerAssessment(assessment);
    expect(first).toEqual(second);
  });

  it("26. no returned string contains raw IssueCategory tokens", () => {
    for (const [category] of CATEGORY_CASES) {
      const result = composeOwnerAssessment(baseAssessment({ primaryIssue: issue("i1", category) }));
      const haystack = narrativeStrings(result).join(" ");
      for (const [rawCategory] of CATEGORY_CASES) {
        expect(haystack).not.toContain(rawCategory);
      }
    }
  });

  it("27. no returned string contains raw confidence enums", () => {
    const rawEnumTokens = Object.values(EvidenceConfidenceLevel);
    for (const confidence of rawEnumTokens) {
      const result = composeOwnerAssessment(baseAssessment({ confidence }));
      const haystack = narrativeStrings(result).join(" ");
      for (const token of rawEnumTokens) {
        expect(haystack).not.toContain(token);
      }
    }
  });

  it("28. no returned string contains businessId, workspaceId, or issue.id", () => {
    const result = composeOwnerAssessment(
      baseAssessment({
        businessId: "biz-super-secret-uuid-1234",
        primaryIssue: issue("issue-secret-uuid-5678", IssueCategory.CASH_DANGER),
        urgentRisks: [issue("risk-secret-uuid-9999", IssueCategory.PROFIT_LEAK)],
      }),
    );
    const haystack = narrativeStrings(result).join(" ");
    expect(haystack).not.toContain("biz-super-secret-uuid-1234");
    expect(haystack).not.toContain("issue-secret-uuid-5678");
    expect(haystack).not.toContain("risk-secret-uuid-9999");
  });

  it("29. no returned string contains score/tier/AI/guaranteed (case-insensitive)", () => {
    const result = composeOwnerAssessment(
      baseAssessment({ readiness: "LIMITED", missingData: ["latest cash position"] }),
    );
    const haystack = narrativeStrings(result).join(" ").toLowerCase();
    for (const forbidden of ["score", "tier", "ai", "guaranteed"]) {
      expect(haystack).not.toContain(forbidden);
    }
  });

  it("30. impossible defensive input (AVAILABLE + null health) fails safely without throwing", () => {
    expect(() =>
      composeOwnerAssessment(baseAssessment({ readiness: "AVAILABLE", health: null, areaStatus: ALL_NULL_AREA_STATUS })),
    ).not.toThrow();
    const result = composeOwnerAssessment(
      baseAssessment({ readiness: "AVAILABLE", health: null, areaStatus: ALL_NULL_AREA_STATUS }),
    );
    expect(result.headline).toBe("There isn't enough evidence to assess this business yet.");
  });
});
