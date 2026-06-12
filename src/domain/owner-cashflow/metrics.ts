/**
 * Owner Cashflow (Module 5) — deterministic cashflow calculation engine.
 *
 * Pure functions only (no DB/I/O/LLM). Amount/ratio metrics return `null` when
 * not computable from the provided inputs; nothing is invented. Composite scores
 * are bounded 0..100. The cashflow lens is liquidity (can near-term cash demands
 * be met), distinct from the profit lens of Module 2 finance. Conventions:
 *   totalCash            = sum(cashInHand, bankBalance)
 *   nearTermObligations  = sum(upcomingEmi, rentDue, salaryDue, vendorDue, taxDue, ownerWithdrawal)
 *   cashRunwayDays       = totalCash / (dailyObligations - dailyCollections), only when net-burning
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import type {
  CashflowSnapshotInput,
  CashflowDerivedMetrics,
  CashflowState,
  CashflowTier,
} from "./types";
import { resolveCashflowThresholds, type CashflowThresholds } from "./thresholds";
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

function periodDays(input: CashflowSnapshotInput): number | null {
  const start = new Date(input.periodStart).getTime();
  const end = new Date(input.periodEnd).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
}

// --- cash position + obligations ---------------------------------------------

export function totalCash(input: CashflowSnapshotInput): number | null {
  return sumPresent(input.cashInHand, input.bankBalance);
}

export function nearTermObligations(input: CashflowSnapshotInput): number | null {
  return sumPresent(
    input.upcomingEmi,
    input.rentDue,
    input.salaryDue,
    input.vendorDue,
    input.taxDue,
    input.ownerWithdrawal
  );
}

// --- runway / collection lag -------------------------------------------------

/**
 * Days the cash buffer lasts at the current net burn. Only meaningful when the
 * business is burning cash (daily obligations exceed daily collections); when
 * collections cover obligations it returns `null` ("not burning / not at risk").
 * Requires cash, obligations, collections, and a valid period — else `null`.
 */
export function cashRunwayDays(input: CashflowSnapshotInput): number | null {
  const cash = totalCash(input);
  const obligations = nearTermObligations(input);
  const collections = num(input.dailyCollections);
  const days = periodDays(input);
  if (cash === null || obligations === null || collections === null || days === null) return null;
  const dailyObligations = obligations / days;
  const netDailyBurn = dailyObligations - collections;
  if (netDailyBurn <= 0) return null; // collections cover obligations → not burning
  return round1(cash / netDailyBurn);
}

/** Days of sales outstanding: receivables ÷ daily collections. */
export function collectionGapDays(input: CashflowSnapshotInput): number | null {
  const receivables = num(input.receivables);
  const collections = num(input.dailyCollections);
  if (receivables === null || collections === null || collections <= 0) return null;
  return round1(receivables / collections);
}

// --- pressure ratios (% ) ----------------------------------------------------

export function overdueReceivablesPct(input: CashflowSnapshotInput): number | null {
  const receivables = num(input.receivables);
  const overdue = num(input.receivablesOverdue);
  if (receivables === null || overdue === null || receivables <= 0) return null;
  return round1((overdue / receivables) * 100);
}

export function payablesPressurePct(input: CashflowSnapshotInput): number | null {
  const cash = totalCash(input);
  const payables = num(input.payables);
  if (cash === null || payables === null || cash <= 0) return null;
  return round1((payables / cash) * 100);
}

export function urgentPaymentRiskPct(input: CashflowSnapshotInput): number | null {
  const cash = totalCash(input);
  const obligations = nearTermObligations(input);
  if (cash === null || obligations === null || cash <= 0) return null;
  return round1((obligations / cash) * 100);
}

export function ownerWithdrawalPressurePct(input: CashflowSnapshotInput): number | null {
  const cash = totalCash(input);
  const withdrawal = num(input.ownerWithdrawal);
  if (cash === null || withdrawal === null || cash <= 0) return null;
  return round1((withdrawal / cash) * 100);
}

// --- risk signals ------------------------------------------------------------

interface CashflowRiskSignals {
  noCashData: boolean;
  lowRunway: boolean;
  criticalRunway: boolean;
  insolventRunway: boolean;
  highUrgentPaymentRisk: boolean;
  criticalUrgentPaymentRisk: boolean;
  highPayablesPressure: boolean;
  criticalPayablesPressure: boolean;
  highOverdueReceivables: boolean;
  highCollectionGap: boolean;
  highOwnerWithdrawal: boolean;
}

function deriveRiskSignals(
  input: CashflowSnapshotInput,
  t: CashflowThresholds
): CashflowRiskSignals {
  const cash = totalCash(input);
  const runway = cashRunwayDays(input);
  const urgent = urgentPaymentRiskPct(input);
  const payables = payablesPressurePct(input);
  const overdue = overdueReceivablesPct(input);
  const gap = collectionGapDays(input);
  const withdrawal = ownerWithdrawalPressurePct(input);
  return {
    noCashData: cash === null,
    lowRunway: runway !== null && runway < t.lowCashRunwayDays,
    criticalRunway: runway !== null && runway < t.criticalCashRunwayDays,
    insolventRunway: runway !== null && runway < t.insolventCashRunwayDays,
    highUrgentPaymentRisk: urgent !== null && urgent > t.highUrgentPaymentRiskPct,
    criticalUrgentPaymentRisk: urgent !== null && urgent >= t.criticalUrgentPaymentRiskPct,
    highPayablesPressure: payables !== null && payables > t.highPayablesPressurePct,
    criticalPayablesPressure: payables !== null && payables >= t.criticalPayablesPressurePct,
    highOverdueReceivables: overdue !== null && overdue > t.highOverdueReceivablesPct,
    highCollectionGap: gap !== null && gap > t.highCollectionGapDays,
    highOwnerWithdrawal: withdrawal !== null && withdrawal > t.highOwnerWithdrawalPressurePct,
  };
}

