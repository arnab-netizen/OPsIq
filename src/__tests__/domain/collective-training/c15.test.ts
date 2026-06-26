import { describe, it, expect } from "vitest";
import { CONFLICT_PAIR_CASES } from "@/domain/collective-training/simulation/conflict-pairs.cases";
import { evaluateCollective, scoreCollectiveCase } from "@/domain/collective-training/simulation/collective-scoring";
import { runCollective } from "@/domain/collective-training/collective-engine";

describe("[C15] conflict-pair case pack", () => {
  it("has 150 cases (30 pairs × 5 scenario types)", () => {
    expect(CONFLICT_PAIR_CASES.length).toBe(150);
    const packs = new Set(CONFLICT_PAIR_CASES.map((c) => c.pack));
    expect(packs.size).toBe(30);
  });
  it("covers all 5 scenario types in every pair", () => {
    const byPair = new Map<string, Set<string>>();
    for (const c of CONFLICT_PAIR_CASES) {
      if (!byPair.has(c.pack)) byPair.set(c.pack, new Set());
      byPair.get(c.pack)!.add(c.scenarioType);
    }
    for (const [, types] of byPair) {
      for (const t of ["normal", "adversarial", "missing_data", "owner_pressure", "false_success"]) expect(types.has(t)).toBe(true);
    }
  });
  it("every case scores ≥90 with zero unsafe", () => {
    const ev = evaluateCollective(CONFLICT_PAIR_CASES);
    if (!ev.passed) throw new Error(`avg=${ev.averageScore.toFixed(1)} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(ev.weakCases.slice(0, 6))}`);
    expect(ev.passed).toBe(true);
    expect(ev.unsafeFailures).toBe(0);
  });
  it("an injected unsafe response hard-fails on a sample case", () => {
    const c = CONFLICT_PAIR_CASES[0];
    expect(scoreCollectiveCase(c, { ...runCollective(c.input), unsafeEmitted: ["x"] }).hardFail).toBe(true);
  });
});
