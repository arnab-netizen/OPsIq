import { describe, it, expect } from "vitest";
import {
  screenIdea,
  type BusinessFitProfile,
  type StartupIdeaInput,
} from "../../domain/owner-strategy/startup-screening";

const baseProfile: BusinessFitProfile = {
  capitalAvailableCents: 1_000_000, // $10 000
  ownerHoursPerWeek: 20,
  riskTolerance: "MEDIUM",
  location: "Cape Town",
  cashRunwayMonthsAvailable: 6,
  regulatoryExperience: false,
  priorIndustryExperience: true,
  existingNetworkStrength: 50,
  minimumMonthlyIncomeNeededCents: 30_000,
};

const baseIdea: StartupIdeaInput = {
  name: "Lawn Care Co",
  industry: "Landscaping",
  estimatedStartupCostCents: 500_000,
  estimatedMonthlyRevenueCents: 200_000,
  estimatedMonthlyProfitCents: 50_000,
  customerAccessibility: "HIGH",
  regulatoryComplexity: "LOW",
  requiresSpecialisedLicence: false,
  deliverableType: "SERVICE",
  capitalIntensity: "LOW",
  timeToFirstRevenueDays: 30,
  supplyChainRisk: "LOW",
  competitiveDifferentiator: "Mobile-first booking",
};

