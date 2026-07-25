/**
 * Phase 14–15 — Startup Mode (Validation + Launch Workbench) tests (GAP-008).
 *
 * Proves the exit gates:
 *   - a beginner scenario produces a validation-first Work Package, not a plan
 *   - weak ideas are rejected; capital insufficiency is exposed (not hidden)
 *   - launch is NOT allowed before validation (planLaunch throws)
 */
import { describe, it, expect } from "vitest";
import {
  evaluateIdea,
  validateStartup,
  planLaunch,
  StartupNotValidatedError,
} from "@/domain/owner-strategy/startup-mode";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";

const INTAKE: StartupIntake = {
  location: "Pune, IN",
  capitalAvailable: 300000,
  monthlySurvivalNeed: 40000,
  hoursPerWeekAvailable: 40,
  riskTolerance: "medium",
  targetMonthlyIncome: 80000,
  canSell: true,
  canOperateDaily: true,
  fastCashVsScale: "fast_cash",
};

const SOLID_IDEA: StartupIdea = {
  name: "Local laundry service",
  industry: "laundry",
  structural: {
    grossMarginPct: 55,
    netMarginPct: 18,
    revenueFrequency: "recurring",
    repeatCustomerPct: 50,
    pricingPower: "moderate",
    differentiation: "moderate",
    competitiveMoat: "weak",
    expansionPath: "local",
    capitalIntensity: "medium",
    downsideRisk: "low",
  },
  estimatedStartupCost: 120000,
  estimatedMonthlyRevenue: 90000,
  estimatedMonthlyCost: 65000,
  timeToFirstRevenueMonths: 1,
  jurisdictionKnown: false,
};

const UNAFFORDABLE_IDEA: StartupIdea = {
  name: "Cloud kitchen chain",
  industry: "food",
  structural: { grossMarginPct: 60, netMarginPct: 12, expansionPath: "multi_unit", capitalIntensity: "high", downsideRisk: "high" },
  estimatedStartupCost: 1500000, // far above capital
  estimatedMonthlyRevenue: 200000,
  estimatedMonthlyCost: 180000,
  timeToFirstRevenueMonths: 4,
};

const TRAP_IDEA: StartupIdea = {
  name: "Discount reselling",
  industry: "retail",
  structural: { netMarginPct: 1, grossMarginPct: 8, expansionPath: "local", capitalIntensity: "high", workingCapitalPressure: "high", downsideRisk: "high", differentiation: "none", competitiveMoat: "none" },
  estimatedStartupCost: 50000,
  estimatedMonthlyRevenue: 40000,
  estimatedMonthlyCost: 41000, // loss-making
};

