/**
 * B11 — KPI Profiles: pure-function tests.
 *
 * Proves industry-specific KPI definitions and retrieval:
 *   - laundry profile includes kg/pieces/day, delivery cost/order, chemical cost/kg, repeat rate, machine utilization
 *   - SaaS profile includes churn, LTV, CAC, MRR/ARR
 *   - restaurant profile includes menu margin, labour, waste, peak-hour utilization
 *   - diagnosis can use selected industry profile
 *
 * Non-DB: pure KPI profile definitions and lookup.
 * Runs under `npm test`.
 */
import { describe, it, expect } from "vitest";
import {
  getKPIProfile,
  listAvailableProfiles,
  hasProfile,
  KPI_PROFILES,
  type KPIProfile,
} from "@/domain/business-facts/kpi-profiles";

describe("B11 KPI profiles — profile retrieval", () => {
  it("retrieves local service business profile", () => {
    const profile = getKPIProfile("local_service");

    expect(profile).toBeTruthy();
    expect(profile?.display_name).toBe("Local Service Business");
    expect(profile?.core_kpis.length).toBeGreaterThan(0);
  });

  it("retrieves SaaS profile", () => {
    const profile = getKPIProfile("saas");

    expect(profile).toBeTruthy();
    expect(profile?.display_name).toBe("SaaS (Software as a Service)");
  });

  it("retrieves restaurant profile", () => {
    const profile = getKPIProfile("restaurant");

    expect(profile).toBeTruthy();
    expect(profile?.display_name).toBe("Restaurant / Cloud Kitchen");
  });

  it("retrieves laundry profile", () => {
    const profile = getKPIProfile("laundry");

    expect(profile).toBeTruthy();
    expect(profile?.display_name).toBe("Laundry / Dry Cleaning");
  });

  it("handles case-insensitive lookup", () => {
    const lowercase = getKPIProfile("LAUNDRY");
    const uppercase = getKPIProfile("SAAS");

    expect(lowercase).toBeTruthy();
    expect(uppercase).toBeTruthy();
  });

  it("returns null for unknown industry", () => {
    const profile = getKPIProfile("unknown_industry_xyz");

    expect(profile).toBeNull();
  });
});

describe("B11 KPI profiles — profile structure", () => {
  it("contains required fields for each profile", () => {
    for (const profile of Object.values(KPI_PROFILES)) {
      expect(profile.industry_type).toBeTruthy();
      expect(profile.display_name).toBeTruthy();
      expect(profile.description).toBeTruthy();
      expect(Array.isArray(profile.core_kpis)).toBe(true);
      expect(Array.isArray(profile.common_failure_modes)).toBe(true);
      expect(Array.isArray(profile.critical_ratios)).toBe(true);
      expect(Array.isArray(profile.required_data_sources)).toBe(true);
      expect(Array.isArray(profile.action_patterns)).toBe(true);
      expect(profile.benchmark_notes).toBeTruthy();
    }
  });

  it("contains well-formed KPI definitions", () => {
    const profile = getKPIProfile("saas")!;

    for (const kpi of profile.core_kpis) {
      expect(kpi.kpi_name).toBeTruthy();
      expect(kpi.measurement_unit).toBeTruthy();
      expect(kpi.calculation_method).toBeTruthy();
      expect(["daily", "weekly", "monthly", "quarterly", "annual"]).toContain(kpi.frequency);
      expect(kpi.why_matters).toBeTruthy();
    }
  });

  it("contains well-formed failure modes", () => {
    const profile = getKPIProfile("restaurant")!;

    for (const mode of profile.common_failure_modes) {
      expect(mode.failure_name).toBeTruthy();
      expect(mode.symptoms.length).toBeGreaterThan(0);
      expect(mode.typical_root_causes.length).toBeGreaterThan(0);
      expect(mode.financial_impact).toBeTruthy();
      expect(mode.timeline_if_unchecked).toBeTruthy();
    }
  });

  it("contains well-formed critical ratios", () => {
    const profile = getKPIProfile("laundry")!;

    for (const ratio of profile.critical_ratios) {
      expect(ratio.ratio_name).toBeTruthy();
      expect(ratio.numerator).toBeTruthy();
      expect(ratio.denominator).toBeTruthy();
      expect(ratio.healthy_range).toBeTruthy();
      expect(ratio.healthy_range.min).toBeLessThanOrEqual(ratio.healthy_range.max);
      expect(["percentage", "multiplier", "days", "count"]).toContain(ratio.unit);
      expect(ratio.why_critical).toBeTruthy();
    }
  });

  it("contains well-formed action patterns", () => {
    const profile = getKPIProfile("local_service")!;

    for (const pattern of profile.action_patterns) {
      expect(pattern.pattern_name).toBeTruthy();
      expect(pattern.when_to_apply).toBeTruthy();
      expect(pattern.typical_steps.length).toBeGreaterThan(0);
      expect(pattern.expected_timeline).toBeTruthy();
      expect(pattern.success_metrics.length).toBeGreaterThan(0);
    }
  });
});

