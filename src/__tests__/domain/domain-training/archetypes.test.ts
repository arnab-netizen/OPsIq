import { describe, it, expect } from "vitest";
import {
  validateOperatingModel,
  isOperatingModelValid,
  canReferenceArchetype,
  UNIVERSAL_SMB_MODEL,
} from "@/domain/domain-training/archetypes/operating-model";
import {
  LAUNDRY_MODEL,
  HOUSEKEEPING_MODEL,
  ALL_ARCHETYPE_MODELS,
  operatingModelFor,
} from "@/domain/domain-training/archetypes/archetype-models";
import { archetypeGuidance } from "@/domain/owner-guidance/archetype-guidance";

describe("[A1-A3] archetype operating models", () => {
  it.each(ALL_ARCHETYPE_MODELS.map((m) => [m.name, m] as const))("%s validates with all required dimensions", (_name, m) => {
    expect(validateOperatingModel(m)).toEqual([]);
    expect(isOperatingModelValid(m)).toBe(true);
    // required dimensions present
    expect(m.proofTypes.length).toBeGreaterThan(0);
    expect(m.commonRisks.length).toBeGreaterThan(0);
    expect(m.capacityDimensions.length).toBeGreaterThan(0);
    expect(m.workloadDimensions.length).toBeGreaterThan(0);
    expect(m.qualityDimensions.length).toBeGreaterThan(0);
  });

  it("rejects a model missing required fields (proof types / risks / quality dims)", () => {
    expect(validateOperatingModel({ ...UNIVERSAL_SMB_MODEL, proofTypes: [] })).toContain("missing_proof_types");
    expect(validateOperatingModel({ ...LAUNDRY_MODEL, commonRisks: [] })).toContain("missing_common_risks");
    expect(validateOperatingModel({ ...HOUSEKEEPING_MODEL, qualityDimensions: [] })).toContain("missing_quality_dimensions");
    expect(validateOperatingModel({ ...UNIVERSAL_SMB_MODEL, reviewCadence: { daily: [], weekly: ["x"], monthly: ["y"] } })).toContain("missing_review_cadence");
  });

  it("domain training can reference a valid archetype model", () => {
    expect(canReferenceArchetype(LAUNDRY_MODEL)).toBe(true);
    expect(canReferenceArchetype(undefined)).toBe(false);
    expect(canReferenceArchetype({ ...HOUSEKEEPING_MODEL, staffRoles: [] })).toBe(false);
  });

  it("archetype ids align with the M41 archetype-guidance vocabulary", () => {
    expect(operatingModelFor("laundry")?.archetypeId).toBe(archetypeGuidance("laundry_local_service").archetype);
    expect(operatingModelFor("housekeeping")?.archetypeId).toBe(archetypeGuidance("housekeeping_cleaning").archetype);
    expect(operatingModelFor("universal")).toBeDefined();
    expect(operatingModelFor("nonexistent")).toBeUndefined();
  });
});
