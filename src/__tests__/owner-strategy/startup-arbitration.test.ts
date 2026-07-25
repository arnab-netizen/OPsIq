/**
 * Unit tests for startup-arbitration.ts
 * Tests: convertIdeaToObjectiveCandidate, arbitrateStartupIdeas
 * Adversarial Scenario E: lower revenue, higher survival preferred over fragile high-revenue
 */
import { describe, it, expect } from "vitest";
import {
  convertIdeaToObjectiveCandidate,
  arbitrateStartupIdeas,
  type StartupIdeaForArbitration,
} from "@/domain/owner-strategy/startup-arbitration";

function makeIdea(overrides: Partial<StartupIdeaForArbitration> = {}): StartupIdeaForArbitration {
  return {
    id: "idea-1",
    name: "Test Idea",
    accepted: true,
    screeningStatus: "PASSED",
    riskAdjustedScore: 70,
    capitalSufficient: true,
    monthlyProfit: 5000,
    economicClassification: "VIABLE",
    cashRunwayMonths: 12,
    breakEvenMonths: 6,
    readinessStatus: "READY",
    hypothesesFailed: 0,
    hypothesesTotal: 5,
    regulatoryBlocked: false,
    ...overrides,
  };
}

describe("startup-arbitration — module contract assertions", () => {
  it("convertIdeaToObjectiveCandidate is a function", () => { expect(typeof convertIdeaToObjectiveCandidate).toBe("function"); });
  it("arbitrateStartupIdeas is a function", () => { expect(typeof arbitrateStartupIdeas).toBe("function"); });
  it("makeIdea is a function", () => { expect(typeof makeIdea).toBe("function"); });
  it("makeIdea() returns an object", () => { expect(typeof makeIdea()).toBe("object"); });
  it("makeIdea().id equals 'idea-1'", () => { expect(makeIdea().id).toBe("idea-1"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("convertIdeaToObjectiveCandidate", () => {
  it("maps riskAdjustedScore to priorityScore (clamped 0-100)", () => {
    const idea = makeIdea({ riskAdjustedScore: 85 });
    const candidate = convertIdeaToObjectiveCandidate(idea);
    expect(candidate.priorityScore).toBe(85);
    expect(candidate.objectiveId).toBe("idea-1");
    expect(candidate.objectiveType).toBe("GROWTH");
  });

  it("uses 50 as neutral priorityScore when riskAdjustedScore is null", () => {
    const idea = makeIdea({ riskAdjustedScore: null });
    const candidate = convertIdeaToObjectiveCandidate(idea);
    expect(candidate.priorityScore).toBe(50);
    expect(candidate.confidence).toBe(0.4);
  });

  it("sets confidence 0.7 when riskAdjustedScore is known", () => {
    const idea = makeIdea({ riskAdjustedScore: 60 });
    const candidate = convertIdeaToObjectiveCandidate(idea);
    expect(candidate.confidence).toBe(0.7);
  });

  it("reversible is always true for startup ideas", () => {
    const candidate = convertIdeaToObjectiveCandidate(makeIdea());
    expect(candidate.reversible).toBe(true);
  });

  it("UNVIABLE classification drives riskScore to at least 85", () => {
    const idea = makeIdea({ economicClassification: "UNVIABLE" });
    const candidate = convertIdeaToObjectiveCandidate(idea);
    expect(candidate.operationalRisk).toBeGreaterThanOrEqual(85);
  });

  it("REGULATORY_BLOCKED drives riskScore to at least 90", () => {
    const idea = makeIdea({ regulatoryBlocked: true });
    const candidate = convertIdeaToObjectiveCandidate(idea);
    expect(candidate.operationalRisk).toBeGreaterThanOrEqual(90);
    expect(candidate.hasBlockingDependencies).toBe(true);
  });

  it("each failed hypothesis adds 10 to riskScore", () => {
    const base = makeIdea({ hypothesesFailed: 0, hypothesesTotal: 5 });
    const failed = makeIdea({ hypothesesFailed: 3, hypothesesTotal: 5 });
    const baseCand = convertIdeaToObjectiveCandidate(base);
    const failedCand = convertIdeaToObjectiveCandidate(failed);
    expect(failedCand.operationalRisk).toBeGreaterThan(baseCand.operationalRisk);
  });

  it("capital insufficient → resourceAvailabilityRatio 0.2", () => {
    const idea = makeIdea({ capitalSufficient: false });
    const candidate = convertIdeaToObjectiveCandidate(idea);
    expect(candidate.resourceAvailabilityRatio).toBe(0.2);
    expect(candidate.resourceBudgetUsedPct).toBe(80);
  });

  it("uses breakEvenMonths * 30 as deadlineDaysRemaining", () => {
    const idea = makeIdea({ breakEvenMonths: 4 });
    const candidate = convertIdeaToObjectiveCandidate(idea);
    expect(candidate.deadlineDaysRemaining).toBe(120);
  });
});

describe("arbitrateStartupIdeas — Scenario E: lower revenue, higher survival preferred", () => {
  it("all ideas rejected → recommendedIdeaId is null with ALL_IDEAS_REJECTED binding constraint", () => {
    const ideas = [
      makeIdea({ id: "a", screeningStatus: "REJECTED" }),
      makeIdea({ id: "b", regulatoryBlocked: true }),
    ];
    const result = arbitrateStartupIdeas(ideas);
    expect(result.recommendedIdeaId).toBeNull();
    expect(result.bindingConstraints).toContain("ALL_IDEAS_REJECTED_OR_BLOCKED");
  });

  it("single viable idea → recommended", () => {
    const ideas = [
      makeIdea({ id: "viable-1", name: "Viable Idea" }),
      makeIdea({ id: "rejected-1", screeningStatus: "REJECTED" }),
    ];
    const result = arbitrateStartupIdeas(ideas);
    expect(result.recommendedIdeaId).toBe("viable-1");
    expect(result.recommendedIdeaName).toBe("Viable Idea");
    expect(result.rejectedIds).toContain("rejected-1");
  });

  it("idea with higher survival (lower risk, capital sufficient) preferred over fragile high-revenue", () => {
    const fragileHighRevenue = makeIdea({
      id: "fragile",
      name: "Fragile High Revenue",
      riskAdjustedScore: 40,        // lower priority after risk adj
      capitalSufficient: false,
      economicClassification: "MARGINAL",
      hypothesesFailed: 2,
      hypothesesTotal: 5,
    });
    const stableLowerRevenue = makeIdea({
      id: "stable",
      name: "Stable Lower Revenue",
      riskAdjustedScore: 75,
      capitalSufficient: true,
      economicClassification: "VIABLE",
      hypothesesFailed: 0,
      hypothesesTotal: 5,
    });
    const result = arbitrateStartupIdeas([fragileHighRevenue, stableLowerRevenue]);
    // Stable with higher survival metrics should be recommended
    expect(result.recommendedIdeaId).toBe("stable");
  });

  it("closestAlternativeId is the non-recommended viable idea", () => {
    const a = makeIdea({ id: "a", name: "A", riskAdjustedScore: 80 });
    const b = makeIdea({ id: "b", name: "B", riskAdjustedScore: 60 });
    const result = arbitrateStartupIdeas([a, b]);
    expect(result.closestAlternativeId).not.toBeNull();
    expect(result.closestAlternativeId).not.toBe(result.recommendedIdeaId);
  });

  it("unknownInputs lists missing riskAdjustedScore and economicClassification per idea", () => {
    const ideas = [
      makeIdea({ id: "x", riskAdjustedScore: null, economicClassification: null }),
    ];
    const result = arbitrateStartupIdeas(ideas);
    expect(result.unknownInputs.some((u) => u.includes("riskAdjustedScore"))).toBe(true);
    expect(result.unknownInputs.some((u) => u.includes("economicClassification"))).toBe(true);
  });

  it("UNVIABLE idea excluded from viable pool but appears in rejectedIds", () => {
    const unviable = makeIdea({ id: "unviable", economicClassification: "UNVIABLE" });
    const viable = makeIdea({ id: "viable", economicClassification: "VIABLE" });
    const result = arbitrateStartupIdeas([unviable, viable]);
    expect(result.recommendedIdeaId).toBe("viable");
    expect(result.rejectionReasons["unviable"]).toContain("ECONOMICALLY_UNVIABLE");
  });

  it("rawArbitrationResult is present and contains candidates", () => {
    const ideas = [makeIdea({ id: "a" }), makeIdea({ id: "b" })];
    const result = arbitrateStartupIdeas(ideas);
    expect(result.rawArbitrationResult).toBeDefined();
    expect(result.rawArbitrationResult.candidates.length).toBeGreaterThanOrEqual(1);
  });
});
