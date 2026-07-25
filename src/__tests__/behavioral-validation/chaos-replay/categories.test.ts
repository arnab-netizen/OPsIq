/**
 * Required business categories + mandatory cross-cutting chaos case types (§9). The counted corpus must
 * span the 15 required real-world-like categories and include every mandatory chaos type.
 */
import { describe, it, expect } from "vitest";
import { REQUIRED_CATEGORIES, computeCoverage } from "@/behavioral-validation/chaos-replay/chaos-corpus";
import { CHAOS_TYPES } from "@/behavioral-validation/chaos-replay/chaos-schema";

const cov = computeCoverage();

const MANDATORY_CHAOS_TYPES = [
  "cash_profit", "staff_workload", "customer_reputation", "proof_fraud_completion", "growth_scale_temptation",
  "owner_pressure_bad_idea", "missing_data_fake_confidence", "novelty_ood", "stop_reject_pause",
  "shutdown_pivot_stoploss", "high_revenue_bad_business", "manipulation_collusion_fraud",
  "compliance_professional_boundary", "vendor_supplier_disruption", "cyber_payment_data_loss",
] as const;

describe("required categories + mandatory chaos types — structural assertions", () => {
  it("MANDATORY_CHAOS_TYPES has exactly 15 entries", () => {
    expect(MANDATORY_CHAOS_TYPES).toHaveLength(15);
  });
  it("all entries in MANDATORY_CHAOS_TYPES are non-empty strings", () => {
    for (const t of MANDATORY_CHAOS_TYPES) {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
    }
  });
  it("MANDATORY_CHAOS_TYPES includes 'cash_profit'", () => {
    expect(MANDATORY_CHAOS_TYPES).toContain("cash_profit");
  });
  it("MANDATORY_CHAOS_TYPES includes 'novelty_ood'", () => {
    expect(MANDATORY_CHAOS_TYPES).toContain("novelty_ood");
  });
  it("MANDATORY_CHAOS_TYPES includes 'shutdown_pivot_stoploss'", () => {
    expect(MANDATORY_CHAOS_TYPES).toContain("shutdown_pivot_stoploss");
  });
  it("MANDATORY_CHAOS_TYPES includes 'manipulation_collusion_fraud'", () => {
    expect(MANDATORY_CHAOS_TYPES).toContain("manipulation_collusion_fraud");
  });
  it("MANDATORY_CHAOS_TYPES includes 'compliance_professional_boundary'", () => {
    expect(MANDATORY_CHAOS_TYPES).toContain("compliance_professional_boundary");
  });
  it("MANDATORY_CHAOS_TYPES includes 'high_revenue_bad_business'", () => {
    expect(MANDATORY_CHAOS_TYPES).toContain("high_revenue_bad_business");
  });
  it("computeCoverage() returns an object with a categories array", () => {
    expect(Array.isArray(cov.categories)).toBe(true);
  });
  it("computeCoverage() categories array is non-empty", () => {
    expect(cov.categories.length).toBeGreaterThan(0);
  });
  it("computeCoverage() returns chaosTypeCounts object", () => {
    expect(typeof cov.chaosTypeCounts).toBe("object");
    expect(cov.chaosTypeCounts).not.toBeNull();
  });
  it("computeCoverage() returns perCategory object", () => {
    expect(typeof cov.perCategory).toBe("object");
    expect(cov.perCategory).not.toBeNull();
  });
  it("all MANDATORY_CHAOS_TYPES are declared in CHAOS_TYPES taxonomy", () => {
    for (const t of MANDATORY_CHAOS_TYPES) {
      expect(CHAOS_TYPES).toContain(t);
    }
  });
  it("REQUIRED_CATEGORIES has exactly 15 entries", () => {
    expect(REQUIRED_CATEGORIES).toHaveLength(15);
  });
  it("all REQUIRED_CATEGORIES are unique strings", () => {
    expect(new Set(REQUIRED_CATEGORIES).size).toBe(REQUIRED_CATEGORIES.length);
  });
  it("coverage categories array covers all REQUIRED_CATEGORIES", () => {
    for (const cat of REQUIRED_CATEGORIES) {
      expect(cov.categories).toContain(cat);
    }
  });
  it("each mandatory chaos type has coverage count >= 1", () => {
    for (const t of MANDATORY_CHAOS_TYPES) {
      expect(cov.chaosTypeCounts[t] ?? 0).toBeGreaterThanOrEqual(1);
    }
  });
  it("MANDATORY_CHAOS_TYPES entries are all lowercase_snake_case", () => {
    for (const t of MANDATORY_CHAOS_TYPES) {
      expect(t).toMatch(/^[a-z_]+$/);
    }
  });
});

describe("required categories + mandatory chaos types (§9)", () => {
  it("covers all 15 required real-world-like categories", () => {
    expect(REQUIRED_CATEGORIES.length).toBe(15);
    for (const cat of REQUIRED_CATEGORIES) {
      expect(cov.categories, cat).toContain(cat);
      expect(cov.perCategory[cat].total, cat).toBeGreaterThanOrEqual(5);
    }
  });

  it("includes every mandatory cross-cutting chaos case type", () => {
    for (const t of MANDATORY_CHAOS_TYPES) {
      expect(cov.chaosTypeCounts[t] ?? 0, t).toBeGreaterThanOrEqual(1);
    }
    // the mandatory list is a subset of the declared chaos-type taxonomy
    for (const t of MANDATORY_CHAOS_TYPES) expect(CHAOS_TYPES).toContain(t);
  });
});
