/**
 * Beta integrity BIV-12: a re-diagnosis must not duplicate (and thereby hide) an action the
 * owner has taken on; untouched proposals are regenerated with the new ranking.
 */
import { describe, it, expect } from "vitest";
import {
  ENGAGED_ACTION_STATUSES,
  continuityKey,
  planWithContinuity,
  isStillFlagged,
} from "@/domain/founder-recovery/action-continuity";

describe("action continuity", () => {
  it("engaged = assigned, in_progress, blocked (never proposed or terminal)", () => {
    expect([...ENGAGED_ACTION_STATUSES]).toEqual(["assigned", "in_progress", "blocked"]);
  });

  it("carries planned actions covered by an engaged prior action (with its id) and creates the rest", () => {
    const planned = [
      { findingCode: "F1", recommendationCode: "R1", priorityScore: 80 },
      { findingCode: "F2", recommendationCode: "R2", priorityScore: 40 },
    ];
    const r = planWithContinuity(planned, [{ id: "a1", findingCode: "F1", recommendationCode: "R1" }]);
    expect(r.toCreate.map((a) => a.findingCode)).toEqual(["F2"]);
    expect(r.carried).toEqual([{ priorActionId: "a1", planned: planned[0] }]);
  });

  it("a different recommendation for the same finding is not a duplicate", () => {
    const r = planWithContinuity([{ findingCode: "F1", recommendationCode: "R9" }], [{ id: "a1", findingCode: "F1", recommendationCode: "R1" }]);
    expect(r.toCreate).toHaveLength(1);
    expect(r.carried).toHaveLength(0);
  });

  it("finding-only keys (recovery) match on finding code", () => {
    expect(continuityKey({ findingCode: "F1" })).toBe(continuityKey({ findingCode: "F1", recommendationCode: null }));
    expect(planWithContinuity([{ findingCode: "F1" }], [{ id: "x", findingCode: "F1" }]).toCreate).toHaveLength(0);
  });

  it("isStillFlagged reflects the latest diagnosis' findings", () => {
    expect(isStillFlagged("F1", new Set(["F1"]))).toBe(true);
    expect(isStillFlagged("F1", new Set(["F2"]))).toBe(false);
  });
});
