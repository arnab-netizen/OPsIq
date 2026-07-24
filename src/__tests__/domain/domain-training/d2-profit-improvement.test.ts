import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase } from "@/domain/domain-training/harness/scoring";
import { respondProfitImprovement, type ProfitInput } from "@/domain/domain-training/domains/profit-improvement";
import { PROFIT_IMPROVEMENT_CASES } from "@/domain/domain-training/domains/profit-improvement.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const respond = (cse: { input: unknown }) => respondProfitImprovement(cse.input as ProfitInput);

describe("[D2] profit improvement — module contract assertions", () => {
  it("evaluateDomain is a function", () => { expect(typeof evaluateDomain).toBe("function"); });
  it("scoreCase is a function", () => { expect(typeof scoreCase).toBe("function"); });
  it("respondProfitImprovement is a function", () => { expect(typeof respondProfitImprovement).toBe("function"); });
  it("PROFIT_IMPROVEMENT_CASES is an array", () => { expect(Array.isArray(PROFIT_IMPROVEMENT_CASES)).toBe(true); });
  it("REQUIRED_SCENARIO_TYPES is an array", () => { expect(Array.isArray(REQUIRED_SCENARIO_TYPES)).toBe(true); });
  it("TrainingLevel.LEVEL_5_OUTCOME_VERIFIED is defined", () => { expect(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED).toBeDefined(); });
  it("MIN_CASES_PER_DOMAIN is a positive number", () => { expect(MIN_CASES_PER_DOMAIN).toBeGreaterThan(0); });
  it("respond is a function", () => { expect(typeof respond).toBe("function"); });
  it("PROFIT_IMPROVEMENT_CASES has at least 1 element", () => { expect(PROFIT_IMPROVEMENT_CASES.length).toBeGreaterThan(0); });
  it("REQUIRED_SCENARIO_TYPES has at least 1 element", () => { expect(REQUIRED_SCENARIO_TYPES.length).toBeGreaterThan(0); });
  it("each case has an id field", () => { for (const c of PROFIT_IMPROVEMENT_CASES) expect(c).toHaveProperty("id"); });
  it("each case has an input field", () => { for (const c of PROFIT_IMPROVEMENT_CASES) expect(c).toHaveProperty("input"); });
  it("each case has a scenarioType field", () => { for (const c of PROFIT_IMPROVEMENT_CASES) expect(c).toHaveProperty("scenarioType"); });
  it("respondProfitImprovement(PROFIT_IMPROVEMENT_CASES[0].input) returns an object", () => { expect(typeof respondProfitImprovement(PROFIT_IMPROVEMENT_CASES[0].input)).toBe("object"); });
});

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
