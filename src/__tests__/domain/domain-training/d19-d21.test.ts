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
