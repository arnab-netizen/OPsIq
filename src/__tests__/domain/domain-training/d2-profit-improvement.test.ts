import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase } from "@/domain/domain-training/harness/scoring";
import { respondProfitImprovement, type ProfitInput } from "@/domain/domain-training/domains/profit-improvement";
import { PROFIT_IMPROVEMENT_CASES } from "@/domain/domain-training/domains/profit-improvement.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const respond = (cse: { input: unknown }) => respondProfitImprovement(cse.input as ProfitInput);

describe("[D2] profit improvement — executable scored training", () => {
  it("carries >=21 cases covering every required scenario type", () => {
    expect(PROFIT_IMPROVEMENT_CASES.length).toBeGreaterThanOrEqual(MIN_CASES_PER_DOMAIN);
    const covered = new Set(PROFIT_IMPROVEMENT_CASES.map((c) => c.scenarioType));
    for (const t of REQUIRED_SCENARIO_TYPES) expect(covered.has(t)).toBe(true);
  });

  it("reaches LEVEL_5 (>=90% avg, zero unsafe failures)", () => {
    const ev = evaluateDomain(PROFIT_IMPROVEMENT_CASES, respond);
    if (!ev.passedLevel5) {
      const weak = ev.perCase.filter((p) => p.score < 90 || p.hardFail);
      throw new Error(`avg=${ev.averageScore} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(weak)}`);
    }
    expect(ev.level).toBe(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED);
    expect(ev.unsafeFailures).toBe(0);
  });

  it("governed — negative margin blocks discounting/low-price-B2B/revenue-chasing", () => {
    const r = respondProfitImprovement(PROFIT_IMPROVEMENT_CASES.find((c) => c.id === "D2-05")!.input);
    expect(r.whatNotToDo).toContain("no discounting below margin");
    expect(r.whatNotToDo).toContain("no revenue-chasing");
  });

  it("governed — vanity (revenue up, profit flat) → stop chasing revenue", () => {
    const r = respondProfitImprovement(PROFIT_IMPROVEMENT_CASES.find((c) => c.id === "D2-19")!.input);
    expect(r.nextAction.toLowerCase()).toContain("stop chasing revenue");
    expect(r.whatNotToDo).toContain("no vanity sales growth");
  });

  it("governed — quality-damaging cost cut blocked without proof", () => {
    const r = respondProfitImprovement(PROFIT_IMPROVEMENT_CASES.find((c) => c.id === "D2-10")!.input);
    expect(r.whatNotToDo).toContain("no quality-damaging cost cuts without proof");
  });

  it("governed — missing/contradictory data → BLOCKED confidence", () => {
    expect(respondProfitImprovement(PROFIT_IMPROVEMENT_CASES.find((c) => c.id === "D2-07")!.input).confidence).toBe("BLOCKED");
    expect(respondProfitImprovement(PROFIT_IMPROVEMENT_CASES.find((c) => c.id === "D2-21")!.input).confidence).toBe("BLOCKED");
  });

  it("never emits a vetoed action; unsafe response hard-fails (scorer real)", () => {
    for (const cse of PROFIT_IMPROVEMENT_CASES) expect(respondProfitImprovement(cse.input).unsafeEmitted).toHaveLength(0);
    const cse = PROFIT_IMPROVEMENT_CASES.find((c) => c.id === "D2-05")!;
    const bad = { ...respondProfitImprovement(cse.input), unsafeEmitted: ["revenue_chasing"] };
    expect(scoreCase(cse, bad).hardFail).toBe(true);
  });
});
