/**
 * Owner Finance (Module 2) — deterministic finance calculation engine.
 *
 * Pure functions only (no DB/I/O/LLM). Ratio/per-unit metrics return `null` when
 * not computable from the provided inputs; nothing is invented. Composite scores
 * are bounded 0..100. Cost model convention (documented + deterministic):
 *   fixedCostsTotal    = fixedCosts ?? sum(rent, salaryPayroll, utilities)
 *   variableCostsTotal = variableCosts ?? sum(costOfGoodsOrServices, deliveryFulfilmentCost)
 *   totalCosts         = fixedCostsTotal + variableCostsTotal + marketingSpend
 * (marketingSpend must be reported separately, not folded into the aggregates.)
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import type {
  FinancialSnapshotInput,
  FinancialDerivedMetrics,
  SurvivalState,
  SurvivalTier,
} from "./types";
import { resolveFinanceThresholds, type FinanceThresholds } from "./thresholds";
import { calculateDataConfidence, isValidCurrency } from "./data-confidence";

// --- safe numeric helpers ----------------------------------------------------

/** Present finite number, else null (fail closed on NaN/Infinity/missing). */
export function num(x: number | undefined | null): number | null {
  if (x === undefined || x === null || !Number.isFinite(x)) return null;
  return x;
}

/** Sum the present finite values; null if none are present. */
function sumPresent(...xs: (number | undefined | null)[]): number | null {
  const vals = xs.map(num).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// --- cost model --------------------------------------------------------------

export function fixedCostsTotal(input: FinancialSnapshotInput): number | null {
  const explicit = num(input.fixedCosts);
  if (explicit !== null) return explicit;
  return sumPresent(input.rent, input.salaryPayroll, input.utilities);
}

export function variableCostsTotal(input: FinancialSnapshotInput): number | null {
  const explicit = num(input.variableCosts);
  if (explicit !== null) return explicit;
  return sumPresent(input.costOfGoodsOrServices, input.deliveryFulfilmentCost);
}

export function totalCosts(input: FinancialSnapshotInput): number | null {
  const fixed = fixedCostsTotal(input);
  const variable = variableCostsTotal(input);
  if (fixed === null && variable === null) return null;
  return (fixed ?? 0) + (variable ?? 0) + (num(input.marketingSpend) ?? 0);
}

// --- margins -----------------------------------------------------------------

export function grossMarginPct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const cogs = num(input.costOfGoodsOrServices);
  if (revenue === null || cogs === null || revenue === 0) return null;
  return round1(((revenue - cogs) / revenue) * 100);
}

export function netProfit(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const costs = totalCosts(input);
  if (revenue === null || costs === null) return null;
  return revenue - costs;
}

export function netMarginPct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const profit = netProfit(input);
  if (revenue === null || profit === null || revenue === 0) return null;
  return round1((profit / revenue) * 100);
}

export function contributionMarginPct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const variable = variableCostsTotal(input);
  if (revenue === null || variable === null || revenue === 0) return null;
  return round1(((revenue - variable) / revenue) * 100);
}

// --- burdens / break-even ----------------------------------------------------

export function fixedCostBurdenPct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const fixed = fixedCostsTotal(input);
  if (revenue === null || fixed === null || revenue === 0) return null;
  return round1((fixed / revenue) * 100);
}

export function payrollBurdenPct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const payroll = num(input.salaryPayroll);
  if (revenue === null || payroll === null || revenue === 0) return null;
  return round1((payroll / revenue) * 100);
}

export function breakEvenRevenue(input: FinancialSnapshotInput): number | null {
  const fixed = fixedCostsTotal(input);
  const cmPct = contributionMarginPct(input);
  if (fixed === null || cmPct === null || cmPct <= 0) return null;
  return round1(fixed / (cmPct / 100));
}

function periodDays(input: FinancialSnapshotInput): number | null {
  const start = new Date(input.periodStart).getTime();
  const end = new Date(input.periodEnd).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
}

export function dailyBreakEvenRevenue(input: FinancialSnapshotInput): number | null {
  const be = breakEvenRevenue(input);
  const days = periodDays(input);
  if (be === null || days === null) return null;
  return round1(be / days);
}

// --- cash / debt / working capital -------------------------------------------

export function cashRunwayDays(input: FinancialSnapshotInput): number | null {
  const cash = num(input.cashOnHand);
  const profit = netProfit(input);
  const days = periodDays(input);
  if (cash === null || profit === null || days === null) return null;
  // Only meaningful when burning cash (net loss). Not burning → null ("not at risk").
  if (profit >= 0) return null;
  const dailyBurn = -profit / days;
  if (dailyBurn <= 0) return null;
  return round1(cash / dailyBurn);
}

