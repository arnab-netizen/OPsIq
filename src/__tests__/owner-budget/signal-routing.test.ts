/**
 * Dynamic Budget — cross-module signal routing map (pure unit proof).
 *
 * Proves: every emitted signal type routes to a consumption decision (no signal
 * dropped); financially-material signals route to finance re-diagnosis (a real
 * consumer); governance/data-quality signals are consumed by the audit ledger;
 * pull-model domains are honestly marked as gaps with a reason; determinism.
 */
import { describe, it, expect } from "vitest";
import {
  routeBudgetSignal,
  routeBudgetSignals,
  requiresFinanceReDiagnosis,
} from "@/domain/owner-budget/signal-routing";
import type { BudgetSignalType } from "@/domain/owner-budget/types";

const FINANCIAL: BudgetSignalType[] = [
  "cash_runway_risk", "statutory_reserve_breach", "budget_variance_critical",
  "profit_guardrail_breach", "unit_economics_negative", "profitable_but_cash_negative",
];

const AUDIT_CONSUMED: BudgetSignalType[] = [
  "spend_proof_missing", "reconciliation_exception", "manager_budget_violation",
  "approval_bypass_risk", "owner_override_recorded", "working_capital_data_stale",
  "working_capital_data_insufficient", "archetype_data_insufficient",
];

const GAP_SAMPLES: BudgetSignalType[] = [
  "revenue_leakage_risk", "receivables_ageing_risk", "vendor_pressure_risk",
  "laundry_consumable_leakage", "housekeeping_overtime_without_output",
  "underinvestment_detected", "laundry_b2b_margin_risk",
];

describe("routeBudgetSignal", () => {
  it("routes financially-material signals to finance re-diagnosis (real consumer)", () => {
    for (const t of FINANCIAL) {
      const r = routeBudgetSignal(t);
      expect(r.consumptionMode).toBe("RE_DIAGNOSE_FINANCE");
      expect(r.consumerExists).toBe(true);
      expect(r.gapReason).toBeUndefined();
    }
  });

  it("routes governance/data-quality signals to the audit ledger (real consumer, audit-only)", () => {
    for (const t of AUDIT_CONSUMED) {
      const r = routeBudgetSignal(t);
      expect(r.consumptionMode).toBe("AUDIT_SIGNAL_ONLY");
      expect(r.targetDomain).toBe("owner_risk_audit");
      expect(r.consumerExists).toBe(true);
      expect(r.gapReason).toBeUndefined();
    }
  });

  it("routes pull-model domains as documented gaps (safe audit-only, reason present)", () => {
    for (const t of GAP_SAMPLES) {
      const r = routeBudgetSignal(t);
      expect(r.consumptionMode).toBe("AUDIT_SIGNAL_ONLY");
      expect(r.consumerExists).toBe(false);
      expect(typeof r.gapReason).toBe("string");
      expect((r.gapReason ?? "").length).toBeGreaterThan(0);
    }
  });

  it("every gap route carries a non-empty reason; every consumed route carries none", () => {
    for (const t of [...FINANCIAL, ...AUDIT_CONSUMED, ...GAP_SAMPLES]) {
      const r = routeBudgetSignal(t);
      if (r.consumerExists) expect(r.gapReason).toBeUndefined();
      else expect(r.gapReason && r.gapReason.length > 0).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(routeBudgetSignal("cash_runway_risk")).toEqual(routeBudgetSignal("cash_runway_risk"));
    expect(routeBudgetSignal("vendor_pressure_risk")).toEqual(routeBudgetSignal("vendor_pressure_risk"));
  });
});

describe("routeBudgetSignals / requiresFinanceReDiagnosis", () => {
  it("preserves order and length", () => {
    const types: BudgetSignalType[] = ["cash_runway_risk", "vendor_pressure_risk", "spend_proof_missing"];
    const routes = routeBudgetSignals(types);
    expect(routes.map((r) => r.type)).toEqual(types);
  });

  it("flags finance re-diagnosis only when a financial signal is present", () => {
    expect(requiresFinanceReDiagnosis(routeBudgetSignals(["vendor_pressure_risk", "spend_proof_missing"]))).toBe(false);
    expect(requiresFinanceReDiagnosis(routeBudgetSignals(["vendor_pressure_risk", "cash_runway_risk"]))).toBe(true);
  });
});
