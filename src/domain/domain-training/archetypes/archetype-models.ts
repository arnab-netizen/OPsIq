/**
 * A2 (laundry) + A3 (housekeeping) concrete archetype operating models (pure data).
 *
 * archetypeId matches the M41 archetype-guidance vocabulary ("laundry"/"housekeeping")
 * so the guidance layer and the training harness share one archetype identity.
 */

import {
  type ArchetypeOperatingModel,
  UNIVERSAL_SMB_MODEL,
} from "@/domain/domain-training/archetypes/operating-model";

/** A2 — Laundry operating model. */
export const LAUNDRY_MODEL: ArchetypeOperatingModel = {
  archetypeId: "laundry",
  name: "Laundry (B2C + B2B linen)",
  revenueStreams: ["B2C walk-in", "B2B linen/towel contracts", "express/premium turnaround"],
  costStructure: ["staff/payroll", "rent", "chemicals/detergent", "water/utilities", "delivery", "packaging"],
  staffRoles: ["counter/intake", "plant/wash", "press/fold", "delivery driver"],
  ownerRoles: ["pricing approval", "B2B contracts", "cash control", "quality oversight"],
  customerLifecycle: ["intake", "process", "ready/notify", "delivery/pickup", "collect", "retain"],
  supplierInventoryExposure: ["chemical inventory", "packaging stock", "spare-part lead time"],
  commonRisks: ["chemical stockout", "rewash/rework", "garment damage/loss", "turnaround delay", "B2B late payment", "washer/dryer breakdown"],
  cashCycle: "intake → process → delivery → invoice (B2B) → collection",
  qualityCycle: "sort → wash → check → rewash/damage handling",
  complaintCycle: "complaint → garment trace → recovery/refund → closure proof",
  marketingCycle: "local/B2B outreach → trial → repeat contract",
  proofTypes: ["csv_upload", "invoice", "payment_confirmation", "pickup_proof", "delivery_proof", "before_after_image", "checklist_completion"],
  capacityDimensions: ["washer/dryer load capacity", "kg/pieces per day", "delivery slots", "press/fold throughput"],
  workloadDimensions: ["staff hours vs load", "overtime in peak", "owner B2B handling"],
  qualityDimensions: ["rewash rate", "garment damage/loss rate", "turnaround time", "complaint rate"],
  reviewCadence: {
    daily: ["cash position", "pending deliveries", "rewash/damage today", "chemical stock"],
    weekly: ["margin per kg/piece", "B2B receivables", "capacity utilization", "complaint trend"],
    monthly: ["B2B contract profitability", "equipment maintenance", "growth readiness"],
  },
};

/** A3 — Housekeeping operating model. */
export const HOUSEKEEPING_MODEL: ArchetypeOperatingModel = {
  archetypeId: "housekeeping",
  name: "Housekeeping (site/contract services)",
  revenueStreams: ["apartment/community contracts", "commercial site contracts", "one-off deep cleans"],
  costStructure: ["staff/payroll", "replacement staffing", "consumables", "training", "transport", "supervision"],
  staffRoles: ["housekeeping staff", "site supervisor", "replacement pool", "roster coordinator"],
  ownerRoles: ["contract negotiation", "SLA/escalation", "payroll/labour compliance", "quality escalation"],
  customerLifecycle: ["site onboarding", "daily service", "supervisor verification", "complaint handling", "contract renewal"],
  supplierInventoryExposure: ["consumables supply", "equipment availability"],
  commonRisks: ["staff attendance/absenteeism", "replacement-staffing cost", "site quality failure", "SLA breach", "payroll/labour compliance", "supervisor verification gaps"],
  cashCycle: "service → supervisor sign-off → invoice → contract payment",
  qualityCycle: "service → supervisor check → site complaint → corrective visit",
  complaintCycle: "site complaint → supervisor → corrective action → SLA closure proof",
  marketingCycle: "site referral/tender → trial → contract",
  proofTypes: ["checklist_completion", "manager_confirmation", "before_after_image", "customer_confirmation", "invoice", "payment_confirmation"],
  capacityDimensions: ["staff per site", "roster coverage", "replacement availability", "supervisor span"],
  workloadDimensions: ["staff hours/attendance", "overtime/replacement load", "owner escalation load"],
  qualityDimensions: ["site inspection pass rate", "complaint rate", "SLA adherence"],
  reviewCadence: {
    daily: ["attendance/replacements", "site complaints", "supervisor sign-offs"],
    weekly: ["payroll/labour exposure", "SLA adherence", "site quality scores"],
    monthly: ["contract profitability", "staff turnover", "compliance review"],
  },
};

export const ALL_ARCHETYPE_MODELS: readonly ArchetypeOperatingModel[] = [
  UNIVERSAL_SMB_MODEL,
  LAUNDRY_MODEL,
  HOUSEKEEPING_MODEL,
];

/** Look up an operating model by archetype id. */
export function operatingModelFor(archetypeId: string): ArchetypeOperatingModel | undefined {
  return ALL_ARCHETYPE_MODELS.find((m) => m.archetypeId === archetypeId);
}
