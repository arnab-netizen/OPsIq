/**
 * Laundry + housekeeping workflow libraries (Slices 17 & 18).
 *
 * Broad base-template libraries (≥24 each) with personalization hooks. Each entry
 * is a `BaseWorkflowTemplate` (so it personalizes via `personalizeWorkflow` and is
 * never employee-visible directly) plus the Slice 17/18 required fields: purpose,
 * allowed/forbidden roles, default steps/proof/escalation, default owner-boundary
 * needs, outcome metric, profit/cash relevance, and employee burden level.
 */

import { BaseWorkflowTemplate } from "@/domain/execution/sop";
import { BurdenLevel } from "@/domain/execution/operational-capacity";

export interface WorkflowLibraryEntry extends BaseWorkflowTemplate {
  purpose: string;
  defaultOwnerBoundaryNeeds: string[];
  profitCashRelevance: string;
  employeeBurdenLevel: BurdenLevel;
}

interface WfSpec {
  id: string;
  archetype: string;
  title: string;
  purpose: string;
  roles: string[];
  forbidden?: string[];
  outcome: string;
  profit: string;
  burden: BurdenLevel;
  steps?: string[];
  proof?: string[];
  escalation?: string[];
  boundary?: string[];
}

function wf(spec: WfSpec): WorkflowLibraryEntry {
  const steps = spec.steps ?? [
    `Prepare for: ${spec.title}`,
    `Perform: ${spec.title}`,
    `Record completion of: ${spec.title}`,
  ];
  return {
    kind: "BASE",
    baseTemplateId: spec.id,
    businessArchetype: spec.archetype,
    title: spec.title,
    purpose: spec.purpose,
    defaultSteps: steps.map((instruction, i) => ({ order: i + 1, instruction })),
    defaultProofRequirements: spec.proof ?? ["short_note", "checklist_completion"],
    defaultEscalationRules: spec.escalation ?? ["unresolved issue → manager"],
    allowedRoles: spec.roles,
    forbiddenRoles: spec.forbidden ?? [],
    defaultOwnerBoundaryNeeds: spec.boundary ?? ["scope", "customer_promise_limits"],
    outcomeMetric: spec.outcome,
    profitCashRelevance: spec.profit,
    employeeBurdenLevel: spec.burden,
  };
}

const L = (n: number) => `laundry-${n.toString().padStart(2, "0")}`;
const H = (n: number) => `housekeeping-${n.toString().padStart(2, "0")}`;
const COUNTER = ["counter_staff"];
const OPS = ["operator"];
const CLEAN = ["cleaner"];
const SUP = ["supervisor"];

