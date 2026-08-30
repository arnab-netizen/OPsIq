/**
 * SMB ARCHETYPE — the single source of truth for how `OwnerBusiness.businessType` changes owner-pilot
 * input requirements.
 *
 * This is the ONLY place that maps a business type to a requirements tier per input category. There is
 * no second, independently-maintained requirements table anywhere else — `owner-onboarding.ts`'s
 * `requiredInputsForProfile()` reads this config directly instead of its own literal table, and
 * `mapBusinessTypeToProfile()` resolves through `resolveSmbArchetype()` below instead of guessing with
 * regex. This replaces the old six-value `BusinessProfileType` taxonomy for the requirements/readiness
 * subsystem; multi-location and remote/manager-run owner roles are NOT modeled here because they are
 * already an orthogonal, existing dimension (`OwnerRole`) with its own additive requirements in
 * `owner-onboarding.ts` — conflating them here would recreate exactly the kind of duplicate taxonomy
 * this file exists to prevent.
 *
 * `laundry_local_service` and `generic_local_service` reproduce the current production
 * `laundry_drycleaning` / `generic` profiles byte-for-byte (pinned by test). `field_mobile_service` and
 * `b2b_project_contract_service` inherit the existing, previously-unreachable `housekeeping_cleaning`
 * and `b2b_contract_service` profile numbers verbatim, rather than inventing fresh judgment calls. The
 * four newly-introduced archetypes (`retail_service_hybrid`'s expanded set, `retail_storefront`,
 * `appointment_capacity_service`, `hospitality_food_service`) intentionally add only RECOMMENDED
 * categories beyond the universal minimum — no new hard requirement is introduced by a first-pass
 * product judgment with no existing OpsIQ engine dependency or proven production behavior behind it.
 *
 * `proof_completion` is RECOMMENDED for every archetype and never optional/absent, because
 * `assessOwnerPilotReadiness` in `readiness-score.ts` blocks `pilotReady` unconditionally
 * (independent of any profile's tier) when it is not supplied — marking it irrelevant anywhere would
 * make that archetype permanently unable to reach pilot-ready.
 *
 * Pure module. No DB, no Date.now, no AI.
 */
import { type OwnerInputCategory, OWNER_INPUT_CATEGORIES } from "@/domain/owner-mode/input-catalog";
import { BUSINESS_TYPES } from "@/domain/founder-recovery/types";

export type SmbArchetype = (typeof BUSINESS_TYPES)[number];

export const SMB_ARCHETYPES: readonly SmbArchetype[] = BUSINESS_TYPES;

/** Safe runtime fallback for any persisted businessType value not recognized by the config below. */
export const GENERIC_SMB_ARCHETYPE: SmbArchetype = "generic_local_service";

export interface SmbArchetypeRequirements {
  /** Additional REQUIRED categories beyond the universal minimum (revenue_sales/expenses/cash_debt). */
  requiredAdd: OwnerInputCategory[];
  recommended: OwnerInputCategory[];
}

/**
 * Per-archetype additions to the universal minimum + the recommended tier.
 *
 * `laundry_local_service` and `generic_local_service` are pinned to today's live production output
 * (`PROFILE_REQUIREMENTS.laundry_drycleaning` / `.generic` in the pre-MVP `owner-onboarding.ts`).
 */
export const SMB_ARCHETYPE_CONFIG: Record<SmbArchetype, SmbArchetypeRequirements> = {
  laundry_local_service: {
    requiredAdd: ["equipment_logs", "fixed_costs"],
    recommended: ["customer_count", "complaints_reviews", "payroll", "marketing", "proof_completion"],
  },
  generic_local_service: {
    requiredAdd: [],
    recommended: ["fixed_costs", "payroll", "customer_count", "complaints_reviews", "proof_completion"],
  },
  retail_service_hybrid: {
    // Intentional product-behavior change vs. today's live "generic" fallback: inventory_stock moves
    // to RECOMMENDED (not REQUIRED — a first-pass product judgment, not yet a proven hard-gating
    // rule). See docs/opsiq-governance for the reconciliation record.
    requiredAdd: [],
    recommended: [
      "inventory_stock", "vendor_invoices", "fixed_costs", "payroll",
      "customer_count", "complaints_reviews", "marketing", "proof_completion",
    ],
  },
  retail_storefront: {
    requiredAdd: [],
    recommended: [
      "inventory_stock", "vendor_invoices", "fixed_costs", "payroll",
      "staff_rota", "customer_count", "marketing", "proof_completion",
    ],
  },
  field_mobile_service: {
    // Inherited verbatim from the existing (previously-unreachable) `housekeeping_cleaning` profile.
    requiredAdd: ["payroll", "staff_attendance"],
    recommended: ["staff_rota", "complaints_reviews", "customer_count", "proof_completion", "sops_checklists"],
  },
  appointment_capacity_service: {
    requiredAdd: [],
    recommended: [
      "customer_count", "staff_rota", "staff_attendance", "payroll", "fixed_costs",
      "complaints_reviews", "marketing", "proof_completion", "staff_training",
    ],
  },
  hospitality_food_service: {
    requiredAdd: [],
    recommended: [
      "fixed_costs", "payroll", "vendor_invoices", "inventory_stock", "staff_attendance",
      "staff_rota", "complaints_reviews", "customer_count", "marketing", "proof_completion", "tax_compliance",
    ],
  },
  b2b_project_contract_service: {
    // Inherited verbatim from the existing (previously-unreachable) `b2b_contract_service` profile.
    requiredAdd: ["b2b_contracts", "fixed_costs"],
    recommended: ["delivery_records", "vendor_invoices", "payroll", "proof_completion", "tax_compliance"],
  },
};

/**
 * Resolve any persisted/incoming businessType string to a known archetype.
 *
 * Deterministic lookup only — no regex inference. An exact match to one of the 8 governed
 * `BUSINESS_TYPES` values returns that value; anything else (a legacy/unrecognized persisted string)
 * falls back to `generic_local_service`, never throws, and never guesses. Incoming API values are
 * separately rejected at the Zod boundary (`businessCreateSchema`/`businessUpdateSchema` both use
 * `z.enum(BUSINESS_TYPES)`) — this function's fallback path only ever matters for a value already
 * persisted before or outside that validation, so it fails safe rather than fails closed.
 */
export function resolveSmbArchetype(businessType: string | null | undefined): SmbArchetype {
  const match = SMB_ARCHETYPES.find((a) => a === businessType);
  return match ?? GENERIC_SMB_ARCHETYPE;
}

/** All 20 input categories, for config-completeness verification. */
export const ALL_INPUT_CATEGORIES: readonly OwnerInputCategory[] = OWNER_INPUT_CATEGORIES;
