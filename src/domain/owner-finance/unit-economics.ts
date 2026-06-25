/**
 * Module 6 — Unit Economics & Pricing (pure domain core).
 *
 * The existing growth/unit-economics-engine.ts covers CAC/LTV. This adds the
 * per-unit PROFIT economics the spec requires and the audit found missing:
 * contribution margin, profit per order / labour-hour / machine-hour / delivery-km,
 * margin floor / minimum viable price, loss-making detection, and B2B-vs-retail
 * segment profitability. Pure + deterministic; persistence + wiring layer on top.
 *
 * Optimizes for PROFIT, not revenue: a discount below the margin floor or a
 * negative contribution margin is flagged, never silently accepted.
 */

export interface OrderEconomicsInput {
  /** Revenue for the order/unit (post-discount price actually charged). */
  revenue: number;
  /** Direct variable costs attributable to the order. */
  labourCost?: number;
  materialCost?: number;
  deliveryCost?: number;
  reworkCost?: number;
  refundCost?: number;
  otherDirectCost?: number;
}

export interface ResourceUsageInput {
  labourHours?: number;
  machineHours?: number;
  deliveryKm?: number;
}

function n(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Total direct (variable) cost of an order. */
export function totalDirectCost(o: OrderEconomicsInput): number {
  return n(o.labourCost) + n(o.materialCost) + n(o.deliveryCost) + n(o.reworkCost) + n(o.refundCost) + n(o.otherDirectCost);
}

/** Contribution margin (revenue − direct cost). Negative means the order loses money per unit. */
export function contributionMargin(o: OrderEconomicsInput): number {
  return n(o.revenue) - totalDirectCost(o);
}

/** Contribution margin as a fraction of revenue (0 when revenue is 0). */
export function contributionMarginPct(o: OrderEconomicsInput): number {
  const rev = n(o.revenue);
  if (rev <= 0) return 0;
  return contributionMargin(o) / rev;
}

export const profitPerOrder = contributionMargin;

/** Profit per labour hour (null when no labour hours recorded). */
export function profitPerLabourHour(o: OrderEconomicsInput, usage: ResourceUsageInput): number | null {
  const h = n(usage.labourHours);
  return h > 0 ? contributionMargin(o) / h : null;
}

/** Profit per machine hour (null when no machine hours recorded). */
export function profitPerMachineHour(o: OrderEconomicsInput, usage: ResourceUsageInput): number | null {
  const h = n(usage.machineHours);
  return h > 0 ? contributionMargin(o) / h : null;
}

/** Profit per delivery km (null when no distance recorded). */
export function profitPerDeliveryKm(o: OrderEconomicsInput, usage: ResourceUsageInput): number | null {
  const km = n(usage.deliveryKm);
  return km > 0 ? contributionMargin(o) / km : null;
}

/** A service/order is loss-making when its contribution margin is negative. */
export function isLossMaking(o: OrderEconomicsInput): boolean {
  return contributionMargin(o) < 0;
}

/**
 * Minimum viable price to hit a target contribution-margin fraction (0..1) given
 * the order's direct cost. Returns the price at which contributionMarginPct == target.
 */
export function minimumViablePrice(directCost: number, targetMarginPct: number): number {
  const t = Math.min(Math.max(targetMarginPct, 0), 0.99);
  if (t <= 0) return directCost;
  return directCost / (1 - t);
}

/** The lowest price that still clears the margin floor; a discount below it is unsafe. */
export function marginFloorPrice(directCost: number, marginFloorPct: number): number {
  return minimumViablePrice(directCost, marginFloorPct);
}

export interface DiscountSafetyResult {
  proposedPrice: number;
  floorPrice: number;
  safe: boolean;
  resultingMarginPct: number;
}

/** Is a proposed (discounted) price still at/above the margin floor? */
export function assessDiscountSafety(directCost: number, proposedPrice: number, marginFloorPct: number): DiscountSafetyResult {
  const floorPrice = marginFloorPrice(directCost, marginFloorPct);
  const resultingMarginPct = proposedPrice > 0 ? (proposedPrice - directCost) / proposedPrice : 0;
  return { proposedPrice, floorPrice, safe: proposedPrice >= floorPrice, resultingMarginPct };
}

export interface SegmentProfitability {
  segment: string;
  contributionMargin: number;
  contributionMarginPct: number;
}

export type SegmentComparison =
  | { higherMarginSegment: string; marginGapPct: number; bothProfitable: boolean }
  | { higherMarginSegment: null; marginGapPct: 0; bothProfitable: boolean };

/** Compare two segments (e.g. B2B vs retail) by contribution-margin fraction. */
export function compareSegmentProfitability(a: SegmentProfitability, b: SegmentProfitability): SegmentComparison {
  const bothProfitable = a.contributionMargin > 0 && b.contributionMargin > 0;
  if (a.contributionMarginPct === b.contributionMarginPct) {
    return { higherMarginSegment: null, marginGapPct: 0, bothProfitable };
  }
  const higher = a.contributionMarginPct > b.contributionMarginPct ? a : b;
  const lower = higher === a ? b : a;
  return {
    higherMarginSegment: higher.segment,
    marginGapPct: higher.contributionMarginPct - lower.contributionMarginPct,
    bothProfitable,
  };
}

/** Build a SegmentProfitability summary from a set of orders in that segment. */
export function summarizeSegment(segment: string, orders: OrderEconomicsInput[]): SegmentProfitability {
  const totalRevenue = orders.reduce((s, o) => s + n(o.revenue), 0);
  const totalCm = orders.reduce((s, o) => s + contributionMargin(o), 0);
  return {
    segment,
    contributionMargin: totalCm,
    contributionMarginPct: totalRevenue > 0 ? totalCm / totalRevenue : 0,
  };
}
