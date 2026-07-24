import { describe, it, expect } from "vitest";
import { COLLECTIVE_CASES } from "@/behavioral-validation/whole-business/collective-cases";
import { arbitrate } from "@/behavioral-validation/whole-business/arbitration";
import { buildWholeBusinessPlan } from "@/behavioral-validation/whole-business/whole-plan";
import { scoreCollectivePlan } from "@/behavioral-validation/whole-business/collective-scorer";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { behavioralCaseSchema } from "@/behavioral-validation/schema";

describe("collective (cross-domain) case library — module contract assertions", () => {
  it("COLLECTIVE_CASES is an array", () => { expect(Array.isArray(COLLECTIVE_CASES)).toBe(true); });
  it("COLLECTIVE_CASES has at least 100 entries", () => { expect(COLLECTIVE_CASES.length).toBeGreaterThanOrEqual(100); });
  it("arbitrate is a function", () => { expect(typeof arbitrate).toBe("function"); });
  it("buildWholeBusinessPlan is a function", () => { expect(typeof buildWholeBusinessPlan).toBe("function"); });
  it("scoreCollectivePlan is a function", () => { expect(typeof scoreCollectivePlan).toBe("function"); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("behavioralCaseSchema has a parse method", () => { expect(typeof behavioralCaseSchema.parse).toBe("function"); });
  it("COLLECTIVE_CASES ids are all unique", () => {
    const ids = COLLECTIVE_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(COLLECTIVE_CASES.length);
  });
  it("COLLECTIVE_CASES[0] has base, cashProfitImpact, and activeDomains fields", () => {
    expect(COLLECTIVE_CASES[0]).toHaveProperty("base");
    expect(COLLECTIVE_CASES[0]).toHaveProperty("cashProfitImpact");
    expect(COLLECTIVE_CASES[0]).toHaveProperty("activeDomains");
  });
  it("COLLECTIVE_CASES[0].activeDomains is an array", () => { expect(Array.isArray(COLLECTIVE_CASES[0].activeDomains)).toBe(true); });
  it("COLLECTIVE_CASES[0].conflictingRecommendations is an array", () => { expect(Array.isArray(COLLECTIVE_CASES[0].conflictingRecommendations)).toBe(true); });
  it("COLLECTIVE_CASES has no null entries", () => { for (const c of COLLECTIVE_CASES) expect(c).not.toBeNull(); });
  it("COLLECTIVE_CASES[0].id is a non-empty string", () => { expect(typeof COLLECTIVE_CASES[0].id).toBe("string"); expect(COLLECTIVE_CASES[0].id.length).toBeGreaterThan(0); });
  it("COLLECTIVE_CASES[0].correctTopPriority is a non-empty string", () => {
    expect(typeof COLLECTIVE_CASES[0].correctTopPriority).toBe("string");
    expect(COLLECTIVE_CASES[0].correctTopPriority.length).toBeGreaterThan(0);
  });
});

describe("collective (cross-domain) case library", () => {
  it("provides at least 100 collective cases with unique ids", () => {
    expect(COLLECTIVE_CASES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(COLLECTIVE_CASES.map((c) => c.id)).size).toBe(COLLECTIVE_CASES.length);
  });

  it("every collective case has a schema-valid base and the required collective fields", () => {
    for (const cc of COLLECTIVE_CASES) {
      expect(() => behavioralCaseSchema.parse(cc.base)).not.toThrow();
      expect(cc.cashProfitImpact.length).toBeGreaterThan(0);
      expect(cc.operationalConstraint.length).toBeGreaterThan(0);
      expect(cc.ownerWorkloadImplication.length).toBeGreaterThan(0);
      expect(cc.proofRequirement.length).toBeGreaterThan(0);
      expect(cc.reassessmentTrigger.length).toBeGreaterThan(0);
      expect(cc.expectedWholeBusinessAnswer.length).toBeGreaterThan(0);
    }
  });

  it("every collective case has at least 4 active domains", () => {
    for (const cc of COLLECTIVE_CASES) expect(cc.activeDomains.length).toBeGreaterThanOrEqual(4);
  });

  it("every collective case has at least 2 conflicting recommendations and a tempting wrong priority", () => {
    for (const cc of COLLECTIVE_CASES) {
      expect(cc.conflictingRecommendations.length).toBeGreaterThanOrEqual(2);
      expect(cc.temptingWrongPriority.length).toBeGreaterThan(0);
    }
  });

  it("the arbitration engine independently derives each case's declared correct top priority", () => {
    for (const cc of COLLECTIVE_CASES) {
      expect(arbitrate(cc.base, cc.conflictingRecommendations).dominantConstraint).toBe(cc.correctTopPriority);
    }
  });

  it("collective cases run through the whole-business plan and land on the correct top priority", () => {
    const sample = COLLECTIVE_CASES.filter((_, i) => i % 17 === 0);
    for (const cc of sample) {
      const plan = buildWholeBusinessPlan(cc.base, baseAdvise(cc.base));
      const score = scoreCollectivePlan(plan, cc.correctTopPriority);
      expect(plan.highestPriorityConstraint).toBe(cc.correctTopPriority);
      expect(score.categories.correct_top_priority).toBe(15);
    }
  });
});