/**
 * Cash divided by daily total costs — measures absolute cash cushion independent of profitability.
 * Uses total liquid funds = cashOnHand + bankBalance (when bank balance is available from a
 * compatible cashflow snapshot, enriched by the service layer). Fails closed: when neither
 * cashOnHand nor bankBalance is present, returns null rather than zero.
 */
export function cashDaysOfCosts(input: FinancialSnapshotInput): number | null {
  const liquidFunds = sumPresent(input.cashOnHand, input.bankBalance);
  const costs = totalCosts(input);
  const days = periodDays(input);
  if (liquidFunds === null || costs === null || days === null || costs < 1) return null;
  const dailyCost = costs / days;
  return round1(liquidFunds / dailyCost);
}

export function debtServicePressurePct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const emi = num(input.loanEmiDebtPayments);
  if (revenue === null || emi === null || revenue === 0) return null;
  return round1((emi / revenue) * 100);
}

export function receivablesPressurePct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const receivables = num(input.receivables);
  if (revenue === null || receivables === null || revenue === 0) return null;
  return round1((receivables / revenue) * 100);
}

export function payablesPressurePct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const payables = num(input.payables);
  if (revenue === null || payables === null || revenue === 0) return null;
  return round1((payables / revenue) * 100);
}

export function ownerWithdrawalPressurePct(input: FinancialSnapshotInput): number | null {
  const profit = netProfit(input);
  const withdrawals = num(input.ownerWithdrawals);
  if (withdrawals === null || profit === null || profit <= 0) return null;
  return round1((withdrawals / profit) * 100);
}

// --- leakage -----------------------------------------------------------------

export function discountLeakagePct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const discount = num(input.discountAmount);
  if (revenue === null || discount === null || revenue === 0) return null;
  return round1((discount / revenue) * 100);
}

export function refundReworkLeakagePct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const leak = sumPresent(input.refundAmount, input.reworkCost, input.complaintCost);
  if (revenue === null || leak === null || revenue === 0) return null;
  return round1((leak / revenue) * 100);
}

export function costLeakageRatioPct(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const leak = sumPresent(
    input.discountAmount,
    input.refundAmount,
    input.reworkCost,
    input.complaintCost
  );
  if (revenue === null || leak === null || revenue === 0) return null;
  return round1((leak / revenue) * 100);
}

// --- per-unit ----------------------------------------------------------------

export function profitPerOrder(input: FinancialSnapshotInput): number | null {
  const profit = netProfit(input);
  const orders = num(input.orderCount);
  if (profit === null || orders === null || orders <= 0) return null;
  return round1(profit / orders);
}

export function profitPerCustomer(input: FinancialSnapshotInput): number | null {
  const profit = netProfit(input);
  const customers = num(input.customerCount);
  if (profit === null || customers === null || customers <= 0) return null;
  return round1(profit / customers);
}

// --- revenue quality ---------------------------------------------------------

/**
 * 0..100 (null if no revenue). Starts at 100 and deducts discount dependence,
 * refund/rework leakage, and single-segment concentration (>90% B2B or B2C).
 */
export function revenueQualityScore(input: FinancialSnapshotInput): number | null {
  const revenue = num(input.revenue);
  if (revenue === null || revenue === 0) return null;
  let score = 100;
  const discount = discountLeakagePct(input);
  if (discount !== null) score -= Math.min(discount * 2, 40);
  const refund = refundReworkLeakagePct(input);
  if (refund !== null) score -= Math.min(refund * 2, 30);

  const b2c = num(input.b2cRevenue);
  const b2b = num(input.b2bRevenue);
  if (b2c !== null && b2b !== null && b2c + b2b > 0) {
    const top = Math.max(b2c, b2b) / (b2c + b2b);
    if (top > 0.9) score -= 10; // concentration risk
  }
  return clampScore(score);
}

// --- composite scores --------------------------------------------------------

interface RiskSignals {
  negativeNetMargin: boolean;
  negativeGrossMargin: boolean;
  belowBreakEven: boolean;
  lowRunway: boolean;
  criticalRunway: boolean;
  insolventRunway: boolean;
  highFixedBurden: boolean;
  highPayrollBurden: boolean;
  highDebt: boolean;
  criticalDebt: boolean;
  highReceivables: boolean;
  highPayables: boolean;
  highLeakage: boolean;
}

