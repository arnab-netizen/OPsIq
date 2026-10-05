/**
 * Owner Cashflow (Module 5 Slice 1) — deterministic metrics engine tests.
 * Pure/no DB. Covers cash position, obligations, runway (burning-only),
 * collection lag, pressure ratios, composite scores, cashflow-state escalation,
 * data-confidence, industry-template adaptability, currency validation,
 * null-on-missing, bounded scores, and input non-mutation.
 */
import { describe, it, expect } from "vitest";
import {
  computeCashflowMetrics,
  isValidCurrency,
  num,
  resolveCashflowThresholds,
  totalCash,
  nearTermObligations,
  cashRunwayDays,
  collectionGapDays,
  overdueReceivablesPct,
  payablesPressurePct,
  urgentPaymentRiskPct,
  ownerWithdrawalPressurePct,
  type CashflowSnapshotInput,
  CASHFLOW_STATES,
} from "@/domain/owner-cashflow";

/** Healthy cash-and-carry laundry in INR (May 2026, 31 days). */
function healthy(): CashflowSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    businessModel: "service",
    cashInHand: 50000,
    bankBalance: 150000,
    dailyCollections: 8000,
    receivables: 5000,
    receivablesOverdue: 0,
    payables: 20000,
    payablesOverdue: 0,
    upcomingEmi: 10000,
    rentDue: 15000,
    salaryDue: 40000,
    vendorDue: 10000,
    taxDue: 5000,
    ownerWithdrawal: 20000,
  };
}

const stateRank = (s: string) => CASHFLOW_STATES.indexOf(s as never);

describe("owner-cashflow — safe numeric + currency", () => {
  it("num() fails closed on missing/NaN/Infinity", () => {
    expect(num(5)).toBe(5);
    expect(num(0)).toBe(0);
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
    expect(computeCashflowMetrics({ ...healthy(), currency: "" }).currencyValid).toBe(false);
    expect(computeCashflowMetrics(healthy()).currencyValid).toBe(true);
  });
});

describe("owner-cashflow — cash position + obligations", () => {
  it("totalCash is known ONLY when BOTH components are known (a known 0 is known; a partial position is unknown)", () => {
    expect(totalCash(healthy())).toBe(200000);
    expect(totalCash({ ...healthy(), cashInHand: 0, bankBalance: 0 })).toBe(0);
    expect(totalCash({ ...healthy(), cashInHand: 100, bankBalance: 0 })).toBe(100);
    expect(totalCash({ ...healthy(), cashInHand: 0, bankBalance: 100 })).toBe(100);
    expect(totalCash({ ...healthy(), cashInHand: undefined })).toBeNull();
    expect(totalCash({ ...healthy(), bankBalance: undefined })).toBeNull();
    expect(totalCash({ ...healthy(), cashInHand: 0, bankBalance: undefined })).toBeNull();
    expect(totalCash({ ...healthy(), cashInHand: undefined, bankBalance: 0 })).toBeNull();
    expect(totalCash({ ...healthy(), cashInHand: Number.NaN })).toBeNull();
    expect(totalCash({ ...healthy(), bankBalance: Number.POSITIVE_INFINITY })).toBeNull();
    expect(
      totalCash({ ...healthy(), cashInHand: undefined, bankBalance: undefined })
    ).toBeNull();
  });
  it("nearTermObligations sums all due components; null if none present", () => {
    expect(nearTermObligations(healthy())).toBe(100000);
    expect(
      nearTermObligations({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        currency: "INR",
      })
    ).toBeNull();
  });
});

describe("owner-cashflow — runway is burning-only and honest", () => {
  it("returns null when collections cover obligations (not burning)", () => {
    // healthy: dailyCollections 8000 > dailyObligations (100000/31≈3226)
    expect(cashRunwayDays(healthy())).toBeNull();
  });
  it("computes days of net burn when burning", () => {
    // 3-day period, cash 100000, salaryDue 90000 → dailyObl 30000, collections 20000
    // netBurn 10000/day → runway 10 days
    const burning: CashflowSnapshotInput = {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-03",
      currency: "INR",
      cashInHand: 100000,
      bankBalance: 0,
      salaryDue: 90000,
      dailyCollections: 20000,
    };
    expect(cashRunwayDays(burning)).toBe(10);
  });
  it("is null when cash, obligations, or collections missing", () => {
    expect(cashRunwayDays({ ...healthy(), dailyCollections: undefined })).toBeNull();
    expect(
      cashRunwayDays({ ...healthy(), cashInHand: undefined, bankBalance: undefined })
    ).toBeNull();
  });
});

describe("owner-cashflow — collection lag + pressure ratios", () => {
  it("collectionGapDays = receivables / daily collections", () => {
    expect(collectionGapDays({ ...healthy(), receivables: 80000 })).toBe(10); // 80000/8000
    expect(collectionGapDays({ ...healthy(), dailyCollections: 0 })).toBeNull();
  });
  it("overdueReceivablesPct of receivables", () => {
    expect(overdueReceivablesPct({ ...healthy(), receivables: 10000, receivablesOverdue: 4000 })).toBe(
      40
    );
    expect(overdueReceivablesPct({ ...healthy(), receivables: 0 })).toBeNull();
  });
  it("payables / urgent / owner-withdrawal pressure are % of total cash", () => {
    const h = healthy(); // totalCash 200000
    expect(payablesPressurePct({ ...h, payables: 100000 })).toBe(50);
    expect(urgentPaymentRiskPct(h)).toBe(50); // obligations 100000 / cash 200000
    expect(ownerWithdrawalPressurePct(h)).toBe(10); // 20000 / 200000
    expect(
      payablesPressurePct({ ...h, cashInHand: undefined, bankBalance: undefined })
    ).toBeNull();
  });
});

