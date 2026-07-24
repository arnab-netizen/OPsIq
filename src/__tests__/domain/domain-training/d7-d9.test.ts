import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase, type DomainCase } from "@/domain/domain-training/harness/scoring";
import { respondCapacity } from "@/domain/domain-training/domains/capacity";
import { CAPACITY_CASES } from "@/domain/domain-training/domains/capacity.cases";
import { respondStaffWorkload } from "@/domain/domain-training/domains/staff-workload";
import { STAFF_WORKLOAD_CASES } from "@/domain/domain-training/domains/staff-workload.cases";
import { respondOwnerWorkload } from "@/domain/domain-training/domains/owner-workload";
import { OWNER_WORKLOAD_CASES } from "@/domain/domain-training/domains/owner-workload.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const suites = [
  { name: "D7 capacity", cases: CAPACITY_CASES, respond: (c: DomainCase) => respondCapacity(c.input as never) },
  { name: "D8 staff workload", cases: STAFF_WORKLOAD_CASES, respond: (c: DomainCase) => respondStaffWorkload(c.input as never) },
  { name: "D9 owner workload", cases: OWNER_WORKLOAD_CASES, respond: (c: DomainCase) => respondOwnerWorkload(c.input as never) },
];

describe("[D7-D9] domain training suites — structural assertions", () => {
  it("suites has exactly 3 entries", () => {
    expect(suites).toHaveLength(3);
  });
  it("suites[0].name is 'D7 capacity'", () => {
    expect(suites[0].name).toBe("D7 capacity");
  });
  it("suites[1].name is 'D8 staff workload'", () => {
    expect(suites[1].name).toBe("D8 staff workload");
  });
  it("suites[2].name is 'D9 owner workload'", () => {
    expect(suites[2].name).toBe("D9 owner workload");
  });
  it("CAPACITY_CASES has at least 21 entries", () => {
    expect(CAPACITY_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("STAFF_WORKLOAD_CASES has at least 21 entries", () => {
    expect(STAFF_WORKLOAD_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("OWNER_WORKLOAD_CASES has at least 21 entries", () => {
    expect(OWNER_WORKLOAD_CASES.length).toBeGreaterThanOrEqual(21);
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
  it("all CAPACITY_CASES have a scenarioType string", () => {
    for (const c of CAPACITY_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all STAFF_WORKLOAD_CASES have a scenarioType string", () => {
    for (const c of STAFF_WORKLOAD_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all OWNER_WORKLOAD_CASES have a scenarioType string", () => {
    for (const c of OWNER_WORKLOAD_CASES) expect(typeof c.scenarioType).toBe("string");
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
