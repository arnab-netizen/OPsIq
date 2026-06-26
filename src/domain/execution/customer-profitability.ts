/**
 * Module 17 — Customer Profitability (pure domain core).
 *
 * Per-customer contribution margin, complaint rate, and a simple lifetime-value
 * estimate, with a profitability classification so the recommendation engine can
 * tell which customers/segments are actually profitable (not just high-revenue).
 * Pure + deterministic.
 */

function n(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export interface CustomerProfitInput {
  customerId: string;
  segment?: string | null;
  revenue: number;
  directCost: number;
  orders?: number;
  complaints?: number;
  /** Average monthly contribution margin (for CLV); defaults from revenue/cost if absent. */
  avgMonthlyMargin?: number;
  /** Expected active months (lifespan) for CLV. */
  expectedLifespanMonths?: number;
}

export type CustomerProfitClass = "PROFITABLE" | "MARGINAL" | "LOSS_MAKING";

export interface CustomerProfitability {
  customerId: string;
  segment: string | null;
  contributionMargin: number;
  contributionMarginPct: number;
  complaintRate: number;
  estimatedLtv: number;
  classification: CustomerProfitClass;
  highMaintenance: boolean;
}

/** Complaint rate = complaints / orders (0 when no orders). */
export function complaintRate(i: CustomerProfitInput): number {
  const orders = n(i.orders);
  return orders > 0 ? n(i.complaints) / orders : 0;
}

/** Simple LTV = avg monthly margin × expected lifespan months. */
export function estimateLtv(i: CustomerProfitInput): number {
  const cm = i.revenue - i.directCost;
  const monthly = typeof i.avgMonthlyMargin === "number" ? i.avgMonthlyMargin : cm;
  const months = n(i.expectedLifespanMonths) || 1;
  return monthly * months;
}

export function classifyCustomer(contributionMarginPct: number): CustomerProfitClass {
  if (contributionMarginPct <= 0) return "LOSS_MAKING";
  if (contributionMarginPct < 0.15) return "MARGINAL";
  return "PROFITABLE";
}

/** Assess a single customer's profitability. High maintenance when complaint rate >= 20%. */
export function assessCustomerProfitability(i: CustomerProfitInput): CustomerProfitability {
  const cm = i.revenue - i.directCost;
  const cmPct = n(i.revenue) > 0 ? cm / i.revenue : 0;
  const rate = complaintRate(i);
  return {
    customerId: i.customerId,
    segment: i.segment ?? null,
    contributionMargin: cm,
    contributionMarginPct: cmPct,
    complaintRate: rate,
    estimatedLtv: estimateLtv(i),
    classification: classifyCustomer(cmPct),
    highMaintenance: rate >= 0.2,
  };
}

export interface SegmentProfitabilityRollup {
  segment: string;
  totalContributionMargin: number;
  contributionMarginPct: number;
  customerCount: number;
  lossMakingCount: number;
}

/** Roll up per-customer profitability by segment. */
export function rollupBySegment(customers: CustomerProfitInput[]): SegmentProfitabilityRollup[] {
  const map = new Map<string, { rev: number; cm: number; count: number; loss: number }>();
  for (const c of customers) {
    const seg = c.segment ?? "unspecified";
    const a = assessCustomerProfitability(c);
    const e = map.get(seg) ?? { rev: 0, cm: 0, count: 0, loss: 0 };
    e.rev += n(c.revenue);
    e.cm += a.contributionMargin;
    e.count += 1;
    if (a.classification === "LOSS_MAKING") e.loss += 1;
    map.set(seg, e);
  }
  return [...map.entries()].map(([segment, e]) => ({
    segment,
    totalContributionMargin: e.cm,
    contributionMarginPct: e.rev > 0 ? e.cm / e.rev : 0,
    customerCount: e.count,
    lossMakingCount: e.loss,
  }));
}

/** Customers ranked by contribution margin, descending. */
export function rankByProfitability(customers: CustomerProfitInput[]): CustomerProfitability[] {
  return customers.map(assessCustomerProfitability).sort((a, b) => b.contributionMargin - a.contributionMargin);
}
