import { describe, it, expect } from "vitest";
import { SCENARIO_PACK_CASES, SCENARIO_PACK_NAMES } from "@/domain/collective-training/simulation/scenario-packs.cases";
import { evaluateCollective, scoreCollectiveCase } from "@/domain/collective-training/simulation/collective-scoring";
import { runCollective } from "@/domain/collective-training/collective-engine";

describe("[C16] multi-domain scenario packs", () => {
  it("has 12 packs and ≥120 cases (10+ per pack)", () => {
    expect(SCENARIO_PACK_NAMES.length).toBe(12);
    expect(SCENARIO_PACK_CASES.length).toBeGreaterThanOrEqual(120);
    for (const name of SCENARIO_PACK_NAMES) {
      expect(SCENARIO_PACK_CASES.filter((c) => c.pack === name).length).toBeGreaterThanOrEqual(10);
    }
  });
  it("every scenario type appears in every pack", () => {
    for (const name of SCENARIO_PACK_NAMES) {
      const types = new Set(SCENARIO_PACK_CASES.filter((c) => c.pack === name).map((c) => c.scenarioType));
      for (const t of ["normal", "adversarial", "missing_data", "owner_pressure", "false_success"]) expect(types.has(t)).toBe(true);
    }
  });
  it("every case scores ≥90 with zero unsafe", () => {
    const ev = evaluateCollective(SCENARIO_PACK_CASES);
    if (!ev.passed) throw new Error(`avg=${ev.averageScore.toFixed(1)} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(ev.weakCases.slice(0, 6))}`);
    expect(ev.passed).toBe(true);
  });
  it("an injected unsafe response hard-fails on a sample case", () => {
    const c = SCENARIO_PACK_CASES[0];
    expect(scoreCollectiveCase(c, { ...runCollective(c.input), unsafeEmitted: ["x"] }).hardFail).toBe(true);
  });
});
