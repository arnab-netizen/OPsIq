/**
 * Adversarial scenarios A-G for Phase 5 Startup Mode.
 * Each scenario tests a failure mode that must be correctly classified,
 * not hidden behind optimistic outputs.
 */
import { describe, it, expect } from "vitest";
import { screenIdea, type ScreeningIdea, type ScreeningProfile } from "@/domain/owner-strategy/startup-screening";
import { buildEconomicModel, type EconomicInputs } from "@/domain/owner-strategy/startup-economics";
import { arbitrateStartupIdeas, type StartupIdeaCandidate } from "@/domain/owner-strategy/startup-arbitration";

function baseIdea(overrides: Partial<ScreeningIdea> = {}): ScreeningIdea {
  return {
    name: "Test Idea",
    industry: "services",
    estimatedStartupCostCents: BigInt(500000),
    estimatedMonthlyRevenueCents: BigInt(200000),
    estimatedMonthlyCostCents: BigInt(80000),
    timeToFirstRevenueDays: 30,
    requiresDailyPresence: false,
    requiresSalesAbility: false,
    regulatoryBurden: "low",
    requiredLicences: [],
    missingLicences: [],
    customerAccessibilityScore: 70,
    marketEvidenceScore: 60,
    grossMarginBps: 5000,
    cashCycleRiskScore: 20,
    operationalComplexityScore: 30,
    reversibilityScore: 80,
    competitiveDefensibilityScore: 60,
    evidenceQualityScore: 70,
    downsideExposureCents: BigInt(300000),
    requiredCapabilities: [],
    unavailableCapabilities: [],
    ...overrides,
  };
}

function baseProfile(overrides: Partial<ScreeningProfile> = {}): ScreeningProfile {
  return {
    capitalAvailableCents: BigInt(5000000),
    monthlySurvivalNeedCents: BigInt(300000),
    hoursPerWeekAvailable: 40,
    riskTolerance: "medium",
    canSell: true,
    canOperateDaily: true,
    location: "AU",
    skills: ["operations"],
    existingAssets: [],
    ownerExclusions: [],
    ethicalConstraints: [],
    debtTolerance: "medium",
    regulatoryTolerance: "medium",
    preferOnline: false,
    targetTimeToRevenueDays: 60,
    ...overrides,
  };
}

function baseEconomicInputs(overrides: Partial<EconomicInputs> = {}): EconomicInputs {
  return {
    startupCostCents: BigInt(500000),
    fixedMonthlyCostCents: BigInt(100000),
    variableUnitCostCents: BigInt(2000),
    pricePerUnitCents: BigInt(5000),
    cacCents: BigInt(10000),
    deliveryCostCents: BigInt(0),
    refundAllowanceCents: BigInt(0),
    workingCapitalCents: BigInt(0),
    paymentDelayDays: 0,
    ownerLabourHoursPerWeek: 20,
    hiredLabourCostCents: BigInt(0),
    capitalAvailableCents: BigInt(2000000),
    monthlySurvivalNeedCents: BigInt(300000),
    minViableCapacity: 40,
    maxCurrentCapacity: 100,
    ...overrides,
  };
}

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

describe("Adversarial Scenario A — cash flow unsafe → CASH_FLOW_UNSAFE (not GO)", () => {
  it("classifies as CASH_FLOW_UNSAFE when capital is insufficient to reach break-even", () => {
    // capital $1000, startup $900, fixed $500/mo, survival $300/mo
    // after startup: $100 left, burn = $800/mo → 0.125 months runway
    // gross contribution = 5000-2000 = 3000, fixed = 500, minCap = 1
    // break-even vol = 500/3000 ≈ 0.167, break-even months ≈ 0.167 → runway < breakeven
    const result = buildEconomicModel(
      baseEconomicInputs({
        capitalAvailableCents: BigInt(100000), // $1000
        startupCostCents: BigInt(90000), // $900
        fixedMonthlyCostCents: BigInt(50000), // $500/month
        monthlySurvivalNeedCents: BigInt(30000), // $300/month
        minViableCapacity: 1,
        maxCurrentCapacity: 1,
      })
    );
    expect(result.economicClassification).toBe("CASH_FLOW_UNSAFE");
    expect(result.economicClassification).not.toBe("ECONOMICALLY_VIABLE");
  });
});

describe("Adversarial Scenario B — owner time insufficient → REJECT", () => {
  it("rejects when idea requires daily presence and owner cannot operate daily", () => {
    const result = screenIdea(
      baseIdea({ requiresDailyPresence: true }),
      baseProfile({ canOperateDaily: false })
    );
    expect(result.status).toBe("REJECT");
  });

  it("binding constraint includes owner_daily_presence dimension with score 100", () => {
    const result = screenIdea(
      baseIdea({ requiresDailyPresence: true }),
      baseProfile({ canOperateDaily: false })
    );
    const constraint = result.bindingConstraints.find(
      (c) => c.dimension === "owner_daily_presence"
    );
    expect(constraint).toBeDefined();
    expect(constraint!.bindingScore).toBe(100);
  });
});

