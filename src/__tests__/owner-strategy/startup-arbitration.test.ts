import { describe, it, expect } from "vitest";
import {
  arbitrateStartupIdeas,
  type StartupIdeaCandidate,
} from "@/domain/owner-strategy/startup-arbitration";

function baseCandidate(
  id: string,
  overrides: Partial<StartupIdeaCandidate> = {}
): StartupIdeaCandidate {
  return {
    ideaId: id,
    name: `Idea ${id}`,
    industry: "services",
    problemEvidenceScore: 75,
    customerEvidenceScore: 70,
    wtpEvidenceScore: 70,
    readinessStatus: "READY_FOR_OWNER_GO_DECISION",
    economicClassification: "ECONOMICALLY_VIABLE",
    breakEvenMonths: 4,
    cashRunwayMonths: 12,
    startupCostCents: BigInt(500000),
    grossMarginBps: 5000,
    ownerFitScore: 80,
    resourceFitScore: 75,
    strategicFitScore: 70,
    riskScore: 20,
    reversibilityScore: 70,
    scalabilityScore: 60,
    defensibilityScore: 60,
    evidenceConfidence: 75,
    linkedOpportunityId: null,
    ...overrides,
  };
}

const defaultProfile = {
  capitalAvailableCents: BigInt(2000000),
  ownerHoursPerWeek: 40,
  riskTolerance: "medium" as const,
};

describe("arbitrateStartupIdeas — single viable idea", () => {
  it("recommends the only viable idea", () => {
    const result = arbitrateStartupIdeas([baseCandidate("A")], defaultProfile);
    expect(result.recommendedIdeaId).toBe("A");
    expect(result.recommendedIdeaName).toBe("Idea A");
  });

  it("closestAlternative is null when only one idea", () => {
    const result = arbitrateStartupIdeas([baseCandidate("A")], defaultProfile);
    expect(result.closestAlternativeId).toBeNull();
  });
});

describe("arbitrateStartupIdeas — no ideas", () => {
  it("returns null recommendation when no ideas provided", () => {
    const result = arbitrateStartupIdeas([], defaultProfile);
    expect(result.recommendedIdeaId).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

describe("arbitrateStartupIdeas — REJECT status excluded", () => {
  it("does not recommend a REJECT-status idea", () => {
    const ideas = [
      baseCandidate("A", { readinessStatus: "REJECT" }),
      baseCandidate("B"),
    ];
    const result = arbitrateStartupIdeas(ideas, defaultProfile);
    expect(result.recommendedIdeaId).toBe("B");
    expect(result.rejectedIdeaIds).toContain("A");
  });

  it("REJECT reason is recorded in rejectionReasons", () => {
    const ideas = [baseCandidate("A", { readinessStatus: "REJECT" }), baseCandidate("B")];
    const result = arbitrateStartupIdeas(ideas, defaultProfile);
    expect(result.rejectionReasons["A"]).toBeTruthy();
  });

  it("UNVIABLE economic classification excludes from recommendation", () => {
    const ideas = [
      baseCandidate("A", { economicClassification: "UNVIABLE" }),
      baseCandidate("B"),
    ];
    const result = arbitrateStartupIdeas(ideas, defaultProfile);
    expect(result.recommendedIdeaId).toBe("B");
  });
});

describe("arbitrateStartupIdeas — adversarial E: lower-revenue higher-survival wins", () => {
  it("prefers idea B with higher survival score over idea A with higher economics score", () => {
    // Idea A: high economics (ECONOMICALLY_VIABLE), poor cash survival
    const ideaA = baseCandidate("A", {
      name: "High Revenue Low Survival",
      economicClassification: "ECONOMICALLY_VIABLE",
      cashRunwayMonths: 3, // barely enough — survival score low
      breakEvenMonths: 4, // runway < breakeven → survival score = 0
      problemEvidenceScore: 90,
      customerEvidenceScore: 85,
      wtpEvidenceScore: 85,
      evidenceConfidence: 90,
    });

    // Idea B: moderate economics, strong survival (2× weight)
    const ideaB = baseCandidate("B", {
      name: "Moderate Revenue High Survival",
      economicClassification: "POTENTIALLY_VIABLE",
      cashRunwayMonths: 24, // 4× breakeven → high survival
      breakEvenMonths: 6,
      problemEvidenceScore: 75,
      customerEvidenceScore: 70,
      wtpEvidenceScore: 70,
      evidenceConfidence: 70,
    });

    const result = arbitrateStartupIdeas([ideaA, ideaB], defaultProfile);
    // B has better survival (2× weighted), A has cashRunway < breakEven → survival=0
    // B's composite score should exceed A's
    expect(result.recommendedIdeaId).toBe("B");
  });
});

describe("arbitrateStartupIdeas — two comparable ideas", () => {
  it("returns a closestAlternative when two ideas advance", () => {
    const ideas = [baseCandidate("A"), baseCandidate("B")];
    const result = arbitrateStartupIdeas(ideas, defaultProfile);
    expect(result.closestAlternativeId).not.toBeNull();
  });

  it("winner and alternative are different ideas", () => {
    const ideas = [baseCandidate("A"), baseCandidate("B"), baseCandidate("C")];
    const result = arbitrateStartupIdeas(ideas, defaultProfile);
    expect(result.recommendedIdeaId).not.toBe(result.closestAlternativeId);
  });
});