function deriveRiskSignals(input: FinancialSnapshotInput, t: FinanceThresholds): RiskSignals {
  const nm = netMarginPct(input);
  const gm = grossMarginPct(input);
  const revenue = num(input.revenue);
  const be = breakEvenRevenue(input);
  const runway = cashRunwayDays(input);
  const fixedBurden = fixedCostBurdenPct(input);
  const payroll = payrollBurdenPct(input);
  const debt = debtServicePressurePct(input);
  const receivables = receivablesPressurePct(input);
  const payables = payablesPressurePct(input);
  const leak = costLeakageRatioPct(input);
  return {
    negativeNetMargin: nm !== null && nm < 0,
    negativeGrossMargin: gm !== null && gm < 0,
    belowBreakEven: revenue !== null && be !== null && revenue < be,
    lowRunway: runway !== null && runway < t.lowCashRunwayDays,
    criticalRunway: runway !== null && runway < t.criticalCashRunwayDays,
    insolventRunway: runway !== null && runway < t.insolventCashRunwayDays,
    highFixedBurden: fixedBurden !== null && fixedBurden > t.highFixedCostBurdenPct,
    highPayrollBurden: payroll !== null && payroll > t.highPayrollBurdenPct,
    highDebt: debt !== null && debt > t.highDebtServicePressurePct,
    criticalDebt: debt !== null && debt > t.criticalDebtServicePressurePct,
    highReceivables: receivables !== null && receivables > t.highReceivablesPressurePct,
    highPayables: payables !== null && payables > t.highPayablesPressurePct,
    highLeakage: leak !== null && leak > t.highCostLeakageRatioPct,
  };
}

export function financialRiskScore(input: FinancialSnapshotInput, t: FinanceThresholds): number {
  const s = deriveRiskSignals(input, t);
  let score = 0;
  if (s.negativeNetMargin) score += 30;
  if (s.negativeGrossMargin) score += 15;
  if (s.belowBreakEven) score += 20;
  if (s.insolventRunway) score += 30;
  else if (s.criticalRunway) score += 20;
  else if (s.lowRunway) score += 10;
  if (s.criticalDebt) score += 20;
  else if (s.highDebt) score += 10;
  if (s.highFixedBurden) score += 8;
  if (s.highPayrollBurden) score += 7;
  if (s.highReceivables) score += 6;
  if (s.highPayables) score += 6;
  if (s.highLeakage) score += 8;
  return clampScore(score);
}

/**
 * Maximum health score permitted at a given confidence level.
 *
 * `financialHealthScore` is a penalty-from-100 model: it measures the
 * absence of detected risks and strength of margin. "No risk detected" means
 * "we found no problems with the data we have" — it does NOT mean "this
 * business is definitively financially healthy." When inputs are incomplete,
 * the model cannot fire risk signals that depend on the missing data, which
 * would otherwise inflate the score to near-perfect without positive evidence.
 *
 * This ceiling enforces the invariant UNKNOWN ≠ HEALTHY:
 *   ceiling = floor(50 + confidence/2)
 *
 * Derivation: 50 is newly introduced as the neutral/unknown baseline for this
 * module (no cross-domain OpsIQ precedent for this specific value; it represents
 * the midpoint of 0–100 with no evidence in either direction). At confidence=0
 * the ceiling is 50 (neutral). It rises proportionally with confidence and
 * reaches 100 at confidence=100 (complete data — no practical cap).
 *
 * The formula applies continuously for all confidence values [0, 100].
 * There is no special case at confidence=85 or any other tier boundary.
 * Tier labels (very_high / minimal risk) in decision-confidence and
 * trust-engine modules are naming conventions only — they do NOT authorize
 * removing output caps.
 *
 * Monotonic: higher confidence → higher ceiling → score can never decrease
 * from increasing confidence alone.
 */
export function healthScoreCeiling(dataConfidenceScore: number): number {
  return Math.floor(50 + dataConfidenceScore / 2);
}

export function financialHealthScore(input: FinancialSnapshotInput, t: FinanceThresholds, dataConfidenceScore: number): number {
  const risk = financialRiskScore(input, t);
  const nm = netMarginPct(input);
  // Margin health maps net margin (-20%..+30%) onto 0..100.
  let marginHealth = 50;
  if (nm !== null) marginHealth = clampScore(((nm + 20) / 50) * 100);
  const raw = clampScore(Math.round(0.6 * (100 - risk) + 0.4 * marginHealth));
  return Math.min(raw, healthScoreCeiling(dataConfidenceScore));
}

