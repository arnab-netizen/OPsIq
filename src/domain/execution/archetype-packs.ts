/**
 * Archetype context packs (Slice 22, pure logic).
 *
 * Structured knowledge-pack skeletons for laundry and housekeeping. Slots start
 * empty (low confidence); missing local data lowers overall pack confidence. A
 * slot may only be filled through the Slice 21 candidate/promotion flow — a
 * promoted `KnowledgeUpdateCandidate` is required to apply knowledge.
 */

import {
  ContextConfidence,
  KnowledgeUpdateCandidate,
} from "@/domain/execution/business-context";

export const LAUNDRY_PACK_SLOTS = [
  "pricing_trends",
  "discount_norms",
  "b2b_linen_towel_rates",
  "chemical_cost_trends",
  "electricity_water_cost_sensitivity",
  "delivery_radius_economics",
  "staff_productivity_benchmarks",
  "customer_retention_tactics",
  "local_licensing_compliance",
  "tax_assumptions",
  "labor_rules",
  "environmental_wastewater_rules",
  "review_platform_trends",
  "competitor_offer_patterns",
] as const;

export const HOUSEKEEPING_PACK_SLOTS = [
  "staff_attendance_risk",
  "replacement_staffing_economics",
  "customer_complaint_patterns",
  "service_quality_benchmarks",
  "pricing_per_visit_hour_task",
  "background_verification_expectations",
  "labor_compliance",
  "insurance_liability_concerns",
  "apartment_community_demand_patterns",
  "retention_upsell_options",
  "training_sop_best_practices",
] as const;

export interface KnowledgeSlot {
  key: string;
  value: string | null;
  sourceId: string | null;
  confidence: ContextConfidence;
}

export interface ArchetypeKnowledgePack {
  archetype: string;
  slots: Record<string, KnowledgeSlot>;
}

export function createArchetypePack(
  archetype: string,
  slotKeys: readonly string[]
): ArchetypeKnowledgePack {
  const slots: Record<string, KnowledgeSlot> = {};
  for (const k of slotKeys) {
    slots[k] = { key: k, value: null, sourceId: null, confidence: ContextConfidence.LOW };
  }
  return { archetype, slots };
}

export function createLaundryPack(): ArchetypeKnowledgePack {
  return createArchetypePack("laundry", LAUNDRY_PACK_SLOTS);
}

export function createHousekeepingPack(): ArchetypeKnowledgePack {
  return createArchetypePack("housekeeping", HOUSEKEEPING_PACK_SLOTS);
}

export interface PackConfidenceResult {
  confidence: ContextConfidence;
  filledSlots: string[];
  missingSlots: string[];
}

export function assessPackConfidence(pack: ArchetypeKnowledgePack): PackConfidenceResult {
  const keys = Object.keys(pack.slots);
  const filled = keys.filter((k) => pack.slots[k].value != null);
  const missing = keys.filter((k) => pack.slots[k].value == null);
  const ratio = keys.length === 0 ? 0 : filled.length / keys.length;
  const confidence =
    ratio >= 0.8 ? ContextConfidence.HIGH : ratio >= 0.4 ? ContextConfidence.MEDIUM : ContextConfidence.LOW;
  return { confidence, filledSlots: filled, missingSlots: missing };
}

export class KnowledgePromotionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgePromotionRequiredError";
  }
}

/**
 * Apply knowledge to a slot — ONLY via a promoted candidate. Returns a new pack;
 * does not mutate the input.
 */
export function applyPromotedKnowledge(
  pack: ArchetypeKnowledgePack,
  slotKey: string,
  candidate: KnowledgeUpdateCandidate,
  value: string,
  confidence: ContextConfidence
): ArchetypeKnowledgePack {
  if (!candidate.promoted) {
    throw new KnowledgePromotionRequiredError(
      "Knowledge can only be applied through a promoted KnowledgeUpdateCandidate."
    );
  }
  if (!(slotKey in pack.slots)) {
    throw new KnowledgePromotionRequiredError(`Unknown slot: ${slotKey}`);
  }
  return {
    ...pack,
    slots: {
      ...pack.slots,
      [slotKey]: { key: slotKey, value, sourceId: candidate.sourceId, confidence },
    },
  };
}
