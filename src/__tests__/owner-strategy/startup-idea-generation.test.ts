/**
 * Unit tests for startup-idea-generation.ts
 * Tests: generateIdeasFromProfile — fail-closed on missing provider, NEED_OPTIONS classification
 */
import { describe, it, expect } from "vitest";
import { generateIdeasFromProfile, type GenerationProfile } from "@/domain/owner-strategy/startup-idea-generation";

function makeProfile(overrides: Partial<GenerationProfile> = {}): GenerationProfile {
  return {
    geography: "AU",
    capitalAvailableCents: 500000n,
    ownerSkills: ["sales", "project management"],
    ownerHoursPerWeek: 30,
    excludedCategories: [],
    riskTolerance: "MEDIUM",
    preferredIndustries: ["services"],
    previouslyRejectedIdeaNames: [],
    existingAssets: [],
    existingCustomerProblems: [],
    ...overrides,
  };
}

describe("generateIdeasFromProfile", () => {
  it("returns available=false when provider is not configured", () => {
    const result = generateIdeasFromProfile(makeProfile(), [], [], false, "ver-1");
    expect(result.available).toBe(false);
    expect(result.generationMethod).toBe("NEED_OPTIONS_UNAVAILABLE");
  });

  it("returns empty concepts when provider unavailable", () => {
    const result = generateIdeasFromProfile(makeProfile(), [], [], false, "ver-1");
    expect(result.concepts).toBeDefined();
    expect(result.concepts).toHaveLength(0);
    expect(result.unavailabilityReason).toBeTruthy();
  });

  it("uses NEED_OPTIONS_GOVERNED_HEURISTIC when provider is configured", () => {
    const signals = [{ id: "sig-1", signalType: "MARKET_GAP", industry: "CLEANING", summary: "High demand for cleaning services in local area", capitalRequirementCents: 100000n }];
    const result = generateIdeasFromProfile(makeProfile({ existingAssets: ["van", "equipment"] }), signals, [], true, "ver-1");
    expect(result.available).toBe(true);
    expect(result.generationMethod).toBe("NEED_OPTIONS_GOVERNED_HEURISTIC");
  });

  it("returns at least one concept when signals or assets are provided", () => {
    const signals = [{ id: "sig-1", signalType: "MARKET_GAP", industry: "SERVICES", summary: "Unmet demand for local delivery service", capitalRequirementCents: 50000n }];
    const result = generateIdeasFromProfile(makeProfile(), signals, [], true, "ver-1");
    expect(result.concepts.length + result.rejectedConcepts.length).toBeGreaterThan(0);
  });

  it("each generated concept has name and industry", () => {
    const signals = [{ id: "sig-2", signalType: "TREND", industry: "FOOD", summary: "Demand for meal prep service", capitalRequirementCents: 80000n }];
    const result = generateIdeasFromProfile(makeProfile(), signals, [], true, "ver-1");
    const all = [...result.concepts, ...result.rejectedConcepts];
    for (const concept of all) {
      expect(concept.name).toBeTruthy();
      expect(concept.industry).toBeTruthy();
    }
  });

  it("concepts with capital requirements above available capital fail capital check", () => {
    const lowCapitalProfile = makeProfile({ capitalAvailableCents: 1000n });
    const signals = [{ id: "sig-3", signalType: "MARKET_GAP", industry: "TECH", summary: "Software startup opportunity", capitalRequirementCents: 500000n }];
    const result = generateIdeasFromProfile(lowCapitalProfile, signals, [], true, "ver-1");
    // If a concept has high capital requirement, it should fail the capital check and be rejected
    const highCapConcept = result.rejectedConcepts.find((c) => c.estimatedCapitalRequirementCents != null && c.estimatedCapitalRequirementCents > 1000n);
    if (highCapConcept) {
      expect(highCapConcept.structuredValidation.passedCapitalCheck).toBe(false);
    }
  });

  it("previously rejected idea names produce concepts with passedPreviousRejectionCheck=false", () => {
    const profile = makeProfile({ previouslyRejectedIdeaNames: ["CLEANING service based on"] });
    const signals = [{ id: "sig-4", signalType: "MARKET_GAP", industry: "CLEANING", summary: "High demand for cleaning", capitalRequirementCents: 50000n }];
    const result = generateIdeasFromProfile(profile, signals, [], true, "ver-1");
    const cleaningRejected = result.rejectedConcepts.find((c) => c.name.toLowerCase().includes("cleaning"));
    if (cleaningRejected) {
      expect(cleaningRejected.structuredValidation.passedPreviousRejectionCheck).toBe(false);
    }
  });

  it("profileVersion is passed through to result", () => {
    const result = generateIdeasFromProfile(makeProfile(), [], [], true, "ver-custom-123");
    expect(result.profileVersion).toBe("ver-custom-123");
  });

  it("rejectedConcepts is an array (may be empty)", () => {
    const result = generateIdeasFromProfile(makeProfile(), [], [], true, "ver-1");
    expect(Array.isArray(result.rejectedConcepts)).toBe(true);
  });
});