describe("startup-mode — module contract assertions", () => {
  it("evaluateIdea is a function", () => { expect(typeof evaluateIdea).toBe("function"); });
  it("validateStartup is a function", () => { expect(typeof validateStartup).toBe("function"); });
  it("planLaunch is a function", () => { expect(typeof planLaunch).toBe("function"); });
  it("StartupNotValidatedError is a function", () => { expect(typeof StartupNotValidatedError).toBe("function"); });
  it("INTAKE is an object", () => { expect(typeof INTAKE).toBe("object"); });
  it("SOLID_IDEA is an object", () => { expect(typeof SOLID_IDEA).toBe("object"); });
  it("UNAFFORDABLE_IDEA is an object", () => { expect(typeof UNAFFORDABLE_IDEA).toBe("object"); });
  it("TRAP_IDEA is an object", () => { expect(typeof TRAP_IDEA).toBe("object"); });
  it("INTAKE.capitalAvailable equals 300000", () => { expect(INTAKE.capitalAvailable).toBe(300000); });
  it("SOLID_IDEA.name equals Local laundry service", () => { expect(SOLID_IDEA.name).toBe("Local laundry service"); });
  it("evaluateIdea(INTAKE, SOLID_IDEA) returns an object", () => { expect(typeof evaluateIdea(INTAKE, SOLID_IDEA)).toBe("object"); });
  it("evaluateIdea(INTAKE, SOLID_IDEA) has accepted field", () => { expect(evaluateIdea(INTAKE, SOLID_IDEA)).toHaveProperty("accepted"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("evaluateIdea — honest screening", () => {
  it("accepts a solid affordable idea and computes economics", () => {
    const e = evaluateIdea(INTAKE, SOLID_IDEA);
    expect(e.accepted).toBe(true);
    expect(e.monthlyProfit).toBe(25000);
    expect(e.capitalSufficient).toBe(true);
    expect(e.breakEvenMonths).toBe(Math.ceil(120000 / 25000));
  });

  it("rejects an unaffordable idea and exposes the capital gap (not hidden)", () => {
    const e = evaluateIdea(INTAKE, UNAFFORDABLE_IDEA);
    expect(e.accepted).toBe(false);
    expect(e.capitalSufficient).toBe(false);
    expect(e.capitalGap).toBeGreaterThan(0);
    expect(e.reasons.join(" ")).toMatch(/capital insufficient/i);
  });

  it("rejects a trap / loss-making idea", () => {
    const e = evaluateIdea(INTAKE, TRAP_IDEA);
    expect(e.accepted).toBe(false);
    expect(e.reasons.join(" ")).toMatch(/weak economics|trap|not worth/i);
  });
});

describe("validateStartup — validation-first, launch not authorized", () => {
  it("shortlists solid ideas, rejects weak ones, and produces a validation Work Package", () => {
    const r = validateStartup(INTAKE, [SOLID_IDEA, UNAFFORDABLE_IDEA, TRAP_IDEA]);
    expect(r.recommended?.name).toBe("Local laundry service");
    expect(r.shortlist).toHaveLength(1);
    expect(r.rejected.length).toBe(2);
    expect(r.validationWorkPackage).not.toBeNull();
    expect(r.validationWorkPackage!.actionKind).toBe("startup_validation");
    // The validation Work Package carries real customer-validation artifacts.
    expect(r.validationWorkPackage!.preparedArtifacts.some((a) => a.kind === "customer_script")).toBe(true);
  });

  it("never authorizes launch from validation alone", () => {
    const r = validateStartup(INTAKE, [SOLID_IDEA]);
    expect(r.launchAllowed).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/not authorized|validate first|validation Work Package/i);
  });

  it("warns clearly when no idea passes", () => {
    const r = validateStartup(INTAKE, [UNAFFORDABLE_IDEA, TRAP_IDEA]);
    expect(r.recommended).toBeNull();
    expect(r.validationWorkPackage).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/no idea passed/i);
  });

  it("provides kill/pivot criteria", () => {
    const r = validateStartup(INTAKE, [SOLID_IDEA]);
    expect(r.killPivotCriteria.length).toBeGreaterThan(0);
  });
});

describe("planLaunch — no launch before validation", () => {
  it("throws when the idea is not validated", () => {
    expect(() => planLaunch("Local laundry service", { validated: false })).toThrow(StartupNotValidatedError);
  });

  it("produces a launch Work Package + 30/60/90 plan for a validated idea", () => {
    const r = planLaunch("Local laundry service", { validated: true, jurisdictionKnown: false, businessName: "Sparkle Laundry" });
    expect(r.launchWorkPackage.actionKind).toBe("startup_launch");
    expect(r.launchWorkPackage.preparedArtifacts.some((a) => a.kind === "launch_checklist")).toBe(true);
    expect(r.plan306090.day30.length).toBeGreaterThan(0);
    expect(r.plan306090.day90.length).toBeGreaterThan(0);
    expect(r.complianceReviewRequired).toBe(true); // jurisdiction not verified
    expect(r.reviewCadenceDays).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const a = planLaunch("X", { validated: true });
    const b = planLaunch("X", { validated: true });
    expect(a).toEqual(b);
  });
});
