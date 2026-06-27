/**
 * Archetype Operational Metrics — vocabulary + pure derivation (Dynamic Budget).
 *
 * Owners (or imports) record manual / import-ready operational figures per archetype.
 * This module defines the metric-type vocabulary and a PURE function that derives the
 * archetype-pack signal inputs (`LaundryArchetypeSignals` / `HousekeepingArchetypeSignals`)
 * from the latest non-stale metrics, so the existing archetype packs + working-capital ×
 * archetype cross-integration become DB-driven through reassessment. No new engine.
 *
 * Honesty: stale metrics are excluded (so confidence is never inflated by old data); when
 * no usable metrics remain the archetype pack falls back to `archetype_data_insufficient`.
 */
import type { LaundryArchetypeSignals, HousekeepingArchetypeSignals } from "@/domain/owner-budget/archetype-packs";

/** Laundry metric types (storable). The starred subset maps to pack signal inputs. */
export const LAUNDRY_METRIC_TYPES = [
  "chemical_usage", "chemical_cost", "load_count", "order_count", "kg_processed",
  "delivery_count", "delivery_cost", "delivery_revenue", "fuel_cost", "rewash_count",
  "rewash_rate_pct", "damage_refund_amount", "refund_rate_pct", "machine_downtime_hours",
  "maintenance_cost", "b2b_kg_price", "b2b_payment_terms_days", "b2b_contribution_margin_pct",
  "discount_amount", "discount_rate_pct", "contribution_after_discount_pct",
  "low_value_delivery_share_pct", "chemical_cost_baseline_per_order", "staff_output",
] as const;

/** Housekeeping metric types (storable). The starred subset maps to pack signal inputs. */
export const HOUSEKEEPING_METRIC_TYPES = [
  "job_count", "labour_hours", "labour_cost", "labour_hours_baseline_per_job",
  "travel_time", "travel_cost", "travel_time_share_pct", "supervisor_hours", "supervisor_cost",
  "supplies_usage", "supplies_cost", "supplies_expected_per_job", "complaint_count",
  "rework_rate_pct", "no_show_count", "no_show_rate_pct", "recurring_contract_price",
  "recurring_payment_terms_days", "recurring_contract_margin_pct", "overtime_hours",
  "overtime_cost", "overtime_output_gain_pct", "route_density", "retention_pct", "staff_output",
] as const;

export const GENERIC_METRIC_TYPES = [
  "labour_utilization_pct", "gross_margin_pct", "repeat_customer_rate_pct", "service_cost",
  "rework_refund_cost", "customer_acquisition_cost", "collection_days", "staff_capacity",
] as const;

export const ARCHETYPE_METRIC_TYPES: readonly string[] = [
  ...LAUNDRY_METRIC_TYPES, ...HOUSEKEEPING_METRIC_TYPES, ...GENERIC_METRIC_TYPES,
];

export function isValidMetricType(t: string): boolean {
  return ARCHETYPE_METRIC_TYPES.includes(t);
}

export interface ArchetypeMetricRow {
  archetype: string;
  metricType: string;
  value: number;
  metricDate: string | Date;
  sourceType?: string | null;
}

export interface DerivedArchetypeSignals {
  laundry?: LaundryArchetypeSignals;
  housekeeping?: HousekeepingArchetypeSignals;
  /** True when some metrics existed but were excluded as stale. */
  stale: boolean;
  /** Count of metric types actually consumed into signal inputs. */
  used: number;
}

// metricType → signal field for each archetype (the consumed subset).
const LAUNDRY_MAP: Record<string, keyof LaundryArchetypeSignals> = {
  chemical_cost: "chemicalCost",
  order_count: "orderVolume",
  chemical_cost_baseline_per_order: "chemicalCostBaselinePerOrder",
  delivery_cost: "deliveryCost",
  delivery_revenue: "deliveryRevenue",
  delivery_count: "deliveryCount",
  rewash_rate_pct: "rewashRatePct",
  refund_rate_pct: "refundRatePct",
  b2b_contribution_margin_pct: "b2bContributionMarginPct",
  machine_downtime_hours: "machineDowntimeHours",
  discount_rate_pct: "discountRatePct",
  contribution_after_discount_pct: "contributionAfterDiscountPct",
  low_value_delivery_share_pct: "lowValueDeliverySharePct",
};
const HOUSEKEEPING_MAP: Record<string, keyof HousekeepingArchetypeSignals> = {
  labour_hours: "labourHours",
  job_count: "jobsCompleted",
  labour_hours_baseline_per_job: "labourHoursBaselinePerJob",
  travel_time_share_pct: "travelTimeSharePct",
  rework_rate_pct: "reworkRatePct",
  no_show_rate_pct: "noShowRatePct",
  overtime_cost: "overtimeCost",
  overtime_output_gain_pct: "overtimeOutputGainPct",
  recurring_contract_margin_pct: "recurringContractMarginPct",
  supplies_usage: "suppliesUsage",
  supplies_expected_per_job: "suppliesExpectedPerJob",
};

function ms(d: string | Date): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

/**
 * Derive archetype-pack signal inputs from persisted metrics. Pure: pass `asOf`.
 * Uses the latest non-stale value per metric type; excludes metrics older than
 * `staleAfterDays` (default 45) so stale data never inflates confidence.
 */
export function deriveArchetypeSignalsFromMetrics(
  archetype: string,
  metrics: ArchetypeMetricRow[],
  asOf: string | Date,
  staleAfterDays = 45
): DerivedArchetypeSignals {
  const result: DerivedArchetypeSignals = { stale: false, used: 0 };
  if (archetype !== "laundry" && archetype !== "housekeeping") return result;

  const cutoff = ms(asOf) - staleAfterDays * 86_400_000;
  const map = archetype === "laundry" ? LAUNDRY_MAP : HOUSEKEEPING_MAP;

  // Latest value per metricType (only the consumed subset), tracking staleness.
  const latest = new Map<string, { value: number; t: number }>();
  for (const m of metrics) {
    if (!(m.metricType in map)) continue;
    const t = ms(m.metricDate);
    if (Number.isNaN(t)) continue;
    if (t < cutoff) { result.stale = true; continue; } // stale → excluded
    const prev = latest.get(m.metricType);
    if (!prev || t > prev.t) latest.set(m.metricType, { value: m.value, t });
  }

  if (latest.size === 0) return result;

  const signals: Record<string, number> = {};
  for (const [metricType, { value }] of latest) {
    signals[map[metricType] as string] = value;
  }
  result.used = latest.size;
  if (archetype === "laundry") result.laundry = signals as LaundryArchetypeSignals;
  else result.housekeeping = signals as HousekeepingArchetypeSignals;
  return result;
}
