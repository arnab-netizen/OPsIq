/**
 * START HERE — proves the 5-step structure is derived honestly from real onboarding signals
 * (never a fabricated progress bar), that a category not required for this archetype is marked
 * "not applicable" rather than a false incomplete, and that maturity/next-step logic behaves.
 */
import { describe, it, expect } from "vitest";
import { computeStartHereSteps, hasEngagedPriorityForBusiness, nextStartHereStep, isStartHereMature, type StartHereInput } from "@/domain/owner-mode/start-here";
import type { MissingMinimum, ProfileInputRequirements } from "@/domain/owner-mode/owner-onboarding";

const missing = (category: string): MissingMinimum => ({
  category: category as MissingMinimum["category"],
  label: category, severity: "critical", why: "test", decisionAffected: "test",
});

function baseInput(over: Partial<StartHereInput> = {}): StartHereInput {
  const requirements: ProfileInputRequirements = {
    minimumRequired: ["revenue_sales", "expenses", "cash_debt"],
    recommended: ["customer_count", "sops_checklists"],
    optional: [],
  };
  return {
    businessBasicsComplete: true,
    canRunFirstDiagnosis: false,
    missingMinimum: [],
    suppliedCategories: [],
    requirements,
    hasEngagedAPriority: false,
    ...over,
  };
}

describe("computeStartHereSteps", () => {
  it("brand-new business: only business basics complete, money is the next step", () => {
    const steps = computeStartHereSteps(baseInput({ missingMinimum: [missing("customer_count"), missing("sops_checklists")] }));
    expect(steps.find((s) => s.id === "business_basics")?.complete).toBe(true);
    expect(steps.find((s) => s.id === "money_numbers")?.complete).toBe(false);
    const next = nextStartHereStep(steps);
    expect(next?.id).toBe("money_numbers");
  });

  it("money entered, customers still missing: customers is the next step", () => {
    const steps = computeStartHereSteps(baseInput({ canRunFirstDiagnosis: true, missingMinimum: [missing("customer_count"), missing("sops_checklists")] }));
    expect(steps.find((s) => s.id === "money_numbers")?.complete).toBe(true);
    const next = nextStartHereStep(steps);
    expect(next?.id).toBe("customers");
  });

  it("a category not required for this archetype is applicable:false and complete:true — never a false incomplete", () => {
    const steps = computeStartHereSteps(baseInput({
      requirements: { minimumRequired: ["revenue_sales", "expenses", "cash_debt"], recommended: [], optional: ["customer_count", "sops_checklists"] },
      canRunFirstDiagnosis: true,
    }));
    const customers = steps.find((s) => s.id === "customers")!;
    expect(customers.applicable).toBe(false);
    expect(customers.complete).toBe(true);
  });

  it("all applicable steps complete + at least one priority engaged: nextStartHereStep is null", () => {
    const steps = computeStartHereSteps(baseInput({ canRunFirstDiagnosis: true, hasEngagedAPriority: true, suppliedCategories: ["customer_count", "sops_checklists"] }));
    expect(nextStartHereStep(steps)).toBeNull();
  });

  it("isStartHereMature is false until money is complete, regardless of other steps", () => {
    const steps = computeStartHereSteps(baseInput({ canRunFirstDiagnosis: false }));
    expect(isStartHereMature(steps)).toBe(false);
  });

  it("isStartHereMature is false when money is complete but BOTH customers and operations are still missing", () => {
    const steps = computeStartHereSteps(baseInput({
      canRunFirstDiagnosis: true,
      missingMinimum: [missing("customer_count"), missing("sops_checklists")],
    }));
    expect(isStartHereMature(steps)).toBe(false);
  });

  it("isStartHereMature is true once money is complete AND at least one of customers/operations is complete", () => {
    // Only customers has actually been supplied; operations is still missing.
    const stepsWithCustomers = computeStartHereSteps(baseInput({ canRunFirstDiagnosis: true, suppliedCategories: ["customer_count"], missingMinimum: [missing("sops_checklists")] }));
    expect(stepsWithCustomers.find((s) => s.id === "customers")?.complete).toBe(true);
    expect(isStartHereMature(stepsWithCustomers)).toBe(true);
  });

  it("isStartHereMature is true once money is complete and neither customers nor operations is applicable at all", () => {
    const steps = computeStartHereSteps(baseInput({
      canRunFirstDiagnosis: true,
      requirements: { minimumRequired: ["revenue_sales", "expenses", "cash_debt"], recommended: [], optional: ["customer_count", "sops_checklists"] },
    }));
    expect(isStartHereMature(steps)).toBe(true);
  });
});

describe("computeStartHereSteps — completion requires the category to be actually supplied", () => {
  it("B1/B4: applicable customer + operations steps with nothing supplied are incomplete even when absent from missingMinimum", () => {
    const steps = computeStartHereSteps(baseInput({ canRunFirstDiagnosis: true, missingMinimum: [], suppliedCategories: ["revenue_sales", "expenses", "cash_debt"] }));
    expect(steps.find((s) => s.id === "customers")).toMatchObject({ applicable: true, complete: false });
    expect(steps.find((s) => s.id === "operations")).toMatchObject({ applicable: true, complete: false });
  });

  it("B2/B4: supplied customer_count / sops_checklists complete their steps", () => {
    const steps = computeStartHereSteps(baseInput({ canRunFirstDiagnosis: true, suppliedCategories: ["customer_count", "sops_checklists"] }));
    expect(steps.find((s) => s.id === "customers")?.complete).toBe(true);
    expect(steps.find((s) => s.id === "operations")?.complete).toBe(true);
  });

  it("B3: a not-applicable step stays 'not needed', not falsely incomplete", () => {
    const steps = computeStartHereSteps(baseInput({
      suppliedCategories: [],
      requirements: { minimumRequired: ["revenue_sales", "expenses", "cash_debt"], recommended: [], optional: ["customer_count", "sops_checklists"] },
    }));
    expect(steps.find((s) => s.id === "customers")).toMatchObject({ applicable: false, complete: true });
    expect(steps.find((s) => s.id === "operations")).toMatchObject({ applicable: false, complete: true });
  });
});

describe("hasEngagedPriorityForBusiness — per-business priority engagement (MP2-1)", () => {
  it("MP2-1A: another business's engaged task never counts", () => {
    expect(hasEngagedPriorityForBusiness([{ businessId: "biz-old", status: "IN_PROGRESS" }], "biz-new")).toBe(false);
  });
  it("MP2-1B: a workspace-level (businessId null) engaged task never counts", () => {
    expect(hasEngagedPriorityForBusiness([{ businessId: null, status: "IN_PROGRESS" }, { status: "APPROVED" }], "biz-new")).toBe(false);
  });
  it("MP2-1C: a PROPOSED (or status-less) task of the selected business does not count", () => {
    expect(hasEngagedPriorityForBusiness([{ businessId: "biz-new", status: "PROPOSED" }, { businessId: "biz-new", status: null }], "biz-new")).toBe(false);
  });
  it("MP2-1D/E: any selected-business task past PROPOSED counts (approved, in progress, rejected, ...)", () => {
    for (const status of ["APPROVED", "IN_PROGRESS", "REJECTED", "COMPLETED"]) {
      expect(hasEngagedPriorityForBusiness([{ businessId: "biz-new", status }], "biz-new"), status).toBe(true);
    }
  });
  it("no active business → false; empty list → false", () => {
    expect(hasEngagedPriorityForBusiness([{ businessId: "biz-new", status: "APPROVED" }], null)).toBe(false);
    expect(hasEngagedPriorityForBusiness([], "biz-new")).toBe(false);
  });
});