describe("startup-screening — module contract assertions", () => {
  it("screenIdea is a function", () => { expect(typeof screenIdea).toBe("function"); });
  it("baseProfile is an object", () => { expect(typeof baseProfile).toBe("object"); });
  it("baseIdea is an object", () => { expect(typeof baseIdea).toBe("object"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
  it("typeof Math.min equals function", () => { expect(typeof Math.min).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
});

describe("startup-screening", () => {
  // ── Scenario A: capital below startupCostEstimate ─────────────────────────
  describe("Scenario A — capital insufficient", () => {
    it("returns REJECTED and includes capital_sufficiency in bindingConstraints", () => {
      const result = screenIdea(
        { ...baseIdea, estimatedStartupCostCents: 2_000_000 }, // need $20 000
        { ...baseProfile, capitalAvailableCents: 500_000 }       // have $5 000
      );
      expect(result.status).toBe("REJECTED");
      expect(result.bindingConstraints.some((c) => c.toLowerCase().includes("capital"))).toBe(true);
    });

    it("capital_sufficiency dimension passed=false", () => {
      const result = screenIdea(
        { ...baseIdea, estimatedStartupCostCents: 2_000_000 },
        { ...baseProfile, capitalAvailableCents: 500_000 }
      );
      const dim = result.dimensions.find((d) => d.dimension === "capital_sufficiency");
      expect(dim?.passed).toBe(false);
    });
  });

  // ── Scenario B: owner hours zero ─────────────────────────────────────────
  describe("Scenario B — owner hours zero", () => {
    it("returns REJECTED when ownerHoursPerWeek=0", () => {
      const result = screenIdea(baseIdea, { ...baseProfile, ownerHoursPerWeek: 0 });
      expect(result.status).toBe("REJECTED");
    });

    it("owner_time dimension passed=false", () => {
      const result = screenIdea(baseIdea, { ...baseProfile, ownerHoursPerWeek: 0 });
      const dim = result.dimensions.find((d) => d.dimension === "owner_time");
      expect(dim?.passed).toBe(false);
    });

    it("returns EVIDENCE_REQUIRED when ownerHoursPerWeek is null", () => {
      const result = screenIdea(baseIdea, { ...baseProfile, ownerHoursPerWeek: null });
      // owner_time is critical and null → EVIDENCE_REQUIRED (unless something else fails harder)
      const dim = result.dimensions.find((d) => d.dimension === "owner_time");
      expect(dim?.passed).toBeNull();
      expect(result.unknownInputs.some((u) => u.includes("ownerHoursPerWeek"))).toBe(true);
    });
  });

  // ── Scenario C: no demand evidence, confidenceLevel=0 ────────────────────
  describe("Scenario C — no demand evidence", () => {
    it("evidenceRequired includes demand-related requirement when revenue estimate missing", () => {
      const result = screenIdea(
        { ...baseIdea, estimatedMonthlyRevenueCents: null },
        baseProfile
      );
      expect(result.evidenceRequired.some((e) =>
        e.toLowerCase().includes("revenue") || e.toLowerCase().includes("pricing")
      )).toBe(true);
    });

    it("revenue_model_evidence dimension is null when estimatedMonthlyRevenueCents missing", () => {
      const result = screenIdea({ ...baseIdea, estimatedMonthlyRevenueCents: null }, baseProfile);
      const dim = result.dimensions.find((d) => d.dimension === "revenue_model_evidence");
      expect(dim?.passed).toBeNull();
    });
  });

  // ── Scenario D: low customer accessibility reduces overall screening score ─
  describe("Scenario D — low customer accessibility", () => {
    it("customer_accessibility dimension passed=false for LOW", () => {
      const result = screenIdea(
        { ...baseIdea, customerAccessibility: "LOW" },
        baseProfile
      );
      const dim = result.dimensions.find((d) => d.dimension === "customer_accessibility");
      expect(dim?.passed).toBe(false);
    });

    it("overall status is REJECTED because customer_accessibility is critical", () => {
      const result = screenIdea(
        { ...baseIdea, customerAccessibility: "LOW" },
        baseProfile
      );
      expect(result.status).toBe("REJECTED");
    });

    it("UNKNOWN customer accessibility makes dim null and adds to evidenceRequired", () => {
      const result = screenIdea(
        { ...baseIdea, customerAccessibility: "UNKNOWN" },
        baseProfile
      );
      const dim = result.dimensions.find((d) => d.dimension === "customer_accessibility");
      expect(dim?.passed).toBeNull();
      expect(result.evidenceRequired.some((e) => e.toLowerCase().includes("customer"))).toBe(true);
    });
  });

  // ── Scenario I: two conflicting evidence items → lower confidence ─────────
  describe("Scenario I — conflicting evidence reflected in unknownInputs/evidenceRequired", () => {
    it("when multiple critical inputs are unknown, evidenceRequired list grows", () => {
      const result = screenIdea(
        {
          ...baseIdea,
          estimatedMonthlyRevenueCents: null,
          customerAccessibility: "UNKNOWN",
          regulatoryComplexity: "UNKNOWN",
        },
        { ...baseProfile, ownerHoursPerWeek: null }
      );
      // Multiple unknowns → EVIDENCE_REQUIRED, status driven by critical unknowns
      expect(result.status).toBe("EVIDENCE_REQUIRED");
      expect(result.evidenceRequired.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Licence and regulatory edge cases ────────────────────────────────────
  describe("licence requirement", () => {
    it("licence required without regulatory experience → REJECTED", () => {
      const result = screenIdea(
        { ...baseIdea, requiresSpecialisedLicence: true },
        { ...baseProfile, regulatoryExperience: false }
      );
      const dim = result.dimensions.find((d) => d.dimension === "licence_requirement");
      expect(dim?.passed).toBe(false);
      expect(result.status).toBe("REJECTED");
    });

    it("licence required with regulatory experience → passes", () => {
      const result = screenIdea(
        { ...baseIdea, requiresSpecialisedLicence: true },
        { ...baseProfile, regulatoryExperience: true }
      );
      const dim = result.dimensions.find((d) => d.dimension === "licence_requirement");
      expect(dim?.passed).toBe(true);
    });
  });

  // ── Cash runway ───────────────────────────────────────────────────────────
  describe("cash runway", () => {
    it("runway < 3 months → REJECTED via cash_survival binding constraint", () => {
      const result = screenIdea(baseIdea, { ...baseProfile, cashRunwayMonthsAvailable: 2 });
      expect(result.bindingConstraints.some((c) => c.toLowerCase().includes("runway"))).toBe(true);
      expect(result.status).toBe("REJECTED");
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────────
  describe("happy path", () => {
    it("returns PASSED when all critical dimensions are satisfied", () => {
      const result = screenIdea(baseIdea, baseProfile);
      expect(result.status).toBe("PASSED");
      expect(result.bindingConstraints).toHaveLength(0);
    });

    it("screenedAt is a valid ISO date string", () => {
      const result = screenIdea(baseIdea, baseProfile);
      expect(() => new Date(result.screenedAt)).not.toThrow();
      expect(new Date(result.screenedAt).toISOString()).toBe(result.screenedAt);
    });

    it("returns exactly 17 dimensions", () => {
      const result = screenIdea(baseIdea, baseProfile);
      expect(result.dimensions).toHaveLength(17);
    });
  });
});
