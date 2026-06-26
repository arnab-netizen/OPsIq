/**
 * Module 23 — Supplier & Inventory Control (pure domain core).
 *
 * Reorder points, days-of-cover, stockout risk, supplier reliability, and PO
 * suggestions — so OpsIQ can flag "inventory below safe minimum" / supplier risk
 * (a false-lean trigger in M11) and recommend reordering before service breaks.
 * Pure + deterministic.
 */

function n(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export interface StockItemInput {
  sku: string;
  currentQty: number;
  dailyUsage: number;
  leadTimeDays: number;
  safetyStock?: number;
  /** Order up to this level when reordering (defaults to reorderPoint + lead-time demand). */
  reorderUpToQty?: number;
}

/** Reorder point = (daily usage × lead time) + safety stock. */
export function reorderPoint(i: StockItemInput): number {
  return n(i.dailyUsage) * n(i.leadTimeDays) + n(i.safetyStock);
}

/** Days of cover remaining at current usage (Infinity when no usage). */
export function daysOfCover(i: StockItemInput): number {
  const usage = n(i.dailyUsage);
  if (usage <= 0) return Infinity;
  return n(i.currentQty) / usage;
}

export function isBelowReorderPoint(i: StockItemInput): boolean {
  return n(i.currentQty) <= reorderPoint(i);
}

export function isStockout(i: StockItemInput): boolean {
  return n(i.currentQty) <= 0;
}

export type StockoutRisk = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "STOCKOUT";

/** Risk based on whether cover survives the replenishment lead time. */
export function stockoutRisk(i: StockItemInput): StockoutRisk {
  if (isStockout(i)) return "STOCKOUT";
  const cover = daysOfCover(i);
  const lead = n(i.leadTimeDays);
  if (cover === Infinity) return "NONE";
  if (cover <= lead) return "HIGH"; // will run out before a reorder arrives
  if (isBelowReorderPoint(i)) return "MEDIUM"; // below reorder point but cover > lead
  if (cover <= lead * 2) return "LOW";
  return "NONE";
}

export interface ReorderSuggestion {
  sku: string;
  shouldReorder: boolean;
  suggestedOrderQty: number;
  risk: StockoutRisk;
  daysOfCover: number;
}

/** Suggest a PO quantity to return to the order-up-to level when below reorder point. */
export function suggestReorder(i: StockItemInput): ReorderSuggestion {
  const rp = reorderPoint(i);
  const orderUpTo = n(i.reorderUpToQty) || rp + n(i.dailyUsage) * n(i.leadTimeDays);
  const shouldReorder = isBelowReorderPoint(i);
  const suggestedOrderQty = shouldReorder ? Math.max(orderUpTo - n(i.currentQty), 0) : 0;
  return { sku: i.sku, shouldReorder, suggestedOrderQty, risk: stockoutRisk(i), daysOfCover: daysOfCover(i) };
}

export interface SupplierInput {
  supplierId: string;
  deliveriesOnTime: number;
  deliveriesTotal: number;
  /** Outstanding payable that, if unpaid, risks supply cutoff. */
  overduePayable?: number;
}

export type SupplierReliability = "RELIABLE" | "WATCH" | "UNRELIABLE" | "UNKNOWN";

/** On-time delivery rate (0 when no deliveries recorded). */
export function onTimeRate(s: SupplierInput): number {
  const total = n(s.deliveriesTotal);
  return total > 0 ? n(s.deliveriesOnTime) / total : 0;
}

export function classifySupplier(s: SupplierInput): SupplierReliability {
  if (n(s.deliveriesTotal) === 0) return "UNKNOWN";
  const rate = onTimeRate(s);
  if (rate >= 0.95) return "RELIABLE";
  if (rate >= 0.8) return "WATCH";
  return "UNRELIABLE";
}

/** Supply is at risk when an overdue payable could trigger a cutoff. */
export function supplyCutoffRisk(s: SupplierInput): boolean {
  return n(s.overduePayable) > 0;
}
