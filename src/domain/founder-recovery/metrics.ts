/**
 * Founder Recovery — metric calculation engine.
 *
 * Pure functions. Every derived metric is computed from the persisted snapshot
 * shape (and optionally the previous snapshot for trends). Currency is taken
 * from the snapshot; nothing is hardcoded to USD. When inputs are missing the
 * result is `null` (never a fabricated number).
 */
import type { MetricSnapshotInput, DerivedMetrics } from "./types";
import { CASH_PRESSURE } from "./thresholds";

/** Safe division: returns null when denominator is missing/zero or inputs are undefined. */
function ratio(numerator: number | undefined, denominator: number | undefined): number | null {
  if (numerator === undefined || denominator === undefined) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Percentage helper. */
function pct(numerator: number | undefined, denominator: number | undefined): number | null {
  const r = ratio(numerator, denominator);
  return r === null ? null : round(r * 100);
}

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Trend percentage from previous to current. */
function trendPct(current: number | undefined, previous: number | undefined): number | null {
  if (current === undefined || previous === undefined) return null;
  if (previous === 0) return null;
  return round(((current - previous) / Math.abs(previous)) * 100);
}

/** Gross profit, using explicit value if provided, else revenue - directCosts approximation. */
function grossMargin(s: MetricSnapshotInput): number | null {
  if (s.grossProfit !== undefined && s.revenue !== undefined && s.revenue !== 0) {
    return round((s.grossProfit / s.revenue) * 100);
  }
  // Derive from material + delivery as direct costs if gross profit absent.
  if (s.revenue !== undefined && s.revenue !== 0 && (s.materialCost !== undefined || s.deliveryCost !== undefined)) {
    const direct = (s.materialCost ?? 0) + (s.deliveryCost ?? 0);
    return round(((s.revenue - direct) / s.revenue) * 100);
  }
  return null;
}

function netMargin(s: MetricSnapshotInput): number | null {
  if (s.netProfit !== undefined && s.revenue !== undefined && s.revenue !== 0) {
    return round((s.netProfit / s.revenue) * 100);
  }
  if (s.revenue !== undefined && s.revenue !== 0 && s.totalCosts !== undefined) {
    return round(((s.revenue - s.totalCosts) / s.revenue) * 100);
  }
  return null;
}

function averageOrderValue(s: MetricSnapshotInput): number | null {
  if (s.averageOrderValue !== undefined) return round(s.averageOrderValue);
  const r = ratio(s.revenue, s.orderCount);
  return r === null ? null : round(r);
}

function repeatRate(s: MetricSnapshotInput): number | null {
  if (s.repeatCustomers === undefined) return null;
  const totalCustomers =
    (s.repeatCustomers ?? 0) + (s.newCustomers ?? 0);
  if (totalCustomers === 0) return null;
  return round((s.repeatCustomers / totalCustomers) * 100);
}

function marketingConversionEfficiency(s: MetricSnapshotInput): number | null {
  // conversions per 1000 currency units of marketing spend
  if (s.campaignConversions === undefined || s.marketingSpend === undefined) return null;
  if (s.marketingSpend === 0) return null;
  return round((s.campaignConversions / s.marketingSpend) * 1000);
}

function discountLeakage(s: MetricSnapshotInput): number | null {
  if (s.discountAmount === undefined || s.revenue === undefined) return null;
  const grossRevenue = s.revenue + s.discountAmount; // revenue is net of discount
  if (grossRevenue === 0) return null;
  return round((s.discountAmount / grossRevenue) * 100);
}

function cashPressure(
  receivablesExposurePct: number | null,
  netMarginPct: number | null
): "low" | "medium" | "high" | null {
  if (receivablesExposurePct === null && netMarginPct === null) return null;
  let score = 0;
  if (receivablesExposurePct !== null) {
    if (receivablesExposurePct >= CASH_PRESSURE.highReceivablesExposurePct) score += 2;
    else if (receivablesExposurePct >= CASH_PRESSURE.mediumReceivablesExposurePct) score += 1;
  }
  if (netMarginPct !== null && netMarginPct < CASH_PRESSURE.lowNetMarginPct) {
    score += netMarginPct < 0 ? 2 : 1;
  }
  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
}

/**
 * Calculate all derived metrics from a current snapshot and an optional
 * previous snapshot (for trends).
 */
export function calculateMetrics(
  current: MetricSnapshotInput,
  previous?: MetricSnapshotInput
): DerivedMetrics {
  const receivablesExposurePct = pct(current.receivables, current.revenue);
  const netMarginPct = netMargin(current);

  const complaintCount = current.complaintCount ?? undefined;
  const rewashCount = current.rewashCount ?? undefined;
  const refundAmount = current.refundAmount ?? undefined;

  const b2bShare = pct(
    current.b2bRevenue,
    current.revenue ??
      (current.b2bRevenue !== undefined && current.b2cRevenue !== undefined
        ? current.b2bRevenue + current.b2cRevenue
        : undefined)
  );
  const b2cShare = pct(
    current.b2cRevenue,
    current.revenue ??
      (current.b2bRevenue !== undefined && current.b2cRevenue !== undefined
        ? current.b2bRevenue + current.b2cRevenue
        : undefined)
  );

  return {
    currency: current.currency,
    revenueTrendPct: trendPct(current.revenue, previous?.revenue),
    costTrendPct: trendPct(current.totalCosts, previous?.totalCosts),
    grossMarginPct: grossMargin(current),
    netMarginPct,
    orderTrendPct: trendPct(current.orderCount, previous?.orderCount),
    averageOrderValue: averageOrderValue(current),
    repeatCustomerRatePct: repeatRate(current),
    b2bSharePct: b2bShare,
    b2cSharePct: b2cShare,
    complaintRatePct: pct(complaintCount, current.orderCount),
    refundRatePct: pct(refundAmount, current.revenue),
    rewashRatePct: pct(rewashCount, current.orderCount),
    receivablesExposurePct,
    deliveryCostRatioPct: pct(current.deliveryCost, current.revenue),
    marketingConversionEfficiency: marketingConversionEfficiency(current),
    staffProductivity:
      current.staffProductivity !== undefined
        ? round(current.staffProductivity)
        : ratio(current.orderCount, current.staffCost) !== null
          ? round(ratio(current.orderCount, current.staffCost)! * 1000)
          : null,
    turnaroundHours:
      current.averageTurnaroundHours !== undefined ? round(current.averageTurnaroundHours) : null,
    discountLeakagePct: discountLeakage(current),
    cashPressureIndicator: cashPressure(receivablesExposurePct, netMarginPct),
  };
}
