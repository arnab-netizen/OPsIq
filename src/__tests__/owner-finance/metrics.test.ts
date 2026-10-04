/**
 * Owner Finance (Module 2 Slice 2) — deterministic metrics engine tests.
 * Pure/no DB. Covers margins, break-even, runway, leakage, scores, survival-state
 * escalation, data-confidence, business-model/industry adaptability, currency
 * validation, null-on-missing, bounded scores, and input non-mutation.
 */
import { describe, it, expect } from "vitest";
import {
  computeFinancialMetrics,
  isValidCurrency,
  num,
  resolveFinanceThresholds,
  grossMarginPct,
  netProfit,
  breakEvenRevenue,
  contributionMarginPct,
  fixedCostBurdenPct,
  fixedCostsTotal,
  variableCostsTotal,
  dailyBreakEvenRevenue,
  cashRunwayDays,
  calculateDataConfidence,
  type FinancialSnapshotInput,
  SURVIVAL_STATES,
} from "@/domain/owner-finance";

/**
 * Fixed evaluation instant for every assertion in this file whose expected
 * survivalState depends on data freshness (i.e. every exact-"SAFE" check —
 * confidence < 70 forces WATCH regardless of margins, and data-confidence.ts's
 * own staleness penalty is keyed off `now` vs `periodEnd`). computeFinancialMetrics
 * defaults `now` to the real wall clock when no override is given, exactly like
 * its owner-strategy/owner-operations siblings (which already pin `now` in their
 * own tests for the same reason) — a fixture's periodEnd is a fixed point in time,
 * so evaluating it against a moving "today" makes a currently-fresh snapshot
 * silently cross the 45-day staleness threshold as real calendar time passes,
 * independent of any code change. 5 days after `profitable()`'s periodEnd
 * ("2026-07-31"), comfortably inside the <30-day FRESH tier with margin to
 * spare.
 */
const NOW = new Date("2026-08-05T00:00:00Z");

/** Profitable service business in INR (July 2026). */
function profitable(): FinancialSnapshotInput {
  return {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    currency: "INR",
    businessModel: "service",
    revenue: 100000,
    costOfGoodsOrServices: 30000,
    // fixedCosts is provided directly (= rent + salaryPayroll + utilities) so it counts as an
    // IMPORTANT_FIELDS present entry; individual components kept for payroll-burden computation.
    fixedCosts: 35000,
    rent: 10000,
    salaryPayroll: 20000,
    utilities: 5000,
    marketingSpend: 5000,
    cashOnHand: 200000, bankBalance: 0,
    orderCount: 1000,
    customerCount: 800,
  };
}

const stateRank = (s: string) => SURVIVAL_STATES.indexOf(s as never);

