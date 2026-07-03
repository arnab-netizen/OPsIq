/**
 * P3-A runtime-readiness proof — the decision-path learning read-back is now LIVE (blocker B6).
 *
 * Before this slice, decision/operator "learning" was write-only (and in fact written to a Prisma model that does
 * not exist, so the writes threw and were swallowed) — no recommendation ever changed because of prior outcomes.
 * `generateRecommendation` now reads the workspace's real decision history (the already-loaded, workspace-scoped
 * `items`) and lowers confidence + annotates when prior REALIZED failures exist for the same problem type. These
 * tests prove: a clean history is unchanged; repeated realized failures demonstrably reduce confidence and are
 * disclosed; and the signal is scoped to the matching problem type. Pure — no DB, no new store.
 */
import { describe, it, expect } from "vitest";
import { generateRecommendation, generateMultipleRecommendations } from "@/services/intelligence/recommendation";
import type { DecisionResult } from "@/domain/decision/types";
import type { DetectedPattern } from "@/services/intelligence/pattern-engine";
import type { OperatorItem } from "@/domain/operator/types";

const decision: DecisionResult = {
  decision: "APPROVED",
  expectedImpact: 100000,
  confidence: 0.8,
  explanation: { summary: "t", drivers: [], assumptions: [], risks: [], missingData: [], calculationTrace: { baselineRevenue: 0, baselineCost: 0, revenueChange: 0, costChange: 0, netImpact: 0, formula: "" } },
  problemType: "revenue_leak",
} as DecisionResult;

// Three qualifying patterns (successRate > 60, ≥3 for data sufficiency); best is 80% → base confidence 0.8.
const patterns: DetectedPattern[] = [
  { patternId: "p-1", problemType: "revenue_leak", successRate: 80, itemIds: ["hit-1", "hit-2"], description: "d" },
  { patternId: "p-2", problemType: "revenue_leak", successRate: 75, itemIds: ["hit-1"], description: "d" },
  { patternId: "p-3", problemType: "revenue_leak", successRate: 70, itemIds: ["hit-2"], description: "d" },
];
const patternHits: OperatorItem[] = [
  { id: "hit-1", action: "fix_channel", workspaceId: "w1", createdBy: "u1" } as OperatorItem,
  { id: "hit-2", action: "fix_channel", workspaceId: "w1", createdBy: "u1" } as OperatorItem,
];
const failed = (id: string, over: Partial<OperatorItem> = {}): OperatorItem =>
  ({ id, action: "fix_channel", workspaceId: "w1", createdBy: "u1", problemType: "revenue_leak", status: "failed", ...over } as OperatorItem);

describe("P3-A B6 — recommendation learns from prior realized failures", () => {
  it("clean history: confidence is unchanged and no learning is applied", () => {
    const r = generateRecommendation(decision, patterns, patternHits);
    expect(r.dataSufficiency).toBe("sufficient");
    expect(r.confidenceScore).toBeCloseTo(0.8, 5);
    expect(r.learningApplied).toBeUndefined();
    expect(r.explanation).not.toMatch(/prior learning/i);
  });

  it("repeated realized failures for the problem type demonstrably lower confidence and are disclosed", () => {
    const items = [...patternHits, failed("f-1"), failed("f-2"), failed("f-3")];
    const r = generateRecommendation(decision, patterns, items);
    expect(r.dataSufficiency).toBe("sufficient"); // still a recommendation…
    expect(r.learningApplied).toBe(true);
    expect(r.priorFailureCount).toBe(3);
    // 3 failures → 45% penalty → 0.8 * 0.55 = 0.44 (< the clean 0.8).
    expect(r.confidenceScore).toBeCloseTo(0.44, 5);
    expect(r.confidenceScore).toBeLessThan(0.8);
    expect(r.explanation).toMatch(/3 realized failure\(s\)/i);
  });

  it("a completed decision with a negative outcome delta counts as a realized failure", () => {
    const items = [...patternHits, failed("d-1", { status: "done", outcomeDelta: -5000 })];
    const r = generateRecommendation(decision, patterns, items);
    expect(r.priorFailureCount).toBe(1);
    expect(r.confidenceScore).toBeCloseTo(0.8 * 0.85, 5); // one failure → 15% penalty
  });

  it("the failure penalty is capped so confidence never collapses to zero", () => {
    const many = Array.from({ length: 20 }, (_, i) => failed(`m-${i}`));
    const r = generateRecommendation(decision, patterns, [...patternHits, ...many]);
    expect(r.confidenceScore).toBeCloseTo(0.8 * 0.4, 5); // capped at 60% penalty
    expect(r.confidenceScore).toBeGreaterThan(0);
  });

  it("failures for a DIFFERENT problem type do not affect this recommendation (scoped signal)", () => {
    const items = [...patternHits, failed("o-1", { problemType: "cost_overrun" }), failed("o-2", { problemType: "cost_overrun" })];
    const r = generateRecommendation(decision, patterns, items);
    expect(r.learningApplied).toBeUndefined();
    expect(r.confidenceScore).toBeCloseTo(0.8, 5);
  });
});

describe("Wave 3 S3 — alternatives apply the same prior-failure learning as the primary", () => {
  const actionable = (recs: ReturnType<typeof generateMultipleRecommendations>) =>
    recs.filter((r) => r.dataSufficiency === "sufficient" && r.recommendedAction);

  it("clean history: every actionable alternative carries un-penalized confidence", () => {
    const recs = generateMultipleRecommendations(decision, patterns, patternHits);
    const a = actionable(recs);
    expect(a.length).toBeGreaterThan(1);
    for (const r of a) expect(r.learningApplied).toBeUndefined();
  });

  it("prior failures lower confidence + disclose on EVERY actionable alternative, not only the primary", () => {
    const items = [...patternHits, failed("f-1"), failed("f-2"), failed("f-3")];
    const a = actionable(generateMultipleRecommendations(decision, patterns, items));
    expect(a.length).toBeGreaterThan(1);
    for (const r of a) {
      expect(r.learningApplied).toBe(true);
      expect(r.priorFailureCount).toBe(3);
      // Clean alternative confidences are all ≥ 0.70; penalized ones are all ≤ 0.44.
      expect(r.confidenceScore).toBeLessThan(0.7);
      expect(r.explanation).toMatch(/3 realized failure\(s\)/i);
    }
  });

  it("failures for a different problem type do not penalize the alternatives (scoped)", () => {
    const items = [...patternHits, failed("o-1", { problemType: "cost_overrun" })];
    const a = actionable(generateMultipleRecommendations(decision, patterns, items));
    for (const r of a) expect(r.learningApplied).toBeUndefined();
  });
});