export const LAUNDRY_WORKFLOWS: WorkflowLibraryEntry[] = [
  wf({ id: L(1), archetype: "laundry", title: "Customer/order intake", purpose: "Capture order + customer details accurately", roles: COUNTER, outcome: "intake_accuracy", profit: "revenue_per_order", burden: BurdenLevel.LOW }),
  wf({ id: L(2), archetype: "laundry", title: "Garment/linen tagging and custody", purpose: "Tag and take custody of every item", roles: COUNTER, outcome: "items_tagged_pct", profit: "loss_prevention", burden: BurdenLevel.MEDIUM, proof: ["tag_photo"] }),
  wf({ id: L(3), archetype: "laundry", title: "Sorting", purpose: "Sort by fabric/color/process", roles: OPS, outcome: "sorting_error_rate", profit: "rework_reduction", burden: BurdenLevel.LOW }),
  wf({ id: L(4), archetype: "laundry", title: "Stain/pre-treatment", purpose: "Pre-treat stains before wash", roles: OPS, outcome: "stain_removal_pct", profit: "rework_reduction", burden: BurdenLevel.MEDIUM, proof: ["before_after_image"] }),
  wf({ id: L(5), archetype: "laundry", title: "Washing/dry-cleaning process", purpose: "Run the correct wash program", roles: OPS, outcome: "process_compliance", profit: "chemical_energy_cost", burden: BurdenLevel.MEDIUM }),
  wf({ id: L(6), archetype: "laundry", title: "Drying", purpose: "Dry per fabric spec", roles: OPS, outcome: "drying_compliance", profit: "energy_cost", burden: BurdenLevel.LOW }),
  wf({ id: L(7), archetype: "laundry", title: "Pressing/ironing/finishing", purpose: "Finish to quality standard", roles: OPS, outcome: "finish_quality", profit: "rework_reduction", burden: BurdenLevel.MEDIUM, proof: ["photo"] }),
  wf({ id: L(8), archetype: "laundry", title: "Quality inspection", purpose: "Inspect before packing", roles: SUP, outcome: "defect_catch_rate", profit: "complaint_reduction", burden: BurdenLevel.MEDIUM, proof: ["checklist_completion"] }),
  wf({ id: L(9), archetype: "laundry", title: "Packing and reconciliation", purpose: "Pack and reconcile item counts", roles: OPS, outcome: "reconciliation_accuracy", profit: "loss_prevention", burden: BurdenLevel.MEDIUM, proof: ["checklist_completion"] }),
  wf({ id: L(10), archetype: "laundry", title: "Pickup scheduling", purpose: "Schedule customer pickup", roles: COUNTER, outcome: "on_time_pickup", profit: "retention", burden: BurdenLevel.LOW }),
  wf({ id: L(11), archetype: "laundry", title: "Delivery dispatch", purpose: "Dispatch deliveries on route", roles: ["delivery_runner"], outcome: "on_time_delivery", profit: "delivery_cost", burden: BurdenLevel.MEDIUM, proof: ["delivery_proof"] }),
  wf({ id: L(12), archetype: "laundry", title: "Payment collection/reconciliation", purpose: "Collect and reconcile payment", roles: COUNTER, outcome: "cash_reconciled", profit: "cash_collected", burden: BurdenLevel.HIGH, proof: ["payment_confirmation"], escalation: ["payment mismatch → manager + owner"], boundary: ["max_discount", "refund_limit"] }),
  wf({ id: L(13), archetype: "laundry", title: "Complaint recovery", purpose: "Recover a customer complaint", roles: COUNTER, outcome: "complaint_resolved", profit: "retention", burden: BurdenLevel.HIGH, proof: ["message_screenshot", "customer_response_tag"], escalation: ["complaint severity HIGH → owner"], boundary: ["refund_limit", "discount_limit", "customer_promise_limits"] }),
  wf({ id: L(14), archetype: "laundry", title: "Lost/damaged garment escalation", purpose: "Escalate a lost/damaged item", roles: COUNTER, outcome: "resolution_time", profit: "liability_cost", burden: BurdenLevel.CRITICAL, proof: ["photo", "short_note"], escalation: ["lost/damaged garment → owner"], boundary: ["compensation_limit"] }),
  wf({ id: L(15), archetype: "laundry", title: "B2B/commercial account handling", purpose: "Service a B2B linen account", roles: SUP, outcome: "b2b_sla_met", profit: "b2b_revenue", burden: BurdenLevel.HIGH, boundary: ["pricing_limits", "quote_authority"] }),
  wf({ id: L(16), archetype: "laundry", title: "Inventory/chemical stock", purpose: "Track chemical and supply stock", roles: OPS, outcome: "stockout_rate", profit: "material_cost", burden: BurdenLevel.LOW }),
  wf({ id: L(17), archetype: "laundry", title: "Machine maintenance", purpose: "Maintain machines on schedule", roles: OPS, outcome: "uptime_pct", profit: "downtime_cost", burden: BurdenLevel.MEDIUM, proof: ["checklist_completion"] }),
  wf({ id: L(18), archetype: "laundry", title: "Staff attendance/shift handover", purpose: "Confirm attendance + handover", roles: SUP, outcome: "coverage_pct", profit: "labor_cost", burden: BurdenLevel.LOW, escalation: ["staff absence → supervisor/manager"] }),
  wf({ id: L(19), archetype: "laundry", title: "Inactive customer recovery", purpose: "Re-engage inactive customers", roles: COUNTER, outcome: "reactivation_rate", profit: "revenue_recovery", burden: BurdenLevel.MEDIUM, boundary: ["discount_limit", "customer_promise_limits"] }),
  wf({ id: L(20), archetype: "laundry", title: "Repeat customer reminder", purpose: "Remind repeat customers", roles: COUNTER, outcome: "repeat_rate", profit: "retention", burden: BurdenLevel.LOW, boundary: ["communication_channel"] }),
  wf({ id: L(21), archetype: "laundry", title: "Price/discount approval", purpose: "Apply price/discount within limits", roles: SUP, outcome: "margin_protected", profit: "discount_cost", burden: BurdenLevel.HIGH, escalation: ["discount above boundary → owner"], boundary: ["max_discount"] }),
  wf({ id: L(22), archetype: "laundry", title: "Express delivery capacity check", purpose: "Check capacity before express promise", roles: SUP, outcome: "express_sla_met", profit: "delivery_cost", burden: BurdenLevel.MEDIUM, boundary: ["capacity_green_required", "same_day_promise"] }),
  wf({ id: L(23), archetype: "laundry", title: "Rework/rewash workflow", purpose: "Rewash items failing QC", roles: OPS, outcome: "rework_rate", profit: "rework_cost", burden: BurdenLevel.MEDIUM, proof: ["before_after_image"] }),
  wf({ id: L(24), archetype: "laundry", title: "Daily closing report", purpose: "Close the day + reconcile", roles: SUP, outcome: "report_completeness", profit: "cash_collected", burden: BurdenLevel.MEDIUM, proof: ["checklist_completion"] }),
];

