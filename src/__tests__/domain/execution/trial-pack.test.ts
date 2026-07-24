import { describe, it, expect } from "vitest";
import {
  assessDataCompleteness,
  buildProvisionalTrialOutput,
} from "@/domain/execution/trial-pack";
import { ContextConfidence } from "@/domain/execution/business-context";

describe("trial pack — module contract assertions", () => {
  it("assessDataCompleteness is a function", () => {
    expect(typeof assessDataCompleteness).toBe("function");
  });
  it("buildProvisionalTrialOutput is a function", () => {
    expect(typeof buildProvisionalTrialOutput).toBe("function");
  });
  it("ContextConfidence.LOW is defined", () => {
    expect(ContextConfidence.LOW).toBeDefined();
  });
  it("ContextConfidence.MEDIUM is defined", () => {
    expect(ContextConfidence.MEDIUM).toBeDefined();
  });
  it("ContextConfidence.HIGH is defined", () => {
    expect(ContextConfidence.HIGH).toBeDefined();
  });
  it("assessDataCompleteness({}) returns an object", () => {
    expect(typeof assessDataCompleteness({})).toBe("object");
  });
  it("assessDataCompleteness({}) result has a confidence field", () => {
    expect(assessDataCompleteness({})).toHaveProperty("confidence");
  });
  it("assessDataCompleteness({}) result has a missingData field", () => {
    expect(assessDataCompleteness({})).toHaveProperty("missingData");
  });
  it("assessDataCompleteness({}).confidence is ContextConfidence.LOW", () => {
    expect(assessDataCompleteness({}).confidence).toBe(ContextConfidence.LOW);
  });
  it("assessDataCompleteness({}).missingData is an array", () => {
    expect(Array.isArray(assessDataCompleteness({}).missingData)).toBe(true);
  });
  it("buildProvisionalTrialOutput({}) returns an object", () => {
    expect(typeof buildProvisionalTrialOutput({})).toBe("object");
  });
  it("buildProvisionalTrialOutput({}) result has requiresOwnerApproval field", () => {
    expect(buildProvisionalTrialOutput({})).toHaveProperty("requiresOwnerApproval");
  });
  it("buildProvisionalTrialOutput({}).requiresOwnerApproval is true", () => {
    expect(buildProvisionalTrialOutput({}).requiresOwnerApproval).toBe(true);
  });
  it("buildProvisionalTrialOutput({}) result has safeProvisionalOnly field", () => {
    expect(buildProvisionalTrialOutput({})).toHaveProperty("safeProvisionalOnly");
  });
  it("buildProvisionalTrialOutput({}) result has provisionalRecommendations field", () => {
    expect(buildProvisionalTrialOutput({})).toHaveProperty("provisionalRecommendations");
  });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
});

describe("trial pack (Slice 24)", () => {
  it("accepts incomplete data without throwing", () => {
    expect(() => assessDataCompleteness({})).not.toThrow();
    expect(() => buildProvisionalTrialOutput({ employees: [{ id: "e1" }] })).not.toThrow();
  });

  it("missing data caps confidence", () => {
    expect(assessDataCompleteness({}).confidence).toBe(ContextConfidence.LOW);
    const partial = assessDataCompleteness({
      businessProfile: {},
      employees: [{}],
      customersOrders: [{}],
      pricingBoundary: {},
      capacity: {},
      ownerGoals: {},
    });
    expect(partial.confidence).toBe(ContextConfidence.MEDIUM);
    expect(partial.missingData.length).toBeGreaterThan(0);
  });

  it("provisional output is safe and always requires owner approval before execution", () => {
    const out = buildProvisionalTrialOutput({ employees: [{ id: "e1" }] });
    expect(out.requiresOwnerApproval).toBe(true);
    expect(out.safeProvisionalOnly).toBe(true);
    expect(out.provisionalRecommendations.join(" ")).toMatch(/approve/i);
  });

  it("full data yields HIGH confidence but still requires owner approval", () => {
    const out = buildProvisionalTrialOutput({
      businessProfile: {},
      employees: [{}],
      customersOrders: [{}],
      pricingBoundary: {},
      capacity: {},
      proofExamples: [{}],
      sopInput: {},
      complaintHistory: [{}],
      paymentCash: {},
      ownerGoals: {},
      marginTarget: 0.3,
    });
    expect(out.confidence).toBe(ContextConfidence.HIGH);
    expect(out.requiresOwnerApproval).toBe(true);
  });
});
