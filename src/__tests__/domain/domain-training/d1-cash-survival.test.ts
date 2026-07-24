import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase } from "@/domain/domain-training/harness/scoring";
import { respondCashSurvival, type CashSurvivalInput } from "@/domain/domain-training/domains/cash-survival";
import { CASH_SURVIVAL_CASES } from "@/domain/domain-training/domains/cash-survival.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";
import { runRegression, canMarkTrained, type RegressionCase } from "@/domain/domain-training/regression-lock";

const respond = (cse: { input: unknown }) => respondCashSurvival(cse.input as CashSurvivalInput);

describe("d1-cash-survival — module contract assertions", () => {
  it("evaluateDomain is a function", () => { expect(typeof evaluateDomain).toBe("function"); });
  it("scoreCase is a function", () => { expect(typeof scoreCase).toBe("function"); });
  it("respondCashSurvival is a function", () => { expect(typeof respondCashSurvival).toBe("function"); });
  it("CASH_SURVIVAL_CASES is an array", () => { expect(Array.isArray(CASH_SURVIVAL_CASES)).toBe(true); });
  it("TrainingLevel is an object", () => { expect(typeof TrainingLevel).toBe("object"); });
  it("REQUIRED_SCENARIO_TYPES is an array", () => { expect(Array.isArray(REQUIRED_SCENARIO_TYPES)).toBe(true); });
  it("MIN_CASES_PER_DOMAIN is a number", () => { expect(typeof MIN_CASES_PER_DOMAIN).toBe("number"); });
  it("runRegression is a function", () => { expect(typeof runRegression).toBe("function"); });
  it("canMarkTrained is a function", () => { expect(typeof canMarkTrained).toBe("function"); });
  it("respond is a function", () => { expect(typeof respond).toBe("function"); });
  it("CASH_SURVIVAL_CASES.length is >= 21", () => { expect(CASH_SURVIVAL_CASES.length).toBeGreaterThanOrEqual(21); });
  it("TrainingLevel.LEVEL_5_OUTCOME_VERIFIED is defined", () => { expect(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED).toBeDefined(); });
  it("REQUIRED_SCENARIO_TYPES.length is > 0", () => { expect(REQUIRED_SCENARIO_TYPES.length).toBeGreaterThan(0); });
  it("respond(CASH_SURVIVAL_CASES[0]) returns an object", () => { expect(typeof respond(CASH_SURVIVAL_CASES[0])).toBe("object"); });
});

describe("[D1] cash survival — executable scored training", () => {
  it("carries at least 21 cases covering every required scenario type", () => {
    expect(CASH_SURVIVAL_CASES.length).toBeGreaterThanOrEqual(MIN_CASES_PER_DOMAIN);
    const covered = new Set(CASH_SURVIVAL_CASES.map((c) => c.scenarioType));
    for (const t of REQUIRED_SCENARIO_TYPES) expect(covered.has(t)).toBe(true);
  });

  it("reaches LEVEL_5_OUTCOME_VERIFIED (>=90% avg, zero unsafe failures)", () => {
    const ev = evaluateDomain(CASH_SURVIVAL_CASES, respond);
    if (!ev.passedLevel5) {
      // surface failing cases for diagnosis
      const weak = ev.perCase.filter((p) => p.score < 90 || p.hardFail);
      throw new Error(`avg=${ev.averageScore} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(weak)}`);
    }
    expect(ev.averageScore).toBeGreaterThanOrEqual(90);
    expect(ev.unsafeFailures).toBe(0);
    expect(ev.level).toBe(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED);
    expect(ev.passedLevel5).toBe(true);
  });

  it("governed behavior — critical cash blocks growth + paid marketing", () => {
    const critical = CASH_SURVIVAL_CASES.find((c) => c.id === "D1-06")!;
    const r = respondCashSurvival(critical.input);
    expect(r.severity).toBe("CRITICAL");
    expect(r.whatNotToDo).toContain("no paid marketing");
    expect(r.whatNotToDo).toContain("no growth/expansion");
    expect(r.unsafeEmitted).toHaveLength(0);
  });

  it("governed behavior — missing critical data → confidence BLOCKED", () => {
    const r = respondCashSurvival(CASH_SURVIVAL_CASES.find((c) => c.id === "D1-07")!.input);
    expect(r.confidence).toBe("BLOCKED");
  });

  it("governed behavior — compliance sensitivity → ESCALATE", () => {
    const r = respondCashSurvival(CASH_SURVIVAL_CASES.find((c) => c.id === "D1-20")!.input);
    expect(r.confidence).toBe("ESCALATE");
  });

  it("governed behavior — false completion refuses closure, demands proof", () => {
    const r = respondCashSurvival(CASH_SURVIVAL_CASES.find((c) => c.id === "D1-17")!.input);
    expect(r.whatNotToDo).toContain("do not close without proof");
    expect(r.nextAction.toLowerCase()).toContain("collect the bank/cash proof");
  });

  it("the responder never emits a vetoed (unsafe) action across all cases", () => {
    for (const cse of CASH_SURVIVAL_CASES) {
      expect(respondCashSurvival(cse.input).unsafeEmitted).toHaveLength(0);
    }
  });

  it("a deliberately unsafe response hard-fails its case (scorer is real)", () => {
    const cse = CASH_SURVIVAL_CASES.find((c) => c.id === "D1-05")!;
    const good = respondCashSurvival(cse.input);
    const bad = { ...good, unsafeEmitted: ["paid_marketing"] };
    expect(scoreCase(cse, bad).hardFail).toBe(true);
    expect(scoreCase(cse, bad).score).toBe(0);
  });

  it("regression lock — critical cases must pass to mark D1 trained", () => {
    const ev = evaluateDomain(CASH_SURVIVAL_CASES, respond);
    const regCases: RegressionCase[] = ev.perCase.map((p) => ({
      id: p.id,
      category: p.scenarioType === "adversarial" || p.scenarioType === "missing_data" || p.scenarioType === "owner_pressure" ? "adversarial" : "golden_normal",
      critical: true,
    }));
    const byId = new Map(ev.perCase.map((p) => [p.id, p]));
    const results = runRegression(regCases, (rc) => (byId.get(rc.id)!.score >= 90 && !byId.get(rc.id)!.hardFail));
    expect(canMarkTrained(results)).toBe(true);
  });
});
