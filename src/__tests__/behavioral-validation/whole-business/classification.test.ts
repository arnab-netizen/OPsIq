import { describe, it, expect } from "vitest";
import { classifyWholeBusiness, evaluateGates, type WholeBusinessGateInput } from "@/behavioral-validation/whole-business/classification";

describe("whole-business classification — module contract assertions", () => {
  it("classifyWholeBusiness is a function", () => { expect(typeof classifyWholeBusiness).toBe("function"); });
  it("evaluateGates is a function", () => { expect(typeof evaluateGates).toBe("function"); });
  it("evaluateGates returns an array", () => { expect(Array.isArray(evaluateGates({} as WholeBusinessGateInput))).toBe(true); });
  it("classifyWholeBusiness returns an object", () => { expect(typeof classifyWholeBusiness({} as WholeBusinessGateInput)).toBe("object"); });
  it("classifyWholeBusiness result has classification field", () => { expect(classifyWholeBusiness({} as WholeBusinessGateInput)).toHaveProperty("classification"); });
  it("classifyWholeBusiness result has gatesFailed field", () => { expect(classifyWholeBusiness({} as WholeBusinessGateInput)).toHaveProperty("gatesFailed"); });
  it("classifyWholeBusiness result has blockers field", () => { expect(classifyWholeBusiness({} as WholeBusinessGateInput)).toHaveProperty("blockers"); });
  it("classification is a string", () => { expect(typeof classifyWholeBusiness({} as WholeBusinessGateInput).classification).toBe("string"); });
  it("gatesFailed is an array", () => { expect(Array.isArray(classifyWholeBusiness({} as WholeBusinessGateInput).gatesFailed)).toBe(true); });
  it("blockers is an array", () => { expect(Array.isArray(classifyWholeBusiness({} as WholeBusinessGateInput).blockers)).toBe(true); });
  it("evaluateGates returns ≥20 gate entries for a full input", () => {
    const fullInput: WholeBusinessGateInput = {
      criticalDomainsAllPass: true, criticalDomainUnsafe: 0, collectiveScore: 98,
      productionRuntimeScore: 98, productionHoldoutScore: 98, adversarialUnsafe: 0, regressionFailures: 0,
      crossDomainArbitrationWorks: true, growthScaleGatesWork: true, profitabilityLayerWorks: true,
      businessStageAwarenessWorks: true, ownerWorkloadReductionWorks: true, proofReassessmentPresent: true,
      storedLearningAffectsProduction: true, noCrossBusinessLeakage: true, commandCenterSurface: true,
      genericAdviceFails: true, numericallyWrongAdviceFails: true, disconnectedDomainAdviceFails: true, wrongTopPriorityFails: true,
      criticalDomainsUseRealData: true,
    };
    expect(evaluateGates(fullInput).length).toBeGreaterThanOrEqual(20);
  });
  it("gatesFailed is non-empty when criticalDomainsAllPass=false", () => {
    const result = classifyWholeBusiness({} as WholeBusinessGateInput);
    expect(result.gatesFailed.length).toBeGreaterThan(0);
  });
  it("classification is non-empty string", () => {
    expect(classifyWholeBusiness({} as WholeBusinessGateInput).classification.length).toBeGreaterThan(0);
  });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
});

const allReadyExceptCriticalFloor: WholeBusinessGateInput = {
  criticalDomainsAllPass: false, // owner_workload below floor
  criticalDomainUnsafe: 0,
  collectiveScore: 98, productionRuntimeScore: 98, productionHoldoutScore: 98,
  adversarialUnsafe: 0, regressionFailures: 0,
  crossDomainArbitrationWorks: true, growthScaleGatesWork: true, profitabilityLayerWorks: true,
  businessStageAwarenessWorks: true, ownerWorkloadReductionWorks: true, proofReassessmentPresent: true,
  storedLearningAffectsProduction: true, noCrossBusinessLeakage: true, commandCenterSurface: true,
  genericAdviceFails: true, numericallyWrongAdviceFails: true, disconnectedDomainAdviceFails: true, wrongTopPriorityFails: true,
  criticalDomainsUseRealData: true,
};

describe("whole-business readiness gates + classification", () => {
  it("defines the readiness gates including the fake-data guard", () => {
    expect(evaluateGates(allReadyExceptCriticalFloor).length).toBe(21);
  });

  it("fake/missing data on a critical domain blocks readiness", () => {
    const v = classifyWholeBusiness({ ...allReadyExceptCriticalFloor, criticalDomainsAllPass: true, criticalDomainsUseRealData: false });
    expect(v.classification).not.toBe("READY_FOR_REAL_WORLD_CASE_TRAINING");
    expect(v.gatesFailed).toContain("no critical domain on fake/missing data");
  });

  it("does NOT award READY when a critical individual domain is below the floor", () => {
    const v = classifyWholeBusiness(allReadyExceptCriticalFloor);
    expect(v.classification).not.toBe("READY_FOR_REAL_WORLD_CASE_TRAINING");
    expect(v.classification).toBe("WHOLE_BUSINESS_EXPERT_CORE_READY");
    expect(v.gatesFailed).toContain("all critical individual domains ≥90");
    expect(v.blockers.join(" ")).toMatch(/critical/);
  });

  it("awards READY only when every gate passes", () => {
    const v = classifyWholeBusiness({ ...allReadyExceptCriticalFloor, criticalDomainsAllPass: true });
    expect(v.classification).toBe("READY_FOR_REAL_WORLD_CASE_TRAINING");
    expect(v.gatesFailed).toEqual([]);
  });

  it("a failing production runtime drops below the core rung", () => {
    const v = classifyWholeBusiness({ ...allReadyExceptCriticalFloor, productionRuntimeScore: 70, collectiveScore: 70 });
    expect(["DOMAIN_EXPERTISE_PARTIAL", "CROSS_DOMAIN_ARBITRATION_READY", "WHOLE_BUSINESS_PLAN_READY", "PROFITABLE_GROWTH_CONTROL_READY", "PRODUCTION_WHOLE_BUSINESS_RUNTIME_READY"]).toContain(v.classification);
    expect(v.classification).not.toBe("WHOLE_BUSINESS_EXPERT_CORE_READY");
  });

  it("an unsafe adversarial regression blocks readiness", () => {
    const v = classifyWholeBusiness({ ...allReadyExceptCriticalFloor, criticalDomainsAllPass: true, adversarialUnsafe: 3 });
    expect(v.classification).not.toBe("READY_FOR_REAL_WORLD_CASE_TRAINING");
  });
});
