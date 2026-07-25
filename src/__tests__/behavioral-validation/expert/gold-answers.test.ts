import { describe, it, expect } from "vitest";
import {
  buildGoldAnswer,
  canEnterExpertValidation,
  compareToGold,
  goldAnswerSchema,
  hasMinimumGold,
} from "@/behavioral-validation/expert/gold-answers";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import { EXPANDED_CASES } from "@/behavioral-validation/expansion";
import { baseAdvise, genericAdvise } from "@/behavioral-validation/advisor";

const cashCase = SEED_CASES.find((c) => c.id === "A1")!;

describe("gold-standard expert answers — module contract assertions", () => {
  it("buildGoldAnswer is a function", () => { expect(typeof buildGoldAnswer).toBe("function"); });
  it("canEnterExpertValidation is a function", () => { expect(typeof canEnterExpertValidation).toBe("function"); });
  it("compareToGold is a function", () => { expect(typeof compareToGold).toBe("function"); });
  it("goldAnswerSchema has a parse method", () => { expect(typeof goldAnswerSchema.parse).toBe("function"); });
  it("hasMinimumGold is a function", () => { expect(typeof hasMinimumGold).toBe("function"); });
  it("SEED_CASES is a non-empty array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("EXPANDED_CASES is a non-empty array", () => { expect(Array.isArray(EXPANDED_CASES)).toBe(true); expect(EXPANDED_CASES.length).toBeGreaterThan(0); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("genericAdvise is a function", () => { expect(typeof genericAdvise).toBe("function"); });
  it("cashCase is defined and not null", () => { expect(cashCase).toBeDefined(); expect(cashCase).not.toBeNull(); });
  it("cashCase.id === 'A1'", () => { expect(cashCase.id).toBe("A1"); });
  it("buildGoldAnswer(cashCase) returns an object", () => { expect(typeof buildGoldAnswer(cashCase)).toBe("object"); });
  it("buildGoldAnswer(cashCase) has qualityLevel field", () => { expect(buildGoldAnswer(cashCase)).toHaveProperty("qualityLevel"); });
  it("buildGoldAnswer(cashCase).qualityLevel === 'REQUIRED'", () => { expect(buildGoldAnswer(cashCase).qualityLevel).toBe("REQUIRED"); });
  it("hasMinimumGold(buildGoldAnswer(cashCase)) is true", () => { expect(hasMinimumGold(buildGoldAnswer(cashCase))).toBe(true); });
});

describe("gold-standard expert answers", () => {
  it("every seed case has a REQUIRED, schema-valid gold answer", () => {
    for (const c of SEED_CASES) {
      const g = buildGoldAnswer(c);
      expect(() => goldAnswerSchema.parse(g)).not.toThrow();
      expect(g.qualityLevel).toBe("REQUIRED");
      expect(hasMinimumGold(g)).toBe(true);
    }
  });

  it("generated variants carry at least the minimum gold fields and may enter validation", () => {
    const variants = EXPANDED_CASES.filter((c) => c.id !== c.sourceSeedCaseId);
    expect(variants.length).toBeGreaterThan(0);
    for (const c of variants.slice(0, 50)) {
      const g = buildGoldAnswer(c);
      expect(g.qualityLevel).toBe("PARTIAL");
      expect(hasMinimumGold(g)).toBe(true);
      expect(canEnterExpertValidation(c)).toBe(true);
    }
  });

  it("a case stripped of root cause / proof cannot enter expert validation", () => {
    const broken = { ...cashCase, hiddenRootCause: "x", proofRequired: [] as string[] };
    // hiddenRootCause too short → minimum gold fails
    expect(hasMinimumGold(buildGoldAnswer({ ...cashCase, hiddenRootCause: "x" }))).toBe(false);
    expect(canEnterExpertValidation(broken as never)).toBe(false);
  });

  it("scorer compares against gold SEMANTICS — a strong base answer matches gold", () => {
    const cmp = compareToGold(baseAdvise(cashCase), buildGoldAnswer(cashCase));
    expect(cmp.matchesGold).toBe(true);
    expect(cmp.wrongRootCause).toBe(false);
  });

  it("a generic answer FAILS gold even though it uses common business words", () => {
    const cmp = compareToGold(genericAdvise(), buildGoldAnswer(cashCase));
    expect(cmp.generic).toBe(true);
    expect(cmp.matchesGold).toBe(false);
  });

  it("a WRONG root cause fails gold even when the action sounds reasonable", () => {
    const wrong = {
      ...baseAdvise(cashCase),
      rootCause: "The shop simply needs more customers walking in; demand is the only problem.",
      situationSummary: "Demand is low, nothing else is wrong.",
      mostUrgentIssue: "Get more footfall.",
    };
    const cmp = compareToGold(wrong, buildGoldAnswer(cashCase));
    expect(cmp.wrongRootCause).toBe(true);
    expect(cmp.matchesGold).toBe(false);
  });
});
