/**
 * A1–A3 — Archetype operating model contract + validator (pure).
 *
 * A structural operating model the domain training harness references to ground a
 * domain in a business archetype (revenue/cost/roles/cycles/risks + capacity, workload
 * and quality dimensions + proof types + review cadence). This is distinct from the
 * M29–M32 knowledge PACKS (slot-based facts): the operating model is the structure,
 * the pack is the knowledge that fills it. Linked by archetypeId. Pure + deterministic.
 */

export interface ReviewCadence {
  daily: string[];
  weekly: string[];
  monthly: string[];
}

export interface ArchetypeOperatingModel {
  /** Matches archetype-guidance GuidanceArchetype where applicable ("universal"/"laundry"/...). */
  archetypeId: string;
  name: string;
  revenueStreams: string[];
  costStructure: string[];
  staffRoles: string[];
  ownerRoles: string[];
  customerLifecycle: string[];
  supplierInventoryExposure: string[];
  commonRisks: string[];
  cashCycle: string;
  qualityCycle: string;
  complaintCycle: string;
  marketingCycle: string;
  /** Acceptable proof types for this archetype (reuses the proof-FSM vocabulary). */
  proofTypes: string[];
  capacityDimensions: string[];
  workloadDimensions: string[];
  qualityDimensions: string[];
  reviewCadence: ReviewCadence;
}

function nonEmpty(a: unknown[] | undefined): boolean {
  return Array.isArray(a) && a.length > 0;
}
function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/** Returns validation violations (empty = valid). */
export function validateOperatingModel(m: ArchetypeOperatingModel): string[] {
  const v: string[] = [];
  if (blank(m.archetypeId)) v.push("missing_archetype_id");
  if (blank(m.name)) v.push("missing_name");
  if (!nonEmpty(m.revenueStreams)) v.push("missing_revenue_streams");
  if (!nonEmpty(m.costStructure)) v.push("missing_cost_structure");
  if (!nonEmpty(m.staffRoles)) v.push("missing_staff_roles");
  if (!nonEmpty(m.ownerRoles)) v.push("missing_owner_roles");
  if (!nonEmpty(m.customerLifecycle)) v.push("missing_customer_lifecycle");
  if (!nonEmpty(m.commonRisks)) v.push("missing_common_risks");
  if (!nonEmpty(m.proofTypes)) v.push("missing_proof_types");
  if (!nonEmpty(m.capacityDimensions)) v.push("missing_capacity_dimensions");
  if (!nonEmpty(m.workloadDimensions)) v.push("missing_workload_dimensions");
  if (!nonEmpty(m.qualityDimensions)) v.push("missing_quality_dimensions");
  if (blank(m.cashCycle)) v.push("missing_cash_cycle");
  if (blank(m.qualityCycle)) v.push("missing_quality_cycle");
  if (blank(m.complaintCycle)) v.push("missing_complaint_cycle");
  if (!m.reviewCadence || !nonEmpty(m.reviewCadence.daily) || !nonEmpty(m.reviewCadence.weekly) || !nonEmpty(m.reviewCadence.monthly)) {
    v.push("missing_review_cadence");
  }
  return v;
}

export function isOperatingModelValid(m: ArchetypeOperatingModel): boolean {
  return validateOperatingModel(m).length === 0;
}

/** A domain training contract may reference an archetype only if its model is valid. */
export function canReferenceArchetype(m: ArchetypeOperatingModel | undefined): boolean {
  return !!m && isOperatingModelValid(m);
}

/** The Universal SMB operating model (A1). */
export const UNIVERSAL_SMB_MODEL: ArchetypeOperatingModel = {
  archetypeId: "universal",
  name: "Universal SMB",
  revenueStreams: ["primary service/product", "repeat customers", "B2B/contract"],
  costStructure: ["staff/payroll", "rent", "materials/inputs", "utilities", "delivery", "marketing"],
  staffRoles: ["front-line/delivery", "supervisor", "support/admin"],
  ownerRoles: ["approvals", "cash control", "quality oversight", "escalation"],
  customerLifecycle: ["acquire", "serve", "collect payment", "retain", "win-back"],
  supplierInventoryExposure: ["input suppliers", "consumables stock"],
  commonRisks: ["cash shortfall", "quality failure", "staff overload", "owner bottleneck", "customer churn", "supplier reliability"],
  cashCycle: "sale → delivery → invoice → collection",
  qualityCycle: "input → process → check → complaint/rework",
  complaintCycle: "complaint → triage → recovery → closure proof",
  marketingCycle: "channel → lead → conversion → repeat",
  proofTypes: ["csv_upload", "invoice", "payment_confirmation", "call_log", "checklist_completion", "before_after_image"],
  capacityDimensions: ["throughput", "delivery", "equipment", "staff hours"],
  workloadDimensions: ["staff utilization", "owner daily load", "overtime dependence"],
  qualityDimensions: ["defect/rework rate", "complaint rate", "on-time rate"],
  reviewCadence: {
    daily: ["cash position", "top priorities", "blockers"],
    weekly: ["margin", "complaints/rework", "capacity", "retention"],
    monthly: ["profit trend", "growth/scale readiness", "supplier risk"],
  },
};
