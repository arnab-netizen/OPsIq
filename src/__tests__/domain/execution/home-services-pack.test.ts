import { describe, it, expect } from "vitest";
import {
  HOME_SERVICES_PACK_SLOTS,
  createHomeServicesPack,
  assessDispatchEfficiency,
  firstTimeFixRate,
} from "@/domain/execution/home-services-pack";
import { assessPackConfidence } from "@/domain/execution/archetype-packs";
import { ContextConfidence } from "@/domain/execution/business-context";

describe("Module 32 — Local Home Services / Maintenance Operating Pack", () => {
  it("[module32] creates a home_services pack with all slots empty + low confidence", () => {
    const pack = createHomeServicesPack();
    expect(pack.archetype).toBe("home_services");
    expect(Object.keys(pack.slots).sort()).toEqual(
      [...HOME_SERVICES_PACK_SLOTS].sort()
    );
    for (const key of HOME_SERVICES_PACK_SLOTS) {
      const slot = pack.slots[key];
      expect(slot.key).toBe(key);
      expect(slot.value).toBeNull();
      expect(slot.sourceId).toBeNull();
      expect(slot.confidence).toBe(ContextConfidence.LOW);
    }
  });

  it("[module32] slot set covers the required field-service knowledge areas", () => {
    const required = [
      "service_area_radius_km",
      "dispatch_and_scheduling_model",
      "emergency_callout_policy",
      "parts_inventory_and_markup",
      "technician_certification_requirements",
      "callback_and_warranty_policy",
      "seasonal_demand_patterns",
      "pricing_model_flat_vs_hourly",
      "first_time_fix_rate_targets",
      "insurance_and_liability_coverage",
      "subcontractor_vs_inhouse_mix",
      "review_and_reputation_channels",
    ];
    for (const key of required) {
      expect(HOME_SERVICES_PACK_SLOTS).toContain(key);
    }
    // No duplicate slot keys.
    expect(new Set(HOME_SERVICES_PACK_SLOTS).size).toBe(
      HOME_SERVICES_PACK_SLOTS.length
    );
  });

  it("[module32] assessPackConfidence reflects a partially-filled pack", () => {
    const empty = createHomeServicesPack();
    const emptyResult = assessPackConfidence(empty);
    expect(emptyResult.confidence).toBe(ContextConfidence.LOW);
    expect(emptyResult.filledSlots).toHaveLength(0);
    expect(emptyResult.missingSlots).toHaveLength(
      HOME_SERVICES_PACK_SLOTS.length
    );

    // Fill half the slots (does not mutate the original via a fresh copy).
    const total = HOME_SERVICES_PACK_SLOTS.length;
    const fillCount = Math.ceil(total / 2);
    const partial = createHomeServicesPack();
    const partialSlots = { ...partial.slots };
    for (let i = 0; i < fillCount; i++) {
      const key = HOME_SERVICES_PACK_SLOTS[i];
      partialSlots[key] = {
        ...partialSlots[key],
        value: "known",
        confidence: ContextConfidence.MEDIUM,
      };
    }
    const partialPack = { ...partial, slots: partialSlots };

    const result = assessPackConfidence(partialPack);
    expect(result.filledSlots).toHaveLength(fillCount);
    expect(result.missingSlots).toHaveLength(total - fillCount);
    // 6/12 = 0.5 ratio -> MEDIUM band.
    expect(result.confidence).toBe(ContextConfidence.MEDIUM);
  });

  it("[module32] assessDispatchEfficiency — efficient happy path", () => {
    const r = assessDispatchEfficiency({
      jobsCompleted: 19,
      jobsScheduled: 20,
      avgTravelMinutes: 30,
      billableMinutes: 270,
    });
    expect(r.completionRate).toBeCloseTo(0.95, 5);
    expect(r.travelRatio).toBeCloseTo(0.1, 5);
    expect(r.efficiencyBand).toBe("EFFICIENT");
  });

  it("[module32] assessDispatchEfficiency — acceptable middle band", () => {
    const r = assessDispatchEfficiency({
      jobsCompleted: 16,
      jobsScheduled: 20,
      avgTravelMinutes: 90,
      billableMinutes: 210,
    });
    expect(r.completionRate).toBeCloseTo(0.8, 5);
    expect(r.travelRatio).toBeCloseTo(0.3, 5);
    expect(r.efficiencyBand).toBe("ACCEPTABLE");
  });

  it("[module32] assessDispatchEfficiency — poor when completion low", () => {
    const r = assessDispatchEfficiency({
      jobsCompleted: 10,
      jobsScheduled: 20,
      avgTravelMinutes: 10,
      billableMinutes: 290,
    });
    expect(r.completionRate).toBeCloseTo(0.5, 5);
    expect(r.efficiencyBand).toBe("POOR");
  });

  it("[module32] assessDispatchEfficiency — poor when travel dominates", () => {
    const r = assessDispatchEfficiency({
      jobsCompleted: 20,
      jobsScheduled: 20,
      avgTravelMinutes: 200,
      billableMinutes: 100,
    });
    expect(r.completionRate).toBeCloseTo(1, 5);
    expect(r.travelRatio).toBeCloseTo(0.6667, 3);
    expect(r.efficiencyBand).toBe("POOR");
  });

  it("[module32] assessDispatchEfficiency — edge: zero scheduled and zero billable (no divide-by-zero)", () => {
    const r = assessDispatchEfficiency({
      jobsCompleted: 0,
      jobsScheduled: 0,
      avgTravelMinutes: 0,
      billableMinutes: 0,
    });
    expect(Number.isFinite(r.completionRate)).toBe(true);
    expect(Number.isFinite(r.travelRatio)).toBe(true);
    expect(r.completionRate).toBe(0);
    expect(r.travelRatio).toBe(0);
    // completionRate 0 (< 0.7) -> POOR.
    expect(r.efficiencyBand).toBe("POOR");
  });

  it("[module32] assessDispatchEfficiency — edge: zero billable with travel", () => {
    const r = assessDispatchEfficiency({
      jobsCompleted: 5,
      jobsScheduled: 5,
      avgTravelMinutes: 120,
      billableMinutes: 0,
    });
    expect(r.travelRatio).toBe(1);
    expect(r.efficiencyBand).toBe("POOR");
  });

  it("[module32] firstTimeFixRate — happy path", () => {
    expect(firstTimeFixRate({ firstVisitResolved: 85, totalJobs: 100 })).toBeCloseTo(
      0.85,
      5
    );
  });

  it("[module32] firstTimeFixRate — zero jobs returns 0 (no divide-by-zero)", () => {
    const v = firstTimeFixRate({ firstVisitResolved: 0, totalJobs: 0 });
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(0);
  });
});