describe("owner-cashflow — composite scores bounded + honest", () => {
  it("healthy business is SAFE with bounded scores", () => {
    const m = computeCashflowMetrics(healthy());
    expect(m.cashflowState).toBe("SAFE");
    expect(m.dataConfidenceScore).toBe(100);
    for (const v of [
      m.cashflowHealthScore,
      m.cashflowDangerScore,
      m.cashflowOpportunityScore,
      m.dataConfidenceScore,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(m.cashflowHealthScore).toBeGreaterThan(60);
    expect(m.cashflowDangerScore).toBe(0);
  });
});

describe("owner-cashflow — state escalation", () => {
  it("INSOLVENT_RISK when obligations exceed cash (urgent ≥ 100%)", () => {
    const m = computeCashflowMetrics({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      cashInHand: 5000,
      bankBalance: 0,
      dailyCollections: 500,
      rentDue: 20000,
      salaryDue: 50000,
    });
    expect(m.cashflowState).toBe("INSOLVENT_RISK");
    expect(m.cashflowTier).toBe("existential");
    expect(m.cashflowDangerScore).toBeGreaterThan(40);
  });
  it("CRITICAL on critical runway without insolvent urgency", () => {
    const m = computeCashflowMetrics({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-03", // 3 days
      currency: "INR",
      cashInHand: 100000,
      bankBalance: 0,
      salaryDue: 90000, // urgent 90% (high, not critical)
      dailyCollections: 20000, // runway 10 days (< critical 14, ≥ insolvent 5)
    });
    expect(m.cashRunwayDays).toBe(10);
    expect(m.cashflowState).toBe("CRITICAL");
  });
  it("AT_RISK on high urgent-payment risk alone", () => {
    const m = computeCashflowMetrics({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      cashInHand: 100000,
      bankBalance: 0,
      dailyCollections: 5000, // covers obligations → not burning
      rentDue: 70000, // urgent 70% (> 60 high, < 100)
    });
    expect(m.cashRunwayDays).toBeNull();
    expect(m.cashflowState).toBe("AT_RISK");
  });
  it("WATCH on high payables pressure with no acute risk", () => {
    const m = computeCashflowMetrics({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      cashInHand: 100000,
      dailyCollections: 5000,
      rentDue: 10000, // urgent 10% (low)
      payables: 80000, // 80% of cash (> 75 high, < 100)
    });
    expect(m.cashflowState).toBe("WATCH");
  });
  it("states escalate monotonically across the fixtures", () => {
    const safe = stateRank(computeCashflowMetrics(healthy()).cashflowState);
    const watch = stateRank(
      computeCashflowMetrics({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        currency: "INR",
        cashInHand: 100000,
        dailyCollections: 5000,
        rentDue: 10000,
        payables: 80000,
      }).cashflowState
    );
    expect(watch).toBeGreaterThan(safe);
  });
});

describe("owner-cashflow — data confidence + missing data honesty", () => {
  it("lists missing critical inputs and drops confidence", () => {
    const m = computeCashflowMetrics({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
    });
    expect(m.missingRequiredInputs).toEqual(
      expect.arrayContaining(["cashInHand", "bankBalance", "nearTermObligations", "dailyCollections"])
    );
    expect(m.dataConfidenceScore).toBeLessThan(50);
    expect(m.cashflowState).toBe("WATCH"); // not enough data to assert SAFE
    expect(m.totalCash).toBeNull();
    expect(m.cashRunwayDays).toBeNull();
  });
  it("marks stale snapshots down when now is provided", () => {
    const fresh = computeCashflowMetrics(healthy(), { now: new Date("2026-06-05") });
    const stale = computeCashflowMetrics(healthy(), { now: new Date("2026-09-01") });
    expect(stale.dataConfidenceScore).toBeLessThan(fresh.dataConfidenceScore);
  });
});

describe("owner-cashflow — industry-template adaptability", () => {
  it("laundry template tightens receivables/collection bars", () => {
    const generic = resolveCashflowThresholds();
    const laundry = resolveCashflowThresholds("laundry_local_service");
    expect(laundry.highOverdueReceivablesPct).toBeLessThan(generic.highOverdueReceivablesPct);
    expect(laundry.highCollectionGapDays).toBeLessThan(generic.highCollectionGapDays);
  });
  it("unknown template falls back to generic defaults", () => {
    expect(resolveCashflowThresholds("does_not_exist")).toEqual(resolveCashflowThresholds());
  });
});

describe("owner-cashflow — purity", () => {
  it("does not mutate its input", () => {
    const input = healthy();
    const snapshot = JSON.parse(JSON.stringify(input));
    computeCashflowMetrics(input, { now: new Date("2026-06-10") });
    expect(input).toEqual(snapshot);
  });
});