export function financialOpportunityScore(input: FinancialSnapshotInput): number {
  let score = 0;
  const leak = costLeakageRatioPct(input);
  if (leak !== null) score += Math.min(leak * 3, 40); // recoverable leakage
  const discount = discountLeakagePct(input);
  if (discount !== null) score += Math.min(discount * 2, 25); // discount tightening upside
  const receivables = receivablesPressurePct(input);
  if (receivables !== null) score += Math.min(receivables, 20); // collectible cash
  const nm = netMarginPct(input);
  if (nm !== null && nm < 15) score += Math.min((15 - Math.max(nm, -20)) / 2, 15); // margin upside
  return clampScore(score);
}

// --- survival state ----------------------------------------------------------

export function survivalState(
  input: FinancialSnapshotInput,
  t: FinanceThresholds,
  dataConfidenceScore: number
): SurvivalState {
  const s = deriveRiskSignals(input, t);

  if (s.insolventRunway || (s.criticalDebt && s.negativeNetMargin)) return "INSOLVENT_RISK";
  if (s.negativeNetMargin && (s.criticalRunway || s.belowBreakEven)) return "CRITICAL";
  if (
    s.negativeGrossMargin ||
    s.negativeNetMargin ||
    s.belowBreakEven ||
    s.lowRunway ||
    s.highDebt ||
    s.highFixedBurden
  ) {
    return "AT_RISK";
  }
  // Not enough trustworthy data to assert SAFE → caution.
  if (dataConfidenceScore < 70) return "WATCH";
  const nm = netMarginPct(input);
  const thin = nm !== null && nm < t.thinNetMarginPct;
  if (thin || s.highReceivables || s.highPayables || s.highLeakage) return "WATCH";
  return "SAFE";
}

export function survivalTier(state: SurvivalState): SurvivalTier {
  switch (state) {
    case "INSOLVENT_RISK":
    case "CRITICAL":
      return "existential";
    case "AT_RISK":
      return "recovery";
    case "WATCH":
      return "growth";
    case "SAFE":
      return "optimization";
  }
}

// --- orchestrator ------------------------------------------------------------

/**
 * Compute the full deterministic finance metric set for one snapshot. Does not
 * mutate `input`. Missing/invalid inputs yield `null` metrics + a missing-input
 * list; composite scores stay 0..100 with confidence reflecting completeness.
 */
export function computeFinancialMetrics(
  input: FinancialSnapshotInput,
  opts: { now?: Date } = {}
): FinancialDerivedMetrics {
  const t = resolveFinanceThresholds(input.industryTemplate);
  const confidence = calculateDataConfidence(input, { now: opts.now, staleDays: t.staleSnapshotDays });
  const state = survivalState(input, t, confidence.dataConfidenceScore);

  return {
    currency: input.currency,
    currencyValid: isValidCurrency(input.currency),

    grossMarginPct: grossMarginPct(input),
    netMarginPct: netMarginPct(input),
    contributionMarginPct: contributionMarginPct(input),
    fixedCostBurdenPct: fixedCostBurdenPct(input),
    payrollBurdenPct: payrollBurdenPct(input),
    breakEvenRevenue: breakEvenRevenue(input),
    dailyBreakEvenRevenue: dailyBreakEvenRevenue(input),
    cashRunwayDays: cashRunwayDays(input),
    cashDaysOfCosts: cashDaysOfCosts(input),
    debtServicePressurePct: debtServicePressurePct(input),
    receivablesPressurePct: receivablesPressurePct(input),
    payablesPressurePct: payablesPressurePct(input),
    costLeakageRatioPct: costLeakageRatioPct(input),
    discountLeakagePct: discountLeakagePct(input),
    refundReworkLeakagePct: refundReworkLeakagePct(input),
    revenueQualityScore: revenueQualityScore(input),
    profitPerOrder: profitPerOrder(input),
    profitPerCustomer: profitPerCustomer(input),
    ownerWithdrawalPressurePct: ownerWithdrawalPressurePct(input),

    netProfit: netProfit(input),

    financialHealthScore: financialHealthScore(input, t, confidence.dataConfidenceScore),
    financialRiskScore: financialRiskScore(input, t),
    financialOpportunityScore: financialOpportunityScore(input),
    dataConfidenceScore: confidence.dataConfidenceScore,

    survivalState: state,
    survivalTier: survivalTier(state),

    missingRequiredInputs: confidence.missingCritical,
  };
}
