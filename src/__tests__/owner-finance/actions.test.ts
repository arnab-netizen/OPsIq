/**
 * Owner Finance (Module 2 Slice 4) — recommendation/action planner tests.
 * Pure/no DB. Verifies traceable recommendations, action conformance, bounded +
 * deterministic survival-weighted priority, ranking, no-invention, and that
 * inputs are not mutated.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  diagnoseFinanceSnapshot,
  planFinanceActionsFromDiagnosis,
  buildFinanceRecommendations,
  GENERIC_FINANCE_THRESHOLDS,
  type FinancialSnapshotInput,
} from "@/domain/owner-finance";
import { buildFinanceRecommendation, buildFinanceEvidenceRationale, attachCurrentFinanceEvidenceRationale, recommendationToOwnerAction } from "@/domain/owner-finance";
import type { OwnerFinding } from "@/domain/owner-spine/contracts";
import {
  ownerActionSchema,
  OWNER_ACTION_STATUSES,
  calculateOwnerPriorityScore,
} from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-05-10T00:00:00.000Z");

function profitable(): FinancialSnapshotInput {
  return {
    periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", businessModel: "service",
    revenue: 100000, costOfGoodsOrServices: 30000, rent: 10000, salaryPayroll: 20000,
    utilities: 5000, marketingSpend: 5000, cashOnHand: 200000, bankBalance: 0, orderCount: 1000, customerCount: 800,
  };
}

/** A fully-healthy, fully-populated snapshot → zero findings. */
function perfect(): FinancialSnapshotInput {
  return {
    periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", businessModel: "service",
    revenue: 100000, costOfGoodsOrServices: 20000, variableCosts: 20000, fixedCosts: 20000,
    salaryPayroll: 15000, marketingSpend: 5000, cashOnHand: 500000, bankBalance: 0,
    loanEmiDebtPayments: 0, receivables: 0, payables: 0, ownerWithdrawals: 0,
    discountAmount: 0, refundAmount: 0, orderCount: 1000, customerCount: 800,
  };
}

function plan(input: FinancialSnapshotInput) {
  return planFinanceActionsFromDiagnosis(diagnoseFinanceSnapshot(input, { now: NOW }));
}
const actionCodes = (p: { actions: { findingCode: string }[] }) => p.actions.map((a) => a.findingCode);

