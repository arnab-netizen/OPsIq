/**
 * Beta integrity BIV-12: a re-diagnosis must not duplicate (and thereby hide) an
 * action that is still open for the same finding/recommendation.
 */
import { describe, it, expect } from "vitest";
import { OPEN_ACTION_STATUSES, continuityKey, withoutOpenDuplicates } from "@/domain/founder-recovery/action-continuity";

describe("action continuity", () => {
  it("open = every non-terminal status", () => {
    expect([...OPEN_ACTION_STATUSES]).toEqual(["proposed", "assigned", "in_progress", "blocked"]);
  });

  it("skips planned actions that already have an open action with the same finding + recommendation", () => {
    const planned = [
      { findingCode: "F1", recommendationCode: "R1", title: "a" },
      { findingCode: "F2", recommendationCode: "R2", title: "b" },
    ];
    const r = withoutOpenDuplicates(planned, [{ findingCode: "F1", recommendationCode: "R1" }]);
    expect(r.toCreate.map((a) => a.title)).toEqual(["b"]);
    expect(r.carriedForward).toBe(1);
  });

  it("a different recommendation for the same finding is not a duplicate", () => {
    const r = withoutOpenDuplicates([{ findingCode: "F1", recommendationCode: "R9" }], [{ findingCode: "F1", recommendationCode: "R1" }]);
    expect(r.toCreate).toHaveLength(1);
  });

  it("finding-only keys (recovery) match on finding code", () => {
    expect(continuityKey({ findingCode: "F1" })).toBe(continuityKey({ findingCode: "F1", recommendationCode: null }));
    expect(withoutOpenDuplicates([{ findingCode: "F1" }], [{ findingCode: "F1" }]).toCreate).toHaveLength(0);
  });
});
