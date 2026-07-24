import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase, type DomainCase } from "@/domain/domain-training/harness/scoring";
import { respondWhatToDoNext } from "@/domain/domain-training/domains/what-to-do-next";
import { WHAT_TO_DO_NEXT_CASES } from "@/domain/domain-training/domains/what-to-do-next.cases";
import { respondWho } from "@/domain/domain-training/domains/who";
import { WHO_CASES } from "@/domain/domain-training/domains/who.cases";
import { respondHow } from "@/domain/domain-training/domains/how";
import { HOW_CASES } from "@/domain/domain-training/domains/how.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const suites = [
  { name: "D19 what to do next", cases: WHAT_TO_DO_NEXT_CASES, respond: (c: DomainCase) => respondWhatToDoNext(c.input as never) },
  { name: "D20 who", cases: WHO_CASES, respond: (c: DomainCase) => respondWho(c.input as never) },
  { name: "D21 how", cases: HOW_CASES, respond: (c: DomainCase) => respondHow(c.input as never) },
];

describe("[D19-D21] domain training suites — structural assertions", () => {
  it("suites has exactly 3 entries", () => {
    expect(suites).toHaveLength(3);
  });
  it("suites[0].name is 'D19 what to do next'", () => {
    expect(suites[0].name).toBe("D19 what to do next");
  });
  it("suites[1].name is 'D20 who'", () => {
    expect(suites[1].name).toBe("D20 who");
  });
  it("suites[2].name is 'D21 how'", () => {
    expect(suites[2].name).toBe("D21 how");
  });
  it("WHAT_TO_DO_NEXT_CASES has at least 21 entries", () => {
    expect(WHAT_TO_DO_NEXT_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("WHO_CASES has at least 21 entries", () => {
    expect(WHO_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("HOW_CASES has at least 21 entries", () => {
    expect(HOW_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("evaluateDomain is a function", () => {
    expect(typeof evaluateDomain).toBe("function");
  });
  it("scoreCase is a function", () => {
    expect(typeof scoreCase).toBe("function");
  });
  it("REQUIRED_SCENARIO_TYPES is a non-empty array", () => {
    expect(Array.isArray(REQUIRED_SCENARIO_TYPES)).toBe(true);
    expect(REQUIRED_SCENARIO_TYPES.length).toBeGreaterThan(0);
  });
  it("MIN_CASES_PER_DOMAIN is >= 21", () => {
    expect(MIN_CASES_PER_DOMAIN).toBeGreaterThanOrEqual(21);
  });
  it("TrainingLevel.LEVEL_5_OUTCOME_VERIFIED is defined", () => {
    expect(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED).toBeDefined();
  });
  it("all suites have respond as a function", () => {
    for (const s of suites) expect(typeof s.respond).toBe("function");
  });
  it("all suites have cases as a non-empty array", () => {
    for (const s of suites) {
      expect(Array.isArray(s.cases)).toBe(true);
      expect(s.cases.length).toBeGreaterThan(0);
    }
  });
  it("all WHAT_TO_DO_NEXT_CASES have a scenarioType string", () => {
    for (const c of WHAT_TO_DO_NEXT_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all WHO_CASES have a scenarioType string", () => {
    for (const c of WHO_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all HOW_CASES have a scenarioType string", () => {
    for (const c of HOW_CASES) expect(typeof c.scenarioType).toBe("string");
  });
});

for (const s of suites) {
  describe(`[${s.name}] executable scored training`, () => {
    it(">=21 cases, all scenario types", () => {
      expect(s.cases.length).toBeGreaterThanOrEqual(MIN_CASES_PER_DOMAIN);
      const covered = new Set(s.cases.map((c) => c.scenarioType));
      for (const t of REQUIRED_SCENARIO_TYPES) expect(covered.has(t)).toBe(true);
    });
    it("reaches LEVEL_5", () => {
      const ev = evaluateDomain(s.cases, s.respond);
      if (!ev.passedLevel5) throw new Error(`${s.name} avg=${ev.averageScore} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(ev.perCase.filter((p) => p.score < 90 || p.hardFail))}`);
      expect(ev.level).toBe(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED);
      expect(ev.unsafeFailures).toBe(0);
    });
    it("never emits unsafe; an unsafe response hard-fails", () => {
      for (const c of s.cases) expect(s.respond(c).unsafeEmitted).toHaveLength(0);
      const c = s.cases[4];
      expect(scoreCase(c, { ...s.respond(c), unsafeEmitted: ["x"] }).hardFail).toBe(true);
    });
  });
}
