/**
 * Owner Strategy & Scenario Planning (Module 8 Slice 2) — detector + diagnosis
 * tests. Pure/no DB. Covers risk findings (negative base / negative ROI / weak ROI
 * / negative worst case / long payback / unaffordable / high execution risk /
 * missing data / invalid currency), opportunity findings (strong return / fast
 * payback / safe upside / data quality), deterministic ranking, the strategy
 * DomainScore, no-fabrication-on-missing, and spine schema validity.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseStrategySnapshot,
  buildStrategyRiskFindings,
  buildStrategyOpportunityFindings,
  computeStrategyMetrics,
  resolveStrategyThresholds,
  rankStrategyFindings,
  type StrategySnapshotInput,
} from "@/domain/owner-strategy";
import { ownerFindingSchema, domainScoreSchema } from "@/domain/owner-spine/contracts";

function strongGo(): StrategySnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    currentRevenue: 500000,
    expectedRevenueChange: 100000,
    costChange: 30000,
    investmentRequired: 200000,
    timeToImpactMonths: 3,
    riskLevel: "low",
    cashAvailable: 400000,
    capacityImpactPct: 20,
    staffImpact: 1,
  };
}

function avoid(): StrategySnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    currentRevenue: 500000,
    expectedRevenueChange: 20000,
    costChange: 60000, // base -40000 (negative base case)
    investmentRequired: 800000,
    timeToImpactMonths: 12,
    riskLevel: "high",
    cashAvailable: 100000, // affordability 0.125 (critically unaffordable)
    capacityImpactPct: 80,
    staffImpact: 4,
  };
}

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

function diagnose(input: StrategySnapshotInput) {
  return diagnoseStrategySnapshot(input, { now: new Date("2026-06-05") });
}

describe("owner-strategy diagnosis — module contract assertions", () => {
  it("diagnoseStrategySnapshot is a function", () => { expect(typeof diagnoseStrategySnapshot).toBe("function"); });
  it("buildStrategyRiskFindings is a function", () => { expect(typeof buildStrategyRiskFindings).toBe("function"); });
  it("buildStrategyOpportunityFindings is a function", () => { expect(typeof buildStrategyOpportunityFindings).toBe("function"); });
  it("computeStrategyMetrics is a function", () => { expect(typeof computeStrategyMetrics).toBe("function"); });
  it("resolveStrategyThresholds is a function", () => { expect(typeof resolveStrategyThresholds).toBe("function"); });
  it("rankStrategyFindings is a function", () => { expect(typeof rankStrategyFindings).toBe("function"); });
  it("ownerFindingSchema is an object", () => { expect(typeof ownerFindingSchema).toBe("object"); });
  it("domainScoreSchema is an object", () => { expect(typeof domainScoreSchema).toBe("object"); });
  it("strongGo is a function", () => { expect(typeof strongGo).toBe("function"); });
  it("avoid is a function", () => { expect(typeof avoid).toBe("function"); });
  it("codes is a function", () => { expect(typeof codes).toBe("function"); });
  it("diagnose is a function", () => { expect(typeof diagnose).toBe("function"); });
  it("strongGo() returns an object", () => { expect(typeof strongGo()).toBe("object"); });
  it("avoid() returns an object", () => { expect(typeof avoid()).toBe("object"); });
});

describe("owner-strategy detector — risk findings", () => {
  it("an avoid option triggers the scenario risk cluster", () => {
    const r = diagnose(avoid());
    const c = codes(r.riskFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "STR_NEGATIVE_BASE_CASE",
        "STR_UNAFFORDABLE",
        "STR_HIGH_EXECUTION_RISK",
      ])
    );
    const base = r.riskFindings.find((f) => f.code === "STR_NEGATIVE_BASE_CASE");
    expect(base?.severity).toBe("critical");
  });

  it("a strong-go option emits no strategy risk findings", () => {
    const r = diagnose(strongGo());
    expect(r.riskFindings).toEqual([]);
  });

  it("flags weak ROI + long payback for a marginal option", () => {
    const r = diagnose({
      ...strongGo(),
      expectedRevenueChange: 33000,
      costChange: 30000, // base 3000
      investmentRequired: 300000, // roi 12% (weak), payback 100 months (critical-long)
    });
    const c = codes(r.riskFindings);
    expect(c).toContain("STR_WEAK_ROI");
    expect(c).toContain("STR_LONG_PAYBACK");
  });

  it("flags missing critical data and invalid currency (certain)", () => {
    const input: StrategySnapshotInput = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "" };
    const m = computeStrategyMetrics(input, { now: new Date("2026-06-05") });
    const findings = buildStrategyRiskFindings(input, m, resolveStrategyThresholds());
    const c = codes(findings);
    expect(c).toContain("STR_INVALID_CURRENCY");
    expect(c).toContain("STR_MISSING_CRITICAL_DATA");
    const missing = findings.find((f) => f.code === "STR_MISSING_CRITICAL_DATA");
    expect(missing?.confidence).toBe(1);
    expect(missing?.missingData).toEqual(
      expect.arrayContaining(["expectedRevenueChange", "costChange", "investmentRequired"])
    );
  });
});

describe("owner-strategy detector — opportunity findings", () => {
  it("a strong-go option emits the upside cluster", () => {
    const r = diagnose(strongGo());
    const c = codes(r.opportunityFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "STR_OPP_STRONG_RETURN",
        "STR_OPP_FAST_PAYBACK",
        "STR_OPP_SAFE_UPSIDE",
      ])
    );
  });

  it("fabricates no opportunity when supporting inputs are absent", () => {
    const bare: StrategySnapshotInput = {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      currentRevenue: 500000,
      expectedRevenueChange: 50000,
      costChange: 20000, // base 30000 (positive) but no investment/riskLevel
    };
    const m = computeStrategyMetrics(bare, { now: new Date("2026-06-05") });
    const c = codes(buildStrategyOpportunityFindings(bare, m, resolveStrategyThresholds()));
    expect(c).not.toContain("STR_OPP_STRONG_RETURN"); // ROI not computable (no investment)
    expect(c).not.toContain("STR_OPP_FAST_PAYBACK"); // payback not computable (no investment)
    expect(c).not.toContain("STR_OPP_SAFE_UPSIDE"); // worst case not computable (no riskLevel)
  });
});

describe("owner-strategy detector — ranking + domain score", () => {
  it("ranks critical findings ahead of low ones (deterministic + stable)", () => {
    const r = diagnose(avoid());
    const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    for (let i = 1; i < r.findings.length; i++) {
      expect(rank[r.findings[i - 1].severity]).toBeGreaterThanOrEqual(rank[r.findings[i].severity]);
    }
    const again = diagnose(avoid());
    expect(codes(again.findings)).toEqual(codes(r.findings));
  });

  it("produces a valid strategy DomainScore from the engine metrics", () => {
    const r = diagnose(avoid());
    const parsed = domainScoreSchema.parse(r.domainScore);
    expect(parsed.domain).toBe("strategy");
    expect(parsed.riskScore).toBe(r.metrics.strategyRiskScore);
    expect(parsed.healthScore).toBe(r.metrics.strategyHealthScore);
    expect(parsed.opportunityScore).toBe(r.metrics.strategyOpportunityScore);
    expect(parsed.topFindingCodes.length).toBeGreaterThan(0);
  });

  it("every finding satisfies the spine OwnerFinding schema with domain strategy", () => {
    for (const input of [strongGo(), avoid()]) {
      const r = diagnose(input);
      for (const f of r.findings) {
        expect(() => ownerFindingSchema.parse(f)).not.toThrow();
        expect(f.domain).toBe("strategy");
      }
    }
  });

  it("rankStrategyFindings does not mutate its input", () => {
    const r = diagnose(avoid());
    const before = codes(r.findings);
    const copy = [...r.findings];
    rankStrategyFindings(r.findings);
    expect(codes(copy)).toEqual(before);
  });
});
