import { describe, it, expect } from "vitest";
import {
  reconcileOwnerAssessment,
  type OwnerAssessmentReconciliationInput,
} from "@/domain/owner-guidance/owner-assessment-reconciliation";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";
import { IssueCategory, type BusinessIssue } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import type { DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";

function issue(
  id: string,
  category: IssueCategory = IssueCategory.CASH_DANGER,
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

const ALL_UNKNOWN_CONDITION_DIMENSIONS: DerivedBusinessConditionSignals = {
  cashPressureLevel: "unknown",
  marginPressureLevel: "unknown",
  clientConcentrationRisk: "unknown",
  ownerDependencyRisk: "unknown",
  keyPersonDependencyRisk: "unknown",
  processMaturityLevel: "unknown",
  managementMaturityLevel: "unknown",
  executionCapacityLevel: "unknown",
  moralFragilityLevel: "unknown",
  resilienceLevel: "unknown",
  growthReadinessLevel: "unknown",
};

function baseInput(
  overrides: Partial<OwnerAssessmentReconciliationInput> = {},
): OwnerAssessmentReconciliationInput {
  return {
    businessId: "biz-1",
    classification: GuidanceClassification.GUIDANCE_READY,
    confidence: EvidenceConfidenceLevel.STRONG,
    confidenceCapped: false,
    missingDataRequests: [],
    businessHealth: "OK",
    cashDangerStatus: "OK",
    profitLeakStatus: "OK",
    staffOverloadStatus: "OK",
    ownerOverloadStatus: "OK",
    qualityFailureStatus: "OK",
    customerRetentionStatus: "OK",
    supplierInventoryStatus: "OK",
    capacityStatus: "OK",
    growthReadinessStatus: "OK",
    topOwnerActions: [],
    urgentRisks: [],
    conditionDimensions: ALL_KNOWN_CONDITION_DIMENSIONS,
    ...overrides,
  };
}

describe("owner-assessment-reconciliation — UX-02A canonical structured truth", () => {
  it("1. AVAILABLE: strong confidence, all 11 dimensions known, no missing data — health preserved exactly", () => {
    const result = reconcileOwnerAssessment(baseInput({ businessHealth: "WATCH" }));
    expect(result.readiness).toBe("AVAILABLE");
    expect(result.health).toBe("WATCH");
  });

  it("2. LIMITED because confidenceCapped — health remains unchanged", () => {
    const result = reconcileOwnerAssessment(baseInput({ confidenceCapped: true, businessHealth: "DANGER" }));
    expect(result.readiness).toBe("LIMITED");
    expect(result.health).toBe("DANGER");
  });

  it("3. LIMITED because missing data — health remains unchanged", () => {
    const result = reconcileOwnerAssessment(
      baseInput({ missingDataRequests: ["current payroll"], businessHealth: "WATCH" }),
    );
    expect(result.readiness).toBe("LIMITED");
    expect(result.health).toBe("WATCH");
  });

  it("4. LIMITED because one or more condition dimensions are unknown — known/unknown counts exact", () => {
    const partial: DerivedBusinessConditionSignals = {
      ...ALL_KNOWN_CONDITION_DIMENSIONS,
      cashPressureLevel: "unknown",
      marginPressureLevel: "unknown",
    };
    const result = reconcileOwnerAssessment(baseInput({ conditionDimensions: partial }));
    expect(result.readiness).toBe("LIMITED");
    expect(result.knownConditionDimensionCount).toBe(9);
    expect(result.unknownConditionDimensionCount).toBe(2);
  });

  it("5. INSUFFICIENT: confidence INSUFFICIENT, 0 known dimensions, no issues — health null, every areaStatus null", () => {
    const result = reconcileOwnerAssessment(
      baseInput({
        confidence: EvidenceConfidenceLevel.INSUFFICIENT,
        conditionDimensions: ALL_UNKNOWN_CONDITION_DIMENSIONS,
        topOwnerActions: [],
        urgentRisks: [],
        businessHealth: "WATCH",
      }),
    );
    expect(result.readiness).toBe("INSUFFICIENT");
    expect(result.health).toBeNull();
    for (const status of Object.values(result.areaStatus)) {
      expect(status).toBeNull();
    }
  });

  it("6. INSUFFICIENT must NOT report OK health even when source businessHealth is OK", () => {
    const result = reconcileOwnerAssessment(
      baseInput({
        confidence: EvidenceConfidenceLevel.INSUFFICIENT,
        conditionDimensions: null,
        topOwnerActions: [],
        urgentRisks: [],
        businessHealth: "OK",
      }),
    );
    expect(result.readiness).toBe("INSUFFICIENT");
    expect(result.health).toBeNull();
    expect(result.health).not.toBe("OK");
  });

  it("7. missing data alone does not increase severity", () => {
    const result = reconcileOwnerAssessment(
      baseInput({ businessHealth: "WATCH", missingDataRequests: ["current payroll"], confidenceCapped: true }),
    );
    expect(result.health).toBe("WATCH");
    expect(result.health).not.toBe("DANGER");
    expect(result.health).not.toBe("CRITICAL");
  });

  it("8. all 'unknown' condition fields remain 'unknown' — never converted", () => {
    const result = reconcileOwnerAssessment(
      baseInput({ conditionDimensions: ALL_UNKNOWN_CONDITION_DIMENSIONS, topOwnerActions: [issue("i1")] }),
    );
    expect(result.conditionDimensions).toEqual(ALL_UNKNOWN_CONDITION_DIMENSIONS);
    for (const value of Object.values(result.conditionDimensions ?? {})) {
      expect(value).toBe("unknown");
    }
  });

  it("9. primaryIssue is exactly topOwnerActions[0]", () => {
    const first = issue("first", IssueCategory.CASH_DANGER, "CRITICAL");
    const second = issue("second", IssueCategory.GROWTH_OPPORTUNITY, "LOW");
    const result = reconcileOwnerAssessment(baseInput({ topOwnerActions: [first, second] }));
    expect(result.primaryIssue).toBe(first);
  });

  it("10. primaryIssue ordering is preserved — not reranked by severity", () => {
    const lowSeverityFirst = issue("low-first", IssueCategory.GROWTH_OPPORTUNITY, "LOW");
    const criticalSecond = issue("critical-second", IssueCategory.CASH_DANGER, "CRITICAL");
    const result = reconcileOwnerAssessment(baseInput({ topOwnerActions: [lowSeverityFirst, criticalSecond] }));
    expect(result.primaryIssue).toBe(lowSeverityFirst);
    expect(result.primaryIssue).not.toBe(criticalSecond);
  });

  it("11. urgentRisks ordering is preserved", () => {
    const risks = [issue("r1"), issue("r2"), issue("r3")];
    const result = reconcileOwnerAssessment(baseInput({ urgentRisks: risks }));
    expect(result.urgentRisks).toEqual(risks);
    expect(result.urgentRisks.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("12. source is exactly OWNER_NOW_VIEW", () => {
    const result = reconcileOwnerAssessment(baseInput());
    expect(result.source).toBe("OWNER_NOW_VIEW");
  });

  it("13. no condition dimension overwrites businessHealth", () => {
    const critical: DerivedBusinessConditionSignals = {
      ...ALL_KNOWN_CONDITION_DIMENSIONS,
      cashPressureLevel: "CRITICAL",
    };
    const result = reconcileOwnerAssessment(baseInput({ businessHealth: "OK", conditionDimensions: critical }));
    expect(result.health).toBe("OK");
  });

  it("14. critical businessHealth with limited confidence remains CRITICAL while readiness becomes LIMITED", () => {
    const result = reconcileOwnerAssessment(baseInput({ businessHealth: "CRITICAL", confidenceCapped: true }));
    expect(result.readiness).toBe("LIMITED");
    expect(result.health).toBe("CRITICAL");
  });

  it("15. no issues + known condition data must not automatically become INSUFFICIENT solely because issue arrays are empty", () => {
    const result = reconcileOwnerAssessment(
      baseInput({ topOwnerActions: [], urgentRisks: [], confidence: EvidenceConfidenceLevel.STRONG }),
    );
    expect(result.readiness).toBe("AVAILABLE");
  });

  it("16. null conditionDimensions yields 0 known / 11 unknown", () => {
    const result = reconcileOwnerAssessment(baseInput({ conditionDimensions: null }));
    expect(result.knownConditionDimensionCount).toBe(0);
    expect(result.unknownConditionDimensionCount).toBe(11);
    expect(result.conditionDimensions).toBeNull();
  });
});
