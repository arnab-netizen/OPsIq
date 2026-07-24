import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase, type DomainCase } from "@/domain/domain-training/harness/scoring";
import { respondQuality } from "@/domain/domain-training/domains/quality";
import { QUALITY_CASES } from "@/domain/domain-training/domains/quality.cases";
import { respondSopProcess } from "@/domain/domain-training/domains/sop-process";
import { SOP_PROCESS_CASES } from "@/domain/domain-training/domains/sop-process.cases";
import { respondCustomerComplaints } from "@/domain/domain-training/domains/customer-complaints";
import { CUSTOMER_COMPLAINTS_CASES } from "@/domain/domain-training/domains/customer-complaints.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const suites = [
  { name: "D10 quality", cases: QUALITY_CASES, respond: (c: DomainCase) => respondQuality(c.input as never) },
  { name: "D11 SOP/process", cases: SOP_PROCESS_CASES, respond: (c: DomainCase) => respondSopProcess(c.input as never) },
  { name: "D12 customer complaints", cases: CUSTOMER_COMPLAINTS_CASES, respond: (c: DomainCase) => respondCustomerComplaints(c.input as never) },
];

describe("[D10-D12] domain training suites — structural assertions", () => {
  it("suites has exactly 3 entries", () => {
    expect(suites).toHaveLength(3);
  });
  it("suites[0].name is 'D10 quality'", () => {
    expect(suites[0].name).toBe("D10 quality");
  });
  it("suites[1].name is 'D11 SOP/process'", () => {
    expect(suites[1].name).toBe("D11 SOP/process");
  });
  it("suites[2].name is 'D12 customer complaints'", () => {
    expect(suites[2].name).toBe("D12 customer complaints");
  });
  it("QUALITY_CASES has at least 21 entries", () => {
    expect(QUALITY_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("SOP_PROCESS_CASES has at least 21 entries", () => {
    expect(SOP_PROCESS_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("CUSTOMER_COMPLAINTS_CASES has at least 21 entries", () => {
    expect(CUSTOMER_COMPLAINTS_CASES.length).toBeGreaterThanOrEqual(21);
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
  it("all QUALITY_CASES have a scenarioType string", () => {
    for (const c of QUALITY_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all SOP_PROCESS_CASES have a scenarioType string", () => {
    for (const c of SOP_PROCESS_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all CUSTOMER_COMPLAINTS_CASES have a scenarioType string", () => {
    for (const c of CUSTOMER_COMPLAINTS_CASES) expect(typeof c.scenarioType).toBe("string");
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
