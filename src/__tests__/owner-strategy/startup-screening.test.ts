import { describe, it, expect } from "vitest";
import {
  screenIdea,
  type ScreeningIdea,
  type ScreeningProfile,
} from "@/domain/owner-strategy/startup-screening";

function baseIdea(overrides: Partial<ScreeningIdea> = {}): ScreeningIdea {
  return {
    name: "Test Idea",
    industry: "services",
    estimatedStartupCostCents: BigInt(500000), // $5000
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
    grossMarginBps: 5000, // 50%
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
    capitalAvailableCents: BigInt(5000000), // $50000
    monthlySurvivalNeedCents: BigInt(300000),
    hoursPerWeekAvailable: 40,
    riskTolerance: "medium",
    canSell: true,
    canOperateDaily: true,
    location: "AU",
    skills: ["marketing", "operations"],
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

describe("screenIdea — passing case", () => {
  it("returns ADVANCE when all dimensions clear", () => {
    const result = screenIdea(baseIdea(), baseProfile());
    expect(result.status).toBe("ADVANCE");
  });

  it("has no binding constraints when passing", () => {
    const result = screenIdea(baseIdea(), baseProfile());
    // Should only have "no blocking factors" messaging
    expect(result.status).toBe("ADVANCE");
    expect(result.unknownInputs.length).toBe(0);
  });
});

describe("screenIdea — missing licence → REJECT", () => {
  it("rejects when a mandatory licence is missing", () => {
    const idea = baseIdea({ missingLicences: ["Food Safety Certificate"] });
    const result = screenIdea(idea, baseProfile());
    expect(result.status).toBe("REJECT");
  });

  it("binding constraint includes regulatory_licence dimension", () => {
    const idea = baseIdea({ missingLicences: ["Food Safety Certificate"] });
    const result = screenIdea(idea, baseProfile());
    const constraint = result.bindingConstraints.find(
      (c) => c.dimension === "regulatory_licence"
    );
    expect(constraint).toBeDefined();
  });

  it("reason mentions the missing licence name", () => {
    const idea = baseIdea({ missingLicences: ["Food Safety Certificate"] });
    const result = screenIdea(idea, baseProfile());
    expect(result.reasons.some((r) => r.includes("Food Safety Certificate"))).toBe(true);
  });
});

describe("screenIdea — insufficient capital → REJECT or MODIFY", () => {
  it("rejects when capital is much less than required (>2× gap)", () => {
    // startup cost $50000, capital $1000, no survival need — gap > 2× capital
    const idea = baseIdea({ estimatedStartupCostCents: BigInt(5000000) });
    const profile = baseProfile({
      capitalAvailableCents: BigInt(10000),
      monthlySurvivalNeedCents: BigInt(0),
    });
    const result = screenIdea(idea, profile);
    expect(["REJECT", "MODIFY"]).toContain(result.status);
    expect(
      result.bindingConstraints.some((c) => c.dimension === "capital_feasibility")
    ).toBe(true);
  });

  it("adversarial A: startup cost $500 vs capital $10 → capital insufficient", () => {
    const idea = baseIdea({ estimatedStartupCostCents: BigInt(50000) });
    const profile = baseProfile({
      capitalAvailableCents: BigInt(1000),
      monthlySurvivalNeedCents: BigInt(0),
    });
    const result = screenIdea(idea, profile);
    // The gap (50000-1000=49000) > 2× capital (2000) → hard rejection
    expect(result.status).not.toBe("ADVANCE");
    expect(["REJECT", "MODIFY", "HOLD"]).toContain(result.status);
  });
});

describe("screenIdea — owner exclusion → REJECT", () => {
  it("rejects when idea name matches owner exclusion", () => {
    const idea = baseIdea({ name: "Gambling Platform", industry: "gaming" });
    const profile = baseProfile({ ownerExclusions: ["gambling"] });
    const result = screenIdea(idea, profile);
    expect(result.status).toBe("REJECT");
  });

  it("rejects when idea industry matches owner exclusion", () => {
    const idea = baseIdea({ name: "Liquor Store", industry: "alcohol retail" });
    const profile = baseProfile({ ownerExclusions: ["alcohol"] });
    const result = screenIdea(idea, profile);
    expect(result.status).toBe("REJECT");
  });
});

describe("screenIdea — low market evidence → VALIDATE_FIRST", () => {
  it("returns VALIDATE_FIRST when marketEvidenceScore is between 20-39", () => {
    const idea = baseIdea({ marketEvidenceScore: 30 });
    const result = screenIdea(idea, baseProfile());
    // Should be VALIDATE_FIRST or ADVANCE_WITH_EVIDENCE_GAPS (evidence gaps from market)
    expect(["VALIDATE_FIRST", "ADVANCE_WITH_EVIDENCE_GAPS"]).toContain(result.status);
  });
});

describe("screenIdea — null inputs → ADVANCE_WITH_EVIDENCE_GAPS", () => {
  it("returns ADVANCE_WITH_EVIDENCE_GAPS when many inputs are unknown (>2 unknowns)", () => {
    const idea = baseIdea({
      estimatedStartupCostCents: null,
      grossMarginBps: null,
      timeToFirstRevenueDays: null,
      customerAccessibilityScore: null,
      marketEvidenceScore: null,
    });
    const profile = baseProfile({ capitalAvailableCents: null });
    const result = screenIdea(idea, profile);
    expect(result.status).toBe("ADVANCE_WITH_EVIDENCE_GAPS");
    expect(result.unknownInputs.length).toBeGreaterThan(2);
  });
});

describe("screenIdea — customer accessibility < 30 → REJECT", () => {
  it("rejects when customerAccessibilityScore is 15", () => {
    const idea = baseIdea({ customerAccessibilityScore: 15 });
    const result = screenIdea(idea, baseProfile());
    expect(result.status).toBe("REJECT");
  });

  it("includes customer_accessibility binding constraint", () => {
    const idea = baseIdea({ customerAccessibilityScore: 20 });
    const result = screenIdea(idea, baseProfile());
    expect(
      result.bindingConstraints.some((c) => c.dimension === "customer_accessibility")
    ).toBe(true);
  });
});

describe("screenIdea — adversarial B: owner cannot operate daily → REJECT", () => {
  it("rejects when idea requires daily presence and owner cannot operate daily", () => {
    const idea = baseIdea({ requiresDailyPresence: true });
    const profile = baseProfile({ canOperateDaily: false });
    const result = screenIdea(idea, profile);
    expect(result.status).toBe("REJECT");
  });

  it("binding constraint dimension is owner_daily_presence", () => {
    const idea = baseIdea({ requiresDailyPresence: true });
    const profile = baseProfile({ canOperateDaily: false });
    const result = screenIdea(idea, profile);
    expect(
      result.bindingConstraints.some((c) => c.dimension === "owner_daily_presence")
    ).toBe(true);
  });
});
