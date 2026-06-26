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
