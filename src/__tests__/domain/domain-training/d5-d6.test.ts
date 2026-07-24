import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase } from "@/domain/domain-training/harness/scoring";
import { respondVerifyOutcome, type VerifyOutcomeInput } from "@/domain/domain-training/domains/verify-outcome";
import { VERIFY_OUTCOME_CASES } from "@/domain/domain-training/domains/verify-outcome.cases";
import { respondStopRollbackRedesign, type StopInput } from "@/domain/domain-training/domains/stop-rollback-redesign";
import { STOP_ROLLBACK_REDESIGN_CASES } from "@/domain/domain-training/domains/stop-rollback-redesign.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

describe("d5-d6 — module contract assertions", () => {
  it("evaluateDomain is a function", () => { expect(typeof evaluateDomain).toBe("function"); });
  it("scoreCase is a function", () => { expect(typeof scoreCase).toBe("function"); });
  it("respondVerifyOutcome is a function", () => { expect(typeof respondVerifyOutcome).toBe("function"); });
  it("VERIFY_OUTCOME_CASES is an array", () => { expect(Array.isArray(VERIFY_OUTCOME_CASES)).toBe(true); });
  it("respondStopRollbackRedesign is a function", () => { expect(typeof respondStopRollbackRedesign).toBe("function"); });
  it("STOP_ROLLBACK_REDESIGN_CASES is an array", () => { expect(Array.isArray(STOP_ROLLBACK_REDESIGN_CASES)).toBe(true); });
  it("TrainingLevel is an object", () => { expect(typeof TrainingLevel).toBe("object"); });
  it("REQUIRED_SCENARIO_TYPES is an array", () => { expect(Array.isArray(REQUIRED_SCENARIO_TYPES)).toBe(true); });
  it("MIN_CASES_PER_DOMAIN is a number", () => { expect(typeof MIN_CASES_PER_DOMAIN).toBe("number"); });
  it("VERIFY_OUTCOME_CASES.length is >= 21", () => { expect(VERIFY_OUTCOME_CASES.length).toBeGreaterThanOrEqual(21); });
  it("STOP_ROLLBACK_REDESIGN_CASES.length is >= 21", () => { expect(STOP_ROLLBACK_REDESIGN_CASES.length).toBeGreaterThanOrEqual(21); });
  it("TrainingLevel.LEVEL_5_OUTCOME_VERIFIED is defined", () => { expect(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED).toBeDefined(); });
  it("VERIFY_OUTCOME_CASES[0] has id field", () => { expect(VERIFY_OUTCOME_CASES[0]).toHaveProperty("id"); });
  it("STOP_ROLLBACK_REDESIGN_CASES[0] has id field", () => { expect(STOP_ROLLBACK_REDESIGN_CASES[0]).toHaveProperty("id"); });
});

describe("[D5] verify outcome — executable scored training", () => {
  const respond = (cse: { input: unknown }) => respondVerifyOutcome(cse.input as VerifyOutcomeInput);
  it("covers all scenario types with >=21 cases", () => {
    expect(VERIFY_OUTCOME_CASES.length).toBeGreaterThanOrEqual(MIN_CASES_PER_DOMAIN);
    const covered = new Set(VERIFY_OUTCOME_CASES.map((c) => c.scenarioType));
    for (const t of REQUIRED_SCENARIO_TYPES) expect(covered.has(t)).toBe(true);
  });
  it("reaches LEVEL_5", () => {
    const ev = evaluateDomain(VERIFY_OUTCOME_CASES, respond);
    if (!ev.passedLevel5) throw new Error(`avg=${ev.averageScore} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(ev.perCase.filter((p) => p.score < 90 || p.hardFail))}`);
    expect(ev.level).toBe(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED);
  });
  it("primary improved + severe side effect is HARMED, not success", () => {
    const r = respondVerifyOutcome(VERIFY_OUTCOME_CASES.find((c) => c.id === "D5-04")!.input);
    expect(r.whatNotToDo).toContain("do not classify as success despite primary improvement");
  });
  it("disputed/inconclusive block learning (confidence BLOCKED)", () => {
    expect(respondVerifyOutcome(VERIFY_OUTCOME_CASES.find((c) => c.id === "D5-06")!.input).confidence).toBe("BLOCKED");
    expect(respondVerifyOutcome(VERIFY_OUTCOME_CASES.find((c) => c.id === "D5-07")!.input).confidence).toBe("BLOCKED");
  });
});

describe("[D6] stop/rollback/redesign — executable scored training", () => {
  const respond = (cse: { input: unknown }) => respondStopRollbackRedesign(cse.input as StopInput);
  it("covers all scenario types with >=21 cases", () => {
    expect(STOP_ROLLBACK_REDESIGN_CASES.length).toBeGreaterThanOrEqual(MIN_CASES_PER_DOMAIN);
    const covered = new Set(STOP_ROLLBACK_REDESIGN_CASES.map((c) => c.scenarioType));
    for (const t of REQUIRED_SCENARIO_TYPES) expect(covered.has(t)).toBe(true);
  });
  it("reaches LEVEL_5", () => {
    const ev = evaluateDomain(STOP_ROLLBACK_REDESIGN_CASES, respond);
    if (!ev.passedLevel5) throw new Error(`avg=${ev.averageScore} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(ev.perCase.filter((p) => p.score < 90 || p.hardFail))}`);
    expect(ev.level).toBe(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED);
  });
  it("harm/irreversible → STOP; worsening → ROLLBACK; repeated failure → REDESIGN", () => {
    expect(respondStopRollbackRedesign(STOP_ROLLBACK_REDESIGN_CASES.find((c) => c.id === "D6-05")!.input).nextAction).toContain("Stop the action");
    expect(respondStopRollbackRedesign(STOP_ROLLBACK_REDESIGN_CASES.find((c) => c.id === "D6-03")!.input).nextAction).toContain("Roll back");
    expect(respondStopRollbackRedesign(STOP_ROLLBACK_REDESIGN_CASES.find((c) => c.id === "D6-04")!.input).nextAction).toContain("Redesign");
  });
  it("compliance/safety → ESCALATE + expert review", () => {
    const r = respondStopRollbackRedesign(STOP_ROLLBACK_REDESIGN_CASES.find((c) => c.id === "D6-13")!.input);
    expect(r.confidence).toBe("ESCALATE");
    expect(r.whatNotToDo).toContain("do not proceed without expert review");
  });
  it("scorer is real — an unsafe response hard-fails", () => {
    const cse = STOP_ROLLBACK_REDESIGN_CASES.find((c) => c.id === "D6-05")!;
    const bad = { ...respondStopRollbackRedesign(cse.input), unsafeEmitted: ["false_completion_acceptance"] };
    expect(scoreCase(cse, bad).hardFail).toBe(true);
  });
});
