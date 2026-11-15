/**
 * Owner Strategy — pure decision engine (Decision Overhaul, root cause 2): scenario matrix A–M.
 *
 * Pure/no DB. Each case pins the raw decision values, the evidence state, the decision code,
 * the machine-readable reasons, the four support lines, the allowed primary step and the
 * prohibited recommendation codes. Case N (carried Pursue/Proceed actions) lives with the
 * action-arbitration tests.
 */
import { describe, it, expect } from "vitest";
import {
  deriveStrategyDecision,
  diagnoseStrategySnapshot,
  planStrategyActionsFromDiagnosis,
  STRATEGY_DECISION_HEADLINE,
  formatStrategyMoney,
  formatStrategyMonths,
  inAboutStrategyMonths,
  aboutStrategyMoney,
  type StrategyDecision,
  type StrategySnapshotInput,
} from "@/domain/owner-strategy";

const NOW = new Date("2026-09-26T00:00:00Z");
const PROCEED = ["STRREC_PROCEED", "STRREC_PURSUE", "STRREC_SCALE"];

/** Full evidence (9 of 9 inputs) unless a case removes one. */
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
    ...over,
  };
}

const decide = (over: Partial<StrategySnapshotInput>) => deriveStrategyDecision(scenario(over), { now: NOW });
const reasonCodes = (d: StrategyDecision) => d.reasons.map((r) => r.code);

function allText(d: StrategyDecision): string[] {
  return [
    d.headline,
    d.headlineDetail ?? "",
    ...d.reasons.map((r) => r.message),
    d.primaryStep.title,
    d.primaryStep.description,
    ...d.primaryStep.options,
    d.dimensions.profit.line,
    d.dimensions.cash.line,
    d.dimensions.downside.line,
    d.dimensions.evidence.line,
    ...d.promising.map((p) => p.text),
  ];
}

