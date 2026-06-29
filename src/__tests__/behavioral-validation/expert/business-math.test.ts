import { describe, it, expect } from "vitest";
import {
  grossMargin, contributionMarginPerUnit, cashRunwayDays, breakEvenUnits, capacityUtilization,
  netRoas, contractMarginAfterTerms, paybackPeriodMonths, validateBusinessMath, deriveCalcs,
} from "@/behavioral-validation/expert/business-math";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import type { AdviceOutput, BehavioralCase } from "@/behavioral-validation/schema";

const marketingSeed = SEED_CASES.find((c) => c.id === "A2")!;
const cashSeed = SEED_CASES.find((c) => c.id === "A1")!;

describe("business-math calculators", () => {
  it("computes core formulas correctly", () => {
    expect(grossMargin(1000, 600)).toBeCloseTo(0.4);
    expect(contributionMarginPerUnit(20, 17)).toBe(3);
    expect(cashRunwayDays(60000, 30000)).toBeCloseTo(60);
    expect(breakEvenUnits(100000, 50)).toBe(2000);
    expect(capacityUtilization(200, 70)).toBeCloseTo(2.857, 2);
    expect(paybackPeriodMonths(120000, 10000)).toBe(12);
  });

  it("returns null when inputs are missing (asks for data, does not guess)", () => {
    expect(grossMargin(null, 600)).toBeNull();
    expect(cashRunwayDays(60000, 0)).toBeNull();
  });

  it("net ROAS collapses below 1 once returns/RTO eat the margin", () => {
    expect(netRoas({ adRevenue: 100000, adSpend: 25000, returnRate: 0.4, rtoRate: 0.2, grossMarginPct: 0.4 })!).toBeLessThan(1);
    expect(netRoas({ adRevenue: 100000, adSpend: 25000, returnRate: 0, grossMarginPct: 1 })!).toBeGreaterThan(1);
  });

  it("contract margin after terms turns negative when the rate is below fully-loaded cost", () => {
    expect(contractMarginAfterTerms({ ratePerUnit: 15, fullyLoadedCost: 20, paymentTermsDays: 45 })!).toBeLessThan(0);
  });
});

function withNumbers(c: BehavioralCase, numbers: Record<string, number>, flags: Partial<BehavioralCase["flags"]> = {}): BehavioralCase {
  return { ...c, numbers: { ...numbers }, flags: { ...c.flags, ...flags } };
}
const expertWords = (over: Partial<AdviceOutput>): AdviceOutput => ({
  situationSummary: "Carefully considered, strategically optimised, margin-aware recommendation.",
  rootCause: "The structural economics of the opportunity drive the decision.",
  recommendedNextAction: "Accept the contract and sign today to capture the strategic volume.",
  reassessmentTrigger: "Reassess in 7 days.", proofRequired: ["x"], expectedOutcome: "growth", localConsiderations: "India",
  ...over,
});

describe("business-math validator — numerically wrong advice fails regardless of wording", () => {
  it("rejects accepting a below-margin contract even when wording sounds expert", () => {
    const c = withNumbers(marketingSeed, { consideredRate: 15, fullyLoadedCost: 20, paymentTermsDays: 45 });
    const v = validateBusinessMath(c, expertWords({}));
    expect(v.violations.some((x) => x.code === "below_margin_accepted")).toBe(true);
    expect(v.passed).toBe(false);
  });

  it("fails high-revenue/low-cash advice that recommends spending", () => {
    const v = validateBusinessMath(cashSeed, { recommendedNextAction: "Spend 75000 on a hoarding and hire a rider now.", reassessmentTrigger: "7d", proofRequired: ["x"] });
    expect(v.violations.some((x) => x.code === "spend_in_cash_risk")).toBe(true);
  });

  it("fails ROAS-only scaling when net margin after returns is negative", () => {
    const c = withNumbers(marketingSeed, { adRevenue: 100000, adSpend: 25000, returnRatePct: 40, rtoRatePct: 20, grossMarginPct: 40 });
    const v = validateBusinessMath(c, { recommendedNextAction: "Scale the ad spend aggressively to grow revenue.", reassessmentTrigger: "7d", proofRequired: ["x"] });
    expect(v.violations.some((x) => x.code === "negative_net_roas_scale")).toBe(true);
  });

  it("blocks growth when capacity utilization is already at/over 100%", () => {
    const c = withNumbers(marketingSeed, { offeredKgPerDay: 200, reliableKgPerDay: 70 }, { capacityRisk: false });
    const v = validateBusinessMath(c, { recommendedNextAction: "Accept and expand to take on the volume.", reassessmentTrigger: "7d", proofRequired: ["x"] });
    expect(v.violations.some((x) => x.code === "growth_over_capacity")).toBe(true);
  });

  it("blocks back-loaded-payment contract for working-capital risk", () => {
    const c = withNumbers(marketingSeed, { consideredRate: 30, fullyLoadedCost: 10, paymentTermsDays: 60 });
    const v = validateBusinessMath(c, { recommendedNextAction: "Sign the contract and take the deal.", reassessmentTrigger: "7d", proofRequired: ["x"] });
    expect(v.violations.some((x) => x.code === "working_capital_terms_ignored")).toBe(true);
  });

  it("lowers confidence when financials are missing (no overconfident irreversible action)", () => {
    const c = withNumbers(marketingSeed, {}, { cashRisk: true });
    const overconfident = validateBusinessMath(c, { dataConfidence: "high", recommendedNextAction: "Spend on marketing now.", reassessmentTrigger: "7d", proofRequired: ["x"] });
    expect(overconfident.violations.some((x) => x.code === "missing_financials_overconfident")).toBe(true);
    const cautious = validateBusinessMath(c, { dataConfidence: "low", recommendedNextAction: "Reconcile the numbers first; do not spend.", whatNotToDo: ["Do not spend"], blockedActions: ["Blocked: spend"], cashMarginRisk: "cash and margin", reassessmentTrigger: "7d", proofRequired: ["x"] });
    expect(cautious.violations.some((x) => x.code === "missing_financials_overconfident")).toBe(false);
  });
});

describe("business-math validator — the safe base advisor passes", () => {
  it("base advice emits a calculation trace for finance-material cases", () => {
    const a = baseAdvise(cashSeed);
    expect((a.calculationTrace ?? []).length).toBeGreaterThan(0);
    expect(deriveCalcs(cashSeed).trace.length).toBeGreaterThan(0);
  });

  it("base advice has no math violations across all seed cases", () => {
    let violations = 0;
    for (const c of SEED_CASES) violations += validateBusinessMath(c, baseAdvise(c)).violations.length;
    expect(violations).toBe(0);
  });
});
