/**
 * Source-register privacy + schema gates. Proves the public-source register stores metadata only:
 * valid schema, unique ids, a url/citation each, NO personal identifiers, and NO long copied text.
 * Also exercises the PII / long-text detectors with positive controls so the gates can actually fail.
 */
import { describe, it, expect } from "vitest";
import {
  SOURCE_REGISTER,
  validateSourceRegister,
  sourceRecordSchema,
  findPII,
  hasLongCopiedText,
  MAX_QUOTE_CHARS,
} from "@/behavioral-validation/public-cases/source-register";

describe("public-case source register — module contract assertions", () => {
  it("SOURCE_REGISTER is an array", () => { expect(Array.isArray(SOURCE_REGISTER)).toBe(true); });
  it("SOURCE_REGISTER has at least 12 entries", () => { expect(SOURCE_REGISTER.length).toBeGreaterThanOrEqual(12); });
  it("validateSourceRegister is a function", () => { expect(typeof validateSourceRegister).toBe("function"); });
  it("sourceRecordSchema has a parse method", () => { expect(typeof sourceRecordSchema.parse).toBe("function"); });
  it("findPII is a function", () => { expect(typeof findPII).toBe("function"); });
  it("hasLongCopiedText is a function", () => { expect(typeof hasLongCopiedText).toBe("function"); });
  it("MAX_QUOTE_CHARS is a positive number", () => { expect(typeof MAX_QUOTE_CHARS).toBe("number"); expect(MAX_QUOTE_CHARS).toBeGreaterThan(0); });
  it("validateSourceRegister() returns an object with ok and errors", () => {
    const res = validateSourceRegister();
    expect(res).toHaveProperty("ok"); expect(res).toHaveProperty("errors");
  });
  it("validateSourceRegister().ok is boolean", () => { expect(typeof validateSourceRegister().ok).toBe("boolean"); });
  it("findPII('') returns an empty array", () => { expect(findPII("")).toEqual([]); });
  it("hasLongCopiedText('') returns false", () => { expect(hasLongCopiedText("")).toBe(false); });
  it("SOURCE_REGISTER[0] has id, title, factsUsed fields", () => {
    expect(SOURCE_REGISTER[0]).toHaveProperty("id");
    expect(SOURCE_REGISTER[0]).toHaveProperty("title");
    expect(SOURCE_REGISTER[0]).toHaveProperty("factsUsed");
  });
  it("all SOURCE_REGISTER ids are non-empty strings", () => { for (const r of SOURCE_REGISTER) expect(typeof r.id).toBe("string"); });
  it("all SOURCE_REGISTER factsUsed are non-empty arrays", () => { for (const r of SOURCE_REGISTER) expect(Array.isArray(r.factsUsed)).toBe(true); });
});

describe("public-case source register", () => {
  it("is non-empty and fully valid (schema + ids + privacy)", () => {
    expect(SOURCE_REGISTER.length).toBeGreaterThanOrEqual(12);
    const res = validateSourceRegister();
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("every record has a unique id and a url or citation", () => {
    const ids = new Set<string>();
    for (const r of SOURCE_REGISTER) {
      expect(sourceRecordSchema.safeParse(r).success).toBe(true);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.url !== undefined || r.citation !== undefined).toBe(true);
      expect(r.reliability).toBeTruthy();
      expect(r.completeness).toBeTruthy();
      expect(r.factsUsed.length).toBeGreaterThan(0);
    }
  });

  it("contains NO personal identifiers in any stored field", () => {
    for (const r of SOURCE_REGISTER) {
      const blob = [r.title, r.citation ?? "", ...r.factsUsed, ...r.factsInferred, ...r.factsSyntheticallyVaried].join("  ");
      expect(findPII(blob), `PII in ${r.id}`).toEqual([]);
    }
  });

  it("contains NO long copied text (every field within the short-quote cap)", () => {
    for (const r of SOURCE_REGISTER) {
      for (const f of [r.title, ...r.factsUsed, ...r.factsInferred, ...r.factsSyntheticallyVaried]) {
        expect(f.length, `${r.id} field too long`).toBeLessThanOrEqual(MAX_QUOTE_CHARS);
      }
    }
  });

  it("PII detector catches planted identifiers (positive control)", () => {
    expect(findPII("contact john at john.doe@example.com")).toContain("email");
    expect(findPII("call +1 415 555 1234 today")).toContain("phone");
    expect(findPII("ship to 1234 Market Street")).toContain("street_address");
    expect(findPII("dm @ownerhandle now")).toContain("social_handle");
    expect(findPII("a Kolkata laundry with cash tight and overdue receivables")).toEqual([]);
  });

  it("long-copied-text detector catches an over-length quote (positive control)", () => {
    expect(hasLongCopiedText("x".repeat(MAX_QUOTE_CHARS + 1))).toBe(true);
    expect(hasLongCopiedText("a short anonymized business pattern")).toBe(false);
  });
});
