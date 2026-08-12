/**
 * FINANCE SCORING INVARIANTS — Regression Tests
 *
 * Covers the defects identified in the OPSIQ OWNER PILOT scoring quality investigation
 * (production cycle 7c729460-ca52-46b5-82b1-b65f538d891a):
 *
 *   F-1/F-3: Confidence ceiling — UNKNOWN ≠ HEALTHY
 *     B: confidence=60 + no risk signals → healthScore ≤ 80, not 100
 *     C: confidence very low (BLOCKED) → healthScore capped below 70
 *   F-2: totalDebtOutstanding surface finding when EMI is absent (engine-level only)
 *   F-5: FIN_OPP_DATA_QUALITY evidence uses owner-facing labels, not generic string
 *
 * Suites A–G: original invariant cases from the investigation brief.
 * Suite H: survival confidence boundary tests (confirming canonical 70 threshold).
 * Suite I: health-score ceiling monotonicity and tier-boundary behavior.
 * Suite J: confirmed zero-repayment debt — no false data-gap finding.
 * Suite K: Trinity-shaped local verification (no production IDs).
 */
import { describe, it, expect } from "vitest";
import {
  computeFinancialMetrics,
  diagnoseFinanceSnapshot,
  healthScoreCeiling,
} from "@/domain/owner-finance";
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
 * 3 IMPORTANT_FIELDS present (costOfGoodsOrServices, loanEmiDebtPayments, orderCount),
 * 8 missing → confidence = 60 (MEDIUM). No risk signals.
 *
 * variableCosts (not in IMPORTANT_FIELDS) satisfies the "costs" critical requirement
 * without covering the fixedCosts component slot. salaryPayroll is intentionally absent
 * so fixedCostsCoveredByComponents() returns false — keeping fixedCosts as a genuine
 * missing IMPORTANT field and the confidence at exactly 60.
 */
function lowConfidenceNoRisk(): FinancialSnapshotInput {
  return {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    currency: "INR",
    revenue: 100000,
    costOfGoodsOrServices: 0,   // IMPORTANT: present
    variableCosts: 20000,        // satisfies "costs" critical; NOT in IMPORTANT_FIELDS
    loanEmiDebtPayments: 0,      // IMPORTANT: present (confirmed zero)
    cashOnHand: 200000,
    orderCount: 100,             // IMPORTANT: present
    // fixedCosts, salaryPayroll, receivables, payables, ownerWithdrawals,
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
    orderCount: 100,
  };
}

// ---------------------------------------------------------------------------
// Confidence-parameterized fixtures
// All critical fields present. Confidence = 100 − (5 × missingImportant).
// ---------------------------------------------------------------------------

/**
 * N IMPORTANT missing (from 11 total). All critical fields present.
 * confidence = 100 - 5 * N (must be multiple of 5).
 */
function withImportantMissing(n: number): FinancialSnapshotInput {
  // Start from completeHealthy (all 11 IMPORTANT present), then strip the last N.
  const base = completeHealthy();
  const stripped: Partial<FinancialSnapshotInput> = { ...base };
  const toStrip: (keyof FinancialSnapshotInput)[] = [
    "refundAmount",        // strip first
    "discountAmount",
    "customerCount",
    "orderCount",
    "ownerWithdrawals",
    "payables",
    "receivables",
    "loanEmiDebtPayments",
    "salaryPayroll",
    "fixedCosts",
    "costOfGoodsOrServices",
  ];
  for (let i = 0; i < n; i++) {
    if (i < toStrip.length) delete (stripped as Record<string, unknown>)[toStrip[i]];
  }
  // Restore critical cost coverage if costOfGoodsOrServices is stripped
  // (must satisfy the "hasCost" critical check via fixedCosts or salaryPayroll).
  // The order above strips costOfGoodsOrServices last, so salaryPayroll + fixedCosts remain
  // for most test cases. Only at N=11 are all cost sources stripped — but we never test that here.
  return stripped as FinancialSnapshotInput;
}