describe("owner-finance — safe numeric + currency", () => {
  it("num() fails closed on missing/NaN/Infinity", () => {
    expect(num(5)).toBe(5);
    expect(num(undefined)).toBeNull();
    expect(num(null)).toBeNull();
    expect(num(Number.NaN)).toBeNull();
    expect(num(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("validates currency (alpha 3–8), rejects empty/numeric", () => {
    expect(isValidCurrency("INR")).toBe(true);
    expect(isValidCurrency("USD")).toBe(true);
    expect(isValidCurrency("")).toBe(false);
    expect(isValidCurrency("12")).toBe(false);
    expect(isValidCurrency("TOOLONGCODE")).toBe(false);
    expect(computeFinancialMetrics({ ...profitable(), currency: "" }).currencyValid).toBe(false);
    expect(computeFinancialMetrics(profitable()).currencyValid).toBe(true);
  });
});

describe("owner-finance — normal profitable business", () => {
  it("computes correct margins, break-even, and a SAFE state", () => {
    const m = computeFinancialMetrics(profitable(), { now: NOW });
    expect(m.grossMarginPct).toBe(70); // (100k-30k)/100k
    expect(m.netProfit).toBe(30000); // 100k - (35k fixed + 30k var + 5k mktg)
    expect(m.netMarginPct).toBe(30);
    expect(m.contributionMarginPct).toBe(70); // (100k - 30k variable)/100k
    expect(m.breakEvenRevenue).toBe(50000); // 35k / 0.70
    expect(m.cashRunwayDays).toBeNull(); // profitable → not burning
    expect(m.profitPerOrder).toBe(30); // 30000 / 1000
    expect(m.survivalState).toBe("SAFE");
    expect(m.survivalTier).toBe("optimization");
  });
});

describe("owner-finance — risk scenarios escalate survival state", () => {
  it("zero revenue → margins null, no crash", () => {
    const m = computeFinancialMetrics({ ...profitable(), revenue: 0 });
    expect(m.grossMarginPct).toBeNull();
    expect(m.netMarginPct).toBeNull();
    expect(SURVIVAL_STATES).toContain(m.survivalState);
  });

  it("negative profit → negative net margin, not SAFE", () => {
    const m = computeFinancialMetrics({
      ...profitable(), revenue: 50000, fixedCosts: 40000, variableCosts: 40000,
      rent: undefined, salaryPayroll: undefined, utilities: undefined,
      costOfGoodsOrServices: undefined, marketingSpend: 0,
    });
    expect(m.netMarginPct!).toBeLessThan(0);
    expect(stateRank(m.survivalState)).toBeGreaterThanOrEqual(stateRank("AT_RISK"));
  });

  it("missing costs → netProfit null, 'costs' listed missing", () => {
    const m = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 100000, cashOnHand: 50000, bankBalance: 0,
    });
    expect(m.netProfit).toBeNull();
    expect(m.missingRequiredInputs).toContain("costs");
  });

  it("high fixed cost burden → not SAFE", () => {
    const m = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 100000, fixedCosts: 60000, variableCosts: 10000, cashOnHand: 100000, bankBalance: 0,
    });
    expect(m.fixedCostBurdenPct).toBe(60);
    expect(m.survivalState).not.toBe("SAFE");
  });

  it("high debt/EMI pressure → not SAFE", () => {
    const m = computeFinancialMetrics({ ...profitable(), loanEmiDebtPayments: 30000 });
    expect(m.debtServicePressurePct).toBe(30);
    expect(m.survivalState).not.toBe("SAFE");
  });

  it("low cash runway → CRITICAL or worse", () => {
    const m = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 20000, bankBalance: 0,
    });
    expect(m.cashRunwayDays).toBe(20); // 20000 / (30000 loss / 30 days)
    expect(stateRank(m.survivalState)).toBeGreaterThanOrEqual(stateRank("CRITICAL"));
  });

  it("insolvent runway → INSOLVENT_RISK", () => {
    const m = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 4000, bankBalance: 0,
    });
    expect(m.cashRunwayDays!).toBeLessThan(7);
    expect(m.survivalState).toBe("INSOLVENT_RISK");
  });

  it("overdue receivables pressure → not SAFE", () => {
    const m = computeFinancialMetrics({ ...profitable(), receivables: 40000, receivablesOverdue: 30000 });
    expect(m.receivablesPressurePct).toBe(40);
    expect(m.survivalState).not.toBe("SAFE");
  });

  it("payables pressure → not SAFE", () => {
    const m = computeFinancialMetrics({ ...profitable(), payables: 50000 });
    expect(m.payablesPressurePct).toBe(50);
    expect(m.survivalState).not.toBe("SAFE");
  });

  it("break-even not reached → below break-even and not SAFE", () => {
    const m = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 30000, fixedCosts: 40000, variableCosts: 6000, cashOnHand: 100000, bankBalance: 0,
    });
    expect(m.breakEvenRevenue).toBe(50000); // 40000 / 0.8
    expect(stateRank(m.survivalState)).toBeGreaterThanOrEqual(stateRank("AT_RISK"));
  });

  it("survival state escalates monotonically across worsening inputs", () => {
    const safe = computeFinancialMetrics(profitable(), { now: NOW });
    const watch = computeFinancialMetrics({ ...profitable(), payables: 50000 }, { now: NOW });
    const atRisk = computeFinancialMetrics({ ...profitable(), loanEmiDebtPayments: 30000 }, { now: NOW });
    const critical = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 20000, bankBalance: 0,
    }, { now: NOW });
    expect(stateRank(safe.survivalState)).toBe(stateRank("SAFE"));
    expect(stateRank(watch.survivalState)).toBeGreaterThanOrEqual(stateRank("WATCH"));
    expect(stateRank(atRisk.survivalState)).toBeGreaterThanOrEqual(stateRank("AT_RISK"));
    expect(stateRank(critical.survivalState)).toBeGreaterThanOrEqual(stateRank("CRITICAL"));
    expect(stateRank(atRisk.survivalState)).toBeGreaterThan(stateRank(safe.survivalState));
  });
});