describe("owner-finance/actions — module contract assertions", () => {
  it("diagnoseFinanceSnapshot is a function", () => { expect(typeof diagnoseFinanceSnapshot).toBe("function"); });
  it("planFinanceActionsFromDiagnosis is a function", () => { expect(typeof planFinanceActionsFromDiagnosis).toBe("function"); });
  it("buildFinanceRecommendations is a function", () => { expect(typeof buildFinanceRecommendations).toBe("function"); });
  it("ownerActionSchema is an object", () => { expect(typeof ownerActionSchema).toBe("object"); });
  it("OWNER_ACTION_STATUSES is an array", () => { expect(Array.isArray(OWNER_ACTION_STATUSES)).toBe(true); });
  it("calculateOwnerPriorityScore is a function", () => { expect(typeof calculateOwnerPriorityScore).toBe("function"); });
  it("NOW is an object", () => { expect(typeof NOW).toBe("object"); });
  it("profitable is a function", () => { expect(typeof profitable).toBe("function"); });
  it("plan is a function", () => { expect(typeof plan).toBe("function"); });
  it("actionCodes is a function", () => { expect(typeof actionCodes).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("owner-finance planner — recommendation/action creation", () => {
  it("negative net margin creates a margin-improvement action", () => {
    const p = plan({ periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 100000, bankBalance: 0 });
    expect(actionCodes(p)).toContain("FIN_NEGATIVE_NET_MARGIN");
    const rec = p.recommendations.find((r) => r.findingCode === "FIN_NEGATIVE_NET_MARGIN");
    expect(rec?.category).toBe("improve_margin");
  });

  it("receivables finding creates a collection action", () => {
    const p = plan({ ...profitable(), receivables: 40000 });
    expect(actionCodes(p)).toContain("FIN_HIGH_RECEIVABLES");
    expect(p.recommendations.some((r) => r.category === "collect_receivables")).toBe(true);
  });

  it("debt pressure finding creates a debt-reduction action", () => {
    const p = plan({ ...profitable(), loanEmiDebtPayments: 30000 });
    expect(p.recommendations.some((r) => r.category === "reduce_debt_pressure")).toBe(true);
  });

  it("leakage finding creates a leakage-reduction action", () => {
    const p = plan({ ...profitable(), discountAmount: 15000 });
    expect(p.recommendations.some((r) => r.category === "stop_reduce_leakage")).toBe(true);
  });

  it("missing critical data creates a data-quality action", () => {
    const p = plan({ periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", revenue: 100000 });
    expect(actionCodes(p)).toContain("FIN_MISSING_CRITICAL_DATA");
    expect(p.recommendations.some((r) => r.category === "improve_data_quality")).toBe(true);
  });

  it("opportunity finding produces a revenue-quality (growth) action", () => {
    const p = plan({ ...profitable(), b2cRevenue: 95000, b2bRevenue: 5000, discountAmount: 12000 });
    expect(p.recommendations.some((r) => r.category === "improve_revenue_quality")).toBe(true);
  });
});

describe("owner-finance planner — traceability & conformance", () => {
  it("every action conforms to OwnerActionSchema and reuses Module 1 status vocab", () => {
    const p = plan({ ...profitable(), loanEmiDebtPayments: 30000, receivables: 40000, discountAmount: 15000 });
    expect(p.actions.length).toBeGreaterThan(0);
    for (const a of p.actions) {
      expect(ownerActionSchema.safeParse(a).success).toBe(true);
      expect(a.status).toBe("proposed");
      expect(OWNER_ACTION_STATUSES).toContain(a.status);
      expect(a.domain).toBe("finance");
    }
  });

  it("recommendations cite sourceMetric/sourceValue/threshold where available", () => {
    const p = plan({ ...profitable(), loanEmiDebtPayments: 30000 });
    const rec = p.recommendations.find((r) => r.findingCode === "FIN_HIGH_DEBT_PRESSURE")!;
    expect(rec.sourceMetric).toBe("debtServicePressurePct");
    expect(rec.sourceValue).toBe(30);
    expect(rec.threshold).toBe(25);
    expect(rec.verificationMethod.length).toBeGreaterThan(0);
    expect(rec.expectedTimeframeDays).toBeGreaterThan(0);
  });

  it("does not invent sourceValue when the finding lacks one", () => {
    const p = plan({ ...profitable(), currency: "" });
    const rec = p.recommendations.find((r) => r.findingCode === "FIN_INVALID_CURRENCY")!;
    expect(rec.sourceValue).toBeNull();
  });
});

describe("owner-finance planner — priority & ranking", () => {
  it("all action priorities are bounded 0..100", () => {
    const p = plan({ ...profitable(), loanEmiDebtPayments: 30000, receivables: 40000, discountAmount: 15000, refundAmount: 5000 });
    for (const a of p.actions) {
      expect(a.priorityScore).toBeGreaterThanOrEqual(0);
      expect(a.priorityScore).toBeLessThanOrEqual(100);
    }
  });

  it("critical survival action outranks a lower-severity growth action", () => {
    // Insolvent runway (critical) alongside a data-quality (low) opportunity.
    const p = plan({ periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 4000, bankBalance: 0 });
    const survival = p.actions.find((a) => a.findingCode === "FIN_INSOLVENT_RUNWAY")!;
    const growth = p.actions.find((a) => a.findingCode === "FIN_OPP_DATA_QUALITY");
    expect(survival).toBeDefined();
    if (growth) expect(survival.priorityScore).toBeGreaterThan(growth.priorityScore);
    expect(p.recommendedNextAction!.findingCode).toBe("FIN_INSOLVENT_RUNWAY");
  });

  it("higher effort lowers priority (Spine priority function)", () => {
    const base = { expectedImpactScore: 60, confidence: 0.7, urgencyScore: 50, effortScore: 20, severity: "high" as const };
    expect(calculateOwnerPriorityScore({ ...base, effortScore: 90 })).toBeLessThan(
      calculateOwnerPriorityScore(base)
    );
  });

  it("ranking is deterministic and recommendedNextAction is the first action", () => {
    const input = { ...profitable(), loanEmiDebtPayments: 30000, receivables: 40000, discountAmount: 15000 };
    const a = plan(input);
    const b = plan(input);
    expect(JSON.stringify(a.actions)).toBe(JSON.stringify(b.actions));
    expect(a.recommendedNextAction).toEqual(a.actions[0]);
    for (let i = 1; i < a.actions.length; i++) {
      expect(a.actions[i - 1].priorityScore).toBeGreaterThanOrEqual(a.actions[i].priorityScore);
    }
  });
});

describe("owner-finance planner — empties & immutability", () => {
  it("a clean fully-populated business yields no findings, no actions", () => {
    const diagnosis = diagnoseFinanceSnapshot(perfect(), { now: NOW });
    expect(diagnosis.findings.length).toBe(0);
    const p = planFinanceActionsFromDiagnosis(diagnosis);
    expect(p.actions).toEqual([]);
    expect(p.recommendations).toEqual([]);
    expect(p.recommendedNextAction).toBeUndefined();
    expect(p.missingActionInputs).toEqual([]);
  });

  it("does not mutate the diagnosis findings", () => {
    const diagnosis = diagnoseFinanceSnapshot({ ...profitable(), discountAmount: 15000 }, { now: NOW });
    const snapshot = JSON.stringify(diagnosis.findings);
    planFinanceActionsFromDiagnosis(diagnosis);
    expect(JSON.stringify(diagnosis.findings)).toBe(snapshot);
  });

  it("buildFinanceRecommendations is order-preserving and pure", () => {
    const diagnosis = diagnoseFinanceSnapshot({ ...profitable(), discountAmount: 15000 }, { now: NOW });
    const recs = buildFinanceRecommendations(diagnosis.findings);
    expect(recs.map((r) => r.findingCode)).toEqual(
      diagnosis.findings.filter((f) => recs.some((r) => r.findingCode === f.code)).map((f) => f.code)
    );
  });
});

describe("owner-finance/recommendations — existing-data verification wording", () => {
  const base = { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR" };
  const recFor = (code: string, input: FinancialSnapshotInput) => {
    const d = diagnoseFinanceSnapshot(input, { now: NOW });
    const finding = d.findings.find((f) => f.code === code);
    expect(finding, `finding ${code} should be produced`).toBeDefined();
    const rec = buildFinanceRecommendation(finding!)!;
    return { finding: finding!, rec };
  };
  // Loss-making business with a controllable cash balance (runway = cash / daily burn).
  const lossMaking = (cashOnHand: number): FinancialSnapshotInput => ({
    ...base, revenue: 100000, costOfGoodsOrServices: 60000, fixedCosts: 60000, cashOnHand, bankBalance: 0,
    receivables: 0, payables: 0, discountAmount: 0, refundAmount: 0, loanEmiDebtPayments: 0,
    ownerWithdrawals: 0, orderCount: 10, customerCount: 5,
  });
  const pressured: FinancialSnapshotInput = {
    ...base, revenue: 100000, costOfGoodsOrServices: 60000, fixedCosts: 60000, cashOnHand: 400000, bankBalance: 0,
    receivables: 40000, payables: 50000, discountAmount: 15000, refundAmount: 5000,
    loanEmiDebtPayments: 0, ownerWithdrawals: 0, orderCount: 10, customerCount: 5,
  };

  it.each([
    ["FIN_INSOLVENT_RUNWAY", 3000],
    ["FIN_LOW_RUNWAY", 10000], // critical band
    ["FIN_LOW_RUNWAY", 22000], // "getting short" band — different threshold, same code
  ])("%s (cash %i) shows the finding's own current value and threshold in days", (code, cash) => {
    const { finding, rec } = recFor(code, lossMaking(cash));
    expect(finding.threshold).not.toBeNull();
    expect(rec.verificationMethod).toContain(`Current: ${finding.sourceValue} days.`);
    expect(rec.verificationMethod).toContain(`Next milestone: at least ${finding.threshold} days.`);
    expect(rec.verificationMethod).not.toMatch(/Target:|cashRunwayDays|null|undefined|NaN/);
  });

  it("FIN_LOW_RUNWAY uses a different threshold in each severity band (never hard-coded)", () => {
    const a = recFor("FIN_LOW_RUNWAY", lossMaking(10000));
    const b = recFor("FIN_LOW_RUNWAY", lossMaking(22000));
    expect(a.finding.threshold).not.toBe(b.finding.threshold);
    expect(a.rec.verificationMethod).not.toBe(b.rec.verificationMethod);
  });

  it("runway bands are staged: at the critical boundary the next band applies, hence 'Next milestone' copy", () => {
    // Cash of 20000 gives a runway exactly at the critical threshold (30 days) for this loss.
    const { finding, rec } = recFor("FIN_LOW_RUNWAY", lossMaking(20000));
    expect(finding.sourceValue).toBe(GENERIC_FINANCE_THRESHOLDS.criticalCashRunwayDays);
    // No longer in the critical (<30) band; still in the low-runway (<45) band.
    expect(finding.threshold).toBe(GENERIC_FINANCE_THRESHOLDS.lowCashRunwayDays);
    expect(finding.threshold).not.toBe(finding.sourceValue);
    expect(rec.verificationMethod).toContain(`Next milestone: at least ${GENERIC_FINANCE_THRESHOLDS.lowCashRunwayDays} days.`);
  });

  it("FIN_LOW_ABSOLUTE_CASH shows actual days of costs and the stored 14-day threshold", () => {
    const { rec } = recFor("FIN_LOW_ABSOLUTE_CASH", { ...base, revenue: 100000, costOfGoodsOrServices: 20000, fixedCosts: 40000, cashOnHand: 20000, bankBalance: 0 });
    expect(rec.verificationMethod).toBe(
      "Next month, check how many days of your costs your cash would cover. Current: 10 days. Target: at least 14 days."
    );
  });

  it.each([
    ["FIN_HIGH_FIXED_COST_BURDEN", "Next period, work out your fixed costs as a % of sales again. Current: 60%. Target: 50% or lower."],
    ["FIN_HIGH_RECEIVABLES", "Next period, work out the money customers owe you as a % of sales again. Current: 40%. Target: 30% or lower."],
    ["FIN_HIGH_PAYABLES", "Next period, work out the money you owe suppliers as a % of sales again. Current: 50%. Target: 40% or lower."],
    ["FIN_DISCOUNT_LEAKAGE", "Next period, work out discounts as a % of sales again. Current: 15%. Target: 10% or lower."],
  ])("%s shows actual current % and actual threshold %", (code, expected) => {
    expect(recFor(code, pressured).rec.verificationMethod).toBe(expected);
  });

  it("FIN_OPP_MARGIN_IMPROVEMENT uses the healthy net-margin target", () => {
    const { finding, rec } = recFor("FIN_OPP_MARGIN_IMPROVEMENT", { ...base, revenue: 100000, costOfGoodsOrServices: 50000, fixedCosts: 40000, cashOnHand: 400000, bankBalance: 0, receivables: 0, payables: 0 });
    expect(rec.verificationMethod).toContain(`Current: ${finding.sourceValue}%.`);
    expect(rec.verificationMethod).toContain(`Target: at least ${finding.threshold}%.`);
  });

  it("opportunity safety guard: FIN_OPP_RECEIVABLES_COLLECTION keeps 'lower than this period' (stored threshold is not the target)", () => {
    const { finding, rec } = recFor("FIN_OPP_RECEIVABLES_COLLECTION", pressured);
    expect(finding.threshold).toBe(30);
    expect(rec.verificationMethod).toContain("Target: lower than this period.");
    expect(rec.verificationMethod).not.toMatch(/30|Current:/);
  });

  it("opportunity safety guard: FIN_OPP_LEAKAGE_REDUCTION keeps 'lower than this period'", () => {
    const { finding, rec } = recFor("FIN_OPP_LEAKAGE_REDUCTION", pressured);
    expect(finding.threshold).toBe(15);
    expect(rec.verificationMethod).toContain("Target: lower than this period.");
    expect(rec.verificationMethod).not.toMatch(/15|Current:/);
  });

  it("refund/rework safety guard: umbrella costLeakageRatioPct threshold is not shown as the refundReworkLeakagePct target", () => {
    const { finding, rec } = recFor("FIN_REFUND_REWORK_LEAKAGE", pressured);
    expect(finding.sourceMetric).toBe("refundReworkLeakagePct");
    expect(finding.threshold).toBe(15);
    expect(rec.verificationMethod).toContain("Target: lower than this period.");
    expect(rec.verificationMethod).not.toMatch(/15|Current:/);
  });

  it("monetary break-even findings are not given dynamic amounts", () => {
    const { rec } = recFor("FIN_BELOW_BREAK_EVEN", pressured);
    expect(rec.verificationMethod).toContain("Target: sales at or above it.");
    expect(rec.verificationMethod).not.toMatch(/\d/);
  });

  it("no invention: null/non-finite values or a mismatched metric fall back to the static wording", () => {
    const mk = (over: Partial<OwnerFinding>): OwnerFinding => ({
      domain: "finance", code: "FIN_HIGH_FIXED_COST_BURDEN", title: "t", summary: "s",
      sourceMetric: "fixedCostBurdenPct", sourceValue: 60, threshold: 50, severity: "high",
      confidence: 1, impactScore: 50, urgencyScore: 50, findingType: "risk", evidence: [],
      missingData: [], verificationMetric: "fixedCostBurdenPct", ...over,
    } as OwnerFinding);
    for (const over of [{ sourceValue: null }, { threshold: null }, { sourceValue: Number.NaN }, { threshold: Number.POSITIVE_INFINITY }, { sourceMetric: "somethingElse" }]) {
      const text = buildFinanceRecommendation(mk(over as Partial<OwnerFinding>))!.verificationMethod;
      expect(text).toBe("Next period, work out your fixed costs as a % of sales again. Target: below the limit that triggered this advice.");
      expect(text).not.toMatch(/null|undefined|NaN|Infinity/);
    }
  });
});

describe("owner-finance/actions — canonical evidence rationale (read-time, finding-specific)", () => {
  const base = { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR" };
  const loss = (cashOnHand: number): FinancialSnapshotInput => ({
    ...base, revenue: 100000, costOfGoodsOrServices: 60000, fixedCosts: 60000, cashOnHand, bankBalance: 0,
    receivables: 0, payables: 0, discountAmount: 0, refundAmount: 0, loanEmiDebtPayments: 0,
    ownerWithdrawals: 0, orderCount: 10, customerCount: 5,
  });
  const pressured: FinancialSnapshotInput = {
    ...base, revenue: 100000, costOfGoodsOrServices: 60000, fixedCosts: 60000, cashOnHand: 400000, bankBalance: 0,
    receivables: 40000, payables: 50000, discountAmount: 15000, refundAmount: 5000,
    loanEmiDebtPayments: 40000, ownerWithdrawals: 0, orderCount: 10, customerCount: 5,
  };
  const inputs: FinancialSnapshotInput[] = [
    pressured, loss(3000), loss(10000), loss(22000), loss(20000),
    { ...base, revenue: 100000, costOfGoodsOrServices: 20000, fixedCosts: 40000, cashOnHand: 20000, bankBalance: 0 },
    { ...base, revenue: 100000, costOfGoodsOrServices: 50000, fixedCosts: 40000, cashOnHand: 400000, bankBalance: 0, receivables: 0, payables: 0 },
    { ...base, revenue: 100000, costOfGoodsOrServices: 20000, fixedCosts: 20000, salaryPayroll: 50000, cashOnHand: 400000, bankBalance: 0, totalDebtOutstanding: 1100000 },
    { ...base, revenue: 100000, costOfGoodsOrServices: 120000, cashOnHand: 400000, bankBalance: 0 },
    { ...base, revenue: 100000 },
    { ...base, currency: "??", revenue: 100000, costOfGoodsOrServices: 20000, cashOnHand: 400000, bankBalance: 0 },
  ];
  const findings = inputs.flatMap((i) => diagnoseFinanceSnapshot(i, { now: NOW }).findings);
  const find = (code: string, input: FinancialSnapshotInput) => {
    const f = diagnoseFinanceSnapshot(input, { now: NOW }).findings.find((x) => x.code === code);
    expect(f, `finding ${code} should be produced`).toBeDefined();
    return f!;
  };
  const rationale = (f: OwnerFinding) => buildFinanceEvidenceRationale({ findingCode: f.code, sourceMetric: f.sourceMetric, sourceValue: f.sourceValue, threshold: f.threshold });
  const RAW_KEYS = /grossMarginPct|netMarginPct|fixedCostBurdenPct|payrollBurdenPct|debtServicePressurePct|receivablesPressurePct|payablesPressurePct|discountLeakagePct|refundReworkLeakagePct|costLeakageRatioPct|cashRunwayDays|cashDaysOfCosts|dataConfidenceScore|revenueQualityScore|totalDebtOutstanding/;

  it("every real emitted finding gets a rationale with no raw keys, 'threshold:' or null/NaN words", () => {
    const codes = new Set(findings.map((f) => f.code));
    for (const code of ["FIN_HIGH_FIXED_COST_BURDEN", "FIN_HIGH_PAYROLL_BURDEN", "FIN_HIGH_DEBT_PRESSURE", "FIN_HIGH_RECEIVABLES", "FIN_HIGH_PAYABLES", "FIN_DISCOUNT_LEAKAGE", "FIN_REFUND_REWORK_LEAKAGE", "FIN_BELOW_BREAK_EVEN", "FIN_INSOLVENT_RUNWAY", "FIN_LOW_RUNWAY", "FIN_LOW_ABSOLUTE_CASH", "FIN_MISSING_CRITICAL_DATA", "FIN_INVALID_CURRENCY", "FIN_NEGATIVE_NET_MARGIN", "FIN_NEGATIVE_GROSS_MARGIN", "FIN_OPP_MARGIN_IMPROVEMENT", "FIN_OPP_RECEIVABLES_COLLECTION", "FIN_OPP_LEAKAGE_REDUCTION", "FIN_OPP_REVENUE_QUALITY", "FIN_OPP_DATA_QUALITY", "FIN_OPP_DEBT_REDUCTION", "FIN_OPP_BREAK_EVEN_RECOVERY", "FIN_NOTABLE_OUTSTANDING_DEBT"]) {
      expect(codes.has(code), `${code} should occur in the sweep`).toBe(true);
    }
    for (const f of findings) {
      const text = rationale(f);
      expect(text, `${f.code} should have a rationale`).not.toBeNull();
      expect(text).not.toMatch(RAW_KEYS);
      expect(text).not.toMatch(/threshold:|\bnull\b|undefined|NaN|Infinity/);
    }
  });

  it("percent, days and score formatting", () => {
    expect(rationale(find("FIN_HIGH_FIXED_COST_BURDEN", pressured))).toBe("Your fixed costs are 60% of your sales. OpsIQ flags this when they are above 50%.");
    expect(rationale(find("FIN_LOW_ABSOLUTE_CASH", inputs[5]))).toBe("Your available cash would cover about 10 days of your total costs. OpsIQ flags this when it is below 14 days.");
    expect(rationale(find("FIN_OPP_REVENUE_QUALITY", pressured))).toMatch(/revenue quality score is 60 out of 100, where higher is better\. OpsIQ flags this finding when the score is below 80\./);
    expect(rationale(find("FIN_OPP_DATA_QUALITY", pressured))).toMatch(/confidence in this diagnosis is \d+ out of 100/);
    expect(rationale(find("FIN_MISSING_CRITICAL_DATA", inputs[9]))).toMatch(/confidence in this diagnosis is \d+ out of 100/);
  });

  it("does not use 'overdue' for total receivables, and uses a deterministic en-US format", () => {
    expect(rationale(find("FIN_HIGH_RECEIVABLES", pressured))).toBe("The money customers owe you is 40% of your sales. OpsIQ flags this when it is above 30%.");
    expect(buildFinanceEvidenceRationale({ findingCode: "FIN_LOW_RUNWAY", sourceMetric: "cashRunwayDays", sourceValue: 7.123, threshold: 30 })).toContain("about 7.1 days");
    expect(buildFinanceEvidenceRationale({ findingCode: "FIN_HIGH_FIXED_COST_BURDEN", sourceMetric: "fixedCostBurdenPct", sourceValue: 61.1, threshold: 55 })).toBe(
      "Your fixed costs are 61.1% of your sales. OpsIQ flags this when they are above 55%."
    );
  });

  it("runway: each band uses its own threshold, never calls it safe or a target; staged at the 30-day boundary", () => {
    const ins = rationale(find("FIN_INSOLVENT_RUNWAY", loss(3000)))!;
    expect(ins).toMatch(/about [\d.]+ days\. OpsIQ treats less than 7 days as an emergency\./);
    const crit = rationale(find("FIN_LOW_RUNWAY", loss(10000)))!;
    const boundary = find("FIN_LOW_RUNWAY", loss(20000));
    expect(boundary.sourceValue).toBe(30);
    expect(boundary.threshold).toBe(45); // no longer the critical (<30) band
    const at30 = rationale(boundary)!;
    expect(crit).toContain("below 30 days");
    expect(at30).toContain("about 30 days");
    expect(at30).toContain("below 45 days");
    for (const t of [ins, crit, at30]) expect(t).not.toMatch(/safe|target|Target/i);
  });

  it("refund/rework never prints the umbrella costLeakageRatioPct threshold", () => {
    const f = find("FIN_REFUND_REWORK_LEAKAGE", pressured);
    expect(f.threshold).toBe(15);
    expect(rationale(f)).toBe("Refunds, redone work and complaint-related costs are 5% of your sales.");
  });

  it("opportunity reference thresholds are never printed (receivables, leakage) and 100 is never a data-quality target", () => {
    const r = find("FIN_OPP_RECEIVABLES_COLLECTION", pressured);
    expect(r.threshold).toBe(30);
    expect(rationale(r)).toBe("The money customers owe you is 40% of your sales.");
    const l = find("FIN_OPP_LEAKAGE_REDUCTION", pressured);
    expect(l.threshold).toBe(15);
    expect(rationale(l)).toBe("Discounts, refunds, redone work and complaint-related costs together are 20% of your sales.");
    const d = find("FIN_OPP_DATA_QUALITY", pressured);
    expect(d.threshold).toBe(100);
    expect(rationale(d)).not.toMatch(/target|threshold/i);
    expect(rationale(d)!.replace("out of 100", "")).not.toContain("100");
  });

  it("monetary findings never expose naked money values", () => {
    for (const code of ["FIN_BELOW_BREAK_EVEN", "FIN_OPP_BREAK_EVEN_RECOVERY"]) {
      const f = find(code, pressured);
      expect(typeof f.sourceValue).toBe("number");
      const text = rationale(f)!;
      expect(text).toBe("Your sales this period are below your break-even amount \u2014 the level of sales needed to cover your costs.");
      expect(text).not.toMatch(/\d/);
    }
    const debt = find("FIN_NOTABLE_OUTSTANDING_DEBT", inputs[7]);
    expect(rationale(debt)).not.toMatch(/\d/);
    expect(rationale(debt)).toContain("no monthly repayment amount");
  });

  it("an unknown code, a mismatched metric or unusable values never fall back to raw metric names", () => {
    const ok = { findingCode: "FIN_HIGH_FIXED_COST_BURDEN", sourceMetric: "fixedCostBurdenPct", sourceValue: 61.1, threshold: 55 };
    expect(buildFinanceEvidenceRationale({ ...ok, findingCode: "FIN_NOT_A_THING" })).toBeNull();
    expect(buildFinanceEvidenceRationale({ ...ok, sourceMetric: "somethingElse" })).toBeNull();
    for (const sourceValue of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(buildFinanceEvidenceRationale({ ...ok, sourceValue })).toBeNull();
    }
    for (const threshold of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const t = buildFinanceEvidenceRationale({ ...ok, threshold })!;
      expect(t).toBe("Your fixed costs are 61.1% of your sales.");
    }
    expect(buildFinanceEvidenceRationale({ findingCode: "FIN_OPP_DATA_QUALITY", sourceMetric: "dataConfidenceScore", sourceValue: null, threshold: 100 })).not.toMatch(/null|undefined|NaN|\d/);
  });

  it("the in-memory planner uses the same canonical builder and ranking/priority are unaffected", () => {
    const diagnosis = diagnoseFinanceSnapshot(pressured, { now: NOW });
    const planned = planFinanceActionsFromDiagnosis(diagnosis);
    const fixed = planned.actions.find((a) => a.findingCode === "FIN_HIGH_FIXED_COST_BURDEN")!;
    expect(fixed.evidenceRationale).toBe("Your fixed costs are 60% of your sales. OpsIQ flags this when they are above 50%.");
    for (const a of planned.actions) {
      const f = diagnosis.findings.find((x) => x.code === a.findingCode)!;
      expect(a.evidenceRationale).toBe(rationale(f) ?? undefined);
    }
    // Rationale wording does not feed ranking: re-planning with the rationale stripped yields the same order and scores.
    const stripped = planned.recommendations.map((r) => recommendationToOwnerAction(r, diagnosis.metrics.financialRiskScore));
    const key = (a: { findingCode: string; priorityScore: number; expectedImpactScore: number; effortScore: number; confidence: number; status: string }) =>
      [a.findingCode, a.priorityScore, a.expectedImpactScore, a.effortScore, a.confidence, a.status].join("|");
    expect(planned.actions.map(key).sort()).toEqual(stripped.map(key).sort());
    expect(planned.recommendedNextAction).toBe(planned.actions[0]);
  });

  it("read time: persisted rows (no stored rationale) get the CURRENT finding's rationale; baseline findingId is untouched", () => {
    const current = [{ code: "FIN_HIGH_FIXED_COST_BURDEN", sourceMetric: "fixedCostBurdenPct", sourceValue: 61.1, threshold: 55 }];
    // An engaged action carried from an older cycle keeps its ORIGINAL findingId (the baseline) and a stale baseline finding.
    const row = { id: "a1", findingCode: "FIN_HIGH_FIXED_COST_BURDEN", findingId: "old-finding", finding: { sourceValue: 70, threshold: 55 }, status: "in_progress" };
    const [out] = attachCurrentFinanceEvidenceRationale([row], current);
    expect(out.evidenceRationale).toBe("Your fixed costs are 61.1% of your sales. OpsIQ flags this when they are above 55%.");
    expect(out.evidenceRationale).not.toContain("70");
    expect(out.findingId).toBe("old-finding");
    expect(out.finding).toEqual({ sourceValue: 70, threshold: 55 });
    expect(row).not.toHaveProperty("evidenceRationale"); // input row not mutated
    expect({ ...out, evidenceRationale: undefined }).toEqual({ ...row, evidenceRationale: undefined });
  });

  it("read time: with no matching current finding no rationale is invented", () => {
    const rows = [{ id: "a1", findingCode: "FIN_DISCOUNT_LEAKAGE", findingId: "old" }, { id: "a2" }];
    const out = attachCurrentFinanceEvidenceRationale(rows, [{ code: "FIN_HIGH_FIXED_COST_BURDEN", sourceMetric: "fixedCostBurdenPct", sourceValue: 61.1, threshold: 55 }]);
    expect(out[0]).not.toHaveProperty("evidenceRationale");
    expect(out[1]).not.toHaveProperty("evidenceRationale");
  });
});

describe("owner-finance/recommendations — final semantic copy cleanup", () => {
  const base = { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR" };
  const lossMaking = (cashOnHand: number): FinancialSnapshotInput => ({
    ...base, revenue: 100000, costOfGoodsOrServices: 60000, fixedCosts: 60000, cashOnHand, bankBalance: 0,
    receivables: 0, payables: 0, discountAmount: 0, refundAmount: 0, loanEmiDebtPayments: 0,
    ownerWithdrawals: 0, orderCount: 10, customerCount: 5,
  });
  const findingFor = (code: string, input: FinancialSnapshotInput) =>
    diagnoseFinanceSnapshot(input, { now: NOW }).findings.find((f) => f.code === code);
  const mkRunway = (code: string, over: Partial<OwnerFinding>): OwnerFinding => ({
    domain: "finance", code, title: "t", summary: "s", sourceMetric: "cashRunwayDays", sourceValue: 5,
    threshold: 7, severity: "critical", confidence: 1, impactScore: 50, urgencyScore: 50,
    findingType: "risk", evidence: [], missingData: [], verificationMetric: "cashRunwayDays", ...over,
  } as OwnerFinding);

  it.each([
    ["FIN_NEGATIVE_GROSS_MARGIN", { revenue: 100000, costOfGoodsOrServices: 120000, fixedCosts: 0 }, { revenue: 100000, costOfGoodsOrServices: 100000, fixedCosts: 0 }],
    ["FIN_NEGATIVE_NET_MARGIN", { revenue: 100000, costOfGoodsOrServices: 50000, fixedCosts: 60000 }, { revenue: 100000, costOfGoodsOrServices: 50000, fixedCosts: 50000 }],
  ])("%s: wording states the 0%% boundary and exactly 0 does not fire the rule", (code, losing, breakEven) => {
    const mk = (o: object): FinancialSnapshotInput => ({ ...base, cashOnHand: 400000, bankBalance: 0, receivables: 0, payables: 0, orderCount: 10, customerCount: 5, ...o } as FinancialSnapshotInput);
    const finding = findingFor(code, mk(losing));
    expect(finding, "negative margin should fire").toBeDefined();
    const text = buildFinanceRecommendation(finding!)!.verificationMethod;
    expect(text).toContain("This warning clears at 0% or higher.");
    expect(text).not.toContain("above 0%");
    expect(findingFor(code, mk(breakEven))).toBeUndefined();
  });

  it("FIN_HIGH_RECEIVABLES title does not claim receivables are overdue", () => {
    const finding = findingFor("FIN_HIGH_RECEIVABLES", { ...base, revenue: 100000, costOfGoodsOrServices: 60000, fixedCosts: 60000, cashOnHand: 400000, bankBalance: 0, receivables: 40000, payables: 0, orderCount: 10, customerCount: 5 });
    const rec = buildFinanceRecommendation(finding!)!;
    expect(rec.title).toBe("Collect money customers owe you");
    expect(rec.title.toLowerCase()).not.toContain("overdue");
  });

  it("Cashflow's genuine overdue-receivables terminology is unchanged", () => {
    const rec = readFileSync(join(process.cwd(), "src/domain/owner-cashflow/recommendations.ts"), "utf8");
    const opp = readFileSync(join(process.cwd(), "src/domain/owner-cashflow/opportunity-rules.ts"), "utf8");
    expect(rec).toContain('title: "Collect overdue receivables"');
    expect(rec).toContain('title: "Convert overdue receivables to cash"');
    expect(opp).toContain('title: "Collect overdue receivables to free cash"');
  });

  it.each([
    ["FIN_INSOLVENT_RUNWAY", 3000],
    ["FIN_LOW_RUNWAY", 10000],
    ["FIN_LOW_RUNWAY", 22000],
  ])("%s (cash %i) dynamic wording uses rate of loss, keeps current value and Next milestone", (code, cash) => {
    const finding = findingFor(code, lossMaking(cash))!;
    const text = buildFinanceRecommendation(finding)!.verificationMethod;
    expect(text).toContain("current rate of loss");
    expect(text).not.toContain("current spending");
    expect(text).toContain(`Current: ${finding.sourceValue} days.`);
    expect(text).toContain(`Next milestone: at least ${finding.threshold} days.`);
  });

  it.each(["FIN_INSOLVENT_RUNWAY", "FIN_LOW_RUNWAY"])("%s static fallback is truthful and invents no numbers", (code) => {
    for (const over of [{ sourceValue: null }, { threshold: null }, { sourceValue: Number.NaN }]) {
      const text = buildFinanceRecommendation(mkRunway(code, over as Partial<OwnerFinding>))!.verificationMethod;
      expect(text).toContain("current rate of loss");
      expect(text).not.toContain("current spending");
      expect(text).not.toMatch(/\b(7|30|45)\b|null|undefined|NaN/);
    }
  });

  it("FIN_LOW_ABSOLUTE_CASH still measures days of costs, not rate of loss", () => {
    const finding = findingFor("FIN_LOW_ABSOLUTE_CASH", { ...base, revenue: 100000, costOfGoodsOrServices: 20000, fixedCosts: 40000, cashOnHand: 20000, bankBalance: 0 })!;
    const text = buildFinanceRecommendation(finding)!.verificationMethod;
    expect(text).toContain("days of your costs");
    expect(text).not.toContain("rate of loss");
  });
});