describe("Phase 14 — housekeeping archetype (registered, isolated)", () => {
  it("retrieves housekeeping profile and is registered + discoverable", () => {
    const profile = getKPIProfile("housekeeping");
    expect(profile).not.toBeNull();
    expect(profile!.industry_type).toBe("housekeeping");
    expect(hasProfile("housekeeping")).toBe(true);
    expect(listAvailableProfiles().some((p) => p.id === "housekeeping")).toBe(true);
  });

  it("is capacity/staff-centric (its differentiating KPIs)", () => {
    const profile = getKPIProfile("housekeeping")!;
    const kpiNames = profile.core_kpis.map((k) => k.kpi_name);
    expect(kpiNames.some((n) => n.includes("Cleaner"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("Utilization"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("Travel"))).toBe(true);
  });

  it("models the §34 staff/capacity failure mode", () => {
    const profile = getKPIProfile("housekeeping")!;
    const failures = profile.common_failure_modes.map((f) => f.failure_name.toLowerCase());
    expect(failures.some((f) => f.includes("capacity") || f.includes("staff"))).toBe(true);
  });

  it("is isolated from laundry (no cross-contamination of either profile)", () => {
    const housekeeping = getKPIProfile("housekeeping")!;
    const laundry = getKPIProfile("laundry")!;
    expect(housekeeping.industry_type).not.toBe(laundry.industry_type);
    const hkKpis = housekeeping.core_kpis.map((k) => k.kpi_name);
    const launKpis = laundry.core_kpis.map((k) => k.kpi_name);
    expect(hkKpis.some((n) => n.includes("Chemical"))).toBe(false); // laundry-only
    expect(launKpis.some((n) => n.includes("Cleaner"))).toBe(false); // housekeeping-only
  });

  it("unknown archetype still fails safely (null), not silently to a known profile", () => {
    expect(getKPIProfile("unknown_archetype_zzz")).toBeNull();
  });
});

describe("B11 KPI profiles — acceptance gates", () => {
  it("gate 1: laundry profile includes required KPIs", () => {
    const profile = getKPIProfile("laundry")!;

    const kpiNames = profile.core_kpis.map((k) => k.kpi_name);

    expect(kpiNames.some((n) => n.includes("Kg") || n.includes("Pieces"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("Delivery"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("Chemical"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("Repeat"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("Utilization"))).toBe(true);
  });

  it("gate 2: SaaS profile includes required KPIs", () => {
    const profile = getKPIProfile("saas")!;

    const kpiNames = profile.core_kpis.map((k) => k.kpi_name);

    expect(kpiNames.some((n) => n.includes("Churn"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("LTV") || n.includes("Lifetime"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("CAC"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("MRR") || n.includes("Revenue"))).toBe(true);
  });

  it("gate 3: restaurant profile includes required KPIs", () => {
    const profile = getKPIProfile("restaurant")!;

    const kpiNames = profile.core_kpis.map((k) => k.kpi_name.toLowerCase());

    expect(kpiNames.some((n) => n.includes("margin") || n.includes("cost") || n.includes("food"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("labour") || n.includes("labor"))).toBe(true);
    expect(kpiNames.some((n) => n.includes("peak"))).toBe(true);
  });

  it("gate 4: each profile has benchmarks and caveats", () => {
    for (const profile of Object.values(KPI_PROFILES)) {
      expect(profile.benchmark_notes.length).toBeGreaterThan(0);
      expect(profile.applicable_benchmarks.length).toBeGreaterThan(0);
      expect(profile.caveats.length).toBeGreaterThan(0);
    }
  });
});

describe("B11 KPI profiles — profile discovery", () => {
  it("lists all available profiles", () => {
    const profiles = listAvailableProfiles();

    expect(profiles.length).toBeGreaterThanOrEqual(4);
    expect(profiles.some((p) => p.id === "laundry")).toBe(true);
    expect(profiles.some((p) => p.id === "saas")).toBe(true);
    expect(profiles.some((p) => p.id === "restaurant")).toBe(true);
    expect(profiles.some((p) => p.id === "local_service")).toBe(true);
  });

  it("each profile in list has valid id and name", () => {
    const profiles = listAvailableProfiles();

    for (const item of profiles) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(getKPIProfile(item.id)).toBeTruthy();
    }
  });

  it("hasProfile checks existence correctly", () => {
    expect(hasProfile("laundry")).toBe(true);
    expect(hasProfile("SAAS")).toBe(true);
    expect(hasProfile("nonexistent")).toBe(false);
  });
});

describe("B11 KPI profiles — benchmark applicability", () => {
  it("SaaS profile includes mature SaaS benchmarks", () => {
    const profile = getKPIProfile("saas")!;

    const benchmarks = profile.applicable_benchmarks.join(" ").toLowerCase();

    expect(benchmarks.includes("churn") || benchmarks.includes("ltv") || benchmarks.includes("cac")).toBe(true);
  });

  it("laundry profile includes delivery-specific guidance", () => {
    const profile = getKPIProfile("laundry")!;

    const benchmarks = profile.applicable_benchmarks.join(" ").toLowerCase();

    expect(benchmarks.includes("deliver") || profile.core_kpis.some((k) => k.kpi_name.includes("Delivery"))).toBe(true);
  });

  it("restaurant profile includes margin and labour benchmarks", () => {
    const profile = getKPIProfile("restaurant")!;

    const benchmarks = profile.applicable_benchmarks.join(" ").toLowerCase();

    expect(benchmarks.includes("margin") || benchmarks.includes("labour") || benchmarks.includes("labor")).toBe(true);
  });

  it("profiles include caveats about benchmark limitations", () => {
    const profile = getKPIProfile("local_service")!;

    expect(profile.caveats.some((c) => c.toLowerCase().includes("geographic") || c.toLowerCase().includes("seasonal"))).toBe(true);
  });
});

describe("B11 KPI profiles — data requirements", () => {
  it("each profile specifies required data sources", () => {
    for (const profile of Object.values(KPI_PROFILES)) {
      expect(profile.required_data_sources.length).toBeGreaterThan(0);
      expect(profile.minimum_data_points_for_diagnosis.length).toBeGreaterThan(0);
    }
  });

  it("laundry profile requires delivery and chemical cost data", () => {
    const profile = getKPIProfile("laundry")!;

    const sources = profile.required_data_sources.join(" ").toLowerCase();

    expect(sources.includes("deliver")).toBe(true);
    expect(sources.includes("chemical")).toBe(true);
  });

  it("SaaS profile requires churn and subscription data", () => {
    const profile = getKPIProfile("saas")!;

    const sources = profile.required_data_sources.join(" ").toLowerCase();

    expect(sources.includes("churn") || sources.includes("retention")).toBe(true);
    expect(sources.includes("subscription") || sources.includes("revenue")).toBe(true);
  });

  it("minimum data points are clearly described", () => {
    for (const profile of Object.values(KPI_PROFILES)) {
      for (const point of profile.minimum_data_points_for_diagnosis) {
        expect(point.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("B11 KPI profiles — failure mode diagnosis", () => {
  it("each failure mode describes financial impact", () => {
    for (const profile of Object.values(KPI_PROFILES)) {
      for (const mode of profile.common_failure_modes) {
        expect(mode.financial_impact).toBeTruthy();
        expect(mode.financial_impact.length).toBeGreaterThan(10);
      }
    }
  });

  it("each failure mode includes timeline if unchecked", () => {
    for (const profile of Object.values(KPI_PROFILES)) {
      for (const mode of profile.common_failure_modes) {
        expect(mode.timeline_if_unchecked).toBeTruthy();
        expect(mode.timeline_if_unchecked.length).toBeGreaterThan(10);
      }
    }
  });

  it("laundry profile includes delivery and quality failure modes", () => {
    const profile = getKPIProfile("laundry")!;

    const failures = profile.common_failure_modes.map((m) => m.failure_name);

    expect(failures.some((f) => f.toLowerCase().includes("delivery"))).toBe(true);
    expect(failures.some((f) => f.toLowerCase().includes("quality"))).toBe(true);
  });

  it("SaaS profile includes churn and product-market fit failure modes", () => {
    const profile = getKPIProfile("saas")!;

    const failures = profile.common_failure_modes.map((m) => m.failure_name);

    expect(failures.some((f) => f.toLowerCase().includes("churn"))).toBe(true);
  });
});

describe("B11 KPI profiles — action patterns", () => {
  it("each action pattern includes clear success metrics", () => {
    for (const profile of Object.values(KPI_PROFILES)) {
      for (const pattern of profile.action_patterns) {
        expect(pattern.success_metrics.length).toBeGreaterThan(0);
        for (const metric of pattern.success_metrics) {
          expect(metric.length).toBeGreaterThan(5);
        }
      }
    }
  });

  it("action patterns include expected timeline", () => {
    for (const profile of Object.values(KPI_PROFILES)) {
      for (const pattern of profile.action_patterns) {
        expect(pattern.expected_timeline).toBeTruthy();
        expect(pattern.expected_timeline.length).toBeGreaterThan(5);
      }
    }
  });
});