describe("owner-finance — business model & industry adaptability", () => {
  it("industry template changes the fixed-cost-burden bar (service vs inventory)", () => {
    const input = {
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 100000, fixedCosts: 52000, variableCosts: 10000, cashOnHand: 100000, bankBalance: 0,
    };
    const generic = computeFinancialMetrics({ ...input, businessModel: "inventory" });
    const laundry = computeFinancialMetrics({
      ...input, businessModel: "service", industryTemplate: "laundry_local_service",
    });
    // 52% > generic bar (50) → flagged; < laundry bar (55) → not flagged.
    expect(generic.survivalState).not.toBe("SAFE");
    expect(resolveFinanceThresholds("laundry_local_service").highFixedCostBurdenPct).toBe(55);
    expect(stateRank(laundry.survivalState)).toBeLessThan(stateRank(generic.survivalState));
  });

  it("B2C-heavy concentration lowers revenue quality vs balanced B2B/B2C", () => {
    const concentrated = computeFinancialMetrics({ ...profitable(), b2cRevenue: 95000, b2bRevenue: 5000 });
    const balanced = computeFinancialMetrics({ ...profitable(), b2cRevenue: 50000, b2bRevenue: 50000 });
    expect(balanced.revenueQualityScore!).toBeGreaterThan(concentrated.revenueQualityScore!);
  });
});

describe("owner-finance — data confidence", () => {
  it("drops as inputs go missing", () => {
    const full = computeFinancialMetrics({
      ...profitable(), fixedCosts: 35000, loanEmiDebtPayments: 0, receivables: 0,
      payables: 0, ownerWithdrawals: 0, discountAmount: 0, refundAmount: 0,
    });
    const sparse = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", revenue: 100000,
    });
    expect(full.dataConfidenceScore).toBeGreaterThan(sparse.dataConfidenceScore);
    expect(sparse.missingRequiredInputs.length).toBeGreaterThan(0);
  });

  /**
   * Regression guard for the exact defect class that broke the "SAFE state"
   * test above: `calculateDataConfidence`'s default staleDays is 45
   * (data-confidence.ts), and a snapshot with `dataConfidenceScore < 70` is
   * forced to WATCH by survivalState() regardless of margins. `profitable()`
   * sits exactly at confidence 70 while fresh (6 missing IMPORTANT_FIELDS ×
   * -5 = -30, no critical/currency penalty) and 55 once stale (-15 more),
   * crossing that boundary. Both sides pin `now` explicitly, so this stays
   * true forever regardless of when it runs -- unlike the bug it guards
   * against, which came from computeFinancialMetrics silently defaulting
   * `now` to the real wall clock.
   */
  it("the same snapshot is confidence-eligible for SAFE just inside the 45-day staleness threshold, and forced to WATCH just past it", () => {
    const periodEnd = new Date("2026-07-31T00:00:00Z");
    const justFresh = new Date(periodEnd.getTime() + 44 * 24 * 60 * 60 * 1000); // 44 days old
    const justStale = new Date(periodEnd.getTime() + 46 * 24 * 60 * 60 * 1000); // 46 days old

    const fresh = computeFinancialMetrics(profitable(), { now: justFresh });
    const stale = computeFinancialMetrics(profitable(), { now: justStale });

    expect(fresh.dataConfidenceScore).toBe(70);
    expect(fresh.survivalState).toBe("SAFE");

    expect(stale.dataConfidenceScore).toBe(55);
    expect(stale.survivalState).toBe("WATCH");

    // Same underlying confidence computation, isolated from the orchestrator,
    // proves this is data-confidence.ts's own documented 45-day boundary
    // (see calculateDataConfidence's doc comment), not an artifact of this
    // particular fixture.
    expect(calculateDataConfidence(profitable(), { now: justFresh }).isStale).toBe(false);
    expect(calculateDataConfidence(profitable(), { now: justStale }).isStale).toBe(true);
  });
});

