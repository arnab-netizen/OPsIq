/**
 * Source rules — real cases only for readiness credit (§3). Every counted scenario is real, sourced,
 * privacy-clean, and chaos-bearing; unsourced / synthetic / no-chaos / no-tempting / no-missing-data /
 * no-limitation / no-consequence / PII / long-copied-text / hallucinated-sourceRef all FAIL.
 */
import { describe, it, expect } from "vitest";
import { COUNTED_CHAOS_SCENARIOS } from "@/behavioral-validation/chaos-replay/chaos-corpus";
import { validateCountedScenario, isCountedScenarioValid, REGISTER_IDS } from "@/behavioral-validation/chaos-replay/chaos-source";

const base = COUNTED_CHAOS_SCENARIOS[0];

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
