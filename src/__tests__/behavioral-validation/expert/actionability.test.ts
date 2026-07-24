import { describe, it, expect } from "vitest";
import { scoreActionability, buildActionabilityReport, ACTIONABILITY_THRESHOLD } from "@/behavioral-validation/expert/actionability";
import { baseAdvise, genericAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import type { AdviceOutput } from "@/behavioral-validation/schema";

const c = SEED_CASES.find((x) => x.id === "A1")!;

describe("actionability score — module contract assertions", () => {
  it("scoreActionability is a function", () => { expect(typeof scoreActionability).toBe("function"); });
  it("buildActionabilityReport is a function", () => { expect(typeof buildActionabilityReport).toBe("function"); });
  it("ACTIONABILITY_THRESHOLD is a positive number", () => { expect(typeof ACTIONABILITY_THRESHOLD).toBe("number"); expect(ACTIONABILITY_THRESHOLD).toBeGreaterThan(0); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("genericAdvise is a function", () => { expect(typeof genericAdvise).toBe("function"); });
  it("SEED_CASES is a non-empty array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("c (SEED_CASES A1) is defined and non-null", () => { expect(c).toBeDefined(); expect(c).not.toBeNull(); });
  it("c has id field equal to 'A1'", () => { expect(c.id).toBe("A1"); });
  it("scoreActionability({}) returns an object", () => { expect(typeof scoreActionability({})).toBe("object"); });
  it("scoreActionability({}) has passed and score fields", () => {
    const r = scoreActionability({});
    expect(r).toHaveProperty("passed"); expect(r).toHaveProperty("score");
  });
  it("scoreActionability({}).passed is a boolean", () => { expect(typeof scoreActionability({}).passed).toBe("boolean"); });
  it("scoreActionability({}).score is a number", () => { expect(typeof scoreActionability({}).score).toBe("number"); });
  it("scoreActionability({}).passed is false for empty input", () => { expect(scoreActionability({}).passed).toBe(false); });
  it("buildActionabilityReport([]) returns an object with a count field", () => {
    const r = buildActionabilityReport([]);
    expect(typeof r).toBe("object"); expect(r).toHaveProperty("count");
  });
});

describe("actionability score", () => {
  it("generic strategic advice fails actionability", () => {
    expect(scoreActionability(genericAdvise()).passed).toBe(false);
  });

  it("diagnosis-only output fails actionability", () => {
    const diagnosisOnly: AdviceOutput = { situationSummary: "Cash is trapped in receivables.", rootCause: "Margin leakage and trapped working capital.", mostUrgentIssue: "Protect cash." };
    const r = scoreActionability(diagnosisOnly);
    expect(r.passed).toBe(false);
    expect(r.missing).toContain("proof");
    expect(r.missing).toContain("deadline");
  });

  it("an output with owner+staff+proof+deadline+metric+stop passes actionability", () => {
    const strong: AdviceOutput = {
      recommendedNextAction: "Owner approves the plan today; assign a named supervisor to recover receivables within 7 days.",
      proofRequired: ["Daily cash balance", "Receivables ageing"],
      reassessmentTrigger: "Reassess in 7 days: cash balance and contribution margin.",
      whatNotToDo: ["Do not spend on marketing while cash is tight"],
      blockedActions: ["Blocked: marketing spend"],
      saferAlternative: "Run a capped pilot first.",
      expectedOutcome: "Cash balance and margin improve.",
      ownerWorkloadReduction: "Delegate routine checks to a named supervisor.",
    };
    const r = scoreActionability(strong);
    expect(r.passed).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(ACTIONABILITY_THRESHOLD);
  });

  it("actionability varies with content (it materially affects the score)", () => {
    const empty = scoreActionability({}).score;
    const full = scoreActionability(baseAdvise(c)).score;
    expect(full).toBeGreaterThan(empty + 30);
  });

  it("the base advisor produces actionable output (responsibility + deadline + stop present)", () => {
    const r = scoreActionability(baseAdvise(c));
    expect(r.components.staffAction).toBe(true);
    expect(r.components.deadline).toBe(true);
    expect(r.components.responsibilityAssignment).toBe(true);
  });

  it("an actionability report aggregates scores and weakest components", () => {
    const report = buildActionabilityReport(SEED_CASES.map((x) => scoreActionability(baseAdvise(x))));
    expect(report.count).toBe(SEED_CASES.length);
    expect(report.avgScore).toBeGreaterThan(0);
    expect(report.weakestComponents.length).toBeGreaterThan(0);
  });
});
