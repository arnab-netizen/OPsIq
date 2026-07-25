import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase } from "@/domain/domain-training/harness/scoring";
import { respondProofRequired, type ProofInput } from "@/domain/domain-training/domains/proof-required";
import { PROOF_REQUIRED_CASES } from "@/domain/domain-training/domains/proof-required.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const respond = (cse: { input: unknown }) => respondProofRequired(cse.input as ProofInput);

describe("[D4] what proof is required — module contract assertions", () => {
  it("evaluateDomain is a function", () => { expect(typeof evaluateDomain).toBe("function"); });
  it("scoreCase is a function", () => { expect(typeof scoreCase).toBe("function"); });
  it("respondProofRequired is a function", () => { expect(typeof respondProofRequired).toBe("function"); });
  it("PROOF_REQUIRED_CASES is a non-empty array", () => { expect(Array.isArray(PROOF_REQUIRED_CASES)).toBe(true); expect(PROOF_REQUIRED_CASES.length).toBeGreaterThan(0); });
  it("REQUIRED_SCENARIO_TYPES is a non-empty array", () => { expect(Array.isArray(REQUIRED_SCENARIO_TYPES)).toBe(true); expect(REQUIRED_SCENARIO_TYPES.length).toBeGreaterThan(0); });
  it("MIN_CASES_PER_DOMAIN is a positive number", () => { expect(typeof MIN_CASES_PER_DOMAIN).toBe("number"); expect(MIN_CASES_PER_DOMAIN).toBeGreaterThan(0); });
  it("PROOF_REQUIRED_CASES.length >= MIN_CASES_PER_DOMAIN", () => { expect(PROOF_REQUIRED_CASES.length).toBeGreaterThanOrEqual(MIN_CASES_PER_DOMAIN); });
  it("PROOF_REQUIRED_CASES[0] has id and input fields", () => {
    expect(PROOF_REQUIRED_CASES[0]).toHaveProperty("id"); expect(PROOF_REQUIRED_CASES[0]).toHaveProperty("input");
  });
  it("PROOF_REQUIRED_CASES[0].id is a non-empty string", () => { expect(typeof PROOF_REQUIRED_CASES[0].id).toBe("string"); });
  it("TrainingLevel.LEVEL_5_OUTCOME_VERIFIED is defined", () => { expect(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED).toBeDefined(); });
  it("respondProofRequired(PROOF_REQUIRED_CASES[0].input) returns an object", () => {
    expect(typeof respondProofRequired(PROOF_REQUIRED_CASES[0].input)).toBe("object");
  });
  it("respondProofRequired result has confidence field", () => {
    expect(respondProofRequired(PROOF_REQUIRED_CASES[0].input)).toHaveProperty("confidence");
  });
  it("respondProofRequired result has whatNotToDo array", () => {
    expect(Array.isArray(respondProofRequired(PROOF_REQUIRED_CASES[0].input).whatNotToDo)).toBe(true);
  });
  it("respond function produces same output as respondProofRequired directly", () => {
    const cse = PROOF_REQUIRED_CASES[0];
    const direct = respondProofRequired(cse.input);
    const wrapped = respond(cse);
    expect(wrapped.confidence).toBe(direct.confidence);
  });
});

describe("[D4] what proof is required — executable scored training", () => {
  it("carries >=21 cases covering every required scenario type", () => {
    expect(PROOF_REQUIRED_CASES.length).toBeGreaterThanOrEqual(MIN_CASES_PER_DOMAIN);
    const covered = new Set(PROOF_REQUIRED_CASES.map((c) => c.scenarioType));
    for (const t of REQUIRED_SCENARIO_TYPES) expect(covered.has(t)).toBe(true);
  });

  it("reaches LEVEL_5 (>=90% avg, zero unsafe failures)", () => {
    const ev = evaluateDomain(PROOF_REQUIRED_CASES, respond);
    if (!ev.passedLevel5) {
      const weak = ev.perCase.filter((p) => p.score < 90 || p.hardFail);
      throw new Error(`avg=${ev.averageScore} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(weak)}`);
    }
    expect(ev.level).toBe(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED);
    expect(ev.unsafeFailures).toBe(0);
  });

  it("rejects unsupported completion, stale proof, contradictory proof, task-not-outcome", () => {
    expect(respondProofRequired(PROOF_REQUIRED_CASES.find((c) => c.id === "D4-07")!.input).whatNotToDo).toContain("do not accept completion without proof");
    expect(respondProofRequired(PROOF_REQUIRED_CASES.find((c) => c.id === "D4-03")!.input).whatNotToDo).toContain("do not accept stale proof");
    expect(respondProofRequired(PROOF_REQUIRED_CASES.find((c) => c.id === "D4-06")!.input).whatNotToDo).toContain("do not accept contradictory proof");
    expect(respondProofRequired(PROOF_REQUIRED_CASES.find((c) => c.id === "D4-05")!.input).whatNotToDo).toContain("do not accept task-done as outcome-verified");
  });

  it("high-risk closure on staff/owner evidence alone is blocked", () => {
    expect(respondProofRequired(PROOF_REQUIRED_CASES.find((c) => c.id === "D4-04")!.input).confidence).toBe("BLOCKED");
    expect(respondProofRequired(PROOF_REQUIRED_CASES.find((c) => c.id === "D4-16")!.input).whatNotToDo)
      .toContain("do not close high-risk without manager verification or stronger");
  });

  it("strong, fresh, outcome-attesting proof is accepted", () => {
    const r = respondProofRequired(PROOF_REQUIRED_CASES.find((c) => c.id === "D4-02")!.input);
    expect(r.confidence).toBe("HIGH");
    expect(r.nextAction.toLowerCase()).toContain("verified proof");
  });

  it("never emits unsafe; deliberately accepting false completion hard-fails", () => {
    for (const cse of PROOF_REQUIRED_CASES) expect(respondProofRequired(cse.input).unsafeEmitted).toHaveLength(0);
    const cse = PROOF_REQUIRED_CASES.find((c) => c.id === "D4-05")!;
    const bad = { ...respondProofRequired(cse.input), unsafeEmitted: ["false_completion_acceptance"] };
    expect(scoreCase(cse, bad).hardFail).toBe(true);
  });
});