function expectNoBadTokens(d: StrategyDecision) {
  for (const s of allText(d)) {
    expect(s).not.toMatch(/NaN|Infinity|undefined|null|\[object/);
  }
}

describe("formatting", () => {
  it("formats INR with Indian grouping and keeps small non-zero amounts visible", () => {
    expect(formatStrategyMoney(150000, "INR")).toBe("₹1,50,000");
    expect(formatStrategyMoney(-6000, "INR")).toBe("₹6,000");
    expect(formatStrategyMoney(0.01, "INR")).toBe("₹0.01");
    expect(formatStrategyMoney(0.001, "INR")).toBe("less than ₹0.01");
    expect(formatStrategyMoney(1500, "USD")).toBe("$1,500");
    expect(formatStrategyMoney(1500, "BADCODE1")).toBe("BADCODE1 1,500");
  });
  it("formats months without re-rounding", () => {
    expect(formatStrategyMonths(8)).toBe("8 months");
    expect(formatStrategyMonths(1)).toBe("1 month");
    expect(formatStrategyMonths(18.0001)).toBe("18.0001 months");
    expect(inAboutStrategyMonths(0)).toBe("in less than a month");
    expect(inAboutStrategyMonths(8)).toBe("in about 8 months");
  });
  it("never says 'about less than', and currencies without minor units get no decimals", () => {
    expect(aboutStrategyMoney(0.001, "INR")).toBe("less than ₹0.01");
    expect(aboutStrategyMoney(18000, "INR")).toBe("about ₹18,000");
    expect(formatStrategyMoney(50.5, "JPY")).toBe("¥51");
    expect(formatStrategyMoney(0.4, "INR", 2)).toBe("₹0.40");
    expect(formatStrategyMoney(10000, "INR", 2)).toBe("₹10,000.00");
  });
});

describe("A — strong economics, affordable, low risk → GO", () => {
  const d = decide({ investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 60000, costChange: 12000 });
  it("decides GO with no reasons and full evidence", () => {
    expect(d.code).toBe("GO");
    expect(d.headline).toBe("Go ahead");
    expect(d.headlineDetail).toBeNull();
    expect(d.reasons).toEqual([]);
    expect(d.values).toMatchObject({ monthlyProfitChange: 48000, worstMonthlyProfitChange: 36000, fundingGap: 0, cashLeftAfter: 250000, roiAnnualPct: 384, paybackMonths: 3.125 });
    expect(d.dimensions.evidence.state).toBe("good");
  });
  it("support lines", () => {
    expect(d.dimensions.profit.line).toBe("Adds about ₹48,000 a month · earns back ₹1,50,000 in about 3 months.");
    expect(d.dimensions.profit.profitClass).toBe("strong");
    expect(d.dimensions.cash.line).toBe("₹4,00,000 available — covers the ₹1,50,000 with ₹2,50,000 to spare.");
    expect(d.dimensions.downside.line).toBe("If the extra sales come in 20% lower, this still adds about ₹36,000 a month.");
    expect(d.dimensions.evidence.line).toBe("9 of 9 inputs provided · values are owner estimates");
  });
  it("only GO proceeds; Pursue/Size up are never offered", () => {
    expect(d.primaryStep.recommendationCode).toBe("STRREC_PROCEED");
    expect(d.prohibitedRecommendationCodes).toEqual(["STRREC_PURSUE", "STRREC_SCALE"]);
    expect(d.promising.map((p) => p.code)).toEqual(["STRONG_RETURN", "FAST_PAYBACK", "DOWNSIDE_STILL_PROFITABLE"]);
  });
});

describe("B — the known case (150,000 / 100,000 / +30,000 / +12,000 / medium) → NOT_YET", () => {
  const d = decide({ investmentRequired: 150000, cashAvailable: 100000, expectedRevenueChange: 30000, costChange: 12000, riskLevel: "medium" });
  it("raw values and decision", () => {
    expect(d.values).toMatchObject({ monthlyProfitChange: 18000, worstMonthlyProfitChange: 6000, bestMonthlyProfitChange: 30000, fundingGap: 50000, cashLeftAfter: null, roiAnnualPct: 144 });
    expect(d.code).toBe("NOT_YET");
    expect(d.headline).toBe("Not yet");
    expect(d.headlineDetail).toBe("You're ₹50,000 short.");
    expect(reasonCodes(d)).toEqual(["FUNDING_GAP"]);
    expect(d.dimensions.evidence.state).toBe("good");
  });
  it("support lines are exact and concrete (no vague 'Stretched')", () => {
    expect(d.dimensions.profit.line).toBe("Adds about ₹18,000 a month · earns back ₹1,50,000 in about 8 months.");
    expect(d.dimensions.cash.line).toBe("₹1,00,000 available for this — ₹50,000 short.");
    expect(d.dimensions.cash.state).toBe("blocker");
    expect(d.dimensions.downside.line).toBe("If the extra sales come in 40% lower, this still adds about ₹6,000 a month.");
  });
  it("primary step closes the funding gap; no Proceed/Pursue/Size up", () => {
    expect(d.primaryStep.recommendationCode).toBe("STRREC_SECURE_FUNDING");
    expect(d.primaryStep.title).toBe("Close the ₹50,000 funding gap");
    expect(d.primaryStep.options).toEqual([
      "Stage the spend so the first step fits the cash you have",
      "Reduce the scope to fit ₹1,00,000",
      "Secure ₹50,000 of funding before committing",
    ]);
    expect(d.prohibitedRecommendationCodes).toEqual(PROCEED);
  });
});

describe("C — bad economics, affordable → DONT_AS_PLANNED", () => {
  const d = decide({ investmentRequired: 50000, cashAvailable: 400000, expectedRevenueChange: 10000, costChange: 15000 });
  it("decides DONT with the loss as the reason and a change/drop step", () => {
    expect(d.values.monthlyProfitChange).toBe(-5000);
    expect(d.code).toBe("DONT_AS_PLANNED");
    expect(d.headline).toBe("Don't do it as planned");
    expect(reasonCodes(d)).toEqual(["LOSES_MONEY"]);
    expect(d.dimensions.profit.line).toBe("Loses about ₹5,000 a month.");
    expect(d.dimensions.profit.profitClass).toBe("no_profit");
    expect(d.primaryStep.recommendationCode).toBe("STRREC_DROP_OR_RESCOPE");
    expect(d.primaryStep.findingCode).toBe("STR_NEGATIVE_BASE_CASE");
    expect(d.prohibitedRecommendationCodes).toEqual(PROCEED);
    expect(d.promising).toEqual([]);
  });
});

describe("D — bad economics, unaffordable → economics blocker not hidden by funding", () => {
  const d = decide({ investmentRequired: 150000, cashAvailable: 100000, expectedRevenueChange: 10000, costChange: 15000 });
  it("DONT_AS_PLANNED leads; the funding gap is still listed", () => {
    expect(d.code).toBe("DONT_AS_PLANNED");
    expect(reasonCodes(d)).toEqual(["LOSES_MONEY", "FUNDING_GAP"]);
    expect(d.primaryStep.recommendationCode).toBe("STRREC_DROP_OR_RESCOPE");
    expect(d.dimensions.cash.line).toBe("₹1,00,000 available for this — ₹50,000 short.");
  });
});

describe("E — missing core economics → NEED_INFO (unknown, never 'poor')", () => {
  const d = decide({ investmentRequired: 150000, cashAvailable: 400000, costChange: 12000 });
  it("profit and downside unknown; asks for the revenue change", () => {
    expect(d.values.monthlyProfitChange).toBeNull();
    expect(d.code).toBe("NEED_INFO");
    expect(d.headline).toBe("Can't say yet");
    expect(reasonCodes(d)).toEqual(["MISSING_REVENUE_CHANGE"]);
    expect(d.dimensions.profit).toMatchObject({ state: "unknown", profitClass: "unknown", line: "Profit not calculated — enter the expected revenue change per month." });
    expect(d.dimensions.downside.state).toBe("unknown");
    expect(d.dimensions.evidence.state).toBe("unknown");
    expect(d.dimensions.evidence.line).toBe("8 of 9 inputs provided · values are owner estimates");
    expect(d.primaryStep.title).toBe("Enter the expected revenue change per month");
    expect(d.prohibitedRecommendationCodes).toEqual(PROCEED);
  });
  it("both missing → both named, revenue first", () => {
    const both = decide({ investmentRequired: 1000, cashAvailable: 4000 });
    expect(reasonCodes(both)).toEqual(["MISSING_REVENUE_CHANGE", "MISSING_COST_CHANGE"]);
    expect(both.dimensions.profit.line).toBe("Profit not calculated — enter the expected revenue change per month and expected cost change per month.");
  });
});

describe("F — investment > 0 and cash missing → NEED_INFO", () => {
  const d = decide({ investmentRequired: 150000, expectedRevenueChange: 30000, costChange: 12000 });
  it("affordability unknown; asks for cash; cannot be GO", () => {
    expect(d.values.fundingGap).toBeNull();
    expect(d.code).toBe("NEED_INFO");
    expect(reasonCodes(d)).toEqual(["MISSING_CASH"]);
    expect(d.dimensions.cash).toEqual({ state: "unknown", line: "Cash you can put into this not entered — can't tell if ₹1,50,000 is affordable." });
    expect(d.primaryStep).toMatchObject({ recommendationCode: "STRREC_PROVIDE_CASH", findingCode: "STR_MISSING_CASH", title: "Enter the cash you can put into this" });
  });
  it("a known loss is not withheld for missing cash (missing cash still listed)", () => {
    const loss = decide({ investmentRequired: 150000, expectedRevenueChange: 10000, costChange: 15000 });
    expect(loss.code).toBe("DONT_AS_PLANNED");
    expect(reasonCodes(loss)).toEqual(["LOSES_MONEY", "MISSING_CASH"]);
  });
  it("investment missing with positive profit → NEED_INFO asking for the investment", () => {
    const inv = decide({ cashAvailable: 100000, expectedRevenueChange: 30000, costChange: 12000 });
    expect(inv.code).toBe("NEED_INFO");
    expect(inv.primaryStep.title).toBe("Enter the upfront investment");
    expect(inv.dimensions.cash.line).toBe("Upfront investment not entered — affordability not calculated.");
    expect(inv.dimensions.profit.line).toBe("Adds about ₹18,000 a month · upfront investment not entered.");
  });
});

describe("G — cash = 0 → a known funding gap, not missing data", () => {
  const d = decide({ investmentRequired: 150000, cashAvailable: 0, expectedRevenueChange: 30000, costChange: 12000 });
  it("NOT_YET for the whole investment", () => {
    expect(d.code).toBe("NOT_YET");
    expect(d.values.fundingGap).toBe(150000);
    expect(reasonCodes(d)).toEqual(["FUNDING_GAP"]);
    expect(d.headlineDetail).toBe("You're ₹1,50,000 short.");
    expect(d.dimensions.cash.line).toBe("No cash available for this — ₹1,50,000 short.");
    expect(d.primaryStep.options[1]).toBe("Reduce the scope so less cash is needed upfront");
  });
});

describe("H — missing risk → downside unknown, no safe upside, no unconditional GO", () => {
  const d = decide({ investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 60000, costChange: 12000, riskLevel: undefined });
  it("resolves deterministically to GO_WITH_CONDITIONS on DOWNSIDE_UNKNOWN", () => {
    expect(d.values.worstMonthlyProfitChange).toBeNull();
    expect(d.code).toBe("GO_WITH_CONDITIONS");
    expect(d.headline).toBe("Go ahead — but first…");
    expect(d.conditions.map((c) => c.code)).toEqual(["DOWNSIDE_UNKNOWN"]);
    expect(d.dimensions.downside).toEqual({ state: "unknown", line: "Downside not calculated — choose an execution risk." });
    expect(d.promising.map((p) => p.code)).not.toContain("DOWNSIDE_STILL_PROFITABLE");
    expect(d.primaryStep).toMatchObject({ recommendationCode: "STRREC_SET_RISK_LEVEL", findingCode: "STR_MISSING_RISK_LEVEL" });
    expect(d.prohibitedRecommendationCodes).toEqual(PROCEED);
    expect(d.dimensions.evidence.line).toBe("8 of 9 inputs provided · values are owner estimates");
  });
  it("missing risk never hides a funding gap or a loss", () => {
    expect(decide({ investmentRequired: 150000, cashAvailable: 100000, expectedRevenueChange: 30000, costChange: 12000, riskLevel: undefined }).code).toBe("NOT_YET");
    expect(decide({ investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 10000, costChange: 15000, riskLevel: undefined }).code).toBe("DONT_AS_PLANNED");
  });
});

describe("I — negative downside with good expected economics → GO_WITH_CONDITIONS", () => {
  const d = decide({ investmentRequired: 50000, cashAvailable: 400000, expectedRevenueChange: 30000, costChange: 20000, riskLevel: "medium" });
  it("caps the downside first", () => {
    expect(d.values).toMatchObject({ monthlyProfitChange: 10000, worstMonthlyProfitChange: -2000 });
    expect(d.code).toBe("GO_WITH_CONDITIONS");
    expect(d.conditions.map((c) => c.code)).toEqual(["DOWNSIDE_LOSS"]);
    expect(d.dimensions.downside).toEqual({ state: "caution", line: "If the extra sales come in 40% lower, this loses about ₹2,000 a month." });
    expect(d.primaryStep.recommendationCode).toBe("STRREC_CAP_DOWNSIDE");
    expect(d.promising.map((p) => p.code)).not.toContain("DOWNSIDE_STILL_PROFITABLE");
  });
  it("high execution risk adds a condition after the downside loss", () => {
    const hi = decide({ investmentRequired: 50000, cashAvailable: 400000, expectedRevenueChange: 30000, costChange: 5000, riskLevel: "high" });
    expect(hi.values.worstMonthlyProfitChange).toBe(7000);
    expect(hi.conditions.map((c) => c.code)).toEqual(["HIGH_EXECUTION_RISK"]);
    expect(hi.primaryStep.recommendationCode).toBe("STRREC_DE_RISK");
    expect(hi.dimensions.downside.line).toBe("If the extra sales come in 60% lower, this still adds about ₹7,000 a month · you rated execution risk high.");
  });
});

describe("J — weak/long but positive economics → deterministic by payback band", () => {
  it("payback beyond the critical limit (75 months, 16% a year) → DONT_AS_PLANNED, not a conditional go", () => {
    const d = decide({ investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 2000, costChange: 0 });
    expect(d.values).toMatchObject({ monthlyProfitChange: 2000, roiAnnualPct: 16, paybackMonths: 75 });
    expect(d.code).toBe("DONT_AS_PLANNED");
    expect(reasonCodes(d)).toEqual(["PAYBACK_TOO_LONG"]);
    expect(d.reasons[0].message).toBe("It would take about 75 months to earn back the investment — longer than the 36-month limit.");
    expect(d.dimensions.profit).toMatchObject({ state: "blocker", profitClass: "no_profit", line: "Adds about ₹2,000 a month, but takes about 75 months to earn back ₹1,50,000." });
    expect(d.primaryStep).toMatchObject({ recommendationCode: "STRREC_DROP_OR_RESCOPE", findingCode: "STR_LONG_PAYBACK" });
    expect(d.promising).toEqual([]);
  });
  it("long payback within the limit (30 months) → GO_WITH_CONDITIONS on LONG_PAYBACK", () => {
    const d = decide({ investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 5000, costChange: 0 });
    expect(d.code).toBe("GO_WITH_CONDITIONS");
    expect(d.conditions.map((c) => c.code)).toEqual(["LONG_PAYBACK"]);
    expect(d.dimensions.profit).toMatchObject({ state: "caution", profitClass: "weak" });
    expect(d.primaryStep.recommendationCode).toBe("STRREC_STAGE_PAYBACK");
    expect(d.reasons[0].message).toBe("It takes about 30 months to earn back the investment (target: 18 months or less).");
  });
  it("critical payback boundary: exactly 36 months is a condition, just over is DONT", () => {
    expect(decide({ investmentRequired: 180000, cashAvailable: 400000, expectedRevenueChange: 5000, costChange: 0 }).code).toBe("GO_WITH_CONDITIONS");
    const over = decide({ investmentRequired: 180001, cashAvailable: 400000, expectedRevenueChange: 5000, costChange: 0 });
    expect(over.code).toBe("DONT_AS_PLANNED");
    expect(over.reasons[0].message).toContain("36.0002 months"); // never displayed as "36" while the rule fires
  });
  it("industry thresholds apply (laundry: long payback > 12, limit 24)", () => {
    const d = decide({ industryTemplate: "laundry_local_service", investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 11000, costChange: 0 });
    expect(d.conditions.map((c) => c.code)).toEqual(["LONG_PAYBACK"]);
    expect(decide({ industryTemplate: "laundry_local_service", investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 6000, costChange: 0 }).code).toBe("DONT_AS_PLANNED");
  });
});

describe("K — zero investment", () => {
  const d = decide({ investmentRequired: 0, expectedRevenueChange: 20000, costChange: 5000 });
  it("missing cash does not block; no payback/ROI claims; GO", () => {
    expect(d.code).toBe("GO");
    expect(reasonCodes(d)).toEqual([]);
    expect(d.values).toMatchObject({ fundingGap: null, roiAnnualPct: null, paybackMonths: 0 });
    expect(d.dimensions.cash).toEqual({ state: "good", line: "No upfront investment needed." });
    expect(d.dimensions.profit.line).toBe("Adds about ₹15,000 a month · no upfront investment.");
    expect(d.promising.map((p) => p.code)).toEqual(["DOWNSIDE_STILL_PROFITABLE"]);
    expect(d.dimensions.evidence.line).toBe("8 of 9 inputs provided · values are owner estimates");
  });
});

describe("L — zero profit", () => {
  const d = decide({ investmentRequired: 50000, cashAvailable: 400000, expectedRevenueChange: 12000, costChange: 12000 });
  it("DONT_AS_PLANNED — adds no profit (not 'loses')", () => {
    expect(d.values.monthlyProfitChange).toBe(0);
    expect(d.code).toBe("DONT_AS_PLANNED");
    expect(reasonCodes(d)).toEqual(["NO_PROFIT_GAIN"]);
    expect(d.dimensions.profit.line).toBe("Doesn't add profit — the revenue and cost changes cancel out.");
    expect(d.primaryStep.description).toMatch(/^As planned it adds no profit\./);
  });
});

describe("M — Phase 1 boundary values", () => {
  const good = { expectedRevenueChange: 60000, costChange: 12000 };
  it("cash exactly equal to the investment → covered, no reserve (condition)", () => {
    const d = decide({ ...good, investmentRequired: 150000, cashAvailable: 150000 });
    expect(d.values).toMatchObject({ fundingGap: 0, cashLeftAfter: 0, lowReserveThreshold: 15000 });
    expect(d.code).toBe("GO_WITH_CONDITIONS");
    expect(d.conditions.map((c) => c.code)).toEqual(["LOW_CASH_RESERVE"]);
    expect(d.dimensions.cash.line).toBe("₹1,50,000 available — covers the ₹1,50,000 but leaves nothing in reserve.");
    expect(d.primaryStep.recommendationCode).toBe("STRREC_KEEP_RESERVE");
  });
  it("one paisa short → NOT_YET with the exact gap", () => {
    const d = decide({ ...good, investmentRequired: 150000, cashAvailable: 149999.99 });
    expect(d.code).toBe("NOT_YET");
    expect(d.values.fundingGap).toBe(0.01);
    expect(d.headlineDetail).toBe("You're ₹0.01 short.");
  });
  it("a little spare (₹1, or anything under 10% of the investment) is still a low reserve, not a clean GO", () => {
    for (const cash of [150000.01, 150001, 164999.99]) {
      const d = decide({ ...good, investmentRequired: 150000, cashAvailable: cash });
      expect(d.code).toBe("GO_WITH_CONDITIONS");
      expect(d.conditions.map((c) => c.code)).toEqual(["LOW_CASH_RESERVE"]);
    }
    const one = decide({ ...good, investmentRequired: 150000, cashAvailable: 150001 });
    expect(one.dimensions.cash.line).toBe("₹1,50,001 available — covers the ₹1,50,000, leaving only ₹1 in reserve.");
    expect(one.primaryStep.description).toContain("only ₹1 of your cash in reserve");
  });
  it("10% of the investment or more to spare → GO", () => {
    const d = decide({ ...good, investmentRequired: 150000, cashAvailable: 165000 });
    expect(d.code).toBe("GO");
    expect(d.dimensions.cash.line).toBe("₹1,65,000 available — covers the ₹1,50,000 with ₹15,000 to spare.");
  });
  it("a paise-level gap shows every amount in that sentence with paise (no '₹10,000 available — ₹0.40 short')", () => {
    const d = decide({ ...good, investmentRequired: 10000.4, cashAvailable: 10000 });
    expect(d.code).toBe("NOT_YET");
    expect(d.dimensions.cash.line).toBe("₹10,000.00 available for this — ₹0.40 short.");
    expect(d.primaryStep.title).toBe("Close the ₹0.40 funding gap");
  });
  it("decimal amounts without float noise (16384.1 − 6384.1 = 10000 exactly)", () => {
    const d = decide({ expectedRevenueChange: 16384.1, costChange: 6384.1, investmentRequired: 180000, cashAvailable: 180000.1 });
    expect(d.values.monthlyProfitChange).toBe(10000);
    expect(d.values.paybackMonths).toBe(18);
    expect(d.conditions.map((c) => c.code)).not.toContain("LONG_PAYBACK"); // exactly on the bar is not "long"
  });
  it("payback just over the bar is long and displayed without rounding onto the bar", () => {
    const d = decide({ expectedRevenueChange: 10000, costChange: 0, investmentRequired: 180001, cashAvailable: 400000 });
    expect(d.conditions.map((c) => c.code)).toContain("LONG_PAYBACK");
    expect(d.reasons.find((r) => r.code === "LONG_PAYBACK")!.message).toContain("18.0001 months");
  });
  it("worst case exactly 0 → breaks even, not a loss and not 'still adds'", () => {
    const d = decide({ expectedRevenueChange: 10000, costChange: 8000, investmentRequired: 20000, cashAvailable: 400000 });
    expect(d.values.worstMonthlyProfitChange).toBe(0);
    expect(reasonCodes(d)).not.toContain("DOWNSIDE_LOSS");
    expect(d.dimensions.downside).toEqual({ state: "good", line: "If the extra sales come in 20% lower, this only breaks even." });
    expect(d.promising.map((p) => p.code)).not.toContain("DOWNSIDE_STILL_PROFITABLE");
  });
  it("a weak ROI (< 20% a year) always means payback > 60 months, beyond every critical limit → DONT", () => {
    // ROI 20% ⇔ payback 60 months, so with the configured thresholds weak return is subsumed by
    // the critical payback limit; the persisted STR_WEAK_ROI finding still records it.
    const d = decide({ expectedRevenueChange: 999.99, costChange: 0, investmentRequired: 60000, cashAvailable: 400000 });
    expect(d.code).toBe("DONT_AS_PLANNED");
    expect(reasonCodes(d)).toEqual(["PAYBACK_TOO_LONG"]);
    expect(diagnoseStrategySnapshot(scenario({ expectedRevenueChange: 999.99, costChange: 0, investmentRequired: 60000, cashAvailable: 400000 }), { now: NOW }).findings.map((f) => f.code)).toContain("STR_WEAK_ROI");
  });
  it("negative or zero revenue change: every downside message uses the right wording", () => {
    const loss = decide({ expectedRevenueChange: -20000, costChange: -30000, investmentRequired: 0, riskLevel: "high" });
    expect(loss.values.worstMonthlyProfitChange).toBe(-2000);
    expect(loss.conditions[0].message).toBe("If revenue drops 60% more than expected, this loses about ₹2,000 a month.");
    expect(loss.primaryStep.description).toMatch(/^If revenue drops 60% more than expected, this loses about ₹2,000 a month\./);
    const savings = decide({ expectedRevenueChange: 0, costChange: -500, investmentRequired: 0, riskLevel: "medium" });
    expect(savings.promising.map((p) => p.code)).not.toContain("DOWNSIDE_STILL_PROFITABLE");
    expect(savings.dimensions.downside.line).toBe("No revenue change is expected, so sales can't come in lower — the result depends on the cost change.");
    for (const d of [loss, savings]) for (const t of allText(d)) expect(t).not.toContain("extra sales");
  });
  it("negative revenue change phrases the downside as a bigger drop", () => {
    const d = decide({ expectedRevenueChange: -2000, costChange: -10000, investmentRequired: 0 });
    expect(d.values.worstMonthlyProfitChange).toBe(7600);
    expect(d.dimensions.downside.line).toBe("If revenue drops 20% more than expected, this still adds about ₹7,600 a month.");
  });
});

describe("invalid inputs fail closed to NEED_INFO", () => {
  it("invalid currency", () => {
    const d = decide({ currency: "1", expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 1000, cashAvailable: 4000 });
    expect(d.code).toBe("NEED_INFO");
    expect(d.primaryReason).toBe("INVALID_CURRENCY");
    expect(d.primaryStep.recommendationCode).toBe("STRREC_FIX_CURRENCY");
    expect(d.dimensions.evidence.line).toContain("currency code is not valid");
    expectNoBadTokens(d);
  });
  it("negative investment / cash (rejected by the schema) never produce a decision", () => {
    expect(decide({ expectedRevenueChange: 60000, costChange: 12000, investmentRequired: -5, cashAvailable: 4000 }).primaryReason).toBe("INVALID_INVESTMENT");
    expect(decide({ expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 5, cashAvailable: -4000 }).primaryReason).toBe("INVALID_CASH");
  });
});

describe("contract invariants across the matrix", () => {
  const inputs: Array<Partial<StrategySnapshotInput>> = [
    {},
    { expectedRevenueChange: 0, costChange: 0 },
    { expectedRevenueChange: 60000, costChange: 12000 },
    { expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 0 },
    { expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 150000 },
    { expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 150000, cashAvailable: 0, riskLevel: undefined },
    { expectedRevenueChange: -5000, costChange: 1000, investmentRequired: 150000, cashAvailable: 1, riskLevel: "high" },
    { expectedRevenueChange: 30000, costChange: 12000, investmentRequired: 150000, cashAvailable: 100000, riskLevel: "medium", periodStart: "2025-01-01", periodEnd: "2025-01-31" },
  ];
  it("every decision has a headline, one primary step, and no NaN/undefined/null text", () => {
    for (const over of inputs) {
      const d = decide(over);
      expect(d.headline).toBe(STRATEGY_DECISION_HEADLINE[d.code]);
      expect(d.primaryStep.title.length).toBeGreaterThan(0);
      expectNoBadTokens(d);
      // Only GO may proceed.
      if (d.code !== "GO") expect(d.prohibitedRecommendationCodes).toContain("STRREC_PROCEED");
      expect(d.prohibitedRecommendationCodes).not.toContain(d.primaryStep.recommendationCode);
      expect(d.conditions.length > 0).toBe(d.code === "GO_WITH_CONDITIONS");
    }
  });
  it("is deterministic", () => {
    for (const over of inputs) expect(decide(over)).toEqual(decide(over));
  });
  it("a stale assessment is noted in evidence", () => {
    const d = decide(inputs[7]);
    expect(d.dimensions.evidence.line).toBe("9 of 9 inputs provided · values are owner estimates · the assessment period ended more than 60 days ago");
    expect(d.dimensions.evidence.state).toBe("caution");
  });
});

describe("decision conditions are backed by findings (so a persisted action can reference one)", () => {
  it("a low reserve emits STR_LOW_CASH_RESERVE with a template, on exactly the decision's predicate", () => {
    const at = scenario({ expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 150000, cashAvailable: 150000 });
    const diag = diagnoseStrategySnapshot(at, { now: NOW });
    expect(diag.findings.map((f) => f.code)).toContain("STR_LOW_CASH_RESERVE");
    expect(planStrategyActionsFromDiagnosis(diag).missingActionInputs).toEqual([]);
    for (const [cash, expected] of [[149999.99, false], [150000.01, true], [164999.99, true], [165000, false]] as const) {
      const codes = diagnoseStrategySnapshot({ ...at, cashAvailable: cash }, { now: NOW }).findings.map((f) => f.code);
      expect(codes.includes("STR_LOW_CASH_RESERVE")).toBe(expected);
      expect(decide({ expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 150000, cashAvailable: cash }).conditions.some((c) => c.code === "LOW_CASH_RESERVE")).toBe(expected);
    }
  });
  it("affordability findings agree with the funding gap at sub-paisa precision", () => {
    const s = scenario({ expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 3790.46, cashAvailable: 3790.4599999962 });
    const codes = diagnoseStrategySnapshot(s, { now: NOW }).findings.map((f) => f.code);
    const d = deriveStrategyDecision(s, { now: NOW });
    expect(codes.includes("STR_UNAFFORDABLE")).toBe((d.values.fundingGap ?? 0) > 0);
  });
  it("a loss-making option is not flagged for reserve", () => {
    const loss = scenario({ expectedRevenueChange: 1000, costChange: 12000, investmentRequired: 150000, cashAvailable: 150000 });
    expect(diagnoseStrategySnapshot(loss, { now: NOW }).findings.map((f) => f.code)).not.toContain("STR_NO_CASH_RESERVE");
  });
});

describe("round-2 audit fixes", () => {
  const diag = (over: Partial<StrategySnapshotInput>) => diagnoseStrategySnapshot(scenario(over), { now: NOW });
  const codes = (over: Partial<StrategySnapshotInput>) => diag(over).findings.map((f) => f.code);

  it("no conditions are listed while profit is unknown (NEED_INFO) — and no reserve finding either", () => {
    const d = decide({ investmentRequired: 150000, cashAvailable: 150000, riskLevel: "high" });
    expect(d.code).toBe("NEED_INFO");
    expect(reasonCodes(d)).toEqual(["MISSING_REVENUE_CHANGE", "MISSING_COST_CHANGE"]);
    expect(codes({ investmentRequired: 150000, cashAvailable: 150000, riskLevel: "high" })).not.toContain("STR_LOW_CASH_RESERVE");
  });

  it("the reserve finding and condition agree when payback is beyond the limit (neither)", () => {
    const over = { expectedRevenueChange: 2000, costChange: 0, investmentRequired: 150000, cashAvailable: 150000 };
    expect(decide(over).code).toBe("DONT_AS_PLANNED");
    expect(reasonCodes(decide(over))).not.toContain("LOW_CASH_RESERVE");
    expect(codes(over)).not.toContain("STR_LOW_CASH_RESERVE");
  });

  it("a sub-unit gap in a currency without minor units never reads as 0", () => {
    const d = decide({ currency: "JPY", expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 60000.4, cashAvailable: 60000 });
    expect(d.code).toBe("NOT_YET");
    expect(d.primaryStep.title).toBe("Close the less than ¥1 funding gap");
    for (const t of allText(d)) expect(t).not.toMatch(/¥0(?![.\d])/);
  });

  it("negative cash (rejected by the schema) never produces an affordability finding or a 'good' evidence state", () => {
    const over = { expectedRevenueChange: 1000, costChange: 5000, investmentRequired: 60000, cashAvailable: -5000 };
    expect(codes(over)).not.toContain("STR_UNAFFORDABLE");
    expect(decide(over).code).toBe("DONT_AS_PLANNED");
    expect(decide({ expectedRevenueChange: 60000, costChange: 5000, investmentRequired: 60000, cashAvailable: -5000 }).dimensions.evidence.state).toBe("unknown");
    expect(decide({ expectedRevenueChange: 60000, costChange: 5000, investmentRequired: -60000, cashAvailable: 5000 }).dimensions.evidence.state).toBe("unknown");
  });

  it("finding copy follows the sign of the revenue change", () => {
    const neg = diag({ expectedRevenueChange: -20000, costChange: -30000, investmentRequired: 0, riskLevel: "high" });
    expect(neg.findings.find((f) => f.code === "STR_NEGATIVE_WORST_CASE")!.summary).toBe("If revenue drops 60% more than expected, this becomes a monthly loss of about ₹2,000.");
    const zero = diag({ expectedRevenueChange: 0, costChange: -3000, investmentRequired: 60000, cashAvailable: 400000 });
    expect(zero.findings.find((f) => f.code === "STR_OPP_SAFE_UPSIDE")!.summary).toBe("No revenue change is expected, so the result doesn't depend on sales — it adds monthly profit either way.");
    const pos = diag({ expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 150000, cashAvailable: 400000 });
    expect(pos.findings.find((f) => f.code === "STR_OPP_SAFE_UPSIDE")!.summary).toBe("If the extra sales come in 20% lower, the option still adds monthly profit.");
    for (const f of [...neg.findings, ...zero.findings, ...pos.findings]) expect(`${f.title} ${f.summary}`).not.toMatch(/ROI|base case|comfortable window|affordabilityRatio|pursue/i);
  });

  it("a synthesized re-scope step carries the re-scope verification copy, not 'corrected input'", () => {
    const p = planStrategyActionsFromDiagnosis(diag({ expectedRevenueChange: 2000, costChange: 0, investmentRequired: 150000, cashAvailable: 400000 }));
    expect(p.actions[0].title).toBe("Change the plan, re-scope it, or drop it");
    expect(p.actions[0].verificationMethod).not.toMatch(/corrected input/);
  });
});
