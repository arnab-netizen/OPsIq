/**
 * FINANCE SCORING INVARIANTS — Regression Tests
 *
 * Covers the five defects identified in the OPSIQ OWNER PILOT scoring quality investigation
 * (production cycle 7c729460-ca52-46b5-82b1-b65f538d891a):
 *
 *   F-1/F-3: Confidence ceiling — UNKNOWN ≠ HEALTHY
 *     B: confidence=60 + no risk signals → healthScore ≤ 80, not 100
 *     C: confidence very low (BLOCKED) → healthScore capped below 70
 *   F-2: totalDebtOutstanding surface finding when EMI is absent
 *   F-5: FIN_OPP_DATA_QUALITY evidence lists specific missing fields, not a generic string
 *
 * Tests A-G correspond to the seven invariant cases in the investigation brief.
 */
import { describe, it, expect } from "vitest";
import { computeFinancialMetrics, diagnoseFinanceSnapshot } from "@/domain/owner-finance";
import type { FinancialSnapshotInput } from "@/domain/owner-finance";

/** Fixed reference date so staleness is deterministic. */
const NOW = new Date("2026-08-01T00:00:00.000Z");

/** All 11 IMPORTANT_FIELDS present, fresh, valid currency, no risk signals. Confidence = 100. */
function completeHealthy(): FinancialSnapshotInput {
  return {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    currency: "INR",
    revenue: 100000,
    costOfGoodsOrServices: 5000,
    fixedCosts: 30000,
    salaryPayroll: 20000,
    loanEmiDebtPayments: 0,
    cashOnHand: 200000,
    receivables: 0,
    payables: 0,
    ownerWithdrawals: 5000,
    orderCount: 1000,
    customerCount: 200,
    discountAmount: 0,
    refundAmount: 0,
  };
}

/**
 * 3 IMPORTANT_FIELDS present (costOfGoodsOrServices, salaryPayroll, orderCount),
 * 8 missing → confidence = 60 (MEDIUM). No risk signals.
 */
function lowConfidenceNoRisk(): FinancialSnapshotInput {
  return {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    currency: "INR",
    revenue: 100000,
    costOfGoodsOrServices: 0,   // IMPORTANT: present
    salaryPayroll: 20000,        // IMPORTANT: present (also makes fixedCostsTotal=20000 via sum)
    cashOnHand: 200000,
    orderCount: 100,             // IMPORTANT: present
    // fixedCosts, loanEmiDebtPayments, receivables, payables, ownerWithdrawals,
    // customerCount, discountAmount, refundAmount — all absent (8 × 5 = 40 penalty → score 60)
  };
}

/**
 * Only revenue + cashOnHand. No cost info → "costs" critical missing.
 * Only orderCount as IMPORTANT present. Confidence = 100 - 30 (critical) - 50 (10 important) = 20.
 */
function veryLowConfidence(): FinancialSnapshotInput {
  return {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    currency: "INR",
    revenue: 100000,
    cashOnHand: 50000,
    orderCount: 100, // one IMPORTANT present → 10 missing × 5 = 50 + 1 critical missing × 30 = 80 penalty
  };
}

// ---------------------------------------------------------------------------
// Test A: 100% complete healthy business → health score can approach 100
// ---------------------------------------------------------------------------

describe("A — complete healthy snapshot → healthScore approaches 100", () => {
  it("returns confidence=100 when all IMPORTANT fields are present and snapshot is fresh", () => {
    const m = computeFinancialMetrics(completeHealthy(), { now: NOW });
    expect(m.dataConfidenceScore).toBe(100);
  });

  it("returns a high healthScore (≥ 90) with full data and no risk signals", () => {
    const m = computeFinancialMetrics(completeHealthy(), { now: NOW });
    expect(m.financialHealthScore).toBeGreaterThanOrEqual(90);
  });

  it("returns survivalState=SAFE with full data and no risk signals", () => {
    const m = computeFinancialMetrics(completeHealthy(), { now: NOW });
    expect(m.survivalState).toBe("SAFE");
  });
});

// ---------------------------------------------------------------------------
// Test B: confidence=60, no risk signals → healthScore must NOT be 100
// ---------------------------------------------------------------------------

