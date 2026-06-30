/**
 * AI SUPERVISOR — INDIVIDUAL DOMAIN behavioral training (pure; no DB, no browser).
 *
 * For every required business domain this proves the supervisor can:
 *  - identify when the domain is the binding constraint (supervisor-POSITIVE) and produce the correct
 *    owner-facing disposition (status / why / do-now / do-not-do / proof / reassessment / impact);
 *  - keep the domain a considered-but-not-headline known fact when a DIFFERENT constraint dominates
 *    (supervisor-NEGATIVE) — i.e. it does not let a non-binding domain hijack the summary.
 *
 * High-impact domains assert proof + reassessment; financial domains assert profit/cash/margin impact;
 * staff domains assert staff/workload impact; growth domains assert the scale-readiness (owner-decision)
 * gate; compliance/proof domains assert the professional-review / blocked boundary.
 *
 * Trains the EXISTING deterministic seam buildSupervisorSummary — no new advice, no model, no autonomy.
 */
import { describe, it, expect } from "vitest";
import {
  buildSupervisorSummary,
  type SupervisorInput,
  type OwnerActionStatus,
} from "@/domain/owner-mode/supervisor-summary";

/** A healthy, fully-backed base; each domain case overrides only what makes its constraint bind. */
function base(over: Partial<SupervisorInput> = {}): SupervisorInput {
  return {
    found: true,
    dominantConstraint: "optimization",
    topPriorityLabel: "Routine optimization",
    nextBestAction: "Apply the measured optimization with proof.",
    rootCause: "Business is stable; only fine-tuning remains.",
    doNotDo: [],
    proofRequired: [],
    reassessmentTriggers: ["after the optimization proof is accepted"],
    successMetrics: ["the metric behind the optimization"],
    redDomains: [],
    ownerApprovalRequired: false,
    ownerOffload: "Hand routine checks to the supervisor; owner reviews exceptions only.",
    delegatedWork: ["Supervisor owns the step with a proof report."],
    opsiqPreparedWork: ["Draft the checklist/SOP and the reassessment schedule."],
    growthScaleAllowed: true,
    growthBlockedBy: [],
    overallConfidence: "high",
    criticalDomainsAllReal: true,
    dataSourceMissing: [],
    realProviderDomains: ["finance_cash", "margin_pricing", "working_capital", "equipment_capacity", "owner_workload_memory"],
    assessedDomains: ["finance_cash", "margin_pricing", "working_capital", "equipment_capacity", "owner_workload_memory", "customer_reputation"],
    unsafeCount: 0,
    impact: {
      financeCash: "Cash neutral.",
      marginPricing: "No margin change.",
      equipmentCapacity: "Capacity unchanged.",
      staffWorkload: "No staff change.",
      customerQuality: "Quality maintained.",
    },
    ownerWorkloadOffload: "Hand routine checks to the supervisor; owner reviews exceptions only.",
    plan7Day: "Stabilise the dominant constraint and verify the proof.",
    plan30Day: "Verify the proof and re-check the KPI.",
    ...over,
  };
}

type Category = "financial" | "staff" | "capacity" | "quality" | "growth" | "owner" | "compliance" | "proof";

interface DomainCase {
  domain: string;
  realDomainKey: string;            // how the domain shows up in realProviderDomains (a known fact)
  constraint: string;               // binding constraint when the domain dominates
  label: string;                    // owner-facing headline label
  categories: Category[];
  pos: Partial<SupervisorInput>;    // overrides that make this domain bind
}

const EMERGENCY = new Set(["compliance_block", "proof_fraud_block", "cash_survival"]);
const HIGH_RISK_FINANCIAL = new Set(["cash_survival", "below_margin", "profitable_growth", "efficiency_scaling"]);

/** Expected action status for a dominant constraint in an otherwise-clean, fully-backed case. */
function expectedStatus(constraint: string, ownerApproval: boolean, unsafe: number): OwnerActionStatus {
  if (unsafe > 0 || constraint === "compliance_block" || constraint === "proof_fraud_block") return "blocked";
  if (ownerApproval || HIGH_RISK_FINANCIAL.has(constraint)) return "owner_decision_required";
  return "proceed"; // confidence high + critical real
}