describe("Adversarial Scenario C — no demand evidence → VALIDATE_FIRST or ADVANCE_WITH_EVIDENCE_GAPS", () => {
  it("does not return ADVANCE when market evidence score is very low (25)", () => {
    const result = screenIdea(
      baseIdea({ marketEvidenceScore: 25 }),
      baseProfile()
    );
    expect(result.status).not.toBe("ADVANCE");
    expect(["VALIDATE_FIRST", "ADVANCE_WITH_EVIDENCE_GAPS"]).toContain(result.status);
  });

  it("includes market_evidence in unknownInputs when marketEvidenceScore is null", () => {
    // A single null input doesn't block ADVANCE, but it IS tracked in unknownInputs.
    // Multiple missing evidence fields are needed to trigger ADVANCE_WITH_EVIDENCE_GAPS.
    const result = screenIdea(
      baseIdea({ marketEvidenceScore: null }),
      baseProfile()
    );
    expect(result.unknownInputs).toContain("market_evidence");
  });

  it("does not return ADVANCE when marketEvidenceScore and other key inputs are null", () => {
    // Three or more unknown inputs → ADVANCE_WITH_EVIDENCE_GAPS
    const result = screenIdea(
      baseIdea({ marketEvidenceScore: null, grossMarginBps: null, customerAccessibilityScore: null }),
      baseProfile()
    );
    expect(result.status).not.toBe("ADVANCE");
    expect(["VALIDATE_FIRST", "ADVANCE_WITH_EVIDENCE_GAPS", "REJECT"]).toContain(result.status);
  });
});

describe("Adversarial Scenario D — inaccessible customers (score 15) → REJECT", () => {
  it("rejects when customerAccessibilityScore is 15", () => {
    const result = screenIdea(
      baseIdea({ customerAccessibilityScore: 15 }),
      baseProfile()
    );
    expect(result.status).toBe("REJECT");
  });

  it("reason explains the accessibility threshold", () => {
    const result = screenIdea(
      baseIdea({ customerAccessibilityScore: 15 }),
      baseProfile()
    );
    expect(result.reasons.some((r) => r.includes("15"))).toBe(true);
  });

  it("binding constraint dimension is customer_accessibility", () => {
    const result = screenIdea(
      baseIdea({ customerAccessibilityScore: 15 }),
      baseProfile()
    );
    const constraint = result.bindingConstraints.find(
      (c) => c.dimension === "customer_accessibility"
    );
    expect(constraint).toBeDefined();
    expect(constraint!.value).toBe(15);
    expect(constraint!.threshold).toBe(30);
  });
});

describe("Adversarial Scenario E — lower-revenue higher-survival wins arbitration", () => {
  it("prefers idea B with higher survival over idea A with higher economics", () => {
    // Idea A: top economics score (ECONOMICALLY_VIABLE), but cash runway < breakeven → survival=0
    const ideaA = baseCandidate("A", {
      name: "High Revenue",
      economicClassification: "ECONOMICALLY_VIABLE",
      cashRunwayMonths: 2,
      breakEvenMonths: 6, // runway(2) < breakeven(6) → survival score = 0, AND 2× weighted
      evidenceConfidence: 90,
    });

    // Idea B: POTENTIALLY_VIABLE, but 4× breakeven runway → survival score = min(100, 4×50)=100, 2× weighted
    const ideaB = baseCandidate("B", {
      name: "High Survival",
      economicClassification: "POTENTIALLY_VIABLE",
      cashRunwayMonths: 24,
      breakEvenMonths: 6,
      evidenceConfidence: 70,
    });

    const result = arbitrateStartupIdeas([ideaA, ideaB], {
      capitalAvailableCents: BigInt(2000000),
      ownerHoursPerWeek: 40,
      riskTolerance: "medium",
    });

    expect(result.recommendedIdeaId).toBe("B");
  });
});

describe("Adversarial Scenario F — missing licence → screening REJECT", () => {
  it("rejects any idea that has a missing mandatory licence", () => {
    const idea = baseIdea({ missingLicences: ["Health and Safety Permit"] });
    const result = screenIdea(idea, baseProfile());
    expect(result.status).toBe("REJECT");
  });

  it("reason explicitly names the missing licence", () => {
    const idea = baseIdea({ missingLicences: ["Health and Safety Permit"] });
    const result = screenIdea(idea, baseProfile());
    expect(result.reasons.some((r) => r.includes("Health and Safety Permit"))).toBe(true);
  });
});

describe("Adversarial Scenario G — owner exclusion match → screening REJECT", () => {
  it("rejects idea when idea name matches owner exclusion (case-insensitive)", () => {
    const idea = baseIdea({ name: "Tobacco Distribution", industry: "logistics" });
    const result = screenIdea(idea, baseProfile({ ownerExclusions: ["tobacco"] }));
    expect(result.status).toBe("REJECT");
  });

  it("rejects idea when industry matches owner exclusion", () => {
    const idea = baseIdea({ name: "Online Shop", industry: "Gambling & Betting" });
    const result = screenIdea(idea, baseProfile({ ownerExclusions: ["gambling"] }));
    expect(result.status).toBe("REJECT");
  });

  it("binding constraint does not appear when exclusion list is empty", () => {
    const idea = baseIdea({ name: "Gambling Platform" });
    const result = screenIdea(idea, baseProfile({ ownerExclusions: [] }));
    // Without exclusions, should not reject due to exclusion
    const hasExclusionReason = result.reasons.some((r) =>
      r.toLowerCase().includes("exclusion")
    );
    expect(hasExclusionReason).toBe(false);
  });
});
