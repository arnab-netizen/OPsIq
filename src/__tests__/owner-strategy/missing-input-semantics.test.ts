/**
 * Owner Strategy — missing-input contract (Decision Overhaul, root cause 1).
 *
 * Pure/no DB. A missing input is an UNKNOWN that is surfaced explicitly; a known zero is a fact.
 *  - investment > 0 and cash missing → affordability/funding gap unknown + STR_MISSING_CASH;
 *  - cash = 0 → affordability 0 and a real funding gap (not missing data);
 *  - investment = 0 → missing cash blocks nothing;
 *  - risk level missing → downside unknown: no safe-upside, no invented downside, STR_MISSING_RISK_LEVEL;
 *  - missing core economics → profit unknown (never "loses money");
 *  - zero investment is not a "fast payback"; data completeness is not an "opportunity".
 */
import { describe, it, expect } from "vitest";
import {
  classifyStrategyInputs,
  amountStatus,
  diagnoseStrategySnapshot,
  planStrategyActionsFromDiagnosis,
  type StrategySnapshotInput,
} from "@/domain/owner-strategy";

const NOW = new Date("2026-09-26T00:00:00Z");

function scenario(over: Partial<StrategySnapshotInput>): StrategySnapshotInput {
  return {
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    currency: "INR",
    currentRevenue: 500000,
    timeToImpactMonths: 2,
    capacityImpactPct: 10,
    staffImpact: 1,
    riskLevel: "low",
    expectedRevenueChange: 30000,
    costChange: 12000,
    investmentRequired: 150000,
    cashAvailable: 400000,
    ...over,
  };
}

const diag = (s: StrategySnapshotInput) => diagnoseStrategySnapshot(s, { now: NOW });
const codes = (s: StrategySnapshotInput) => diag(s).findings.map((f) => f.code);
const finding = (s: StrategySnapshotInput, code: string) => diag(s).findings.find((f) => f.code === code);

describe("amount classification: missing / zero / negative / positive", () => {
  it("classifies each state distinctly (NaN/Infinity are missing, never a number)", () => {
    expect(amountStatus(undefined)).toBe("missing");
    expect(amountStatus(null)).toBe("missing");
    expect(amountStatus(Number.NaN)).toBe("missing");
    expect(amountStatus(Number.POSITIVE_INFINITY)).toBe("missing");
    expect(amountStatus(0)).toBe("zero");
    expect(amountStatus(-0)).toBe("zero");
    expect(amountStatus(-1)).toBe("negative");
    expect(amountStatus(0.01)).toBe("positive");
  });

  it("flags cash as needed-but-missing only when a positive investment is required", () => {
    expect(classifyStrategyInputs(scenario({ cashAvailable: undefined })).cashNeededButMissing).toBe(true);
    expect(classifyStrategyInputs(scenario({ cashAvailable: 0 })).cashNeededButMissing).toBe(false);
    expect(classifyStrategyInputs(scenario({ cashAvailable: undefined, investmentRequired: 0 })).cashNeededButMissing).toBe(false);
    expect(classifyStrategyInputs(scenario({ cashAvailable: undefined, investmentRequired: undefined })).cashNeededButMissing).toBe(false);
  });

  it("flags core economics missing when revenue change or cost change is absent", () => {
    expect(classifyStrategyInputs(scenario({})).coreEconomicsMissing).toBe(false);
    expect(classifyStrategyInputs(scenario({ expectedRevenueChange: undefined })).coreEconomicsMissing).toBe(true);
    expect(classifyStrategyInputs(scenario({ costChange: undefined })).coreEconomicsMissing).toBe(true);
    expect(classifyStrategyInputs(scenario({ costChange: 0 })).coreEconomicsMissing).toBe(false);
  });

  it("an invalid risk string is not a risk level", () => {
    expect(classifyStrategyInputs(scenario({ riskLevel: "extreme" as never })).riskLevel).toBeNull();
    expect(classifyStrategyInputs(scenario({ riskLevel: "medium" })).riskLevel).toBe("medium");
  });
});

