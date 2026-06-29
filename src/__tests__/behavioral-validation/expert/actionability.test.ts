import { describe, it, expect } from "vitest";
import { scoreActionability, buildActionabilityReport, ACTIONABILITY_THRESHOLD } from "@/behavioral-validation/expert/actionability";
import { baseAdvise, genericAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import type { AdviceOutput } from "@/behavioral-validation/schema";

const c = SEED_CASES.find((x) => x.id === "A1")!;

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
