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

describe("[A1-A3] archetype operating models — structural assertions", () => {
  it("ALL_ARCHETYPE_MODELS is a non-empty array", () => {
    expect(Array.isArray(ALL_ARCHETYPE_MODELS)).toBe(true);
    expect(ALL_ARCHETYPE_MODELS.length).toBeGreaterThan(0);
  });
  it("validateOperatingModel is a function", () => {
    expect(typeof validateOperatingModel).toBe("function");
  });
  it("isOperatingModelValid is a function", () => {
    expect(typeof isOperatingModelValid).toBe("function");
  });
  it("canReferenceArchetype is a function", () => {
    expect(typeof canReferenceArchetype).toBe("function");
  });
  it("operatingModelFor is a function", () => {
    expect(typeof operatingModelFor).toBe("function");
  });
  it("UNIVERSAL_SMB_MODEL has a non-empty archetypeId", () => {
    expect(typeof UNIVERSAL_SMB_MODEL.archetypeId).toBe("string");
    expect(UNIVERSAL_SMB_MODEL.archetypeId.length).toBeGreaterThan(0);
  });
  it("LAUNDRY_MODEL has a non-empty archetypeId", () => {
    expect(typeof LAUNDRY_MODEL.archetypeId).toBe("string");
    expect(LAUNDRY_MODEL.archetypeId.length).toBeGreaterThan(0);
  });
  it("HOUSEKEEPING_MODEL has a non-empty archetypeId", () => {
    expect(typeof HOUSEKEEPING_MODEL.archetypeId).toBe("string");
    expect(HOUSEKEEPING_MODEL.archetypeId.length).toBeGreaterThan(0);
  });
  it("isOperatingModelValid(UNIVERSAL_SMB_MODEL) is true", () => {
    expect(isOperatingModelValid(UNIVERSAL_SMB_MODEL)).toBe(true);
  });
  it("isOperatingModelValid(LAUNDRY_MODEL) is true", () => {
    expect(isOperatingModelValid(LAUNDRY_MODEL)).toBe(true);
  });
  it("isOperatingModelValid(HOUSEKEEPING_MODEL) is true", () => {
    expect(isOperatingModelValid(HOUSEKEEPING_MODEL)).toBe(true);
  });
  it("canReferenceArchetype(LAUNDRY_MODEL) is true", () => {
    expect(canReferenceArchetype(LAUNDRY_MODEL)).toBe(true);
  });
  it("canReferenceArchetype(UNIVERSAL_SMB_MODEL) is true", () => {
    expect(canReferenceArchetype(UNIVERSAL_SMB_MODEL)).toBe(true);
  });
  it("canReferenceArchetype(undefined) is false", () => {
    expect(canReferenceArchetype(undefined)).toBe(false);
  });
  it("operatingModelFor('laundry') returns a defined model", () => {
    expect(operatingModelFor("laundry")).toBeDefined();
  });
  it("operatingModelFor('housekeeping') returns a defined model", () => {
    expect(operatingModelFor("housekeeping")).toBeDefined();
  });
  it("operatingModelFor('nonexistent') returns undefined", () => {
    expect(operatingModelFor("nonexistent")).toBeUndefined();
  });
});

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
