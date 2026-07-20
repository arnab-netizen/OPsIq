import { describe, it, expect } from "vitest";
import {
  assessReadiness,
  type ReadinessInputs,
} from "@/domain/owner-strategy/startup-readiness";

function baseInputs(overrides: Partial<ReadinessInputs> = {}): ReadinessInputs {
  return {
    problemEvidenceScore: 80,
    customerEvidenceScore: 75,
    wtpEvidenceScore: 70,
    solutionFeasibilityScore: 80,
    deliveryFeasibilityScore: 75,
    acquisitionFeasibilityScore: 70,
    economicClassification: "ECONOMICALLY_VIABLE",
    cashRunwayMonths: 12,
    breakEvenMonths: 6,
    capitalAvailableCents: BigInt(2000000),
    requiredStartupCostCents: BigInt(500000),
    ownerHoursPerWeek: 40,
    requiredHoursPerWeek: 30,
    maxCurrentCapacity: 100,
    minViableCapacity: 40,
    missingLicences: [],
    regulatoryEvidenceConfirmed: true,
    unresolvedCriticalRisks: 0,
    riskRegisterConfidence: 80,
    executionPlanExists: true,
    measurementPlanExists: true,
    stopConditionsDefined: true,
    confirmedHypotheses: 8,
    rejectedHypotheses: 1,
    totalHypotheses: 11,
    pendingCriticalHypotheses: 0,
    ...overrides,
  };
}

describe("assessReadiness — perfect inputs", () => {
  it("returns READY_FOR_OWNER_GO_DECISION", () => {
    const result = assessReadiness(baseInputs());
    expect(result.readinessStatus).toBe("READY_FOR_OWNER_GO_DECISION");
  });

  it("has no hard gate failures", () => {
    const result = assessReadiness(baseInputs());
    expect(result.hardGateFailures).toHaveLength(0);
  });

  it("regulatory gate passes", () => {
    const result = assessReadiness(baseInputs());
    const gate = result.passedGates.find((g) => g.id === "regulatory_licence");
    expect(gate).toBeDefined();
  });

  it("execution plan score is 100", () => {
    const result = assessReadiness(baseInputs());
    expect(result.executionPlanScore).toBe(100);
  });

  it("measurement plan score is 100", () => {
    const result = assessReadiness(baseInputs());
    expect(result.measurementPlanScore).toBe(100);
  });
});

describe("assessReadiness — missing licence → hard gate failure", () => {
  it("has regulatory_licence in hardGateFailures", () => {
    const result = assessReadiness(
      baseInputs({ missingLicences: ["Food Safety Certificate"] })
    );
    const gate = result.hardGateFailures.find((g) => g.id === "regulatory_licence");
    expect(gate).toBeDefined();
  });

  it("readinessStatus is REJECT when licence missing", () => {
    const result = assessReadiness(
      baseInputs({ missingLicences: ["Food Safety Certificate"] })
    );
    expect(result.readinessStatus).toBe("REJECT");
  });

  it("bindingConstraints includes the missing licence note", () => {
    const result = assessReadiness(
      baseInputs({ missingLicences: ["Food Safety Certificate"] })
    );
    expect(
      result.bindingConstraints.some((c) => c.includes("Food Safety Certificate"))
    ).toBe(true);
  });

  it("regulatory gate score is 0", () => {
    const result = assessReadiness(
      baseInputs({ missingLicences: ["Health Permit"] })
    );
    const gate = result.hardGateFailures.find((g) => g.id === "regulatory_licence");
    expect(gate?.score).toBe(0);
    expect(gate?.isHard).toBe(true);
  });
});

describe("assessReadiness — unresolved critical risks → hard gate failure", () => {
  it("critical_risks appears in hardGateFailures", () => {
    const result = assessReadiness(baseInputs({ unresolvedCriticalRisks: 2 }));
    const gate = result.hardGateFailures.find((g) => g.id === "critical_risks");
    expect(gate).toBeDefined();
  });

  it("status is not READY when there are unresolved critical risks", () => {
    const result = assessReadiness(baseInputs({ unresolvedCriticalRisks: 1 }));
    expect(result.readinessStatus).not.toBe("READY_FOR_OWNER_GO_DECISION");
  });
});

describe("assessReadiness — cash flow unsafe → hard gate failure", () => {
  it("cash_survival gate fails when runway < breakeven", () => {
    const result = assessReadiness(
      baseInputs({ cashRunwayMonths: 2, breakEvenMonths: 8 })
    );
    const gate = result.hardGateFailures.find((g) => g.id === "cash_survival");
    expect(gate).toBeDefined();
    expect(gate?.isHard).toBe(true);
  });

  it("readinessStatus is ON_HOLD when cash safety fails", () => {
    const result = assessReadiness(
      baseInputs({ cashRunwayMonths: 2, breakEvenMonths: 8 })
    );
    expect(result.readinessStatus).toBe("ON_HOLD");
  });
});

describe("assessReadiness — insufficient hypothesis confirmation", () => {
  it("returns MORE_VALIDATION_REQUIRED when <50% hypotheses confirmed", () => {
    const result = assessReadiness(
      baseInputs({ confirmedHypotheses: 2, totalHypotheses: 11, rejectedHypotheses: 1 })
    );
    expect(result.readinessStatus).toBe("MORE_VALIDATION_REQUIRED");
  });
});

describe("assessReadiness — individual dimension scores", () => {
  it("executionPlanScore is 0 when no plan exists", () => {
    const result = assessReadiness(baseInputs({ executionPlanExists: false }));
    expect(result.executionPlanScore).toBe(0);
  });

  it("stopConditionsScore is 0 when not defined", () => {
    const result = assessReadiness(baseInputs({ stopConditionsDefined: false }));
    expect(result.stopConditionsScore).toBe(0);
  });

  it("regulatoryReadinessScore is 30 when evidence not confirmed", () => {
    const result = assessReadiness(
      baseInputs({ regulatoryEvidenceConfirmed: false, missingLicences: [] })
    );
    expect(result.regulatoryReadinessScore).toBe(30);
  });
});
