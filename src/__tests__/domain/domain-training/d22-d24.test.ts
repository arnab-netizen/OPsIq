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

describe("[D22-D24] domain training suites — structural assertions", () => {
  it("suites has exactly 3 entries", () => {
    expect(suites).toHaveLength(3);
  });
  it("suites[0].name is 'D22 growth readiness'", () => {
    expect(suites[0].name).toBe("D22 growth readiness");
  });
  it("suites[1].name is 'D23 scale readiness'", () => {
    expect(suites[1].name).toBe("D23 scale readiness");
  });
  it("suites[2].name is 'D24 risk/compliance'", () => {
    expect(suites[2].name).toBe("D24 risk/compliance");
  });
  it("GROWTH_READINESS_CASES has at least 21 entries", () => {
    expect(GROWTH_READINESS_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("SCALE_READINESS_CASES has at least 21 entries", () => {
    expect(SCALE_READINESS_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("RISK_COMPLIANCE_CASES has at least 21 entries", () => {
    expect(RISK_COMPLIANCE_CASES.length).toBeGreaterThanOrEqual(21);
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
  it("all GROWTH_READINESS_CASES have a scenarioType string", () => {
    for (const c of GROWTH_READINESS_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all SCALE_READINESS_CASES have a scenarioType string", () => {
    for (const c of SCALE_READINESS_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all RISK_COMPLIANCE_CASES have a scenarioType string", () => {
    for (const c of RISK_COMPLIANCE_CASES) expect(typeof c.scenarioType).toBe("string");
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
