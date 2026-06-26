import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase, type DomainCase } from "@/domain/domain-training/harness/scoring";
import { respondGrowthReadiness } from "@/domain/domain-training/domains/growth-readiness";
import { GROWTH_READINESS_CASES } from "@/domain/domain-training/domains/growth-readiness.cases";
import { respondScaleReadiness } from "@/domain/domain-training/domains/scale-readiness";
import { SCALE_READINESS_CASES } from "@/domain/domain-training/domains/scale-readiness.cases";
import { respondRiskCompliance } from "@/domain/domain-training/domains/risk-compliance";
import { RISK_COMPLIANCE_CASES } from "@/domain/domain-training/domains/risk-compliance.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const suites = [
  { name: "D22 growth readiness", cases: GROWTH_READINESS_CASES, respond: (c: DomainCase) => respondGrowthReadiness(c.input as never) },
  { name: "D23 scale readiness", cases: SCALE_READINESS_CASES, respond: (c: DomainCase) => respondScaleReadiness(c.input as never) },
  { name: "D24 risk/compliance", cases: RISK_COMPLIANCE_CASES, respond: (c: DomainCase) => respondRiskCompliance(c.input as never) },
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
