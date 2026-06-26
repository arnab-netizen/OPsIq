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
