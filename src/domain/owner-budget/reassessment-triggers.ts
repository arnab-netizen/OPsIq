/**
 * Dynamic Reassessment trigger classifier (Section 4). Pure, deterministic.
 *
 * Maps a material-change descriptor to whether budget reassessment is required and
 * which trigger class it belongs to. The SERVICE layer is responsible for actually
 * enqueuing/running the reassessment from real mutation paths; this is the pure
 * rule that decides materiality (so it can be unit-tested independently).
 */

export type ReassessmentTriggerClass =
  | "BUDGET_STRUCTURE" | "ACTUAL_FINANCIAL" | "REVENUE" | "OPERATIONAL"
  | "SALES_MARKETING" | "EMPLOYEE_GOVERNANCE" | "EXTERNAL_PLANNING" | "NONE";

/** Canonical material change kinds (subset of Section 4 A–G that the engine acts on). */
export type MaterialChangeKind =
  // A. budget structure
  | "budget_period_created" | "budget_line_added" | "budget_line_removed"
  | "budget_line_amount_changed" | "budget_owner_changed" | "approval_threshold_changed"
  | "reserve_target_changed" | "business_goal_changed" | "budget_scenario_changed"
  // B. actual financial
  | "spend_entry_added" | "spend_entry_edited" | "spend_entry_voided"
  | "spend_proof_uploaded" | "spend_proof_disputed" | "committed_spend_added"
  | "payment_status_changed" | "reconciliation_changed" | "cash_balance_changed"
  | "receivable_changed" | "payable_changed" | "owner_drawing_added"
  | "debt_obligation_changed" | "statutory_obligation_changed"
  // C. revenue
  | "revenue_changed" | "refunds_discounts_changed" | "revenue_assurance_exception"
  // D. operational
  | "capacity_changed" | "quality_metric_changed"
  // E. sales/marketing
  | "campaign_spend_changed" | "cac_changed" | "channel_roi_changed"
  // F. employee governance
  | "approval_violation_detected" | "split_spend_detected" | "self_approval_detected"
  | "proof_compliance_changed"
  // G. external/planning
  | "seasonality_changed" | "vendor_price_changed" | "supplier_bank_changed"
  // non-material
  | "note_edited" | "label_renamed";

const TRIGGER_MAP: Record<MaterialChangeKind, ReassessmentTriggerClass> = {
  budget_period_created: "BUDGET_STRUCTURE",
  budget_line_added: "BUDGET_STRUCTURE",
  budget_line_removed: "BUDGET_STRUCTURE",
  budget_line_amount_changed: "BUDGET_STRUCTURE",
  budget_owner_changed: "BUDGET_STRUCTURE",
  approval_threshold_changed: "BUDGET_STRUCTURE",
  reserve_target_changed: "BUDGET_STRUCTURE",
  business_goal_changed: "BUDGET_STRUCTURE",
  budget_scenario_changed: "BUDGET_STRUCTURE",

  spend_entry_added: "ACTUAL_FINANCIAL",
  spend_entry_edited: "ACTUAL_FINANCIAL",
  spend_entry_voided: "ACTUAL_FINANCIAL",
  spend_proof_uploaded: "ACTUAL_FINANCIAL",
  spend_proof_disputed: "ACTUAL_FINANCIAL",
  committed_spend_added: "ACTUAL_FINANCIAL",
  payment_status_changed: "ACTUAL_FINANCIAL",
  reconciliation_changed: "ACTUAL_FINANCIAL",
  cash_balance_changed: "ACTUAL_FINANCIAL",
  receivable_changed: "ACTUAL_FINANCIAL",
  payable_changed: "ACTUAL_FINANCIAL",
  owner_drawing_added: "ACTUAL_FINANCIAL",
  debt_obligation_changed: "ACTUAL_FINANCIAL",
  statutory_obligation_changed: "ACTUAL_FINANCIAL",

  revenue_changed: "REVENUE",
  refunds_discounts_changed: "REVENUE",
  revenue_assurance_exception: "REVENUE",

  capacity_changed: "OPERATIONAL",
  quality_metric_changed: "OPERATIONAL",

  campaign_spend_changed: "SALES_MARKETING",
  cac_changed: "SALES_MARKETING",
  channel_roi_changed: "SALES_MARKETING",

  approval_violation_detected: "EMPLOYEE_GOVERNANCE",
  split_spend_detected: "EMPLOYEE_GOVERNANCE",
  self_approval_detected: "EMPLOYEE_GOVERNANCE",
  proof_compliance_changed: "EMPLOYEE_GOVERNANCE",

  seasonality_changed: "EXTERNAL_PLANNING",
  vendor_price_changed: "EXTERNAL_PLANNING",
  supplier_bank_changed: "EXTERNAL_PLANNING",

  note_edited: "NONE",
  label_renamed: "NONE",
};

export interface ReassessmentTriggerResult {
  requiresReassessment: boolean;
  triggerClass: ReassessmentTriggerClass;
  /** True for the high-priority financial/cash/proof triggers that must run immediately. */
  immediate: boolean;
}

const IMMEDIATE_CLASSES: ReadonlySet<ReassessmentTriggerClass> = new Set([
  "ACTUAL_FINANCIAL", "REVENUE", "BUDGET_STRUCTURE", "EMPLOYEE_GOVERNANCE",
]);

export function classifyMaterialChange(kind: MaterialChangeKind): ReassessmentTriggerResult {
  const triggerClass = TRIGGER_MAP[kind] ?? "NONE";
  const requiresReassessment = triggerClass !== "NONE";
  return {
    requiresReassessment,
    triggerClass,
    immediate: requiresReassessment && IMMEDIATE_CLASSES.has(triggerClass),
  };
}
