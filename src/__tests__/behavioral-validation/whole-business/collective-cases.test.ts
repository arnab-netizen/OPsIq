import { describe, it, expect } from "vitest";
import { COLLECTIVE_CASES } from "@/behavioral-validation/whole-business/collective-cases";
import { arbitrate } from "@/behavioral-validation/whole-business/arbitration";
import { buildWholeBusinessPlan } from "@/behavioral-validation/whole-business/whole-plan";
import { scoreCollectivePlan } from "@/behavioral-validation/whole-business/collective-scorer";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { behavioralCaseSchema } from "@/behavioral-validation/schema";

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
