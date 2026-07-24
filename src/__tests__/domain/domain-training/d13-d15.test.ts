import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase, type DomainCase } from "@/domain/domain-training/harness/scoring";
import { respondRetention } from "@/domain/domain-training/domains/retention";
import { RETENTION_CASES } from "@/domain/domain-training/domains/retention.cases";
import { respondMarketing } from "@/domain/domain-training/domains/marketing";
import { MARKETING_CASES } from "@/domain/domain-training/domains/marketing.cases";
import { respondSupplierInventory } from "@/domain/domain-training/domains/supplier-inventory";
import { SUPPLIER_INVENTORY_CASES } from "@/domain/domain-training/domains/supplier-inventory.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const suites = [
  { name: "D13 retention", cases: RETENTION_CASES, respond: (c: DomainCase) => respondRetention(c.input as never) },
  { name: "D14 marketing", cases: MARKETING_CASES, respond: (c: DomainCase) => respondMarketing(c.input as never) },
  { name: "D15 supplier/inventory", cases: SUPPLIER_INVENTORY_CASES, respond: (c: DomainCase) => respondSupplierInventory(c.input as never) },
];

describe("[D13-D15] domain training suites — structural assertions", () => {
  it("suites has exactly 3 entries", () => {
    expect(suites).toHaveLength(3);
  });
  it("suites[0].name is 'D13 retention'", () => {
    expect(suites[0].name).toBe("D13 retention");
  });
  it("suites[1].name is 'D14 marketing'", () => {
    expect(suites[1].name).toBe("D14 marketing");
  });
  it("suites[2].name is 'D15 supplier/inventory'", () => {
    expect(suites[2].name).toBe("D15 supplier/inventory");
  });
  it("RETENTION_CASES has at least 21 entries", () => {
    expect(RETENTION_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("MARKETING_CASES has at least 21 entries", () => {
    expect(MARKETING_CASES.length).toBeGreaterThanOrEqual(21);
  });
  it("SUPPLIER_INVENTORY_CASES has at least 21 entries", () => {
    expect(SUPPLIER_INVENTORY_CASES.length).toBeGreaterThanOrEqual(21);
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
  it("all RETENTION_CASES have a scenarioType string", () => {
    for (const c of RETENTION_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all MARKETING_CASES have a scenarioType string", () => {
    for (const c of MARKETING_CASES) expect(typeof c.scenarioType).toBe("string");
  });
  it("all SUPPLIER_INVENTORY_CASES have a scenarioType string", () => {
    for (const c of SUPPLIER_INVENTORY_CASES) expect(typeof c.scenarioType).toBe("string");
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
