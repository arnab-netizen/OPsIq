import { describe, it, expect } from "vitest";
import { SEED_CASES, SEED_CASE_IDS } from "@/behavioral-validation/seed-cases";
import { behavioralCaseSchema } from "@/behavioral-validation/schema";

describe("chaos seed cases — module contract assertions", () => {
  it("SEED_CASES is an array", () => {
    expect(Array.isArray(SEED_CASES)).toBe(true);
  });
  it("SEED_CASES.length is 31", () => {
    expect(SEED_CASES.length).toBe(31);
  });
  it("SEED_CASE_IDS is an array", () => {
    expect(Array.isArray(SEED_CASE_IDS)).toBe(true);
  });
  it("SEED_CASE_IDS.length is 31", () => {
    expect(SEED_CASE_IDS.length).toBe(31);
  });
  it("all SEED_CASE_IDS are strings", () => {
    for (const id of SEED_CASE_IDS) expect(typeof id).toBe("string");
  });
  it("all SEED_CASE_IDS are unique", () => {
    expect(new Set(SEED_CASE_IDS).size).toBe(31);
  });
  it("SEED_CASES[0] has an id field", () => {
    expect(SEED_CASES[0]).toHaveProperty("id");
  });
  it("SEED_CASES[0] has a sourceSeedCaseId field", () => {
    expect(SEED_CASES[0]).toHaveProperty("sourceSeedCaseId");
  });
  it("SEED_CASES[0].id equals SEED_CASES[0].sourceSeedCaseId", () => {
    expect(SEED_CASES[0].id).toBe(SEED_CASES[0].sourceSeedCaseId);
  });
  it("first SEED_CASE_IDS entry starts with 'A'", () => {
    expect(SEED_CASE_IDS[0][0]).toBe("A");
  });
  it("some SEED_CASE_IDS start with 'L'", () => {
    expect(SEED_CASE_IDS.some((id) => id.startsWith("L"))).toBe(true);
  });
  it("all SEED_CASES have a hiddenRootCause field", () => {
    for (const c of SEED_CASES) expect(c).toHaveProperty("hiddenRootCause");
  });
  it("all SEED_CASES have an id field", () => {
    for (const c of SEED_CASES) expect(c).toHaveProperty("id");
  });
  it("behavioralCaseSchema is defined", () => {
    expect(behavioralCaseSchema).toBeDefined();
  });
  it("behavioralCaseSchema.parse is a function", () => {
    expect(typeof behavioralCaseSchema.parse).toBe("function");
  });
  it("behavioralCaseSchema.parse(SEED_CASES[0]) does not throw", () => {
    expect(() => behavioralCaseSchema.parse(SEED_CASES[0])).not.toThrow();
  });
});

describe("chaos seed cases (packs A–L)", () => {
  it("encodes 31 seeds with unique ids each equal to its sourceSeedCaseId", () => {
    expect(SEED_CASES.length).toBe(31);
    expect(new Set(SEED_CASE_IDS).size).toBe(31);
    for (const c of SEED_CASES) expect(c.sourceSeedCaseId).toBe(c.id);
  });

  it("every seed validates against the case schema", () => {
    for (const c of SEED_CASES) expect(() => behavioralCaseSchema.parse(c)).not.toThrow();
  });

  it("every seed preserves the non-negotiable invariants (root cause, tempting/correct, proof, reassessment, learning rule)", () => {
    for (const c of SEED_CASES) {
      expect(c.hiddenRootCause.length).toBeGreaterThan(8);
      expect(c.temptingBadDecision.length).toBeGreaterThan(4);
      expect(c.correctExpertDecision.length).toBeGreaterThan(8);
      expect(c.opsiqShouldSay.length).toBeGreaterThan(0);
      expect(c.opsiqShouldBlock.length).toBeGreaterThan(0);
      expect(c.proofRequired.length).toBeGreaterThan(0);
      expect(c.reassessmentTrigger.length).toBeGreaterThan(4);
      expect(c.learningRuleIfFails.length).toBeGreaterThan(8);
    }
  });

  it("spans packs A through L", () => {
    const prefixes = new Set(SEED_CASE_IDS.map((id) => id[0]));
    for (const p of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]) expect(prefixes.has(p)).toBe(true);
  });
});