export const HOUSEKEEPING_WORKFLOWS: WorkflowLibraryEntry[] = [
  wf({ id: H(1), archetype: "housekeeping", title: "Customer inquiry and quote", purpose: "Respond to inquiry + quote", roles: SUP, outcome: "quote_conversion", profit: "revenue_per_job", burden: BurdenLevel.LOW, boundary: ["pricing_limits", "quote_authority"] }),
  wf({ id: H(2), archetype: "housekeeping", title: "Job scheduling and assignment", purpose: "Schedule + assign cleaners", roles: SUP, outcome: "schedule_fill_rate", profit: "utilization", burden: BurdenLevel.LOW }),
  wf({ id: H(3), archetype: "housekeeping", title: "Daily attendance confirmation", purpose: "Confirm cleaner attendance", roles: SUP, outcome: "attendance_pct", profit: "labor_cost", burden: BurdenLevel.LOW, escalation: ["staff absence → supervisor/manager"] }),
  wf({ id: H(4), archetype: "housekeeping", title: "Pre-job site readiness", purpose: "Confirm site readiness", roles: CLEAN, outcome: "readiness_pct", profit: "rework_reduction", burden: BurdenLevel.LOW }),
  wf({ id: H(5), archetype: "housekeeping", title: "Standard residential cleaning", purpose: "Perform standard clean", roles: CLEAN, outcome: "quality_score", profit: "revenue_per_job", burden: BurdenLevel.MEDIUM, proof: ["before_after_image"] }),
  wf({ id: H(6), archetype: "housekeeping", title: "Deep cleaning", purpose: "Perform deep clean", roles: CLEAN, outcome: "quality_score", profit: "revenue_per_job", burden: BurdenLevel.HIGH, proof: ["before_after_image"] }),
  wf({ id: H(7), archetype: "housekeeping", title: "Move-in/move-out cleaning", purpose: "Turnover clean", roles: CLEAN, outcome: "quality_score", profit: "revenue_per_job", burden: BurdenLevel.HIGH, proof: ["before_after_image"] }),
  wf({ id: H(8), archetype: "housekeeping", title: "Office/commercial recurring cleaning", purpose: "Recurring commercial clean", roles: CLEAN, outcome: "sla_met", profit: "contract_revenue", burden: BurdenLevel.MEDIUM }),
  wf({ id: H(9), archetype: "housekeeping", title: "Bathroom/kitchen high-risk cleaning", purpose: "High-risk area clean", roles: CLEAN, outcome: "quality_score", profit: "complaint_reduction", burden: BurdenLevel.HIGH, proof: ["before_after_image"] }),
  wf({ id: H(10), archetype: "housekeeping", title: "Customer complaint recovery", purpose: "Recover a complaint", roles: SUP, outcome: "complaint_resolved", profit: "retention", burden: BurdenLevel.HIGH, proof: ["message_screenshot"], escalation: ["complaint severity HIGH → owner"], boundary: ["refund_limit", "discount_limit"] }),
  wf({ id: H(11), archetype: "housekeeping", title: "Rework workflow", purpose: "Re-clean failed areas", roles: CLEAN, outcome: "rework_rate", profit: "rework_cost", burden: BurdenLevel.MEDIUM, proof: ["before_after_image"] }),
  wf({ id: H(12), archetype: "housekeeping", title: "Materials/inventory workflow", purpose: "Manage supplies", roles: SUP, outcome: "stockout_rate", profit: "material_cost", burden: BurdenLevel.LOW }),
  wf({ id: H(13), archetype: "housekeeping", title: "Staff training/skill workflow", purpose: "Train staff on standards", roles: SUP, outcome: "skill_score", profit: "quality_improvement", burden: BurdenLevel.MEDIUM }),
  wf({ id: H(14), archetype: "housekeeping", title: "Payment/invoice follow-up", purpose: "Collect payment", roles: SUP, outcome: "cash_reconciled", profit: "cash_collected", burden: BurdenLevel.HIGH, proof: ["payment_confirmation"], escalation: ["payment mismatch → manager + owner"], boundary: ["refund_limit"] }),
  wf({ id: H(15), archetype: "housekeeping", title: "Customer feedback and retention", purpose: "Collect feedback + retain", roles: SUP, outcome: "retention_rate", profit: "retention", burden: BurdenLevel.LOW, boundary: ["communication_channel"] }),
  wf({ id: H(16), archetype: "housekeeping", title: "Supervisor inspection", purpose: "Inspect completed jobs", roles: SUP, outcome: "defect_catch_rate", profit: "complaint_reduction", burden: BurdenLevel.MEDIUM, proof: ["checklist_completion"] }),
  wf({ id: H(17), archetype: "housekeeping", title: "Backup staff dispatch", purpose: "Dispatch backup cleaner", roles: SUP, outcome: "coverage_pct", profit: "sla_protection", burden: BurdenLevel.MEDIUM, escalation: ["repeated absence → owner"] }),
  wf({ id: H(18), archetype: "housekeeping", title: "Customer delay notification", purpose: "Notify customer of delay", roles: SUP, outcome: "notification_timeliness", profit: "retention", burden: BurdenLevel.LOW, boundary: ["communication_channel", "customer_promise_limits"] }),
  wf({ id: H(19), archetype: "housekeeping", title: "Site hazard/safety issue", purpose: "Handle a safety hazard", roles: CLEAN, outcome: "incident_rate", profit: "liability_cost", burden: BurdenLevel.CRITICAL, escalation: ["safety/legal issue → owner immediately"] }),
  wf({ id: H(20), archetype: "housekeeping", title: "Staff absence escalation", purpose: "Escalate staff absence", roles: SUP, outcome: "coverage_pct", profit: "labor_cost", burden: BurdenLevel.MEDIUM, escalation: ["staff absence → supervisor/manager"] }),
  wf({ id: H(21), archetype: "housekeeping", title: "Recurring contract renewal", purpose: "Renew recurring contracts", roles: SUP, outcome: "renewal_rate", profit: "contract_revenue", burden: BurdenLevel.MEDIUM, boundary: ["pricing_limits"] }),
  wf({ id: H(22), archetype: "housekeeping", title: "Quality audit", purpose: "Audit service quality", roles: SUP, outcome: "audit_score", profit: "quality_improvement", burden: BurdenLevel.MEDIUM, proof: ["checklist_completion"] }),
  wf({ id: H(23), archetype: "housekeeping", title: "Daily operations report", purpose: "Report daily operations", roles: SUP, outcome: "report_completeness", profit: "utilization", burden: BurdenLevel.LOW, proof: ["checklist_completion"] }),
  wf({ id: H(24), archetype: "housekeeping", title: "Profitability review by service type", purpose: "Review profit by service", roles: SUP, outcome: "margin_visibility", profit: "net_margin", burden: BurdenLevel.MEDIUM }),
];

const REQUIRED_FIELDS: (keyof WorkflowLibraryEntry)[] = [
  "purpose",
  "allowedRoles",
  "defaultSteps",
  "defaultProofRequirements",
  "defaultEscalationRules",
  "defaultOwnerBoundaryNeeds",
  "outcomeMetric",
  "profitCashRelevance",
  "employeeBurdenLevel",
];

/** Validate that every library entry has all required (non-empty) fields. */
export function validateWorkflowLibrary(
  entries: WorkflowLibraryEntry[]
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const e of entries) {
    for (const f of REQUIRED_FIELDS) {
      const v = e[f] as unknown;
      const empty =
        v == null ||
        (typeof v === "string" && v.length === 0) ||
        (Array.isArray(v) && v.length === 0);
      if (empty) problems.push(`${e.baseTemplateId}: missing ${String(f)}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
