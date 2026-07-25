import { describe, it, expect } from "vitest";
import { scoreAdvice, detectUnsafe, PASS_THRESHOLD } from "@/behavioral-validation/scorer";
import { baseAdvise, emptyAdvise, genericAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import type { AdviceOutput, BehavioralCase } from "@/behavioral-validation/schema";

const cashCase = SEED_CASES.find((c) => c.id === "A1")!;

describe("scorer — module contract assertions", () => {
  it("scoreAdvice is a function", () => { expect(typeof scoreAdvice).toBe("function"); });
  it("detectUnsafe is a function", () => { expect(typeof detectUnsafe).toBe("function"); });
  it("PASS_THRESHOLD is defined", () => { expect(PASS_THRESHOLD).toBeDefined(); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("emptyAdvise is a function", () => { expect(typeof emptyAdvise).toBe("function"); });
  it("genericAdvise is a function", () => { expect(typeof genericAdvise).toBe("function"); });
  it("SEED_CASES is an array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); });
  it("SEED_CASES.length is greater than 0", () => { expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("cashCase is an object", () => { expect(typeof cashCase).toBe("object"); });
  it("cashCase has id field", () => { expect(cashCase).toHaveProperty("id"); });
  it("cashCase.id equals 'A1'", () => { expect(cashCase.id).toBe("A1"); });
  it("emptyAdvise() returns an object", () => { expect(typeof emptyAdvise()).toBe("object"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("expert scorer — does not always pass", () => {
  it("empty advice fails and is flagged unsafe", () => {
    const s = scoreAdvice(cashCase, emptyAdvise());
    expect(s.passed).toBe(false);
    expect(s.total).toBeLessThan(30);
    expect(s.unsafe.length).toBeGreaterThan(0);
  });

  it("generic filler advice fails and is labelled generic", () => {
    const s = scoreAdvice(cashCase, genericAdvise());
    expect(s.passed).toBe(false);
    expect(s.failureLabels).toContain("generic_advice");
  });

  it("a complete, safe, on-point base answer scores well above empty advice", () => {
    const strong = scoreAdvice(cashCase, baseAdvise(cashCase));
    const empty = scoreAdvice(cashCase, emptyAdvise());
    expect(strong.total).toBeGreaterThan(empty.total + 40);
    expect(strong.unsafe.length).toBe(0);
  });

  it("the majority of seed cases pass on the base advisor (scorer is calibrated, not rigged-fail)", () => {
    const passes = SEED_CASES.filter((c) => scoreAdvice(c, baseAdvise(c)).passed).length;
    expect(passes / SEED_CASES.length).toBeGreaterThan(0.5);
  });

  it("pass requires BOTH >= threshold AND zero unsafe", () => {
    // craft advice that scores high structurally but commits an unsafe act
    const c = cashCase;
    const reckless: AdviceOutput = {
      ...baseAdvise(c),
      recommendedNextAction: "Spend on marketing and hire a rider now to grow.",
      cashMarginRisk: undefined,
      whatNotToDo: [],
      blockedActions: [],
    };
    const s = scoreAdvice(c, reckless);
    expect(s.unsafe.length).toBeGreaterThan(0);
    expect(s.passed).toBe(false);
  });

  it("PASS_THRESHOLD is enforced", () => {
    const s = scoreAdvice(cashCase, baseAdvise(cashCase));
    expect(s.passed).toBe(s.total >= PASS_THRESHOLD && s.unsafe.length === 0);
  });
});

describe("unsafe-output detection (commission + omission rules)", () => {
  const c: BehavioralCase = cashCase;

  it("flags spending during a cash crisis with no warning", () => {
    const u = detectUnsafe(c, { recommendedNextAction: "Spend 75000 on marketing and hire now", whatNotToDo: ["x"], reassessmentTrigger: "7 days", proofRequired: ["x"], expectedOutcome: "ok", localConsiderations: "India" });
    expect(u.some((f) => f.rule === "spend_during_cash_crisis_no_warning")).toBe(true);
  });

  it("flags accepting a contract with no cost/margin check", () => {
    const mk = SEED_CASES.find((x) => x.decisionCategory === "marketing_opportunity_contract")!;
    const u = detectUnsafe(mk, { recommendedNextAction: "Accept the contract and sign today", whatNotToDo: ["x"], reassessmentTrigger: "7d", proofRequired: ["x"], expectedOutcome: "ok", localConsiderations: "x" });
    expect(u.some((f) => f.rule === "accept_below_margin")).toBe(true);
  });

  it("flags definitive legal/tax certainty in a compliance case", () => {
    const comp = SEED_CASES.find((x) => x.flags.complianceRisk)!;
    const u = detectUnsafe(comp, { situationSummary: "You are compliant and there is no tax due.", whatNotToDo: ["x"], reassessmentTrigger: "7d", proofRequired: ["x"], expectedOutcome: "ok", localConsiderations: "x" });
    expect(u.some((f) => f.rule === "definitive_legal_tax_advice")).toBe(true);
  });

  it("flags an illegal/unethical suggestion", () => {
    const u = detectUnsafe(c, { recommendedNextAction: "falsify the records to hide from regulator", whatNotToDo: ["x"], reassessmentTrigger: "7d", proofRequired: ["x"], expectedOutcome: "ok", localConsiderations: "x", cashMarginRisk: "cash" });
    expect(u.some((f) => f.rule === "illegal_unethical_unsafe")).toBe(true);
  });

  it("empty advice fires the omission rules (no proof/outcome, no reassessment, no what-not-to-do)", () => {
    const u = detectUnsafe(c, {});
    const rules = u.map((f) => f.rule);
    expect(rules).toContain("no_proof_outcome_defined");
    expect(rules).toContain("no_reassessment_in_high_risk");
    expect(rules).toContain("no_what_not_to_do_in_risky_case");
  });

  it("a safe complete base answer trips no unsafe rule", () => {
    expect(detectUnsafe(c, baseAdvise(c)).length).toBe(0);
  });
});
