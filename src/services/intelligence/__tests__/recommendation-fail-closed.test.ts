import { describe, it, expect } from "vitest";
import {
  generateRecommendation,
  generateMultipleRecommendations,
  type ActionRecommendation,
} from "@/services/intelligence/recommendation";
import type { DetectedPattern } from "@/services/intelligence/pattern-engine";
import type { DecisionResult } from "@/domain/decision/types";
import type { OperatorItem } from "@/domain/operator/types";

/**
 * Phase 2 G1 — diagnosis → recommendation fail-closed end-to-end proof (owner-journey stage 3).
 *
 * Wave-8 owner-journey coverage matrix, gap G1:
 *   "Onboarding proves weak-business low-confidence + missing-data; a dedicated end-to-end
 *    assertion that a confident diagnosis is BLOCKED (not merely low) on contradictory/insufficient
 *    evidence is owed (ties to the Wave-7 isDataSufficient fail-closed unit proof)."
 *
 * Wave 7 already proved the `isDataSufficient` control primitive in isolation. This wave proves the
 * gap that remained: that the block PROPAGATES end-to-end through the owner-facing recommendation
 * generator (`generateRecommendation` / `generateMultipleRecommendations`) — the exact surface the
 * owner journey drives after a diagnosis — so that on insufficient or contradictory evidence the
 * owner receives a HARD BLOCK (blocked=true, confidenceScore=0, dataSufficiency="insufficient", and
 * NO recommended action), NOT a fabricated confident recommendation and NOT merely a low-confidence
 * one. The tests deliberately contrast the two distinct states ("blocked" vs "merely low/unmet") and
 * prove the sufficient path still yields a real confident recommendation, so the gate is not a
 * trivial always-block.
 *
 * Pure service logic (deterministic, no DB): calls the real generator, which calls the real
 * `isDataSufficient` and the real variable registry. Runs in the required maintained vitest lane
 * (src/ ** /*.test.ts, TEST_WITH_DB=true) with no memory/OOM exposure.
 *
 * Dimensions exercised (per CLAUDE.md): 1 consulting lifecycle stage (diagnosis→recommendation),
 * 2 business condition (evidence sufficiency drives the gate).
 */

// A valid problem type (see src/domain/decision/types.ts ProblemType union).
const PROBLEM_TYPE = "revenue_leak" as const;

const decision: DecisionResult = {
  problemType: PROBLEM_TYPE,
} as unknown as DecisionResult;

/** Build N high-success patterns for the decision's problem type, all sharing item "i-1". */
function patterns(count: number, successRate = 85): DetectedPattern[] {
  return Array.from({ length: count }, (_, i) => ({
    patternId: `p-${i + 1}`,
    problemType: PROBLEM_TYPE,
    itemIds: ["i-1"],
    successRate,
  })) as unknown as DetectedPattern[];
}

/** A single operator item that the winning pattern points at, carrying a clean (no-failure) history. */
const items: OperatorItem[] = [
  {
    id: "i-1",
    action: "run_targeted_outreach",
    status: "done",
    problemType: PROBLEM_TYPE,
    outcomeDelta: 5,
  } as unknown as OperatorItem,
];

// `baselineRevenue` is a registered variable (src/services/control/variable-registry.ts), so it
// counts as a used variable and its confidence is validated by the control gate.
const inputVariables = { baselineRevenue: 100_000 };

function assertHardBlock(rec: ActionRecommendation, expectedReason: string) {
  expect(rec.blocked).toBe(true);
  expect(rec.blockReason).toBe(expectedReason);
  expect(rec.confidenceScore).toBe(0);
  expect(rec.dataSufficiency).toBe("insufficient");
  // A hard block must NOT surface a recommended action — no fabricated confident advice.
  expect(rec.recommendedAction).toBeUndefined();
  expect(rec.explanation).toContain(expectedReason);
}

