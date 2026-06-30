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
