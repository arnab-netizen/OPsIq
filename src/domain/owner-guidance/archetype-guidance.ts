/**
 * Module 41 — archetype-aware guidance wording (pure).
 *
 * Maps a business's persisted `businessType` to the correct operating archetype
 * (laundry / housekeeping / home services / generic) so the Owner Now View speaks
 * the owner's language — e.g. "commercial linen clients" for laundry vs
 * "service-call customers" for home services. Reuses the archetype pack vocabulary
 * (M29/M30/M31/M32); it does not re-derive packs.
 *
 * Pure + deterministic.
 */

export type GuidanceArchetype = "laundry" | "housekeeping" | "home_services" | "generic";

export interface ArchetypeGuidance {
  archetype: GuidanceArchetype;
  /** Pack identifier (matches archetype-packs.ts / home-services-pack.ts). */
  pack: "laundry" | "housekeeping" | "home_services" | null;
  /** Plain noun for the business's customers, used in step wording. */
  customerNoun: string;
  /** Plain noun for the front-line worker, used in step wording. */
  workerNoun: string;
}

/** Normalize a persisted OwnerBusiness.businessType into a guidance archetype. */
export function archetypeFromBusinessType(businessType: string | null | undefined): GuidanceArchetype {
  const t = (businessType ?? "").toLowerCase();
  if (t.includes("laundry")) return "laundry";
  if (t.includes("housekeep") || t.includes("cleaning")) return "housekeeping";
  if (t.includes("home") || t.includes("maintenance") || t.includes("field") || t.includes("repair")) {
    return "home_services";
  }
  return "generic";
}

const GUIDANCE: Record<GuidanceArchetype, ArchetypeGuidance> = {
  laundry: { archetype: "laundry", pack: "laundry", customerNoun: "commercial/B2B linen clients", workerNoun: "counter/plant staff" },
  housekeeping: { archetype: "housekeeping", pack: "housekeeping", customerNoun: "apartment/community clients", workerNoun: "housekeeping staff" },
  home_services: { archetype: "home_services", pack: "home_services", customerNoun: "service-call customers", workerNoun: "field technicians" },
  generic: { archetype: "generic", pack: null, customerNoun: "customers", workerNoun: "staff" },
};

export function archetypeGuidance(businessType: string | null | undefined): ArchetypeGuidance {
  return GUIDANCE[archetypeFromBusinessType(businessType)];
}
