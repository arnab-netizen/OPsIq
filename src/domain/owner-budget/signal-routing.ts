/**
 * Dynamic Budget — cross-module signal routing map (Slice 6).
 *
 * Pure, deterministic decision layer that maps each emitted {@link BudgetSignal}
 * to the owner domain that should consume it and HOW it is consumed. It does NOT
 * perform any I/O — the service layer (`signal-router.service.ts`) executes the
 * routing decision (audit emission + the one real push consumer).
 *
 * Honesty rules (no fabricated consumers, no new modules):
 * - The only proven cross-module *push* precedent in the codebase is the finance
 *   action → finance re-diagnosis pattern. Financially-material budget signals
 *   (cash/profit/unit-economics) therefore route to `RE_DIAGNOSE_FINANCE`, which
 *   refreshes the finance cycle and so feeds business-condition/health
 *   (`financeCycleToDomainScore`). This is a real consumer.
 * - The audit/owner-risk ledger is a genuine universal consumer; governance,
 *   data-quality and override signals route there as `AUDIT_SIGNAL_ONLY` with
 *   `consumerExists: true`.
 * - Every other owner domain (sales, operations, marketing, staffing, scale
 *   readiness, external procurement) runs diagnosis from its OWN snapshot (a pull
 *   model). There is no push-consumption interface, and budget must not invent one
 *   or duplicate those snapshots. Those signals route as `AUDIT_SIGNAL_ONLY` with
 *   `consumerExists: false` and an explicit `gapReason` — a safe budget-side signal
 *   only, with the gap documented rather than faked.
 */
import type { BudgetSignalType } from "@/domain/owner-budget/types";

/** Conceptual owner domain a budget signal is addressed to. */
export type SignalTargetDomain =
  | "health"
  | "finance_pricing"
  | "sales_collections"
  | "procurement_vendor"
  | "operations"
  | "staffing"
  | "marketing_roi"
  | "owner_risk_audit"
  | "scale_readiness";

/**
 * How the signal is consumed:
 * - `RE_DIAGNOSE_FINANCE`: triggers a finance re-diagnosis (the proven push
 *   precedent); the refreshed finance cycle feeds business-condition/health.
 * - `AUDIT_SIGNAL_ONLY`: emits a structured cross-module audit signal only. For
 *   `owner_risk_audit` targets the audit ledger IS the consumer; for pull-model
 *   domains it is a safe budget-side signal with the consumption gap documented.
 */
export type SignalConsumptionMode = "RE_DIAGNOSE_FINANCE" | "AUDIT_SIGNAL_ONLY";

export interface SignalRoute {
  type: BudgetSignalType;
  targetDomain: SignalTargetDomain;
  consumptionMode: SignalConsumptionMode;
  /** True when a real consumer receives this (finance re-diagnosis or the audit/owner-risk ledger). */
  consumerExists: boolean;
  /** Why no push consumer exists (present iff `consumerExists` is false). */
  gapReason?: string;
}

/** Why a pull-model domain has no push-consumption interface (documented gap, not a stub). */
const GAP_REASON: Record<SignalTargetDomain, string> = {
  health: "business condition is assembled on read from each domain cycle; no push trigger",
  finance_pricing: "no dedicated pricing module; the finance snapshot does not capture this margin lever, so finance re-diagnosis cannot reflect it",
  sales_collections: "owner-sales runs diagnosis from its own sales snapshot; no push-consumption interface",
  procurement_vendor: "vendor control is native to budget; no separate procurement module to push to",
  operations: "owner-operations runs diagnosis from its own operations snapshot; no push-consumption interface",
  staffing: "no staffing module exists in the codebase",
  marketing_roi: "owner-marketing runs diagnosis from its own marketing snapshot; no push-consumption interface",
  owner_risk_audit: "", // consumer exists (audit ledger) — never used
  scale_readiness: "owner-strategy/portfolio runs diagnosis from its own snapshot; no push-consumption interface",
};

function reDiagnose(type: BudgetSignalType, targetDomain: SignalTargetDomain): SignalRoute {
  return { type, targetDomain, consumptionMode: "RE_DIAGNOSE_FINANCE", consumerExists: true };
}

/** Audit-only with a real consumer (the audit/owner-risk ledger). */
function auditConsumed(type: BudgetSignalType, targetDomain: SignalTargetDomain): SignalRoute {
  return { type, targetDomain, consumptionMode: "AUDIT_SIGNAL_ONLY", consumerExists: true };
}

/** Audit-only, no push consumer — safe budget-side signal with the gap documented. */
function auditGap(type: BudgetSignalType, targetDomain: SignalTargetDomain): SignalRoute {
  return { type, targetDomain, consumptionMode: "AUDIT_SIGNAL_ONLY", consumerExists: false, gapReason: GAP_REASON[targetDomain] };
}

/**
 * Exhaustive routing table. `satisfies Record<BudgetSignalType, ...>` makes adding
 * a new signal type a compile error until it is routed here — no signal is ever
 * silently dropped.
 */
