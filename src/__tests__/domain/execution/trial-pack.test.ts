import { describe, it, expect } from "vitest";
import {
  assessDataCompleteness,
  buildProvisionalTrialOutput,
} from "@/domain/execution/trial-pack";
import { ContextConfidence } from "@/domain/execution/business-context";

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
