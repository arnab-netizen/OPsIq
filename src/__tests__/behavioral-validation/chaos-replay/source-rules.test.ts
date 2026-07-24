/**
 * Source rules — real cases only for readiness credit (§3). Every counted scenario is real, sourced,
 * privacy-clean, and chaos-bearing; unsourced / synthetic / no-chaos / no-tempting / no-missing-data /
 * no-limitation / no-consequence / PII / long-copied-text / hallucinated-sourceRef all FAIL.
 */
import { describe, it, expect } from "vitest";
import { COUNTED_CHAOS_SCENARIOS } from "@/behavioral-validation/chaos-replay/chaos-corpus";
import { validateCountedScenario, isCountedScenarioValid, REGISTER_IDS } from "@/behavioral-validation/chaos-replay/chaos-source";

const base = COUNTED_CHAOS_SCENARIOS[0];

describe("source rules (§3) — structural corpus assertions (no service call)", () => {
  it("COUNTED_CHAOS_SCENARIOS is a non-empty array", () => {
    expect(Array.isArray(COUNTED_CHAOS_SCENARIOS)).toBe(true);
    expect(COUNTED_CHAOS_SCENARIOS.length).toBeGreaterThan(0);
  });
  it("all scenarios have a non-empty scenarioId string", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      expect(typeof s.scenarioId).toBe("string");
      expect(s.scenarioId.length).toBeGreaterThan(0);
    }
  });
  it("all scenarios have sourceRefs as a non-empty array", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      expect(Array.isArray(s.sourceRefs)).toBe(true);
      expect(s.sourceRefs.length).toBeGreaterThan(0);
    }
  });
  it("all scenarios have chaosTypes as an array", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      expect(Array.isArray(s.chaosTypes)).toBe(true);
    }
  });
  it("all scenarios have a non-empty businessProfile", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      expect(typeof s.businessProfile).toBe("string");
      expect(s.businessProfile.length).toBeGreaterThan(0);
    }
  });
  it("all scenarios have a non-empty temptingWrongAction", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      expect(typeof s.temptingWrongAction).toBe("string");
      expect(s.temptingWrongAction.length).toBeGreaterThan(0);
    }
  });
  it("all scenarios have a non-empty expectedRealWorldConsequenceIfWrong", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      expect(typeof s.expectedRealWorldConsequenceIfWrong).toBe("string");
      expect(s.expectedRealWorldConsequenceIfWrong.length).toBeGreaterThan(0);
    }
  });
  it("all scenarios have missingData as an array", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      expect(Array.isArray(s.missingData)).toBe(true);
    }
  });
  it("all scenarios have sourceLimitations as an array", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      expect(Array.isArray(s.sourceLimitations)).toBe(true);
    }
  });
  it("all counted scenarios have synthetic !== true", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      expect(s.synthetic).not.toBe(true);
    }
  });
  it("validateCountedScenario is a function", () => {
    expect(typeof validateCountedScenario).toBe("function");
  });
  it("isCountedScenarioValid is a function", () => {
    expect(typeof isCountedScenarioValid).toBe("function");
  });
  it("REGISTER_IDS is a Set", () => {
    expect(REGISTER_IDS instanceof Set).toBe(true);
  });
  it("REGISTER_IDS is non-empty", () => {
    expect(REGISTER_IDS.size).toBeGreaterThan(0);
  });
  it("all scenario IDs are unique", () => {
    const ids = COUNTED_CHAOS_SCENARIOS.map((s) => s.scenarioId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("base scenario (first counted case) passes isCountedScenarioValid", () => {
    expect(isCountedScenarioValid(base)).toBe(true);
  });
  it("base scenario validateCountedScenario returns empty array (no violations)", () => {
    expect(validateCountedScenario(base)).toEqual([]);
  });
});

describe("source rules (§3) — counted corpus is real, sourced and privacy-clean", () => {
  it("every counted scenario passes all source rules", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      expect(validateCountedScenario(s), s.scenarioId).toEqual([]);
    }
  });

  it("every counted sourceRef exists in the source register (no hallucinated refs)", () => {
    for (const s of COUNTED_CHAOS_SCENARIOS) {
      for (const ref of s.sourceRefs) expect(REGISTER_IDS.has(ref), `${s.scenarioId}:${ref}`).toBe(true);
    }
  });
});

describe("source rules (§3) — negative gates each fail", () => {
  const cases: Array<[string, () => unknown]> = [
    ["unsourced counted case fails", () => ({ ...base, sourceRefs: [] })],
    ["synthetic counted case fails", () => ({ ...base, synthetic: true })],
    ["no-chaos clean case fails", () => ({ ...base, conflictingData: [], chaosTypes: [] })],
    ["no wrong tempting action fails", () => ({ ...base, temptingWrongAction: "" })],
    ["no missing-data challenge fails", () => ({ ...base, missingData: [] })],
    ["no source limitation fails", () => ({ ...base, sourceLimitations: [] })],
    ["no real-world consequence fails", () => ({ ...base, expectedRealWorldConsequenceIfWrong: "" })],
    ["PII fails", () => ({ ...base, businessProfile: "owner jane@acme.com runs a laundry" })],
    ["long copied text fails", () => ({ ...base, businessProfile: "x".repeat(400) })],
    ["hallucinated sourceRef fails", () => ({ ...base, sourceRefs: ["SRC-DOES-NOT-EXIST-999"] })],
  ];
  for (const [name, make] of cases) {
    it(name, () => {
      expect(isCountedScenarioValid(make() as typeof base)).toBe(false);
      expect(validateCountedScenario(make() as typeof base).length).toBeGreaterThan(0);
    });
  }
});
