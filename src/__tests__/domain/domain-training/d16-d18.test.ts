import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase, type DomainCase } from "@/domain/domain-training/harness/scoring";
import { respondDailyPriorities } from "@/domain/domain-training/domains/daily-priorities";
import { DAILY_PRIORITIES_CASES } from "@/domain/domain-training/domains/daily-priorities.cases";
import { respondReviewCadence } from "@/domain/domain-training/domains/review-cadence";
import { REVIEW_CADENCE_CASES } from "@/domain/domain-training/domains/review-cadence.cases";
import { respondWhatNotToDo } from "@/domain/domain-training/domains/what-not-to-do";
import { WHAT_NOT_TO_DO_CASES } from "@/domain/domain-training/domains/what-not-to-do.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const suites = [
  { name: "D16 daily priorities", cases: DAILY_PRIORITIES_CASES, respond: (c: DomainCase) => respondDailyPriorities(c.input as never) },
  { name: "D17 review cadence", cases: REVIEW_CADENCE_CASES, respond: (c: DomainCase) => respondReviewCadence(c.input as never) },
  { name: "D18 what not to do", cases: WHAT_NOT_TO_DO_CASES, respond: (c: DomainCase) => respondWhatNotToDo(c.input as never) },
];

describe("[D16-D18] domain training suites — structural assertions", () => {
  it("suites has exactly 3 entries", () => {
    expect(suites).toHaveLength(3);
  });
  it("suites[0].name is 'D16 daily priorities'", () => {
    expect(suites[0].name).toBe("D16 daily priorities");
  });
  it("suites[1].name is 'D17 review cadence'", () => {
    expect(suites[1].name).toBe("D17 review cadence");
  });
  it("suites[2].name is 'D18 what not to do'", () => {
    expect(suites[2].name).toBe("D18 what not to do");
  });
  it("DAILY_PRIORITIES_CASES has at least 21 entries", () => {
    expect(DAILY_PRIORITIES_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("REVIEW_CADENCE_CASES has at least 21 entries", () => {
    expect(REVIEW_CADENCE_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("WHAT_NOT_TO_DO_CASES has at least 21 entries", () => {
    expect(WHAT_NOT_TO_DO_CASES.length).toBeGreaterThanOrEqual(21);
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
  it("all DAILY_PRIORITIES_CASES have a scenarioType string", () => {
    for (const c of DAILY_PRIORITIES_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all REVIEW_CADENCE_CASES have a scenarioType string", () => {
    for (const c of REVIEW_CADENCE_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all WHAT_NOT_TO_DO_CASES have a scenarioType string", () => {
    for (const c of WHAT_NOT_TO_DO_CASES) expect(typeof c.scenarioType).toBe("string");
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