describe("B — confidence=60 with no risk signals → healthScore ≤ 80, state=WATCH", () => {
  it("computes dataConfidenceScore=60", () => {
    const m = computeFinancialMetrics(lowConfidenceNoRisk(), { now: NOW });
    expect(m.dataConfidenceScore).toBe(60);
  });

  it("caps healthScore at 80 (floor(50 + 60/2)) — not 100", () => {
    const m = computeFinancialMetrics(lowConfidenceNoRisk(), { now: NOW });
    expect(m.financialHealthScore).toBeLessThanOrEqual(80);
    expect(m.financialHealthScore).not.toBe(100);
  });

  it("returns survivalState=WATCH when confidence < 70 and no hard risk triggers", () => {
    const m = computeFinancialMetrics(lowConfidenceNoRisk(), { now: NOW });
    expect(m.survivalState).toBe("WATCH");
  });

  it("riskScore=0 (no risk signals fire on null inputs)", () => {
    const m = computeFinancialMetrics(lowConfidenceNoRisk(), { now: NOW });
    expect(m.financialRiskScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test C: very low confidence → unknown inputs do NOT produce a healthy score
// ---------------------------------------------------------------------------

describe("C — very low confidence → UNKNOWN ≠ HEALTHY", () => {
  it("computes a BLOCKED-tier confidence score (< 30)", () => {
    const m = computeFinancialMetrics(veryLowConfidence(), { now: NOW });
    expect(m.dataConfidenceScore).toBeLessThan(30);
  });

  it("caps healthScore well below 100 even with no computable risk signals", () => {
    const m = computeFinancialMetrics(veryLowConfidence(), { now: NOW });
    expect(m.financialHealthScore).toBeLessThan(70);
    expect(m.financialHealthScore).not.toBe(100);
  });

  it("returns WATCH state — not SAFE — when confidence is very low", () => {
    const m = computeFinancialMetrics(veryLowConfidence(), { now: NOW });
    expect(m.survivalState).toBe("WATCH");
    expect(m.survivalState).not.toBe("SAFE");
  });
});

// ---------------------------------------------------------------------------
// Test D: high confidence + genuinely healthy → strong SAFE
// ---------------------------------------------------------------------------

describe("D — high confidence (100) + no risk signals → SAFE with uncapped healthScore", () => {
  it("returns survivalState=SAFE", () => {
    const m = computeFinancialMetrics(completeHealthy(), { now: NOW });
    expect(m.survivalState).toBe("SAFE");
  });

  it("returns uncapped healthScore (≥ raw score — no ceiling when confidence ≥ 85)", () => {
    const m = computeFinancialMetrics(completeHealthy(), { now: NOW });
    // With confidence=100, ceiling formula does not apply; score is purely risk+margin driven.
    expect(m.dataConfidenceScore).toBeGreaterThanOrEqual(85);
    expect(m.financialHealthScore).toBeGreaterThanOrEqual(90);
  });
});

// ---------------------------------------------------------------------------
// Test E: high confidence + material risk → risk is reflected in healthScore
// ---------------------------------------------------------------------------

describe("E — high confidence + material risk → riskScore and healthScore reflect reality", () => {
  const riskInput: FinancialSnapshotInput = {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    currency: "INR",
    revenue: 50000,
    costOfGoodsOrServices: 20000,
    fixedCosts: 50000,
    salaryPayroll: 25000,
    loanEmiDebtPayments: 15000,
    cashOnHand: 5000,
    receivables: 0,
    payables: 0,
    ownerWithdrawals: 0,
    orderCount: 200,
    customerCount: 50,
    discountAmount: 0,
    refundAmount: 0,
  };

  it("computes high confidence (all IMPORTANT fields present)", () => {
    const m = computeFinancialMetrics(riskInput, { now: NOW });
    expect(m.dataConfidenceScore).toBeGreaterThanOrEqual(85);
  });

  it("produces a non-zero riskScore when hard risk signals fire", () => {
    const m = computeFinancialMetrics(riskInput, { now: NOW });
    expect(m.financialRiskScore).toBeGreaterThan(0);
  });

  it("produces a materially lower healthScore than a healthy business", () => {
    const healthy = computeFinancialMetrics(completeHealthy(), { now: NOW });
    const risky = computeFinancialMetrics(riskInput, { now: NOW });
    expect(risky.financialHealthScore).toBeLessThan(healthy.financialHealthScore);
    expect(risky.financialHealthScore).toBeLessThan(60);
  });

  it("survival state escalates to AT_RISK or worse", () => {
    const m = computeFinancialMetrics(riskInput, { now: NOW });
    const RANK = { SAFE: 0, WATCH: 1, AT_RISK: 2, CRITICAL: 3, INSOLVENT_RISK: 4 };
    expect(RANK[m.survivalState]).toBeGreaterThanOrEqual(RANK["AT_RISK"]);
  });
});

// ---------------------------------------------------------------------------
// Test F: totalDebtOutstanding present + zero EMI → debt-service metric null,
//          FIN_NOTABLE_OUTSTANDING_DEBT finding emitted as context
// ---------------------------------------------------------------------------

describe("F — outstanding principal + no EMI → context finding, not pressure signal", () => {
  const debtContextInput: FinancialSnapshotInput = {
    ...completeHealthy(),
    totalDebtOutstanding: 1_100_000,
    loanEmiDebtPayments: undefined, // no EMI provided
  };

  it("debtServicePressurePct is null (cannot be computed without EMI)", () => {
    const m = computeFinancialMetrics(debtContextInput, { now: NOW });
    expect(m.debtServicePressurePct).toBeNull();
  });

  it("emits FIN_NOTABLE_OUTSTANDING_DEBT as an informational opportunity finding", () => {
    const r = diagnoseFinanceSnapshot(debtContextInput, { now: NOW });
    const codes = r.opportunityFindings.map((f) => f.code);
    expect(codes).toContain("FIN_NOTABLE_OUTSTANDING_DEBT");
  });

  it("FIN_NOTABLE_OUTSTANDING_DEBT has severity=low and sourceValue=1100000", () => {
    const r = diagnoseFinanceSnapshot(debtContextInput, { now: NOW });
    const f = r.opportunityFindings.find((x) => x.code === "FIN_NOTABLE_OUTSTANDING_DEBT");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("low");
    expect(f!.sourceValue).toBe(1_100_000);
  });

  it("does NOT emit FIN_HIGH_DEBT_PRESSURE risk finding (no EMI = no pressure signal)", () => {
    const r = diagnoseFinanceSnapshot(debtContextInput, { now: NOW });
    const riskCodes = r.riskFindings.map((f) => f.code);
    expect(riskCodes).not.toContain("FIN_HIGH_DEBT_PRESSURE");
  });

  it("does NOT emit FIN_NOTABLE_OUTSTANDING_DEBT when EMI is also provided", () => {
    const withEmi: FinancialSnapshotInput = { ...debtContextInput, loanEmiDebtPayments: 10000 };
    const r = diagnoseFinanceSnapshot(withEmi, { now: NOW });
    const codes = r.opportunityFindings.map((f) => f.code);
    expect(codes).not.toContain("FIN_NOTABLE_OUTSTANDING_DEBT");
  });
});

// ---------------------------------------------------------------------------
// Test G: data quality action gives concrete missing field names
// ---------------------------------------------------------------------------

describe("G — FIN_OPP_DATA_QUALITY evidence names specific missing IMPORTANT fields", () => {
  const partialInput: FinancialSnapshotInput = {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    currency: "INR",
    revenue: 100000,
    costOfGoodsOrServices: 5000,  // IMPORTANT: present
    fixedCosts: 30000,             // IMPORTANT: present
    salaryPayroll: 20000,          // IMPORTANT: present
    loanEmiDebtPayments: 0,        // IMPORTANT: present
    cashOnHand: 200000,
    // receivables, payables, ownerWithdrawals, orderCount, customerCount,
    // discountAmount, refundAmount — all absent (7 missing × 5 = 35 penalty → score=65)
  };

  it("emits FIN_OPP_DATA_QUALITY (confidence < 100)", () => {
    const r = diagnoseFinanceSnapshot(partialInput, { now: NOW });
    const codes = r.opportunityFindings.map((f) => f.code);
    expect(codes).toContain("FIN_OPP_DATA_QUALITY");
  });

  it("evidence[1] names specific missing IMPORTANT fields — not the generic fallback string", () => {
    const r = diagnoseFinanceSnapshot(partialInput, { now: NOW });
    const f = r.opportunityFindings.find((x) => x.code === "FIN_OPP_DATA_QUALITY");
    expect(f).toBeDefined();
    const evidenceLine = f!.evidence[1];
    expect(evidenceLine).not.toBe("some non-critical fields missing");
    // Should reference at least one of the known-missing fields
    expect(evidenceLine).toContain("receivables");
  });

  it("evidence[1] lists multiple missing fields when several are absent", () => {
    const r = diagnoseFinanceSnapshot(partialInput, { now: NOW });
    const f = r.opportunityFindings.find((x) => x.code === "FIN_OPP_DATA_QUALITY")!;
    const evidenceLine = f.evidence[1];
    // At least payables and ownerWithdrawals are also missing
    expect(evidenceLine).toContain("payables");
    expect(evidenceLine).toContain("ownerWithdrawals");
  });

  it("evidence[1] does NOT include fields that are already provided", () => {
    const r = diagnoseFinanceSnapshot(partialInput, { now: NOW });
    const f = r.opportunityFindings.find((x) => x.code === "FIN_OPP_DATA_QUALITY")!;
    const evidenceLine = f.evidence[1];
    // These are present in partialInput → must not appear as missing
    expect(evidenceLine).not.toContain("fixedCosts");
    expect(evidenceLine).not.toContain("salaryPayroll");
    expect(evidenceLine).not.toContain("loanEmiDebtPayments");
  });
});
