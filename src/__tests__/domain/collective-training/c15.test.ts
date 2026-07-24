import { describe, it, expect } from "vitest";
import { CONFLICT_PAIR_CASES } from "@/domain/collective-training/simulation/conflict-pairs.cases";
import { evaluateCollective, scoreCollectiveCase } from "@/domain/collective-training/simulation/collective-scoring";
import { runCollective } from "@/domain/collective-training/collective-engine";

describe("[C15] conflict-pair case pack — module contract assertions", () => {
  it("CONFLICT_PAIR_CASES is an array", () => {
    expect(Array.isArray(CONFLICT_PAIR_CASES)).toBe(true);
  });
  it("CONFLICT_PAIR_CASES.length is 150", () => {
    expect(CONFLICT_PAIR_CASES.length).toBe(150);
  });
  it("evaluateCollective is a function", () => {
    expect(typeof evaluateCollective).toBe("function");
  });
  it("scoreCollectiveCase is a function", () => {
    expect(typeof scoreCollectiveCase).toBe("function");
  });
  it("runCollective is a function", () => {
    expect(typeof runCollective).toBe("function");
  });
  it("CONFLICT_PAIR_CASES[0] has a pack field", () => {
    expect(CONFLICT_PAIR_CASES[0]).toHaveProperty("pack");
  });
  it("CONFLICT_PAIR_CASES[0].pack is a string", () => {
    expect(typeof CONFLICT_PAIR_CASES[0].pack).toBe("string");
  });
  it("CONFLICT_PAIR_CASES[0] has a scenarioType field", () => {
    expect(CONFLICT_PAIR_CASES[0]).toHaveProperty("scenarioType");
  });
  it("there are exactly 30 distinct pack names", () => {
    expect(new Set(CONFLICT_PAIR_CASES.map((c) => c.pack)).size).toBe(30);
  });
  it("all CONFLICT_PAIR_CASES have a string scenarioType", () => {
    for (const c of CONFLICT_PAIR_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("evaluateCollective(CONFLICT_PAIR_CASES) returns an object", () => {
    expect(typeof evaluateCollective(CONFLICT_PAIR_CASES)).toBe("object");
  });
  it("evaluateCollective result has a passed field", () => {
    expect(evaluateCollective(CONFLICT_PAIR_CASES)).toHaveProperty("passed");
  });
  it("evaluateCollective result has an averageScore field (number)", () => {
    expect(typeof evaluateCollective(CONFLICT_PAIR_CASES).averageScore).toBe("number");
  });
  it("evaluateCollective result has an unsafeFailures field", () => {
    expect(evaluateCollective(CONFLICT_PAIR_CASES)).toHaveProperty("unsafeFailures");
  });
  it("evaluateCollective(CONFLICT_PAIR_CASES).passed is true", () => {
    expect(evaluateCollective(CONFLICT_PAIR_CASES).passed).toBe(true);
  });
  it("evaluateCollective(CONFLICT_PAIR_CASES).unsafeFailures is 0", () => {
    expect(evaluateCollective(CONFLICT_PAIR_CASES).unsafeFailures).toBe(0);
  });
});

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
