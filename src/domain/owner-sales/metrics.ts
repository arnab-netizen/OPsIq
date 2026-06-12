/**
 * Owner Sales (Module 3) — deterministic sales calculation engine.
 *
 * Pure functions only (no DB/I/O/LLM). Ratio/per-unit metrics return `null` when
 * not computable from the provided inputs; nothing is invented. Composite scores
 * are bounded 0..100. Sales is the GROWTH lens (conversion, retention, churn,
 * mix, leakage), distinct from the survival lenses of finance/cashflow.
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import type {
  SalesSnapshotInput,
  SalesDerivedMetrics,
  SalesState,
  SalesTier,
} from "./types";
import { resolveSalesThresholds, type SalesThresholds } from "./thresholds";
import { calculateDataConfidence, isValidCurrency } from "./data-confidence";

// --- safe numeric helpers ----------------------------------------------------

/** Present finite number, else null (fail closed on NaN/Infinity/missing). */
export function num(x: number | undefined | null): number | null {
  if (x === undefined || x === null || !Number.isFinite(x)) return null;
  return x;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function periodDays(input: SalesSnapshotInput): number | null {
  const start = new Date(input.periodStart).getTime();
  const end = new Date(input.periodEnd).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
}

function activeCustomers(input: SalesSnapshotInput): number | null {
  const nw = num(input.newCustomers);
  const rp = num(input.repeatCustomers);
  if (nw === null && rp === null) return null;
  return (nw ?? 0) + (rp ?? 0);
}

// --- funnel ------------------------------------------------------------------

export function leadToSaleConversionPct(input: SalesSnapshotInput): number | null {
  const leads = num(input.leads);
  const orders = num(input.orders);
  if (leads === null || orders === null || leads <= 0) return null;
  return round1((orders / leads) * 100);
}

export function qualifiedConversionPct(input: SalesSnapshotInput): number | null {
  const ql = num(input.qualifiedLeads);
  const orders = num(input.orders);
  if (ql === null || orders === null || ql <= 0) return null;
  return round1((orders / ql) * 100);
}

export function averageOrderValue(input: SalesSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const orders = num(input.orders);
  if (revenue !== null && orders !== null && orders > 0) return round1(revenue / orders);
  return num(input.averageOrderValue);
}

export function salesPerDay(input: SalesSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const days = periodDays(input);
  if (revenue === null || days === null) return null;
  return round1(revenue / days);
}

export function ordersPerDay(input: SalesSnapshotInput): number | null {
  const orders = num(input.orders);
  const days = periodDays(input);
  if (orders === null || days === null) return null;
  return round1(orders / days);
}

export function salesPerStaff(input: SalesSnapshotInput): number | null {
  const revenue = num(input.revenue);
  const staff = num(input.staffCount);
  if (revenue === null || staff === null || staff <= 0) return null;
  return round1(revenue / staff);
}

// --- customers ---------------------------------------------------------------

export function repeatRatePct(input: SalesSnapshotInput): number | null {
  const rp = num(input.repeatCustomers);
  const active = activeCustomers(input);
  if (rp === null || active === null || active <= 0) return null;
  return round1((rp / active) * 100);
}

export function newCustomerSharePct(input: SalesSnapshotInput): number | null {
  const nw = num(input.newCustomers);
  const active = activeCustomers(input);
  if (nw === null || active === null || active <= 0) return null;
  return round1((nw / active) * 100);
}

export function lostCustomerRatePct(input: SalesSnapshotInput): number | null {
  const lost = num(input.lostCustomers);
  const active = activeCustomers(input);
  if (lost === null || active === null) return null;
  const denom = active + lost;
  if (denom <= 0) return null;
  return round1((lost / denom) * 100);
}

export function acquisitionPerDay(input: SalesSnapshotInput): number | null {
  const nw = num(input.newCustomers);
  const days = periodDays(input);
  if (nw === null || days === null) return null;
  return round1(nw / days);
}

// --- segment mix -------------------------------------------------------------

export function b2bSharePct(input: SalesSnapshotInput): number | null {
  const b2b = num(input.b2bRevenue);
  const b2c = num(input.b2cRevenue);
  if (b2b !== null && b2c !== null && b2b + b2c > 0) return round1((b2b / (b2b + b2c)) * 100);
  const revenue = num(input.revenue);
  if (b2b !== null && revenue !== null && revenue > 0) return round1((b2b / revenue) * 100);
  return null;
}

export function b2cSharePct(input: SalesSnapshotInput): number | null {
  const b2b = num(input.b2bRevenue);
  const b2c = num(input.b2cRevenue);
  if (b2b !== null && b2c !== null && b2b + b2c > 0) return round1((b2c / (b2b + b2c)) * 100);
  const revenue = num(input.revenue);
  if (b2c !== null && revenue !== null && revenue > 0) return round1((b2c / revenue) * 100);
  return null;
}

export function b2bPipelineCoveragePct(input: SalesSnapshotInput): number | null {
  const pipeline = num(input.b2bPipelineValue);
  const revenue = num(input.revenue);
  if (pipeline === null || revenue === null || revenue <= 0) return null;
  return round1((pipeline / revenue) * 100);
}

// --- quality / leakage -------------------------------------------------------

export function complaintToSaleRatioPct(input: SalesSnapshotInput): number | null {
  const complaints = num(input.complaints);
  const orders = num(input.orders);
  if (complaints === null || orders === null || orders <= 0) return null;
  return round1((complaints / orders) * 100);
}

export function discountDependencePct(input: SalesSnapshotInput): number | null {
  const discount = num(input.discountAmount);
  const revenue = num(input.revenue);
  if (discount === null || revenue === null || revenue <= 0) return null;
  return round1((discount / revenue) * 100);
}

export function refundRatePct(input: SalesSnapshotInput): number | null {
  const refund = num(input.refundAmount);
  const revenue = num(input.revenue);
  if (refund === null || revenue === null || revenue <= 0) return null;
  return round1((refund / revenue) * 100);
}

// --- risk signals ------------------------------------------------------------

interface SalesRiskSignals {
  lowConversion: boolean;
  criticalConversion: boolean;
  weakRepeat: boolean;
  criticalRepeat: boolean;
  highLost: boolean;
  criticalLost: boolean;
  highComplaint: boolean;
  highDiscount: boolean;
  highRefund: boolean;
  weakB2bPipeline: boolean;
}

function deriveRiskSignals(input: SalesSnapshotInput, t: SalesThresholds): SalesRiskSignals {
  const conv = leadToSaleConversionPct(input);
  const repeat = repeatRatePct(input);
  const lost = lostCustomerRatePct(input);
  const complaint = complaintToSaleRatioPct(input);
  const discount = discountDependencePct(input);
  const refund = refundRatePct(input);
  const pipeline = b2bPipelineCoveragePct(input);
  return {
    lowConversion: conv !== null && conv < t.lowConversionPct,
    criticalConversion: conv !== null && conv < t.criticalConversionPct,
    weakRepeat: repeat !== null && repeat < t.weakRepeatRatePct,
    criticalRepeat: repeat !== null && repeat < t.criticalRepeatRatePct,
    highLost: lost !== null && lost > t.highLostCustomerRatePct,
    criticalLost: lost !== null && lost > t.criticalLostCustomerRatePct,
    highComplaint: complaint !== null && complaint > t.highComplaintToSalePct,
    highDiscount: discount !== null && discount > t.highDiscountDependencePct,
    highRefund: refund !== null && refund > t.highRefundRatePct,
    weakB2bPipeline: pipeline !== null && pipeline < t.weakB2bPipelineCoveragePct,
  };
}

// --- composite scores --------------------------------------------------------

export function salesRiskScore(input: SalesSnapshotInput, t: SalesThresholds): number {
  const s = deriveRiskSignals(input, t);
  let score = 0;
  if (s.criticalConversion) score += 25;
  else if (s.lowConversion) score += 12;
  if (s.criticalRepeat) score += 20;
  else if (s.weakRepeat) score += 10;
  if (s.criticalLost) score += 20;
  else if (s.highLost) score += 10;
  if (s.highComplaint) score += 12;
  if (s.highDiscount) score += 10;
  if (s.highRefund) score += 8;
  if (s.weakB2bPipeline) score += 8;
  return clampScore(score);
}

export function salesHealthScore(input: SalesSnapshotInput, t: SalesThresholds): number {
  const risk = salesRiskScore(input, t);
  const conv = leadToSaleConversionPct(input);
  // Conversion health maps lead→sale conversion (0..healthy) onto 0..100.
  let momentum = 50;
  if (conv !== null) momentum = clampScore((conv / t.healthyConversionPct) * 100);
  return clampScore(Math.round(0.6 * (100 - risk) + 0.4 * momentum));
}

export function salesOpportunityScore(input: SalesSnapshotInput, t: SalesThresholds): number {
  let score = 0;
  const conv = leadToSaleConversionPct(input);
  if (conv !== null && conv < t.healthyConversionPct) {
    score += Math.min(t.healthyConversionPct - conv, 30); // conversion upside
  }
  const repeat = repeatRatePct(input);
  if (repeat !== null && repeat < t.healthyRepeatRatePct) {
    score += Math.min((t.healthyRepeatRatePct - repeat) / 2, 25); // retention upside
  }
  const discount = discountDependencePct(input);
  if (discount !== null) score += Math.min(discount, 20); // discount-tightening upside
  const pipeline = b2bPipelineCoveragePct(input);
  if (pipeline !== null && pipeline > 0) score += Math.min(pipeline / 5, 15); // pipeline conversion
  const lost = lostCustomerRatePct(input);
  if (lost !== null && lost > 0) score += Math.min(lost, 15); // win-back upside
  return clampScore(score);
}

// --- sales state -------------------------------------------------------------

export function salesState(
  input: SalesSnapshotInput,
  t: SalesThresholds,
  dataConfidenceScore: number
): SalesState {
  const s = deriveRiskSignals(input, t);

  if (s.criticalConversion && (s.criticalRepeat || s.criticalLost)) return "CRITICAL";
  if (s.criticalConversion || s.criticalRepeat || s.criticalLost || s.highLost) return "WEAK";
  // Not enough trustworthy data to assert strength → caution.
  if (dataConfidenceScore < 50) return "SOFT";
  if (
    s.lowConversion ||
    s.weakRepeat ||
    s.highComplaint ||
    s.highDiscount ||
    s.highRefund ||
    s.weakB2bPipeline
  ) {
    return "SOFT";
  }
  const conv = leadToSaleConversionPct(input);
  const repeat = repeatRatePct(input);
  const strongConv = conv === null || conv >= t.healthyConversionPct;
  const strongRepeat = repeat === null || repeat >= t.healthyRepeatRatePct;
  return strongConv && strongRepeat ? "STRONG" : "STEADY";
}

export function salesTier(state: SalesState): SalesTier {
  switch (state) {
    case "CRITICAL":
      return "rescue";
    case "WEAK":
      return "recovery";
    case "SOFT":
    case "STEADY":
      return "growth";
    case "STRONG":
      return "optimization";
  }
}

// --- orchestrator ------------------------------------------------------------

/**
 * Compute the full deterministic sales metric set for one snapshot. Does not
 * mutate `input`. Missing/invalid inputs yield `null` metrics + a missing-input
 * list; composite scores stay 0..100 with confidence reflecting completeness.
 */
export function computeSalesMetrics(
  input: SalesSnapshotInput,
  opts: { now?: Date } = {}
): SalesDerivedMetrics {
  const t = resolveSalesThresholds(input.industryTemplate);
  const confidence = calculateDataConfidence(input, {
    now: opts.now,
    staleDays: t.staleSnapshotDays,
  });
  const state = salesState(input, t, confidence.dataConfidenceScore);

  return {
    currency: input.currency,
    currencyValid: isValidCurrency(input.currency),

    leadToSaleConversionPct: leadToSaleConversionPct(input),
    qualifiedConversionPct: qualifiedConversionPct(input),
    repeatRatePct: repeatRatePct(input),
    newCustomerSharePct: newCustomerSharePct(input),
    lostCustomerRatePct: lostCustomerRatePct(input),
    acquisitionPerDay: acquisitionPerDay(input),
    averageOrderValue: averageOrderValue(input),
    salesPerDay: salesPerDay(input),
    ordersPerDay: ordersPerDay(input),
    salesPerStaff: salesPerStaff(input),
    b2bSharePct: b2bSharePct(input),
    b2cSharePct: b2cSharePct(input),
    b2bPipelineCoveragePct: b2bPipelineCoveragePct(input),
    complaintToSaleRatioPct: complaintToSaleRatioPct(input),
    discountDependencePct: discountDependencePct(input),
    refundRatePct: refundRatePct(input),

    salesHealthScore: salesHealthScore(input, t),
    salesRiskScore: salesRiskScore(input, t),
    salesOpportunityScore: salesOpportunityScore(input, t),
    dataConfidenceScore: confidence.dataConfidenceScore,

    salesState: state,
    salesTier: salesTier(state),

    missingRequiredInputs: confidence.missingCritical,
  };
}
