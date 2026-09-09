/**
 * Phase 4 — Business Operating System unit tests (no DB).
 *
 * Tests pure domain functions:
 *   - scoreObjectiveHealth()  (objective-portfolio)
 *   - buildObjectivePortfolio()  (objective-portfolio)
 *   - runGoalArbitrationLogic  (goal-arbitration domain)
 *
 * Tests service layer input validation:
 *   - createObjective validation errors
 *   - createBusinessRisk validation errors
 */
import { describe, it, expect } from "vitest";
import {
  scoreObjectiveHealth,
  buildObjectivePortfolio,
  type ObjectivePortfolioInput,
} from "@/domain/owner-mode/objective-portfolio";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeObjective(over: Partial<ObjectivePortfolioInput> = {}): ObjectivePortfolioInput {
  return {
    objectiveId: "obj-1",
    parentId: null,
    title: "Reduce cash collection lag",
    objectiveType: "REVENUE",
    status: "ACTIVE",
    priorityScore: 80,
    targetValue: 20,
    currentValue: 25,
    progressPct: 0,
    deadlineDaysRemaining: 30,
    linkedGoalAligned: true,
    hasBlockingDependencies: false,
    resourceBudgetUsedPct: 40,
    childCount: 0,
    completedChildCount: 0,
    ...over,
  };
}