describe("cash: missing vs known zero", () => {
  it("investment > 0 and cash missing → affordability unknown + machine-readable STR_MISSING_CASH", () => {
    const s = scenario({ cashAvailable: undefined });
    const d = diag(s);
    expect(d.metrics.raw.affordabilityRatio).toBeNull();
    expect(d.metrics.affordabilityRatio).toBeNull();
    const f = finding(s, "STR_MISSING_CASH");
    expect(f).toBeDefined();
    expect(f!.findingType).toBe("risk");
    expect(f!.severity).toBe("high");
    expect(f!.missingData).toEqual(["cashAvailable"]);
    expect(f!.sourceValue).toBeNull(); // nothing invented
    expect(codes(s)).not.toContain("STR_UNAFFORDABLE"); // unknown is not "unaffordable"...
  });

  it("known cash = 0 → affordability 0, a critical funding finding, and NO missing-cash finding", () => {
    const s = scenario({ cashAvailable: 0 });
    const d = diag(s);
    expect(d.metrics.raw.affordabilityRatio).toBe(0);
    expect(codes(s)).not.toContain("STR_MISSING_CASH");
    const f = finding(s, "STR_UNAFFORDABLE");
    expect(f?.severity).toBe("critical");
    expect(f?.sourceValue).toBe(0);
  });

  it("investment = 0 → missing cash does not block (no missing-cash, no affordability finding)", () => {
    const s = scenario({ investmentRequired: 0, cashAvailable: undefined });
    expect(codes(s)).not.toContain("STR_MISSING_CASH");
    expect(codes(s)).not.toContain("STR_UNAFFORDABLE");
    expect(diag(s).metrics.raw.affordabilityRatio).toBeNull();
  });

  it("investment itself missing → reported as missing critical data, not as missing cash", () => {
    const s = scenario({ investmentRequired: undefined, cashAvailable: undefined });
    expect(codes(s)).toContain("STR_MISSING_CRITICAL_DATA");
    expect(codes(s)).not.toContain("STR_MISSING_CASH");
  });
});

describe("risk level: missing means downside unknown", () => {
  const s = scenario({ riskLevel: undefined });

  it("no scenario range is calculated", () => {
    const d = diag(s);
    expect(d.metrics.raw.worstMonthlyProfitDelta).toBeNull();
    expect(d.metrics.raw.bestMonthlyProfitDelta).toBeNull();
  });

  it("emits STR_MISSING_RISK_LEVEL and neither a safe-upside nor an invented downside finding", () => {
    const f = finding(s, "STR_MISSING_RISK_LEVEL");
    expect(f?.missingData).toEqual(["riskLevel"]);
    expect(f?.sourceValue).toBeNull();
    expect(codes(s)).not.toContain("STR_OPP_SAFE_UPSIDE");
    expect(codes(s)).not.toContain("STR_NEGATIVE_WORST_CASE");
  });

  it("with a risk level chosen the missing-risk finding is absent", () => {
    expect(codes(scenario({}))).not.toContain("STR_MISSING_RISK_LEVEL");
  });
});

describe("missing core economics: unknown, never 'loses money'", () => {
  it("revenue change missing → profit unknown, no loss/ROI/payback finding asserted", () => {
    const s = scenario({ expectedRevenueChange: undefined });
    const d = diag(s);
    expect(d.metrics.raw.baseMonthlyProfitDelta).toBeNull();
    expect(d.metrics.raw.roiAnnualPct).toBeNull();
    for (const c of ["STR_NEGATIVE_BASE_CASE", "STR_NEGATIVE_ROI", "STR_WEAK_ROI", "STR_LONG_PAYBACK"]) {
      expect(codes(s)).not.toContain(c);
    }
    expect(finding(s, "STR_MISSING_CRITICAL_DATA")?.missingData).toContain("expectedRevenueChange");
  });
});

describe("zero investment and data completeness", () => {
  it("zero investment is not a 'fast payback' (payback 0 is not a finding) — raw payback stays 0", () => {
    const s = scenario({ investmentRequired: 0 });
    expect(diag(s).metrics.raw.paybackMonths).toBe(0);
    expect(codes(s)).not.toContain("STR_OPP_FAST_PAYBACK");
  });

  it("a real positive investment within the window still produces the fast-payback finding", () => {
    expect(codes(scenario({}))).toContain("STR_OPP_FAST_PAYBACK");
  });

  it("missing/stale inputs never produce a data-quality 'opportunity'", () => {
    const sparse = scenario({ currentRevenue: undefined, cashAvailable: undefined, riskLevel: undefined });
    const stale = scenario({ periodStart: "2025-01-01", periodEnd: "2025-01-31" });
    for (const s of [sparse, stale]) {
      expect(codes(s)).not.toContain("STR_OPP_DATA_QUALITY");
      expect(diag(s).opportunityFindings.every((f) => f.code !== "STR_OPP_DATA_QUALITY")).toBe(true);
    }
  });

  it("every new missing-input finding has an action template (nothing reported as untemplated)", () => {
    const s = scenario({ cashAvailable: undefined, riskLevel: undefined });
    const plan = planStrategyActionsFromDiagnosis(diag(s));
    expect(plan.missingActionInputs).toEqual([]);
    const recCodes = plan.recommendations.map((r) => r.recommendationCode);
    expect(recCodes).toContain("STRREC_PROVIDE_CASH");
    expect(recCodes).toContain("STRREC_SET_RISK_LEVEL");
  });
});
