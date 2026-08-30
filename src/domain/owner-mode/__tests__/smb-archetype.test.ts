/**
 * SMB archetype config — completeness + invariant proofs.
 *
 * Proves the config itself is internally consistent (every category classified exactly once per
 * archetype, no unknowns) and the two hard governance invariants that motivated the reconciliation
 * before this config was written: `proof_completion` can never be dropped from every archetype's
 * required/recommended tier (readiness-score.ts's unconditional blocker would make that archetype
 * permanently unready), and `resolveSmbArchetype` never regex-infers — it's an exact lookup with a
 * safe generic fallback.
 */
import { describe, it, expect } from "vitest";
import {
  SMB_ARCHETYPES,
  SMB_ARCHETYPE_CONFIG,
  GENERIC_SMB_ARCHETYPE,
  resolveSmbArchetype,
  ALL_INPUT_CATEGORIES,
} from "@/domain/owner-mode/smb-archetype";
import { requiredInputsForProfile } from "@/domain/owner-mode/owner-onboarding";

describe("SMB_ARCHETYPES", () => {
  it("has exactly the 8 governed keys", () => {
    expect(SMB_ARCHETYPES).toHaveLength(8);
    expect([...SMB_ARCHETYPES].sort()).toEqual(
      [
        "laundry_local_service", "generic_local_service", "retail_service_hybrid",
        "retail_storefront", "field_mobile_service", "appointment_capacity_service",
        "hospitality_food_service", "b2b_project_contract_service",
      ].sort(),
    );
  });

  it("GENERIC_SMB_ARCHETYPE is a member of SMB_ARCHETYPES", () => {
    expect(SMB_ARCHETYPES).toContain(GENERIC_SMB_ARCHETYPE);
  });
});

describe("config completeness — every archetype classifies every one of the 20 categories exactly once", () => {
  for (const archetype of SMB_ARCHETYPES) {
    it(`${archetype}: all 20 categories accounted for, no duplicates`, () => {
      const req = requiredInputsForProfile(archetype, "owner_operated");
      const all = [...req.minimumRequired, ...req.recommended, ...req.optional];
      expect(all).toHaveLength(ALL_INPUT_CATEGORIES.length);
      expect(new Set(all).size).toBe(ALL_INPUT_CATEGORIES.length);
      for (const category of ALL_INPUT_CATEGORIES) {
        expect(all).toContain(category);
      }
    });
  }

  it("8 archetypes x 20 categories = 160 cells, all classified", () => {
    let cellCount = 0;
    for (const archetype of SMB_ARCHETYPES) {
      const req = requiredInputsForProfile(archetype, "owner_operated");
      cellCount += req.minimumRequired.length + req.recommended.length + req.optional.length;
    }
    expect(cellCount).toBe(SMB_ARCHETYPES.length * ALL_INPUT_CATEGORIES.length);
  });
});

describe("EVERY_ARCHETYPE_PROOF_COMPLETION_TIER = RECOMMENDED_OR_REQUIRED (never optional/irrelevant)", () => {
  for (const archetype of SMB_ARCHETYPES) {
    it(`${archetype}: proof_completion is required or recommended, for every owner role`, () => {
      for (const role of ["owner_operated", "manager_run", "remote_owner", "multi_location"] as const) {
        const req = requiredInputsForProfile(archetype, role);
        const inRequiredOrRecommended =
          req.minimumRequired.includes("proof_completion") || req.recommended.includes("proof_completion");
        expect(inRequiredOrRecommended).toBe(true);
      }
    });
  }
});

describe("resolveSmbArchetype — deterministic lookup, never regex inference", () => {
  it("resolves every exact governed value to itself", () => {
    for (const archetype of SMB_ARCHETYPES) {
      expect(resolveSmbArchetype(archetype)).toBe(archetype);
    }
  });

  it("PERSISTED_UNKNOWN_BUSINESS_TYPE: any unrecognized string, null, or undefined falls back to generic_local_service", () => {
    expect(resolveSmbArchetype("some legacy free-text value")).toBe(GENERIC_SMB_ARCHETYPE);
    expect(resolveSmbArchetype("Housekeeping & maid service")).toBe(GENERIC_SMB_ARCHETYPE);
    expect(resolveSmbArchetype(null)).toBe(GENERIC_SMB_ARCHETYPE);
    expect(resolveSmbArchetype(undefined)).toBe(GENERIC_SMB_ARCHETYPE);
    expect(resolveSmbArchetype("")).toBe(GENERIC_SMB_ARCHETYPE);
  });
});

describe("SMB_ARCHETYPE_CONFIG — laundry_local_service and generic_local_service are pinned to current production behavior", () => {
  it("laundry_local_service requiredAdd/recommended match today's live laundry_drycleaning profile exactly", () => {
    expect(SMB_ARCHETYPE_CONFIG.laundry_local_service.requiredAdd).toEqual(["equipment_logs", "fixed_costs"]);
    expect(SMB_ARCHETYPE_CONFIG.laundry_local_service.recommended).toEqual([
      "customer_count", "complaints_reviews", "payroll", "marketing", "proof_completion",
    ]);
  });

  it("generic_local_service requiredAdd/recommended match today's live generic profile exactly", () => {
    expect(SMB_ARCHETYPE_CONFIG.generic_local_service.requiredAdd).toEqual([]);
    expect(SMB_ARCHETYPE_CONFIG.generic_local_service.recommended).toEqual([
      "fixed_costs", "payroll", "customer_count", "complaints_reviews", "proof_completion",
    ]);
  });

  it("retail_service_hybrid: inventory_stock is RECOMMENDED, not REQUIRED — the one deliberate behavior change", () => {
    const req = requiredInputsForProfile("retail_service_hybrid", "owner_operated");
    expect(req.recommended).toContain("inventory_stock");
    expect(req.minimumRequired).not.toContain("inventory_stock");
  });
});

describe("byte-for-byte production compatibility — full requiredInputsForProfile output, pinned", () => {
  it("laundry_local_service + owner_operated: exact minimumRequired and recommended arrays", () => {
    const req = requiredInputsForProfile("laundry_local_service", "owner_operated");
    expect(req.minimumRequired.sort()).toEqual(
      ["revenue_sales", "expenses", "cash_debt", "equipment_logs", "fixed_costs"].sort(),
    );
    expect(req.recommended.sort()).toEqual(
      ["customer_count", "complaints_reviews", "payroll", "marketing", "proof_completion"].sort(),
    );
  });

  it("generic_local_service + owner_operated: exact minimumRequired and recommended arrays", () => {
    const req = requiredInputsForProfile("generic_local_service", "owner_operated");
    expect(req.minimumRequired.sort()).toEqual(["revenue_sales", "expenses", "cash_debt"].sort());
    expect(req.recommended.sort()).toEqual(
      ["fixed_costs", "payroll", "customer_count", "complaints_reviews", "proof_completion"].sort(),
    );
  });
});