const ROUTES = {
  // --- Financially material → finance re-diagnosis (refreshes health via finance cycle) ---
  cash_runway_risk: reDiagnose("cash_runway_risk", "health"),
  statutory_reserve_breach: reDiagnose("statutory_reserve_breach", "health"),
  budget_variance_critical: reDiagnose("budget_variance_critical", "health"),
  profit_guardrail_breach: reDiagnose("profit_guardrail_breach", "finance_pricing"),
  unit_economics_negative: reDiagnose("unit_economics_negative", "finance_pricing"),
  profitable_but_cash_negative: reDiagnose("profitable_but_cash_negative", "health"),

  // --- Governance / risk / data-quality → audit ledger (real consumer) ---
  spend_proof_missing: auditConsumed("spend_proof_missing", "owner_risk_audit"),
  reconciliation_exception: auditConsumed("reconciliation_exception", "owner_risk_audit"),
  manager_budget_violation: auditConsumed("manager_budget_violation", "owner_risk_audit"),
  approval_bypass_risk: auditConsumed("approval_bypass_risk", "owner_risk_audit"),
  owner_override_recorded: auditConsumed("owner_override_recorded", "owner_risk_audit"),
  working_capital_data_stale: auditConsumed("working_capital_data_stale", "owner_risk_audit"),
  working_capital_data_insufficient: auditConsumed("working_capital_data_insufficient", "owner_risk_audit"),
  archetype_data_insufficient: auditConsumed("archetype_data_insufficient", "owner_risk_audit"),

  // --- Informational / meta (budget-internal state) → health, audit-only ---
  reassessment_required: auditConsumed("reassessment_required", "owner_risk_audit"),
  updated_plan_ready: auditConsumed("updated_plan_ready", "owner_risk_audit"),
  laundry_reserve_protected_by_downtime_and_receivables: auditConsumed("laundry_reserve_protected_by_downtime_and_receivables", "owner_risk_audit"),

  // --- Pull-model domains: safe budget-side signal only, gap documented ---
  underinvestment_detected: auditGap("underinvestment_detected", "scale_readiness"),
  growth_budget_available: auditGap("growth_budget_available", "scale_readiness"),
  growth_budget_blocked: auditGap("growth_budget_blocked", "scale_readiness"),
  scale_budget_ready: auditGap("scale_budget_ready", "scale_readiness"),
  scale_budget_blocked: auditGap("scale_budget_blocked", "scale_readiness"),
  growth_blocked_by_working_capital: auditGap("growth_blocked_by_working_capital", "scale_readiness"),

  revenue_leakage_risk: auditGap("revenue_leakage_risk", "sales_collections"),
  working_capital_risk: auditGap("working_capital_risk", "sales_collections"),
  receivables_ageing_risk: auditGap("receivables_ageing_risk", "sales_collections"),
  collection_first_required: auditGap("collection_first_required", "sales_collections"),
  cash_conversion_risk: auditGap("cash_conversion_risk", "sales_collections"),
  laundry_b2b_cash_conversion_risk: auditGap("laundry_b2b_cash_conversion_risk", "sales_collections"),
  laundry_b2b_payment_terms_risk: auditGap("laundry_b2b_payment_terms_risk", "sales_collections"),
  housekeeping_recurring_contract_cash_risk: auditGap("housekeeping_recurring_contract_cash_risk", "sales_collections"),

  vendor_control_risk: auditGap("vendor_control_risk", "procurement_vendor"),
  payables_ageing_risk: auditGap("payables_ageing_risk", "procurement_vendor"),
  vendor_pressure_risk: auditGap("vendor_pressure_risk", "procurement_vendor"),

  laundry_consumable_leakage: auditGap("laundry_consumable_leakage", "operations"),
  laundry_delivery_uneconomic: auditGap("laundry_delivery_uneconomic", "operations"),
  laundry_machine_downtime_risk: auditGap("laundry_machine_downtime_risk", "operations"),
  housekeeping_travel_inefficiency: auditGap("housekeeping_travel_inefficiency", "operations"),
  housekeeping_supplies_variance: auditGap("housekeeping_supplies_variance", "operations"),

  laundry_b2b_margin_risk: auditGap("laundry_b2b_margin_risk", "finance_pricing"),
  laundry_discount_contribution_risk: auditGap("laundry_discount_contribution_risk", "finance_pricing"),
  housekeeping_contract_underpriced: auditGap("housekeeping_contract_underpriced", "finance_pricing"),

  housekeeping_overtime_without_output: auditGap("housekeeping_overtime_without_output", "staffing"),
  housekeeping_payroll_collection_conflict: auditGap("housekeeping_payroll_collection_conflict", "staffing"),
} satisfies Record<BudgetSignalType, SignalRoute>;

/** Route a single budget signal type to its consumption decision. */
export function routeBudgetSignal(type: BudgetSignalType): SignalRoute {
  return ROUTES[type];
}

/** Route a list of emitted signals (deterministic, order-preserving). */
export function routeBudgetSignals(types: BudgetSignalType[]): SignalRoute[] {
  return types.map(routeBudgetSignal);
}

/** True if any of the routed signals require a finance re-diagnosis push. */
export function requiresFinanceReDiagnosis(routes: SignalRoute[]): boolean {
  return routes.some((r) => r.consumptionMode === "RE_DIAGNOSE_FINANCE");
}
