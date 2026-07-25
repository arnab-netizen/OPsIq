/**
 * Owner Intake (Module 10 Slice 3) — write-path validation + field-spec registry
 * tests (no DB).
 */
import { describe, it, expect } from "vitest";
import { intakeUploadSchema, fieldSpecForDomain, INTAKE_TARGET_DOMAINS } from "@/domain/owner-intake";

describe("Owner Intake — module contract assertions", () => {
  it("intakeUploadSchema has safeParse method", () => { expect(typeof intakeUploadSchema.safeParse).toBe("function"); });
  it("fieldSpecForDomain is a function", () => { expect(typeof fieldSpecForDomain).toBe("function"); });
  it("INTAKE_TARGET_DOMAINS is a non-empty array", () => { expect(Array.isArray(INTAKE_TARGET_DOMAINS)).toBe(true); expect(INTAKE_TARGET_DOMAINS.length).toBeGreaterThan(0); });
  it("INTAKE_TARGET_DOMAINS contains 'finance'", () => { expect(INTAKE_TARGET_DOMAINS).toContain("finance"); });
  it("intakeUploadSchema.safeParse(valid csv) succeeds", () => {
    expect(intakeUploadSchema.safeParse({ source: "csv_upload", targetDomain: "finance", csvText: "a,b\n1,2" }).success).toBe(true);
  });
  it("intakeUploadSchema rejects empty csvText", () => {
    expect(intakeUploadSchema.safeParse({ source: "csv_upload", targetDomain: "finance", csvText: "" }).success).toBe(false);
  });
  it("fieldSpecForDomain('finance') returns a non-null array", () => {
    const spec = fieldSpecForDomain("finance"); expect(spec).not.toBeNull(); expect(Array.isArray(spec)).toBe(true);
  });
  it("fieldSpecForDomain('portfolio') returns null", () => { expect(fieldSpecForDomain("portfolio")).toBeNull(); });
  it("fieldSpecForDomain('nonsense') returns null", () => { expect(fieldSpecForDomain("nonsense")).toBeNull(); });
  it("'finance' spec has length > 3", () => { expect(fieldSpecForDomain("finance")!.length).toBeGreaterThan(3); });
  it("'finance' spec requires periodStart", () => { expect(fieldSpecForDomain("finance")!.some((f) => f.name === "periodStart" && f.required)).toBe(true); });
  it("'finance' spec requires periodEnd", () => { expect(fieldSpecForDomain("finance")!.some((f) => f.name === "periodEnd" && f.required)).toBe(true); });
  it("'finance' spec requires currency", () => { expect(fieldSpecForDomain("finance")!.some((f) => f.name === "currency" && f.required)).toBe(true); });
  it("intakeUploadSchema rejects unknown source", () => {
    expect(intakeUploadSchema.safeParse({ source: "telepathy", targetDomain: "finance", csvText: "a" }).success).toBe(false);
  });
});

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