// --- composite scores --------------------------------------------------------

export function cashflowDangerScore(input: CashflowSnapshotInput, t: CashflowThresholds): number {
  const s = deriveRiskSignals(input, t);
  let score = 0;
  if (s.insolventRunway) score += 30;
  else if (s.criticalRunway) score += 20;
  else if (s.lowRunway) score += 10;
  if (s.criticalUrgentPaymentRisk) score += 25;
  else if (s.highUrgentPaymentRisk) score += 12;
  if (s.criticalPayablesPressure) score += 15;
  else if (s.highPayablesPressure) score += 8;
  if (s.highOverdueReceivables) score += 10;
  if (s.highCollectionGap) score += 6;
  if (s.highOwnerWithdrawal) score += 7;
  return clampScore(score);
}

export function cashflowHealthScore(input: CashflowSnapshotInput, t: CashflowThresholds): number {
  const danger = cashflowDangerScore(input, t);
  const urgent = urgentPaymentRiskPct(input);
  // Liquidity health maps urgent-payment risk (0%..100%+ of cash) onto 100..0.
  let liquidityHealth = 50;
  if (urgent !== null) liquidityHealth = clampScore(100 - urgent);
  return clampScore(Math.round(0.65 * (100 - danger) + 0.35 * liquidityHealth));
}

export function cashflowOpportunityScore(input: CashflowSnapshotInput): number {
  let score = 0;
  const overdue = overdueReceivablesPct(input);
  if (overdue !== null) score += Math.min(overdue, 40); // collectible overdue receivables
  const payables = payablesPressurePct(input);
  if (payables !== null) score += Math.min(payables / 4, 20); // defer/negotiate payables headroom
  const withdrawal = ownerWithdrawalPressurePct(input);
  if (withdrawal !== null) score += Math.min(withdrawal / 3, 20); // trim owner draw under pressure
  return clampScore(score);
}

// --- cashflow state ----------------------------------------------------------

export function cashflowState(
  input: CashflowSnapshotInput,
  t: CashflowThresholds,
  dataConfidenceScore: number
): CashflowState {
  const s = deriveRiskSignals(input, t);

  if (s.insolventRunway || s.criticalUrgentPaymentRisk) return "INSOLVENT_RISK";
  if (s.criticalRunway || (s.highUrgentPaymentRisk && s.criticalPayablesPressure)) return "CRITICAL";
  if (
    s.lowRunway ||
    s.highUrgentPaymentRisk ||
    s.criticalPayablesPressure ||
    s.highOverdueReceivables
  ) {
    return "AT_RISK";
  }
  // Not enough trustworthy data to assert SAFE → caution.
  if (dataConfidenceScore < 50) return "WATCH";
  if (s.highPayablesPressure || s.highCollectionGap || s.highOwnerWithdrawal) return "WATCH";
  return "SAFE";
}

export function cashflowTier(state: CashflowState): CashflowTier {
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
 * Compute the full deterministic cashflow metric set for one snapshot. Does not
 * mutate `input`. Missing/invalid inputs yield `null` metrics + a missing-input
 * list; composite scores stay 0..100 with confidence reflecting completeness.
 */
export function computeCashflowMetrics(
  input: CashflowSnapshotInput,
  opts: { now?: Date } = {}
): CashflowDerivedMetrics {
  const t = resolveCashflowThresholds(input.industryTemplate);
  const confidence = calculateDataConfidence(input, {
    now: opts.now,
    staleDays: t.staleSnapshotDays,
  });
  const state = cashflowState(input, t, confidence.dataConfidenceScore);

  return {
    currency: input.currency,
    currencyValid: isValidCurrency(input.currency),

    totalCash: totalCash(input),
    nearTermObligations: nearTermObligations(input),
    cashRunwayDays: cashRunwayDays(input),
    collectionGapDays: collectionGapDays(input),
    overdueReceivablesPct: overdueReceivablesPct(input),
    payablesPressurePct: payablesPressurePct(input),
    urgentPaymentRiskPct: urgentPaymentRiskPct(input),
    ownerWithdrawalPressurePct: ownerWithdrawalPressurePct(input),

    cashflowHealthScore: cashflowHealthScore(input, t),
    cashflowDangerScore: cashflowDangerScore(input, t),
    cashflowOpportunityScore: cashflowOpportunityScore(input),
    dataConfidenceScore: confidence.dataConfidenceScore,

    cashflowState: state,
    cashflowTier: cashflowTier(state),

    missingRequiredInputs: confidence.missingCritical,
  };
}