// Achievable exact confidence values via withImportantMissing:
// N=0 → 100, N=1 → 95, N=2 → 90, N=3 → 85, N=4 → 80,
// N=5 → 75, N=6 → 70, N=7 → 65, N=8 → 60, N=9 → 55, N=10 → 50

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

  it("caps healthScore at 80 (floor(50+60/2)) — not 100", () => {
    const m = computeFinancialMetrics(lowConfidenceNoRisk(), { now: NOW });
    expect(m.financialHealthScore).toBeLessThanOrEqual(80);
    expect(m.financialHealthScore).not.toBe(100);
  });

  it("returns survivalState=WATCH when confidence=60 (below 70 gate)", () => {
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

  it("returns healthScore ≥ 90 (ceiling(100)=100 — no practical cap for complete data)", () => {
    const m = computeFinancialMetrics(completeHealthy(), { now: NOW });
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
// Test F: outstanding debt (engine-level)
// ---------------------------------------------------------------------------

describe("F — outstanding principal + no EMI → context finding (engine-level)", () => {
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

  it("does NOT emit FIN_NOTABLE_OUTSTANDING_DEBT when EMI is explicitly provided", () => {
    const withEmi: FinancialSnapshotInput = { ...debtContextInput, loanEmiDebtPayments: 10000 };
    const r = diagnoseFinanceSnapshot(withEmi, { now: NOW });
    const codes = r.opportunityFindings.map((f) => f.code);
    expect(codes).not.toContain("FIN_NOTABLE_OUTSTANDING_DEBT");
  });
});

// ---------------------------------------------------------------------------
// Test G: data quality action gives concrete owner-facing labels
// ---------------------------------------------------------------------------

describe("G — FIN_OPP_DATA_QUALITY evidence uses owner-facing labels, not generic string", () => {
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

  it("evidence[1] uses owner-facing labels — not the generic fallback string", () => {
    const r = diagnoseFinanceSnapshot(partialInput, { now: NOW });
    const f = r.opportunityFindings.find((x) => x.code === "FIN_OPP_DATA_QUALITY");
    expect(f).toBeDefined();
    const evidenceLine = f!.evidence[1];
    expect(evidenceLine).not.toBe("some non-critical fields missing");
    expect(evidenceLine).toContain("Receivables");
  });

  it("evidence[1] lists multiple missing fields with human-readable names", () => {
    const r = diagnoseFinanceSnapshot(partialInput, { now: NOW });
    const f = r.opportunityFindings.find((x) => x.code === "FIN_OPP_DATA_QUALITY")!;
    const evidenceLine = f.evidence[1];
    expect(evidenceLine).toContain("Payables");
    expect(evidenceLine).toContain("Owner Withdrawals");
  });

  it("evidence[1] does NOT include fields that are already provided", () => {
    const r = diagnoseFinanceSnapshot(partialInput, { now: NOW });
    const f = r.opportunityFindings.find((x) => x.code === "FIN_OPP_DATA_QUALITY")!;
    const evidenceLine = f.evidence[1];
    // These are present in partialInput → must not appear as missing
    expect(evidenceLine).not.toContain("Fixed Costs");
    expect(evidenceLine).not.toContain("Payroll");
    expect(evidenceLine).not.toContain("Loan / EMI");
  });
});

// ---------------------------------------------------------------------------
// Suite H: survival confidence boundary — canonical 70 threshold
// ---------------------------------------------------------------------------

describe("H — survivalState confidence boundary at 70 (canonical cross-domain threshold)", () => {
  // confidence=65: 7 IMPORTANT missing (N=7), all critical present
  it("confidence=65 (below 70) → WATCH, never SAFE", () => {
    const m = computeFinancialMetrics(withImportantMissing(7), { now: NOW });
    expect(m.dataConfidenceScore).toBe(65);
    expect(m.survivalState).toBe("WATCH");
  });

  // confidence=70: 6 IMPORTANT missing (N=6), all critical present
  it("confidence=70 (at threshold) → SAFE when no risk signals and no secondary WATCH", () => {
    const m = computeFinancialMetrics(withImportantMissing(6), { now: NOW });
    expect(m.dataConfidenceScore).toBe(70);
    expect(m.survivalState).toBe("SAFE");
  });

  // confidence=80: 4 IMPORTANT missing (N=4)
  it("confidence=80 → SAFE when no risk signals", () => {
    const m = computeFinancialMetrics(withImportantMissing(4), { now: NOW });
    expect(m.dataConfidenceScore).toBe(80);
    expect(m.survivalState).toBe("SAFE");
  });

  // confidence=85: 3 IMPORTANT missing (N=3) → HIGH tier
  it("confidence=85 (HIGH tier) → SAFE when no risk signals", () => {
    const m = computeFinancialMetrics(withImportantMissing(3), { now: NOW });
    expect(m.dataConfidenceScore).toBe(85);
    expect(m.survivalState).toBe("SAFE");
  });

  it("survivalState transitions from WATCH→SAFE exactly at confidence=70 for an otherwise safe business", () => {
    const at69 = computeFinancialMetrics(withImportantMissing(7), { now: NOW }); // 65, closest below 70
    const at70 = computeFinancialMetrics(withImportantMissing(6), { now: NOW }); // 70
    expect(at69.survivalState).toBe("WATCH");
    expect(at70.survivalState).toBe("SAFE");
  });

  it("high-confidence, genuinely risky business is not promoted to SAFE by high confidence alone", () => {
    const risky: FinancialSnapshotInput = {
      ...completeHealthy(), // confidence=100
      revenue: 50000,
      fixedCosts: 80000, // fixed burden > threshold
      variableCosts: 30000,
      cashOnHand: 3000,
    };
    const m = computeFinancialMetrics(risky, { now: NOW });
    expect(m.dataConfidenceScore).toBeGreaterThanOrEqual(85);
    expect(m.survivalState).not.toBe("SAFE");
  });
});

// ---------------------------------------------------------------------------
// Suite I: health score ceiling — formula behavior and monotonicity
// ---------------------------------------------------------------------------

describe("I — healthScoreCeiling() and score-confidence monotonicity", () => {
  // healthScoreCeiling formula: floor(50 + confidence/2) for all confidence values [0, 100] (no special case at 85).

  it("ceiling=50 at confidence=0 (neutral/unknown baseline)", () => {
    expect(healthScoreCeiling(0)).toBe(50);
  });

  it("ceiling=57 at confidence=15", () => {
    expect(healthScoreCeiling(15)).toBe(57);
  });

  it("ceiling=65 at confidence=30", () => {
    expect(healthScoreCeiling(30)).toBe(65);
  });

  it("ceiling=74 at confidence=49", () => {
    expect(healthScoreCeiling(49)).toBe(74);
  });

  it("ceiling=75 at confidence=50", () => {
    expect(healthScoreCeiling(50)).toBe(75);
  });

  it("ceiling=79 at confidence=59", () => {
    expect(healthScoreCeiling(59)).toBe(79);
  });

  it("ceiling=80 at confidence=60 (Trinity result)", () => {
    expect(healthScoreCeiling(60)).toBe(80);
  });

  it("ceiling=84 at confidence=69", () => {
    expect(healthScoreCeiling(69)).toBe(84);
  });

  it("ceiling=85 at confidence=70 (canonical actionability threshold)", () => {
    expect(healthScoreCeiling(70)).toBe(85);
  });

  it("ceiling=92 at confidence=84", () => {
    expect(healthScoreCeiling(84)).toBe(92);
  });

  it("ceiling=92 at confidence=85 (continuous formula — no tier jump)", () => {
    expect(healthScoreCeiling(85)).toBe(92);
  });

  it("ceiling=100 at confidence=100 (complete data — no practical cap)", () => {
    expect(healthScoreCeiling(100)).toBe(100);
  });

  it("ceiling is monotonically non-decreasing (higher confidence → higher or equal ceiling)", () => {
    const values = [0, 10, 20, 30, 40, 50, 60, 70, 80, 84, 85, 90, 95, 100];
    for (let i = 1; i < values.length; i++) {
      const lo = healthScoreCeiling(values[i - 1]);
      const hi = healthScoreCeiling(values[i]);
      expect(hi).toBeGreaterThanOrEqual(lo);
    }
  });

  it("ceiling is continuous across 84→85 boundary — both return 92 (no jump)", () => {
    expect(healthScoreCeiling(84)).toBe(92);
    expect(healthScoreCeiling(85)).toBe(92);
  });

  // End-to-end: risk-free, good-margin business at achievable confidence values
  it("healthScore at confidence=65 ≤ 82 and not 100 (WATCH state)", () => {
    const m = computeFinancialMetrics(withImportantMissing(7), { now: NOW });
    expect(m.dataConfidenceScore).toBe(65);
    expect(m.financialHealthScore).toBeLessThanOrEqual(82);
    expect(m.financialHealthScore).not.toBe(100);
  });

  it("healthScore at confidence=70 ≤ 85 (ceiling applies, SAFE state)", () => {
    const m = computeFinancialMetrics(withImportantMissing(6), { now: NOW });
    expect(m.dataConfidenceScore).toBe(70);
    expect(m.financialHealthScore).toBeLessThanOrEqual(85);
  });

  it("healthScore at confidence=80 ≤ 90 (ceiling applies)", () => {
    const m = computeFinancialMetrics(withImportantMissing(4), { now: NOW });
    expect(m.dataConfidenceScore).toBe(80);
    expect(m.financialHealthScore).toBeLessThanOrEqual(90);
  });

  it("healthScore at confidence=85 has ceiling=92; strong healthy business scores ≥ 90", () => {
    const m = computeFinancialMetrics(withImportantMissing(3), { now: NOW });
    expect(m.dataConfidenceScore).toBe(85);
    expect(m.financialHealthScore).toBeGreaterThanOrEqual(90);
  });

  it("healthScore at confidence=100 (complete data) is uncapped and ≥ 90 for genuinely healthy", () => {
    const m = computeFinancialMetrics(completeHealthy(), { now: NOW });
    expect(m.dataConfidenceScore).toBe(100);
    expect(m.financialHealthScore).toBeGreaterThanOrEqual(90);
  });

  it("score-confidence monotonicity: identical business, increasing confidence → non-decreasing health", () => {
    // Build snapshots with progressively more IMPORTANT fields filled (confidence increases).
    // Use a genuinely healthy base so raw score stays constant at 100.
    // As ceiling rises, reported score should be non-decreasing.
    const ns = [10, 8, 6, 4, 3, 0]; // IMPORTANT missing: confidence = 50, 60, 70, 80, 85, 100
    const scores = ns.map((n) => computeFinancialMetrics(withImportantMissing(n), { now: NOW }).financialHealthScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite J: confirmed zero-repayment debt — no false data-gap finding
// ---------------------------------------------------------------------------

describe("J — confirmed zero-repayment debt does not trigger FIN_NOTABLE_OUTSTANDING_DEBT", () => {
  const confirmedZeroEmi: FinancialSnapshotInput = {
    ...completeHealthy(),
    totalDebtOutstanding: 1_100_000,
    loanEmiDebtPayments: 0, // confirmed: no fixed monthly repayment
  };

  it("debtServicePressurePct=0 (confirmed zero EMI produces zero pressure, not null)", () => {
    const m = computeFinancialMetrics(confirmedZeroEmi, { now: NOW });
    expect(m.debtServicePressurePct).toBe(0);
  });

  it("does NOT emit FIN_NOTABLE_OUTSTANDING_DEBT when EMI is confirmed as 0", () => {
    const r = diagnoseFinanceSnapshot(confirmedZeroEmi, { now: NOW });
    const codes = r.opportunityFindings.map((f) => f.code);
    expect(codes).not.toContain("FIN_NOTABLE_OUTSTANDING_DEBT");
  });

  it("does NOT emit FIN_HIGH_DEBT_PRESSURE (zero EMI = zero pressure signal)", () => {
    const r = diagnoseFinanceSnapshot(confirmedZeroEmi, { now: NOW });
    const riskCodes = r.riskFindings.map((f) => f.code);
    expect(riskCodes).not.toContain("FIN_HIGH_DEBT_PRESSURE");
  });

  it("survivalState remains SAFE (zero EMI does not degrade state)", () => {
    const m = computeFinancialMetrics(confirmedZeroEmi, { now: NOW });
    expect(m.survivalState).toBe("SAFE");
  });

  it("FIN_NOTABLE_OUTSTANDING_DEBT DOES fire when principal is present and EMI is absent", () => {
    const unknownEmi: FinancialSnapshotInput = {
      ...completeHealthy(),
      totalDebtOutstanding: 1_100_000,
      loanEmiDebtPayments: undefined,
    };
    const r = diagnoseFinanceSnapshot(unknownEmi, { now: NOW });
    const codes = r.opportunityFindings.map((f) => f.code);
    expect(codes).toContain("FIN_NOTABLE_OUTSTANDING_DEBT");
  });
});

// ---------------------------------------------------------------------------
// Suite K: Trinity-shaped local engine verification (no production IDs)
// ---------------------------------------------------------------------------

describe("K — Trinity-shaped local engine verification", () => {
  // Matches the production Trinity snapshot values as described in the investigation.
  // After fix: monthlyRepayment=0 is mapped to loanEmiDebtPayments=0 by the
  // diagnosis service enrichment. At engine level we supply it directly here.
  const trinity: FinancialSnapshotInput = {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    currency: "INR",
    industryTemplate: "laundry_local_service",
    revenue: 265076,
    costOfGoodsOrServices: 26683,
    rent: 25000,
    salaryPayroll: 101000,
    utilities: 19760,
    cashOnHand: 0,
    bankBalance: 129923.99,
    totalDebtOutstanding: 1_100_000,
    loanEmiDebtPayments: 0,   // confirmed zero-repayment from intake monthlyRepayment=0
    // Missing IMPORTANT: fixedCosts (computed from rent+salary+utilities), receivables,
    // payables, ownerWithdrawals, orderCount, customerCount, discountAmount, refundAmount
    // fixedCosts absent — engine derives from rent+salary+utilities = 145760
  };

  it("dataConfidenceScore=65 (7 IMPORTANT missing — fixedCosts satisfied by rent+salary+utilities components)", () => {
    const m = computeFinancialMetrics(trinity, { now: NOW });
    expect(m.dataConfidenceScore).toBe(65);
  });

  it("financialHealthScore=82 (raw=100 capped by ceiling(65)=82)", () => {
    const m = computeFinancialMetrics(trinity, { now: NOW });
    expect(m.financialHealthScore).toBe(82);
  });

  it("financialRiskScore=0 (no risk signals fire for Trinity)", () => {
    const m = computeFinancialMetrics(trinity, { now: NOW });
    expect(m.financialRiskScore).toBe(0);
  });

  it("survivalState=WATCH (confidence=65 < 70 gate)", () => {
    const m = computeFinancialMetrics(trinity, { now: NOW });
    expect(m.survivalState).toBe("WATCH");
  });

  it("debtServicePressurePct=0 (loanEmiDebtPayments=0, confirmed zero-repayment)", () => {
    const m = computeFinancialMetrics(trinity, { now: NOW });
    expect(m.debtServicePressurePct).toBe(0);
  });

  it("fixedCostBurdenPct=~55 (145760/265076) — just at laundry threshold, no highFixedBurden signal", () => {
    const m = computeFinancialMetrics(trinity, { now: NOW });
    // 145760 / 265076 * 100 = 54.98% — below the laundry threshold (55%), no signal
    expect(m.fixedCostBurdenPct).toBeCloseTo(54.98, 1);
  });

  it("netMarginPct ≈ 34.9% (profitable service business)", () => {
    const m = computeFinancialMetrics(trinity, { now: NOW });
    expect(m.netMarginPct).toBeCloseTo(34.9, 0);
  });

  it("does NOT emit FIN_NOTABLE_OUTSTANDING_DEBT (EMI is confirmed as 0)", () => {
    const r = diagnoseFinanceSnapshot(trinity, { now: NOW });
    const codes = r.opportunityFindings.map((f) => f.code);
    expect(codes).not.toContain("FIN_NOTABLE_OUTSTANDING_DEBT");
  });

  it("emits FIN_OPP_DATA_QUALITY with human-readable missing field labels", () => {
    const r = diagnoseFinanceSnapshot(trinity, { now: NOW });
    const f = r.opportunityFindings.find((x) => x.code === "FIN_OPP_DATA_QUALITY");
    expect(f).toBeDefined();
    const evidenceLine = f!.evidence[1];
    expect(evidenceLine).not.toBe("some non-critical fields missing");
    // Should mention human-readable labels for the missing fields
    expect(evidenceLine).toMatch(/Receivables|Payables|Order Count/);
  });
});
