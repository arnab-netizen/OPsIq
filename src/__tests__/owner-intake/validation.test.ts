/**
 * Owner Intake (Module 10 Slice 3) — write-path validation + field-spec registry
 * tests (no DB).
 */
import { describe, it, expect } from "vitest";
import { intakeUploadSchema, fieldSpecForDomain, INTAKE_TARGET_DOMAINS } from "@/domain/owner-intake";

describe("Owner Intake — upload schema", () => {
  const valid = { source: "csv_upload", targetDomain: "finance", csvText: "a,b\n1,2" };

  it("accepts a valid upload", () => {
    expect(intakeUploadSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects an unknown source", () => {
    expect(intakeUploadSchema.safeParse({ ...valid, source: "telepathy" }).success).toBe(false);
  });
  it("rejects an unsupported target domain", () => {
    expect(intakeUploadSchema.safeParse({ ...valid, targetDomain: "portfolio" }).success).toBe(false);
  });
  it("rejects empty CSV content", () => {
    expect(intakeUploadSchema.safeParse({ ...valid, csvText: "" }).success).toBe(false);
  });
});

describe("Owner Intake — field-spec registry", () => {
  it("resolves a spec for every supported target domain (period + currency required)", () => {
    for (const d of INTAKE_TARGET_DOMAINS) {
      const spec = fieldSpecForDomain(d)!;
      expect(spec.length).toBeGreaterThan(3);
      const required = spec.filter((f) => f.required).map((f) => f.name);
      expect(required).toEqual(expect.arrayContaining(["periodStart", "periodEnd", "currency"]));
    }
  });
  it("returns null for an unsupported domain", () => {
    expect(fieldSpecForDomain("portfolio")).toBeNull();
    expect(fieldSpecForDomain("nonsense")).toBeNull();
  });
});