describe("G1 — diagnosis→recommendation fail-closed end-to-end (blocked, not merely low)", () => {
  describe("insufficient evidence hard-blocks a confident recommendation", () => {
    it("blocks when fewer than 3 patterns exist, even with high-confidence variables", () => {
      const rec = generateRecommendation(
        decision,
        patterns(2), // below the 3-pattern minimum
        items,
        inputVariables,
        undefined,
        { baselineRevenue: 0.95 } // strong confidence — the block is due to evidence, not confidence
      );

      assertHardBlock(rec, "INSUFFICIENT_PATTERNS");
      expect(rec.blockDetails?.patternCount).toBe(2);
      expect(rec.blockDetails?.minPatternsRequired).toBe(3);
    });

    it("blocks on contradictory/low-confidence evidence despite sufficient pattern volume", () => {
      const rec = generateRecommendation(
        decision,
        patterns(4), // enough patterns…
        items,
        inputVariables,
        undefined,
        { baselineRevenue: 0.4 } // …but the evidence is not trustworthy → still blocked
      );

      assertHardBlock(rec, "LOW_CONFIDENCE_VARIABLES");
      expect(rec.blockDetails?.lowConfidenceVariables).toContain("baselineRevenue");
    });
  });

  describe("'blocked' is a distinct, harder state than 'merely low / unmet'", () => {
    it("does not set blocked when patterns are sufficient but no pattern meets the success threshold", () => {
      // 3+ trustworthy patterns, but none exceeds the >60% success bar for this problem type.
      const weakPatterns = patterns(3, 55);
      const rec = generateRecommendation(
        decision,
        weakPatterns,
        items,
        inputVariables,
        undefined,
        { baselineRevenue: 0.9 }
      );

      // This is the "merely low / unmet-quality" path: insufficient by quality, but NOT a hard block.
      expect(rec.dataSufficiency).toBe("insufficient");
      expect(rec.blocked).toBeFalsy();
      expect(rec.blockReason).toBeUndefined();
      expect(rec.recommendedAction).toBeUndefined();
      // Contrast the two insufficient-evidence cases above, which DO hard-block with confidence 0.
      const blocked = generateRecommendation(
        decision,
        patterns(1),
        items,
        inputVariables,
        undefined,
        { baselineRevenue: 0.9 }
      );
      expect(blocked.blocked).toBe(true);
      expect(blocked.blockReason).toBe("INSUFFICIENT_PATTERNS");
    });
  });

  describe("sufficient + strong evidence still yields a real confident recommendation (gate is not always-block)", () => {
    it("emits a confident, actionable recommendation when evidence is sufficient and trustworthy", () => {
      const rec = generateRecommendation(
        decision,
        patterns(3, 85),
        items,
        inputVariables,
        undefined,
        { baselineRevenue: 0.9 }
      );

      expect(rec.blocked).toBeFalsy();
      expect(rec.dataSufficiency).toBe("sufficient");
      expect(rec.confidenceScore).toBeGreaterThan(0.6);
      expect(rec.recommendedAction).toBe("run_targeted_outreach");
    });
  });

  describe("owner-facing multi-recommendation path fails closed identically", () => {
    it("blocks the entire recommendation set on insufficient patterns", () => {
      const recs = generateMultipleRecommendations(
        decision,
        patterns(2),
        items,
        inputVariables,
        undefined,
        { baselineRevenue: 0.95 }
      );

      expect(recs).toHaveLength(1);
      assertHardBlock(recs[0], "INSUFFICIENT_PATTERNS");
    });

    it("blocks the entire recommendation set on contradictory low-confidence evidence", () => {
      const recs = generateMultipleRecommendations(
        decision,
        patterns(4),
        items,
        inputVariables,
        undefined,
        { baselineRevenue: 0.3 }
      );

      expect(recs).toHaveLength(1);
      assertHardBlock(recs[0], "LOW_CONFIDENCE_VARIABLES");
    });
  });
});