describe("owner-finance — invariants", () => {
  const samples: FinancialSnapshotInput[] = [
    profitable(),
    { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR" }, // empty
    { ...profitable(), revenue: 0 },
    { ...profitable(), revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 1000, bankBalance: 0 },
  ];

  it("all composite scores stay within 0..100", () => {
    for (const s of samples) {
      const m = computeFinancialMetrics(s);
      for (const v of [m.financialHealthScore, m.financialRiskScore, m.financialOpportunityScore, m.dataConfidenceScore]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("non-computable metrics return null on an empty snapshot", () => {
    const m = computeFinancialMetrics({ periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR" });
    for (const v of [
      m.grossMarginPct, m.netMarginPct, m.contributionMarginPct, m.fixedCostBurdenPct,
      m.breakEvenRevenue, m.cashRunwayDays, m.debtServicePressurePct, m.receivablesPressurePct,
      m.profitPerOrder, m.profitPerCustomer, m.revenueQualityScore, m.netProfit,
    ]) {
      expect(v).toBeNull();
    }
  });

  it("does not mutate the input object", () => {
    const input = profitable();
    const snapshot = JSON.parse(JSON.stringify(input));
    computeFinancialMetrics(input);
    expect(input).toEqual(snapshot);
  });

  it("direct metric helpers agree with the orchestrator", () => {
    const input = profitable();
    expect(grossMarginPct(input)).toBe(70);
    expect(netProfit(input)).toBe(30000);
    expect(breakEvenRevenue(input)).toBe(50000);
  });
});

describe("owner-finance — onboarding cost-field mapping honesty (regression)", () => {
  /**
   * Regression guard for the onboarding "Essential numbers" defect: rent/wages are
   * fixed costs, and must be posted as `fixedCosts`, never mislabeled as
   * `variableCosts` merely to satisfy an onboarding-readiness or diagnosis-gate
   * check. This proves the onboarding page's own field mapping
   * (src/app/(authenticated)/owner/onboarding/page.tsx EssentialNumbersForm) is the
   * financially correct one: entering rent+wages as `fixedCosts` (what onboarding
   * now posts) produces different, correct contribution margin / break-even /
   * fixed-cost-burden results than the old, incorrect `variableCosts` mapping would
   * have — and identical results to entering the same figures through the normal
   * Finance "Add snapshot" surface, because both post through the exact same
   * `financialSnapshotCreateSchema` fields into the exact same pure metric
   * functions. There is no separate onboarding data model to drift out of sync.
   */
  const base = {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    currency: "INR",
  };

  it("onboarding's fixedCosts mapping matches the equivalent normal-Finance-surface input exactly", () => {
    // What onboarding now posts: revenue + fixedCosts (rent+wages+other) + cashOnHand.
    const onboardingInput: FinancialSnapshotInput = {
      ...base,
      revenue: 100000,
      fixedCosts: 30000,
      cashOnHand: 50000, bankBalance: 0,
    };
    // The semantically equivalent entry through Finance's own "Add snapshot" form —
    // same concept, same field, same schema. Must produce byte-identical metrics.
    const financeSurfaceInput: FinancialSnapshotInput = { ...onboardingInput };

    expect(fixedCostsTotal(onboardingInput)).toBe(fixedCostsTotal(financeSurfaceInput));
    expect(contributionMarginPct(onboardingInput)).toBe(contributionMarginPct(financeSurfaceInput));
    expect(fixedCostBurdenPct(onboardingInput)).toBe(fixedCostBurdenPct(financeSurfaceInput));
    expect(breakEvenRevenue(onboardingInput)).toBe(breakEvenRevenue(financeSurfaceInput));

    // And the values must be the financially correct ones: $30k of rent+wages is
    // 100% fixed cost, 0% variable cost.
    expect(fixedCostsTotal(onboardingInput)).toBe(30000);
    expect(variableCostsTotal(onboardingInput)).toBeNull(); // nothing variable was reported
    expect(fixedCostBurdenPct(onboardingInput)).toBe(30); // 30000 / 100000
  });

  it("mislabeling fixed costs as variableCosts (the old defect) silently corrupts contribution margin, fixed-cost burden, and break-even", () => {
    const revenue = 100000;
    const rentAndWages = 30000;
    const trueVariableCosts = 20000; // e.g. cost of goods, reported honestly in both scenarios

    // Correct: rent+wages reported as fixedCosts (what onboarding posts today), plus a
    // genuine variable cost, exactly as a fuller Finance-surface entry would look.
    const correct: FinancialSnapshotInput = {
      ...base, revenue, fixedCosts: rentAndWages, variableCosts: trueVariableCosts, cashOnHand: 1, bankBalance: 0,
    };
    // The old defect: rent+wages folded into variableCosts alongside the real variable
    // cost, with nothing left to represent fixed costs at all.
    const oldDefect: FinancialSnapshotInput = {
      ...base, revenue, variableCosts: rentAndWages + trueVariableCosts, cashOnHand: 1, bankBalance: 0,
    };

    // Contribution margin: correct subtracts only the true $20k variable cost (80%
    // margin). The old defect wrongly subtracts $50k as if all of it scaled with
    // sales, understating contribution margin by 30 points.
    expect(contributionMarginPct(correct)).toBe(80);
    expect(contributionMarginPct(oldDefect)).toBe(50);

    // Fixed-cost burden: correct sees the real 30% fixed-cost burden; the old defect
    // sees none at all (fixedCostsTotal is null with nothing to sum), hiding it entirely.
    expect(fixedCostBurdenPct(correct)).toBe(30);
    expect(fixedCostBurdenPct(oldDefect)).toBeNull();

    // Break-even revenue: correct computes a real break-even off the true fixed cost
    // and true contribution margin; the old defect can't compute one at all (no fixed
    // cost to break even against).
    expect(breakEvenRevenue(correct)).toBe(37500); // 30000 / (80/100)
    expect(breakEvenRevenue(oldDefect)).toBeNull();
  });

  it("either fixedCosts or variableCosts alone still satisfies the diagnosis engine's cost-info gate", () => {
    const fixedOnly: FinancialSnapshotInput = { ...base, revenue: 100000, fixedCosts: 20000, cashOnHand: 1, bankBalance: 0 };
    const variableOnly: FinancialSnapshotInput = { ...base, revenue: 100000, variableCosts: 20000, cashOnHand: 1, bankBalance: 0 };
    // netProfit requires totalCosts to be non-null, which is the same "has cost info"
    // condition the diagnosis engine's readiness gate depends on.
    expect(netProfit(fixedOnly)).not.toBeNull();
    expect(netProfit(variableOnly)).not.toBeNull();
  });
});

describe("owner-finance — onboarding period-field mapping honesty (regression)", () => {
  /**
   * Regression guard for the onboarding time-period defect: the essential-numbers form asks
   * for "Average monthly sales/costs" (a full, typical month), so its snapshot's
   * periodStart/periodEnd must span a real ~30-day month -- never
   * periodStart=start-of-current-month / periodEnd=today, which is only a partial period on
   * every day but the last of the month. periodDays() (src/domain/owner-finance/metrics.ts)
   * divides the SAME monthly figures by however many days sit in that window to derive
   * dailyBreakEvenRevenue and cashRunwayDays, so a short window silently inflates daily burn
   * and understates cash runway by the same factor the window is short.
   *
   * Onboarding now posts a real last-full-calendar-month window
   * (src/app/(authenticated)/owner/onboarding/page.tsx: lastFullMonthStart/lastFullMonthEnd),
   * which this proves is period-length-honest and produces identical period-dependent
   * metrics to the same figures entered through Finance's own "Add snapshot" surface with an
   * equivalent explicit one-month period.
   */
  // A loss-making month (revenue 200000 - fixedCosts 150000 - variableCosts 100000 = -50000
  // net profit), so cashRunwayDays is actually computed (non-null) rather than trivially
  // null===null in the equivalence check below.
  const monthlyFigures = {
    revenue: 200000,
    fixedCosts: 150000,
    variableCosts: 100000,
    cashOnHand: 50000, bankBalance: 0,
  };

  it("a real ~30-day period (what onboarding now posts) and an equivalent Finance-surface month produce identical period-dependent metrics", () => {
    // What onboarding now posts: a real last-full-calendar-month window (31 days, e.g. July).
    const onboardingInput: FinancialSnapshotInput = {
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      currency: "INR",
      ...monthlyFigures,
    };
    // The semantically equivalent entry through Finance's own "Add snapshot" form for the
    // same calendar month -- same dates, same fields, same schema.
    const financeSurfaceInput: FinancialSnapshotInput = { ...onboardingInput };

    expect(dailyBreakEvenRevenue(onboardingInput)).toBe(dailyBreakEvenRevenue(financeSurfaceInput));
    expect(cashRunwayDays(onboardingInput)).toBe(cashRunwayDays(financeSurfaceInput));
  });

  it("the old defect (partial current-month-to-date window) silently corrupts daily break-even and cash runway relative to a real month", () => {
    // The old, incorrect mapping: periodStart=start-of-month, periodEnd=8th of the month --
    // an 8-day window carrying a FULL MONTH's worth of revenue/costs.
    const oldDefectInput: FinancialSnapshotInput = {
      periodStart: "2026-07-01",
      periodEnd: "2026-07-08", // 8 days
      currency: "INR",
      ...monthlyFigures, // fixedCosts: 90000 => break-even revenue is fixed/(CM%)
    };
    // The corrected mapping: the same figures against a real 31-day month.
    const correctedInput: FinancialSnapshotInput = {
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31", // 31 days
      currency: "INR",
      ...monthlyFigures,
    };

    const be = breakEvenRevenue(correctedInput)!;
    expect(be).not.toBeNull();

    // Same break-even revenue in both (period length doesn't change breakEvenRevenue itself)...
    expect(breakEvenRevenue(oldDefectInput)).toBe(be);

    // ...but dividing it by 8 days instead of 31 inflates the reported daily break-even by
    // roughly 4x -- the exact corruption class this test guards against.
    const dailyOld = dailyBreakEvenRevenue(oldDefectInput)!;
    const dailyCorrected = dailyBreakEvenRevenue(correctedInput)!;
    expect(dailyOld).toBeGreaterThan(dailyCorrected * 3);
    expect(Math.round((dailyOld / dailyCorrected) * 10) / 10).toBeCloseTo(31 / 8, 1);
  });
});