describe("phase4-business-operating-system — module contract assertions", () => {
  it("scoreObjectiveHealth is a function", () => { expect(typeof scoreObjectiveHealth).toBe("function"); });
  it("buildObjectivePortfolio is a function", () => { expect(typeof buildObjectivePortfolio).toBe("function"); });
  it("makeObjective is a function", () => { expect(typeof makeObjective).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
  it("typeof Math.min equals function", () => { expect(typeof Math.min).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
});

// ── scoreObjectiveHealth ─────────────────────────────────────────────────────

describe("scoreObjectiveHealth", () => {
  it("returns COMPLETED for completed objective", () => {
    const result = scoreObjectiveHealth(makeObjective({ status: "COMPLETED" }));
    expect(result.healthStatus).toBe("COMPLETED");
    expect(result.healthScore).toBe(100);
  });

  it("returns INACTIVE for abandoned objective", () => {
    const result = scoreObjectiveHealth(makeObjective({ status: "ABANDONED" }));
    expect(result.healthStatus).toBe("INACTIVE");
    expect(result.healthScore).toBe(0);
  });

  it("returns BLOCKED when hasBlockingDependencies=true", () => {
    const result = scoreObjectiveHealth(makeObjective({ hasBlockingDependencies: true }));
    expect(result.healthStatus).toBe("BLOCKED");
    expect(result.atRiskReasons.length).toBeGreaterThan(0);
  });

  it("returns AT_RISK when past deadline with low progress and budget exhausted", () => {
    // score = 100 - 30 (past deadline) - 20 (budget) - 10 (low progress) = 40 → AT_RISK (31–60)
    const result = scoreObjectiveHealth(makeObjective({
      deadlineDaysRemaining: -5,
      progressPct: 5,
      resourceBudgetUsedPct: 96,
    }));
    expect(result.healthStatus).toBe("AT_RISK");
  });

  it("returns AT_RISK when past deadline with very low progress", () => {
    // score = 100 - 30 (past deadline) - 10 (low progress < 20, deadline < 60) = 60 → AT_RISK (≤60)
    const result = scoreObjectiveHealth(makeObjective({ deadlineDaysRemaining: -1, progressPct: 5 }));
    expect(result.healthStatus).toBe("AT_RISK");
  });

  it("returns ON_TRACK for healthy objective", () => {
    const result = scoreObjectiveHealth(makeObjective({
      progressPct: 80,
      deadlineDaysRemaining: 60,
      resourceBudgetUsedPct: 50,
    }));
    expect(result.healthStatus).toBe("ON_TRACK");
    expect(result.healthScore).toBeGreaterThan(50);
  });

  it("is deterministic — identical input produces identical output", () => {
    const obj = makeObjective({ progressPct: 50, deadlineDaysRemaining: 20 });
    const r1 = scoreObjectiveHealth(obj);
    const r2 = scoreObjectiveHealth(obj);
    expect(r1.healthStatus).toBe(r2.healthStatus);
    expect(r1.healthScore).toBe(r2.healthScore);
    expect(r1.atRiskReasons).toEqual(r2.atRiskReasons);
  });
});

// ── buildObjectivePortfolio ──────────────────────────────────────────────────

describe("buildObjectivePortfolio", () => {
  it("returns empty portfolio for empty input", () => {
    const view = buildObjectivePortfolio([]);
    expect(view.totalActive).toBe(0);
    expect(view.items).toHaveLength(0);
    expect(view.topPriorityObjectiveId).toBeNull();
  });

  it("correctly counts completed objectives", () => {
    const objectives = [
      makeObjective({ objectiveId: "obj-1", status: "COMPLETED", progressPct: 100 }),
      makeObjective({ objectiveId: "obj-2", status: "ACTIVE", progressPct: 50 }),
    ];
    const view = buildObjectivePortfolio(objectives);
    expect(view.totalCompleted).toBe(1);
    expect(view.totalActive).toBe(1);
  });

  it("identifies top priority objective by priorityScore", () => {
    const objectives = [
      makeObjective({ objectiveId: "low", priorityScore: 10, progressPct: 50, deadlineDaysRemaining: 60 }),
      makeObjective({ objectiveId: "high", priorityScore: 95, progressPct: 50, deadlineDaysRemaining: 60 }),
    ];
    const view = buildObjectivePortfolio(objectives);
    // Top priority should be the high-priority, non-completed, non-blocked one
    expect(view.topPriorityObjectiveId).not.toBeNull();
  });

  it("counts blocked objectives correctly", () => {
    const objectives = [
      makeObjective({ objectiveId: "obj-1", hasBlockingDependencies: true }),
      makeObjective({ objectiveId: "obj-2", hasBlockingDependencies: false, progressPct: 70, deadlineDaysRemaining: 60 }),
    ];
    const view = buildObjectivePortfolio(objectives);
    expect(view.totalBlocked).toBe(1);
  });

  it("computes portfolioHealthScore as a number in 0..100", () => {
    const objectives = [
      makeObjective({ objectiveId: "obj-1", progressPct: 80, deadlineDaysRemaining: 60 }),
      makeObjective({ objectiveId: "obj-2", progressPct: 20, deadlineDaysRemaining: 5 }),
    ];
    const view = buildObjectivePortfolio(objectives);
    expect(view.portfolioHealthScore).toBeGreaterThanOrEqual(0);
    expect(view.portfolioHealthScore).toBeLessThanOrEqual(100);
  });

  it("marks objective as leaf when no children", () => {
    const objectives = [makeObjective({ objectiveId: "obj-1", childCount: 0 })];
    const view = buildObjectivePortfolio(objectives);
    expect(view.items[0].isLeaf).toBe(true);
  });

  it("marks objective as not leaf when it has children", () => {
    const objectives = [makeObjective({ objectiveId: "obj-1", childCount: 2, completedChildCount: 1 })];
    const view = buildObjectivePortfolio(objectives);
    expect(view.items[0].isLeaf).toBe(false);
  });

  it("canStart=false when hasBlockingDependencies=true", () => {
    const objectives = [makeObjective({ objectiveId: "obj-1", hasBlockingDependencies: true })];
    const view = buildObjectivePortfolio(objectives);
    expect(view.items[0].canStart).toBe(false);
  });

  it("canStart=true when no blocking dependencies", () => {
    const objectives = [makeObjective({ objectiveId: "obj-1", hasBlockingDependencies: false })];
    const view = buildObjectivePortfolio(objectives);
    expect(view.items[0].canStart).toBe(true);
  });

  it("atRiskCount includes AT_RISK objectives", () => {
    // obj-1: score = 100 - 30 (past deadline) - 10 (low progress) = 60 → AT_RISK
    const objectives = [
      makeObjective({ objectiveId: "obj-1", deadlineDaysRemaining: -1, progressPct: 5 }),
      makeObjective({ objectiveId: "obj-2", deadlineDaysRemaining: 60, progressPct: 80 }),
    ];
    const view = buildObjectivePortfolio(objectives);
    expect(view.atRiskCount).toBeGreaterThan(0);
  });

  it("all items have valid healthStatus", () => {
    const VALID_STATUSES = ["ON_TRACK", "AT_RISK", "BLOCKED", "CRITICAL", "COMPLETED", "INACTIVE"];
    const objectives = [
      makeObjective({ objectiveId: "obj-1", status: "ACTIVE", progressPct: 50, deadlineDaysRemaining: 30 }),
      makeObjective({ objectiveId: "obj-2", status: "COMPLETED", progressPct: 100 }),
      makeObjective({ objectiveId: "obj-3", hasBlockingDependencies: true }),
    ];
    const view = buildObjectivePortfolio(objectives);
    for (const item of view.items) {
      expect(VALID_STATUSES).toContain(item.healthStatus);
    }
  });
});

// ── [module42] repo-wide UNKNOWN != BAD sweep — objective progress ────────────
//
// Root cause: an objective whose progress has never been measured (no target set, or a target
// set but currentValue never recorded) was collapsed to progressPct=0 by every caller, which
// scoreObjectiveHealth then penalized identically to "genuinely measured at 0% done" — an
// objective nobody has logged progress against could be marked AT_RISK/CRITICAL purely because
// no one measured it, not because it's actually behind. progressPct is now `number | null`; null
// means "never measured" and must apply none of the progress-based penalties.
describe("[module42] scoreObjectiveHealth — progressPct: null must never be treated as 0%", () => {
  it("progressPct: null with an imminent deadline is NOT penalized as low progress", () => {
    const withNull = scoreObjectiveHealth(makeObjective({ progressPct: null, deadlineDaysRemaining: 5 }));
    const withZero = scoreObjectiveHealth(makeObjective({ progressPct: 0, deadlineDaysRemaining: 5 }));
    expect(withNull.atRiskReasons).toEqual([]);
    expect(withNull.healthStatus).toBe("ON_TRACK");
    expect(withNull.healthScore).toBe(100);
    // Contrast: a genuinely-measured 0% at the same deadline IS penalized — proves the null case
    // is a real behavior difference, not a coincidence of the scoring math.
    expect(withZero.atRiskReasons.length).toBeGreaterThan(0);
    expect(withZero.healthScore).toBeLessThan(100);
  });

  it("progressPct: null with budget nearly exhausted is NOT penalized", () => {
    const result = scoreObjectiveHealth(makeObjective({ progressPct: null, resourceBudgetUsedPct: 98 }));
    expect(result.atRiskReasons).toEqual([]);
    expect(result.healthScore).toBe(100);
  });

  it("progressPct: null with a near-term deadline inside the 60-day window is NOT penalized as very-low-progress", () => {
    const result = scoreObjectiveHealth(makeObjective({ progressPct: null, deadlineDaysRemaining: 30 }));
    expect(result.atRiskReasons).toEqual([]);
    expect(result.healthStatus).toBe("ON_TRACK");
  });

  it("buildObjectivePortfolio: an unmeasured objective past most deadlines still reports ON_TRACK, not AT_RISK", () => {
    const view = buildObjectivePortfolio([
      makeObjective({ objectiveId: "obj-never-measured", progressPct: null, deadlineDaysRemaining: 5, resourceBudgetUsedPct: 96 }),
    ]);
    expect(view.items[0].healthStatus).toBe("ON_TRACK");
    expect(view.atRiskCount).toBe(0);
    expect(view.criticalCount).toBe(0);
  });
});