const DOMAINS: DomainCase[] = [
  {
    domain: "finance / cash", realDomainKey: "finance_cash", constraint: "cash_survival", label: "Cash survival",
    categories: ["financial"],
    pos: { nextBestAction: "Protect cash first: stop discretionary spend and recover receivables.", rootCause: "Cash runway is short while receivables are trapped.", doNotDo: ["Do not spend on growth until cash runway is proven."], proofRequired: ["13-week cash runway statement"], reassessmentTriggers: ["cash runway falls below 6 weeks"], impact: { financeCash: "Restores ~3 weeks of runway by recovering receivables.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Quality maintained." } },
  },
  {
    domain: "budget / capital allocation", realDomainKey: "budgeting_capital", constraint: "cash_survival", label: "Capital allocation overrun",
    categories: ["financial"],
    pos: { realProviderDomains: ["finance_cash", "budgeting_capital", "working_capital"], assessedDomains: ["finance_cash", "budgeting_capital", "working_capital", "customer_reputation"], nextBestAction: "Freeze the over-budget line and re-plan capital against runway.", rootCause: "A capital commitment exceeds the safe budget envelope.", doNotDo: ["Do not release the next capital tranche until runway is proven."], proofRequired: ["capital plan vs runway reconciliation"], reassessmentTriggers: ["committed capital exceeds the budget envelope"], impact: { financeCash: "Avoids a cash shortfall from an over-budget commitment.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Quality maintained." } },
  },
  {
    domain: "pricing / margin", realDomainKey: "margin_pricing", constraint: "below_margin", label: "Below-margin work",
    categories: ["financial"],
    pos: { nextBestAction: "Re-quote the line to a viable margin or decline it.", rootCause: "Contribution margin is negative after fully-loaded cost.", doNotDo: ["Do not sign at the offered rate — it loses money per unit."], proofRequired: ["fully-loaded cost sheet"], reassessmentTriggers: ["margin recovers above the floor"], impact: { financeCash: "Stops the per-unit cash drain.", marginPricing: "Restores positive contribution after fully-loaded cost.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Quality maintained." } },
  },
  {
    domain: "working capital", realDomainKey: "working_capital", constraint: "cash_survival", label: "Working-capital squeeze",
    categories: ["financial"],
    pos: { nextBestAction: "Recover receivables and clear dead stock to free trapped cash.", rootCause: "Cash is trapped in receivables and slow stock.", doNotDo: ["Do not buy more inventory until trapped cash is freed."], proofRequired: ["receivables ageing + stock turn report"], reassessmentTriggers: ["receivables days exceed the safe band"], impact: { financeCash: "Frees trapped working capital back into runway.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Quality maintained." } },
  },
  {
    domain: "sales", realDomainKey: "sales", constraint: "profitable_growth", label: "Profitable sales growth",
    categories: ["growth"],
    pos: { realProviderDomains: ["finance_cash", "margin_pricing", "working_capital", "sales"], assessedDomains: ["finance_cash", "margin_pricing", "working_capital", "sales", "customer_reputation"], nextBestAction: "Grow profitable sales via a capped, proof-gated pilot.", rootCause: "Unit economics are sound; demand can be grown safely.", proofRequired: ["pilot conversion + margin proof"], growthBlockedBy: ["unproven channel CAC"], reassessmentTriggers: ["pilot CAC exceeds the payback band"], impact: { financeCash: "Cash-positive once the pilot proves payback.", marginPricing: "Protects margin via capped pilot pricing.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Quality maintained." } },
  },
  {
    domain: "marketing", realDomainKey: "marketing", constraint: "cash_survival", label: "Marketing spend vs cash",
    categories: ["financial"],
    pos: { realProviderDomains: ["finance_cash", "margin_pricing", "working_capital", "marketing"], assessedDomains: ["finance_cash", "margin_pricing", "working_capital", "marketing"], nextBestAction: "Hold discretionary ad spend; protect cash first.", rootCause: "Owner wants to spend on ads while cash runway is short.", doNotDo: ["Do not commit the ad budget until runway is proven."], proofRequired: ["cash runway before any spend"], reassessmentTriggers: ["runway recovers above the safe band"], impact: { financeCash: "Preserves runway by deferring discretionary spend.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Quality maintained." } },
  },
  {
    domain: "customer complaints / reputation", realDomainKey: "customer_reputation", constraint: "customer_quality", label: "Reputation / complaints",
    categories: ["quality"],
    pos: { realProviderDomains: ["finance_cash", "margin_pricing", "customer_reputation"], assessedDomains: ["finance_cash", "margin_pricing", "customer_reputation"], nextBestAction: "Fix the complaint root cause before any acquisition spend.", rootCause: "Rising complaints and rework are breaking reputation.", doNotDo: ["Do not spend on acquisition while complaints are unresolved."], proofRequired: ["complaint/rework rate returning to band"], reassessmentTriggers: ["complaint rate exceeds the acceptable band"], impact: { financeCash: "Protects demand that complaints would erode.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "Adds a quality-fix task.", customerQuality: "Restores quality/reputation to an acceptable band." } },
  },
  {
    domain: "retention", realDomainKey: "customer_retention", constraint: "customer_quality", label: "Customer retention",
    categories: ["quality"],
    pos: { realProviderDomains: ["finance_cash", "margin_pricing", "customer_retention"], assessedDomains: ["finance_cash", "margin_pricing", "customer_retention"], nextBestAction: "Fix the service gap driving churn before discounting to re-acquire.", rootCause: "Churn is driven by a service-quality gap, not price.", doNotDo: ["Do not blanket-discount to mask a retention problem."], proofRequired: ["cohort retention curve"], reassessmentTriggers: ["churn exceeds the retention band"], impact: { financeCash: "Protects recurring revenue from churn.", marginPricing: "Avoids margin loss from defensive discounting.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Restores the service quality behind retention." } },
  },
  {
    domain: "operations", realDomainKey: "operations", constraint: "capacity_feasibility", label: "Operations capacity",
    categories: ["capacity"],
    pos: { realProviderDomains: ["finance_cash", "operations", "equipment_capacity"], assessedDomains: ["finance_cash", "operations", "equipment_capacity"], nextBestAction: "Cap load to reliable throughput before taking more volume.", rootCause: "Demand exceeds reliable operational capacity.", doNotDo: ["Do not accept volume beyond proven reliable throughput."], proofRequired: ["measured reliable throughput"], reassessmentTriggers: ["utilization exceeds reliable capacity"], impact: { financeCash: "No cash change.", marginPricing: "No margin change.", equipmentCapacity: "Caps load to protect delivery reliability.", staffWorkload: "Rebalances load to capacity.", customerQuality: "Protects quality/SLA under load." } },
  },
  {
    domain: "SOPs / checklists", realDomainKey: "sop_checklist", constraint: "capacity_feasibility", label: "SOP / checklist discipline",
    categories: ["capacity"],
    pos: { realProviderDomains: ["finance_cash", "sop_checklist", "operations"], assessedDomains: ["finance_cash", "sop_checklist", "operations"], nextBestAction: "Establish SOP discipline before buying tooling.", rootCause: "The process lacks basic SOP discipline.", doNotDo: ["Do not automate a process that lacks SOP discipline."], proofRequired: ["SOP adherence audit"], reassessmentTriggers: ["SOP adherence falls below band"], opsiqPreparedWork: ["Draft the SOP and adherence checklist."], impact: { financeCash: "No cash change.", marginPricing: "No margin change.", equipmentCapacity: "Stabilises throughput via discipline.", staffWorkload: "Clarifies each step's owner.", customerQuality: "Reduces defects from process drift." } },
  },
  {
    domain: "staff workload / fairness", realDomainKey: "staff_management", constraint: "owner_workload", label: "Staff workload / fairness",
    categories: ["staff", "owner"],
    pos: { realProviderDomains: ["finance_cash", "staff_management", "owner_workload_memory"], assessedDomains: ["finance_cash", "staff_management", "owner_workload_memory"], nextBestAction: "Delegate with proof-based controls and rebalance shifts fairly.", rootCause: "Owner is the bottleneck; load is unevenly distributed.", doNotDo: ["Do not pile new work on the overloaded staff/owner."], proofRequired: ["shift-balance + proof report"], reassessmentTriggers: ["owner hours/day exceed the sustainable band"], impact: { financeCash: "No cash change.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "Rebalances workload fairly across staff.", customerQuality: "Protects quality by relieving overload." } },
  },
  {
    domain: "staff training", realDomainKey: "staff_training", constraint: "capacity_feasibility", label: "Staff training gap",
    categories: ["staff", "capacity"],
    pos: { realProviderDomains: ["finance_cash", "staff_training", "operations"], assessedDomains: ["finance_cash", "staff_training", "operations"], nextBestAction: "Close the training gap before adding volume.", rootCause: "Defects trace to an untrained-step capability gap.", proofRequired: ["training completion + defect-rate proof"], reassessmentTriggers: ["defect rate stays above band after training"], opsiqPreparedWork: ["Draft the training checklist and sign-off sheet."], impact: { financeCash: "No cash change.", marginPricing: "No margin change.", equipmentCapacity: "Lifts reliable throughput once trained.", staffWorkload: "Adds a time-boxed training task.", customerQuality: "Reduces defects from the skill gap." } },
  },
  {
    domain: "hiring / firing / resource", realDomainKey: "staff_management", constraint: "capacity_feasibility", label: "Hiring vs process",
    categories: ["staff", "capacity"],
    pos: { realProviderDomains: ["finance_cash", "staff_management", "process_improvement"], assessedDomains: ["finance_cash", "staff_management", "process_improvement"], nextBestAction: "Fix the process bottleneck before adding headcount.", rootCause: "The bottleneck is a broken process, not headcount.", doNotDo: ["Do not hire to paper over a process failure."], proofRequired: ["bottleneck root-cause proof"], reassessmentTriggers: ["throughput stays capped after the process fix"], impact: { financeCash: "Avoids fixed-cost headcount that wouldn't fix the bottleneck.", marginPricing: "No margin change.", equipmentCapacity: "Relieves the true bottleneck.", staffWorkload: "Rebalances rather than expands the team.", customerQuality: "Protects quality under load." } },
  },
  {
    domain: "equipment / capacity", realDomainKey: "equipment_capacity", constraint: "capacity_feasibility", label: "Equipment / capacity bottleneck",
    categories: ["capacity"],
    pos: { realProviderDomains: ["finance_cash", "equipment_capacity", "operations"], assessedDomains: ["finance_cash", "equipment_capacity", "operations"], nextBestAction: "Relieve the equipment bottleneck and cap load to reliable output.", rootCause: "An equipment bottleneck caps reliable output.", proofRequired: ["measured equipment throughput"], reassessmentTriggers: ["equipment utilization exceeds reliable output"], impact: { financeCash: "No cash change.", marginPricing: "No margin change.", equipmentCapacity: "Caps load to protected, reliable equipment output.", staffWorkload: "No staff change.", customerQuality: "Protects delivery reliability." } },
  },
  {
    domain: "maintenance / downtime", realDomainKey: "maintenance_downtime", constraint: "capacity_feasibility", label: "Maintenance / downtime risk",
    categories: ["capacity"],
    pos: { realProviderDomains: ["finance_cash", "maintenance_downtime", "equipment_capacity"], assessedDomains: ["finance_cash", "maintenance_downtime", "equipment_capacity"], nextBestAction: "Schedule preventive maintenance before peak load.", rootCause: "Deferred maintenance threatens unplanned downtime.", proofRequired: ["preventive-maintenance log"], reassessmentTriggers: ["downtime incidents exceed the tolerance band"], impact: { financeCash: "No cash change.", marginPricing: "No margin change.", equipmentCapacity: "Prevents downtime that would cut capacity.", staffWorkload: "Adds a scheduled maintenance task.", customerQuality: "Protects delivery against breakdowns." } },
  },
  {
    domain: "vendor / supplier", realDomainKey: "vendor_supplier", constraint: "customer_quality", label: "Vendor reliability vs savings",
    categories: ["quality"],
    pos: { realProviderDomains: ["finance_cash", "vendor_supplier", "quality_control"], assessedDomains: ["finance_cash", "vendor_supplier", "quality_control"], nextBestAction: "Qualify the cheaper vendor's reliability before switching.", rootCause: "A cheaper vendor risks quality and reliability.", doNotDo: ["Do not switch to the cheapest vendor before reliability is proven."], proofRequired: ["vendor reliability/quality qualification"], reassessmentTriggers: ["vendor defect/late rate exceeds band"], impact: { financeCash: "Savings deferred until reliability is proven.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Protects quality against a risky supplier switch." } },
  },
  {
    domain: "delivery / logistics", realDomainKey: "delivery_logistics", constraint: "capacity_feasibility", label: "Delivery / logistics throughput",
    categories: ["capacity"],
    pos: { realProviderDomains: ["finance_cash", "delivery_logistics", "operations"], assessedDomains: ["finance_cash", "delivery_logistics", "operations"], nextBestAction: "Cap delivery promises to proven route throughput.", rootCause: "Delivery promises exceed reliable route capacity.", doNotDo: ["Do not promise delivery windows beyond proven throughput."], proofRequired: ["on-time delivery rate"], reassessmentTriggers: ["on-time rate falls below SLA"], impact: { financeCash: "No cash change.", marginPricing: "No margin change.", equipmentCapacity: "Caps promises to reliable logistics throughput.", staffWorkload: "No staff change.", customerQuality: "Protects the on-time SLA." } },
  },
  {
    domain: "B2B contracts / opportunities", realDomainKey: "opportunity_eval", constraint: "below_margin", label: "B2B contract below margin",
    categories: ["financial"],
    pos: { realProviderDomains: ["finance_cash", "opportunity_eval", "margin_pricing"], assessedDomains: ["finance_cash", "opportunity_eval", "margin_pricing"], ownerApprovalRequired: true, nextBestAction: "Re-quote the B2B contract to a viable margin or decline.", rootCause: "The contract is below fully-loaded cost.", doNotDo: ["Do not sign the B2B contract at the offered rate."], proofRequired: ["fully-loaded cost vs offered rate"], reassessmentTriggers: ["re-quote reaches a viable margin"], impact: { financeCash: "Avoids a back-loaded cash drain.", marginPricing: "Restores a viable contract margin.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Quality maintained." } },
  },
  {
    domain: "proof / anti-gaming", realDomainKey: "proof_anti_gaming", constraint: "proof_fraud_block", label: "Unverifiable proof",
    categories: ["proof"],
    pos: { realProviderDomains: ["finance_cash", "proof_anti_gaming", "operations"], assessedDomains: ["finance_cash", "proof_anti_gaming", "operations"], unsafeCount: 1, nextBestAction: "Require independent verification before acting on the report.", rootCause: "Reported numbers are unverifiable / possibly gamed.", doNotDo: ["Do not act on unverifiable staff-reported numbers."], proofRequired: ["independent third-party verification"], reassessmentTriggers: ["independent verification confirms the numbers"], redDomains: ["proof_anti_gaming"], impact: { financeCash: "Prevents decisions on corrupted numbers.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Quality maintained." } },
  },
  {
    domain: "compliance / professional review", realDomainKey: "compliance_review", constraint: "compliance_block", label: "Compliance / licensing exposure",
    categories: ["compliance"],
    pos: { realProviderDomains: ["finance_cash", "compliance_review", "risk_management"], assessedDomains: ["finance_cash", "compliance_review", "risk_management"], nextBestAction: "Pause and obtain written professional compliance/tax review before any action.", rootCause: "A licensing/tax grey area blocks the move.", doNotDo: ["Do not proceed past the compliance grey area for revenue."], proofRequired: ["written professional compliance review"], reassessmentTriggers: ["professional review confirms it is permitted"], redDomains: ["compliance_review"], impact: { financeCash: "Avoids a shutdown-level legal exposure.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Quality maintained." } },
  },
  {
    domain: "owner workload", realDomainKey: "owner_workload_memory", constraint: "owner_workload", label: "Owner workload",
    categories: ["owner"],
    pos: { nextBestAction: "Delegate billing and pickups to a named supervisor with a daily proof report.", rootCause: "Owner is the bottleneck for every routine task.", doNotDo: ["Do not take on new work until delegation is in place."], proofRequired: ["daily supervisor proof report"], reassessmentTriggers: ["owner hours/day exceed the sustainable band"], impact: { financeCash: "Cash neutral; frees ~6 owner hours/week.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "Adds one supervisor responsibility.", customerQuality: "Maintains quality via the proof report." } },
  },
  {
    domain: "approval memory", realDomainKey: "approval_memory", constraint: "owner_workload", label: "Approval bottleneck",
    categories: ["owner"],
    pos: { realProviderDomains: ["finance_cash", "approval_memory", "owner_workload_memory"], assessedDomains: ["finance_cash", "approval_memory", "owner_workload_memory"], nextBestAction: "Codify recurring approvals into delegated rules with proof.", rootCause: "Every routine approval still routes through the owner.", doNotDo: ["Do not keep routing routine approvals through the owner."], proofRequired: ["delegated approval-rule log"], reassessmentTriggers: ["owner approval queue exceeds the band"], impact: { financeCash: "No cash change.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "Shifts routine approvals to staff with rules.", customerQuality: "Quality maintained via proof." } },
  },
  {
    domain: "remote owner", realDomainKey: "remote_owner", constraint: "owner_workload", label: "Remote owner control",
    categories: ["owner"],
    pos: { realProviderDomains: ["finance_cash", "remote_owner", "owner_workload_memory"], assessedDomains: ["finance_cash", "remote_owner", "owner_workload_memory"], nextBestAction: "Put proof-based remote controls in place instead of personal supervision.", rootCause: "A remote owner cannot personally supervise everything.", doNotDo: ["Do not rely on the owner personally supervising from afar."], proofRequired: ["remote proof-control dashboard"], reassessmentTriggers: ["control exceptions exceed the band"], impact: { financeCash: "No cash change.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "Moves control to proof-based delegation.", customerQuality: "Protects quality remotely via proof." } },
  },
  {
    domain: "multi-location", realDomainKey: "multi_location_portfolio", constraint: "owner_workload", label: "Multi-location attention",
    categories: ["owner", "growth"],
    pos: { realProviderDomains: ["finance_cash", "multi_location_portfolio", "owner_workload_memory"], assessedDomains: ["finance_cash", "multi_location_portfolio", "owner_workload_memory"], nextBestAction: "Stabilise per-site controls before adding another location.", rootCause: "Adding sites stretches owner attention past controls.", doNotDo: ["Do not add another location before per-site control is proven."], proofRequired: ["per-site control + P&L proof"], growthBlockedBy: ["unproven per-site controls"], reassessmentTriggers: ["per-site exceptions exceed the band"], impact: { financeCash: "No cash change.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "Caps owner span to controllable sites.", customerQuality: "Protects quality across sites." } },
  },
  {
    domain: "growth / scale", realDomainKey: "scaling_expansion", constraint: "profitable_growth", label: "Scale readiness",
    categories: ["growth"],
    pos: { realProviderDomains: ["finance_cash", "margin_pricing", "scaling_expansion"], assessedDomains: ["finance_cash", "margin_pricing", "scaling_expansion"], nextBestAction: "Scale only via a capped, proof-gated pilot once unit economics hold.", rootCause: "Scaling is tempting but must be proof-gated.", proofRequired: ["per-unit economics + pilot proof"], growthScaleAllowed: false, growthBlockedBy: ["unproven unit economics at scale"], reassessmentTriggers: ["pilot unit economics hold at scale"], impact: { financeCash: "Protects cash by capping the scale pilot.", marginPricing: "Holds margin discipline while scaling.", equipmentCapacity: "Caps capacity additions to the pilot.", staffWorkload: "No staff change.", customerQuality: "Protects quality while scaling." } },
  },
  {
    domain: "shutdown / pivot / stop-loss", realDomainKey: "shutdown_pivot_stoploss", constraint: "cash_survival", label: "Stop-loss on a losing line",
    categories: ["financial"],
    pos: { realProviderDomains: ["finance_cash", "shutdown_pivot_stoploss", "risk_management"], assessedDomains: ["finance_cash", "shutdown_pivot_stoploss", "risk_management"], nextBestAction: "Set a stop-loss and cut the persistently loss-making line.", rootCause: "A line keeps losing money; sunk cost is blocking the stop.", doNotDo: ["Do not keep funding the losing line on sunk-cost reasoning."], proofRequired: ["per-line P&L vs stop-loss threshold"], growthBlockedBy: ["monthly loss on the line", "cash runway"], reassessmentTriggers: ["line losses breach the stop-loss threshold"], impact: { financeCash: "Stops the monthly cash bleed from the losing line.", marginPricing: "Removes a negative-margin line.", equipmentCapacity: "Frees capacity for profitable work.", staffWorkload: "No staff change.", customerQuality: "Quality maintained." } },
  },
  {
    domain: "cybersecurity / payment / data-loss", realDomainKey: "cyber_payment_dataloss", constraint: "compliance_block", label: "Cyber / payment / data-loss exposure",
    categories: ["compliance"],
    pos: { realProviderDomains: ["finance_cash", "cyber_payment_dataloss", "risk_management"], assessedDomains: ["finance_cash", "cyber_payment_dataloss", "risk_management"], nextBestAction: "Contain the breach and obtain professional security/compliance review before normal operations resume.", rootCause: "A payment/data-loss exposure threatens customers and licensing.", doNotDo: ["Do not resume normal operations before the exposure is contained and reviewed."], proofRequired: ["professional security + compliance review"], reassessmentTriggers: ["professional review confirms containment"], redDomains: ["cyber_payment_dataloss"], impact: { financeCash: "Avoids fines and liability from a data/payment breach.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Protects customers from a breach." } },
  },
  {
    domain: "business continuity", realDomainKey: "business_continuity", constraint: "compliance_block", label: "Business-continuity exposure",
    categories: ["compliance"],
    pos: { realProviderDomains: ["finance_cash", "business_continuity", "risk_management"], assessedDomains: ["finance_cash", "business_continuity", "risk_management"], nextBestAction: "Pause the at-risk operation and obtain a professional continuity/compliance review.", rootCause: "A continuity gap creates a licensing/legal exposure.", doNotDo: ["Do not continue the at-risk operation without a continuity review."], proofRequired: ["business-continuity + compliance review"], reassessmentTriggers: ["continuity review confirms it is safe to resume"], redDomains: ["business_continuity"], impact: { financeCash: "Avoids a shutdown-level continuity exposure.", marginPricing: "No margin change.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "No staff change.", customerQuality: "Protects service continuity for customers." } },
  },
  {
    domain: "seasonality / weather / festival demand", realDomainKey: "seasonality_demand", constraint: "capacity_feasibility", label: "Seasonal demand spike",
    categories: ["capacity"],
    pos: { realProviderDomains: ["finance_cash", "seasonality_demand", "equipment_capacity"], assessedDomains: ["finance_cash", "seasonality_demand", "equipment_capacity"], nextBestAction: "Pre-plan capacity to the seasonal peak without over-committing.", rootCause: "A festival/weather demand spike will exceed normal capacity.", doNotDo: ["Do not over-commit beyond what peak capacity can reliably deliver."], proofRequired: ["peak-capacity plan vs forecast"], reassessmentTriggers: ["forecast demand exceeds the planned peak"], impact: { financeCash: "Captures seasonal demand without overspend.", marginPricing: "No margin change.", equipmentCapacity: "Plans reliable capacity to the seasonal peak.", staffWorkload: "Schedules temporary peak staffing.", customerQuality: "Protects quality during the spike." } },
  },
  {
    domain: "exit / sale readiness", realDomainKey: "exit_sale_readiness", constraint: "profitable_growth", label: "Exit / sale readiness",
    categories: ["growth"],
    pos: { realProviderDomains: ["finance_cash", "margin_pricing", "exit_sale_readiness"], assessedDomains: ["finance_cash", "margin_pricing", "exit_sale_readiness"], nextBestAction: "Build verifiable financials and owner-independence before going to market.", rootCause: "The business is owner-dependent with unverified financials.", proofRequired: ["audited financials + owner-independence proof"], growthScaleAllowed: false, growthBlockedBy: ["owner dependence", "unverified financials"], reassessmentTriggers: ["financials are independently verified"], impact: { financeCash: "Raises sale value via clean, proven cash figures.", marginPricing: "Demonstrates durable margin to buyers.", equipmentCapacity: "Capacity unchanged.", staffWorkload: "Reduces owner dependence for buyers.", customerQuality: "Protects quality through the transition." } },
  },
];

describe("AI supervisor — individual domain training (positive: domain binds)", () => {
  for (const dc of DOMAINS) {
    it(`[${dc.domain}] supervisor surfaces the domain as the binding constraint with the correct disposition`, () => {
      const s = buildSupervisorSummary(base({
        dominantConstraint: dc.constraint,
        topPriorityLabel: dc.label,
        ...dc.pos,
      }));

      expect(s.found).toBe(true);
      // Main issue is headlined by THIS domain's label; why-it-matters is a real, non-empty rationale.
      expect(s.mainIssue).toContain(dc.label);
      expect(s.whyItMatters.length).toBeGreaterThan(12);

      // Action status matches the deterministic disposition for the binding constraint.
      const ownerApproval = dc.pos.ownerApprovalRequired ?? false;
      const unsafe = dc.pos.unsafeCount ?? 0;
      expect(s.actionStatus).toBe(expectedStatus(dc.constraint, ownerApproval, unsafe));

      // Emergency / non-emergency priority cap.
      if (EMERGENCY.has(dc.constraint) || unsafe > 0) {
        expect(s.emergency).toBe(true);
        expect(s.topPriorities.length).toBeLessThanOrEqual(5);
      } else {
        expect(s.emergency).toBe(false);
        expect(s.topPriorities.length).toBeLessThanOrEqual(3);
      }

      // Blocked / professional-review domains never read as proceed and carry a do-not-do.
      if (dc.categories.includes("compliance") || dc.categories.includes("proof")) {
        expect(s.actionStatus).toBe("blocked");
        expect(s.canProceed).toBe(false);
        expect(s.doNotDo.length).toBeGreaterThan(0);
        expect(s.proofNeeded.join(" ")).toMatch(/review|verification|professional|independent|security|continuity/i);
      }

      // Financial domains surface profit/cash/margin impact.
      if (dc.categories.includes("financial")) {
        const fin = s.impact.filter((i) => i.relevant).map((i) => i.dimension);
        expect(fin.some((d) => d === "profit_margin" || d === "cash")).toBe(true);
      }

      // Staff domains surface staff/capacity impact.
      if (dc.categories.includes("staff")) {
        expect(s.impact.find((i) => i.dimension === "staff_capacity")?.relevant).toBe(true);
      }

      // Growth domains apply a scale-readiness gate — expressed either as an owner decision
      // (profitable_growth / efficiency_scaling are high-risk-financial) or, when the binding
      // constraint is owner attention/control, as an explicit do-not-scale-yet instruction.
      if (dc.categories.includes("growth")) {
        const scaleGated = s.actionStatus === "owner_decision_required" || s.doNotDo.length > 0;
        expect(scaleGated).toBe(true);
        if (HIGH_RISK_FINANCIAL.has(dc.constraint)) expect(s.ownerDecisionRequired).not.toBeNull();
      }

      // High-impact (non-optimization) domains show proof and a reassessment trigger.
      expect(s.proofNeeded.length).toBeGreaterThan(0);
      expect(s.cadence.reassessmentTrigger.length).toBeGreaterThan(0);

      // The domain is a verified known fact in the ledger (it was actually consulted).
      expect(s.ledger.knownFacts.join(" ").toLowerCase()).toContain(dc.realDomainKey.replace(/_/g, " "));

      // No fabricated confidence: fully-backed ⇒ not capped low for a missing critical.
      expect(s.confidence).not.toBe("none");
    });
  }
});

describe("AI supervisor — individual domain training (negative: domain present but NOT binding)", () => {
  for (const dc of DOMAINS) {
    it(`[${dc.domain}] supervisor keeps the domain a known fact and does not let it hijack the summary`, () => {
      // A DIFFERENT constraint dominates; this domain is real-backed but should not be the headline.
      const negConstraint = dc.constraint === "cash_survival" ? "customer_quality" : "cash_survival";
      const negLabel = negConstraint === "cash_survival" ? "Cash survival" : "Reputation / complaints";

      const s = buildSupervisorSummary(base({
        dominantConstraint: negConstraint,
        topPriorityLabel: negLabel,
        nextBestAction: negConstraint === "cash_survival"
          ? "Protect cash first before anything else."
          : "Fix the complaint root cause before acquisition.",
        rootCause: "A different constraint is binding this period.",
        // The domain under test is consulted (real-backed) but not the dominant one.
        realProviderDomains: ["finance_cash", dc.realDomainKey, "operations"],
        assessedDomains: ["finance_cash", dc.realDomainKey, "operations", "customer_reputation"],
      }));

      // The headline is the dominant constraint, NOT this (non-binding) domain.
      expect(s.mainIssue).toContain(negLabel);
      if (dc.label !== negLabel) expect(s.mainIssue).not.toContain(dc.label);

      // The domain was still consulted — it appears as a verified known fact, not as an escalation.
      expect(s.ledger.knownFacts.join(" ").toLowerCase()).toContain(dc.realDomainKey.replace(/_/g, " "));

      // It does not manufacture an emergency or a block for a non-binding domain.
      if (!EMERGENCY.has(negConstraint)) expect(s.emergency).toBe(false);
      expect(["proceed", "cautious_proceed", "owner_decision_required", "need_more_data", "blocked"]).toContain(s.actionStatus);
      // cash_survival is high-risk-financial ⇒ owner decision; never a silent proceed.
      if (negConstraint === "cash_survival") expect(s.actionStatus).toBe("owner_decision_required");
    });
  }
});
