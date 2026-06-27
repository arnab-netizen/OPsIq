/**
 * Archetype Operational Metrics — pure derivation unit proof (no DB).
 *
 * Proves persisted metric rows map to the archetype-pack signal inputs, stale metrics
 * are excluded (confidence not inflated), and generic/empty inputs derive nothing.
 */
import { describe, it, expect } from "vitest";
import {
  deriveArchetypeSignalsFromMetrics,
  isValidMetricType,
  type ArchetypeMetricRow,
} from "@/domain/owner-budget/archetype-metrics";

const ASOF = new Date("2026-06-27T00:00:00Z");
const daysBefore = (n: number) => new Date(ASOF.getTime() - n * 86_400_000).toISOString();
const row = (metricType: string, value: number, daysOld = 1, archetype = "laundry"): ArchetypeMetricRow =>
  ({ archetype, metricType, value, metricDate: daysBefore(daysOld), sourceType: "MANUAL" });

describe("isValidMetricType", () => {
  it("accepts known types and rejects unknown", () => {
    expect(isValidMetricType("chemical_cost")).toBe(true);
    expect(isValidMetricType("travel_time_share_pct")).toBe(true);
    expect(isValidMetricType("totally_made_up")).toBe(false);
  });
});

describe("deriveArchetypeSignalsFromMetrics — laundry", () => {
  it("maps consumed metric types to laundry signal fields", () => {
    const d = deriveArchetypeSignalsFromMetrics("laundry", [
      row("chemical_cost", 60000), row("order_count", 1000), row("chemical_cost_baseline_per_order", 40),
      row("b2b_contribution_margin_pct", 4), row("machine_downtime_hours", 12),
      row("delivery_cost", 50000), row("delivery_revenue", 30000),
    ], ASOF);
    expect(d.laundry).toBeDefined();
    expect(d.laundry!.chemicalCost).toBe(60000);
    expect(d.laundry!.orderVolume).toBe(1000);
    expect(d.laundry!.chemicalCostBaselinePerOrder).toBe(40);
    expect(d.laundry!.b2bContributionMarginPct).toBe(4);
    expect(d.laundry!.machineDowntimeHours).toBe(12);
    expect(d.used).toBeGreaterThanOrEqual(7);
  });

  it("uses the latest value per metric type", () => {
    const d = deriveArchetypeSignalsFromMetrics("laundry", [
      row("b2b_contribution_margin_pct", 4, 30), row("b2b_contribution_margin_pct", 18, 1),
    ], ASOF);
    expect(d.laundry!.b2bContributionMarginPct).toBe(18); // newest wins
  });

  it("excludes stale metrics (older than the window) and flags stale", () => {
    const d = deriveArchetypeSignalsFromMetrics("laundry", [row("machine_downtime_hours", 12, 120)], ASOF);
    expect(d.stale).toBe(true);
    expect(d.laundry).toBeUndefined(); // stale-only ⇒ no usable signals
    expect(d.used).toBe(0);
  });
});

describe("deriveArchetypeSignalsFromMetrics — housekeeping & fallbacks", () => {
  it("maps housekeeping metric types", () => {
    const d = deriveArchetypeSignalsFromMetrics("housekeeping", [
      row("travel_time_share_pct", 35, 1, "housekeeping"),
      row("recurring_contract_margin_pct", 6, 1, "housekeeping"),
      row("labour_hours", 500, 1, "housekeeping"), row("job_count", 100, 1, "housekeeping"),
    ], ASOF);
    expect(d.housekeeping!.travelTimeSharePct).toBe(35);
    expect(d.housekeeping!.recurringContractMarginPct).toBe(6);
    expect(d.housekeeping!.labourHours).toBe(500);
    expect(d.housekeeping!.jobsCompleted).toBe(100);
  });

  it("generic archetype derives nothing", () => {
    expect(deriveArchetypeSignalsFromMetrics("generic", [row("chemical_cost", 1)], ASOF).laundry).toBeUndefined();
  });

  it("no metrics derives nothing", () => {
    const d = deriveArchetypeSignalsFromMetrics("laundry", [], ASOF);
    expect(d.laundry).toBeUndefined();
    expect(d.used).toBe(0);
    expect(d.stale).toBe(false);
  });
});
