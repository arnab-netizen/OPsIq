/**
 * Archetype + decision-category taxonomy helpers.
 *
 * Pure, deterministic lookups used by the expansion generator, advisor and report. No business
 * mutation here — these only describe how archetypes/categories map to the operational concerns the
 * advisor must always cover (so a laundry case and a fleet case are reasoned about on their own terms).
 */
import {
  BUSINESS_ARCHETYPES,
  DECISION_CATEGORIES,
  type BusinessArchetype,
  type DecisionCategory,
} from "./schema";

/** Operational concern tags per archetype — what an expert always checks for that kind of business. */
const ARCHETYPE_CONCERNS: Record<BusinessArchetype, string[]> = {
  laundry_dry_cleaning: ["rework/lost-item leakage", "batch/order tracking", "chemical/water cost", "contribution margin by service"],
  housekeeping_facility: ["shift coverage", "supervisor trust", "client SLA penalties", "labour cost per site"],
  food_restaurant_cloudkitchen: ["food cost %", "wastage/spoilage", "platform commission", "hygiene/compliance"],
  retail_pharmacy_grocery_apparel: ["inventory dead-stock", "expiry/regulated stock", "shrinkage", "credit-customer ageing"],
  professional_services_agency: ["utilisation", "scope creep", "receivables ageing", "key-person dependency"],
  health_care_fitness: ["membership churn", "trainer/clinician dependency", "regulated claims", "capacity per slot"],
  trades_repair_manufacturing: ["job costing", "rework/warranty", "parts/inventory", "AR collection"],
  education_training: ["enrolment seasonality", "trainer dependency", "refund liability", "outcome proof"],
  logistics_delivery_fleet: ["cost per trip", "fuel/maintenance", "idle vehicles", "driver reliability"],
  digital_ecommerce_d2c_saas: ["CAC vs LTV", "refund/chargeback", "churn", "unit economics per order"],
  agri_rural: ["input cost volatility", "buyer payment delay", "spoilage/weather shock", "aggregator dependency"],
  multi_location_franchise_portfolio: ["per-branch P&L", "brand/pricing constraint", "cross-branch comparison", "central vs local control"],
};

/** Concerns the advisor must surface for a given archetype. */
export function archetypeConcerns(a: BusinessArchetype): string[] {
  return ARCHETYPE_CONCERNS[a];
}

/** Which decision categories are most material for an archetype (used to weight expansion variety). */
export function isCoreArchetype(a: BusinessArchetype): boolean {
  return BUSINESS_ARCHETYPES.includes(a);
}

/** Stable human label for reports. */
export function categoryLabel(c: DecisionCategory): string {
  const labels: Record<DecisionCategory, string> = {
    cash_margin_working_capital: "Cash / margin / working capital",
    staff_process_equipment: "Staff / process / equipment",
    marketing_opportunity_contract: "Marketing / opportunity / contract",
    compliance_location_review: "Compliance / location",
    owner_emotional_override: "Owner-emotional override",
    remote_owner: "Remote owner",
    multi_branch_portfolio: "Multi-branch / portfolio",
    data_sufficiency: "Data sufficiency",
  };
  return labels[c];
}

export { BUSINESS_ARCHETYPES, DECISION_CATEGORIES };
