import { describe, it, expect } from "vitest";
import { deriveNextMove, deriveNextMoveValidity, NEXT_MOVE_VALIDITY_NOTE } from "@/domain/owner-first-run/next-move";

const facts = { commitment: "Collect money customers owe you", decidedAt: new Date("2026-10-01T09:00:00Z"), intendedCompletionAt: null, observationWindowDays: 14, assessed: false, now: new Date("2026-10-05T09:00:00Z") };

describe("next move validity: a stale recommendation is never the active next move", () => {
  it("unchanged evidence → CURRENT, with timing", () => {
    expect(deriveNextMoveValidity({ evidenceChanged: false, currentReadExists: true, findingStillRaised: true })).toBe("CURRENT");
    const v = deriveNextMove({ ...facts, evidenceChangedSince: false });
    expect(v.validity).toBe("CURRENT");
    expect(v.validityHeading).toBeNull();
    expect(v.prompt).toMatch(/Due in/);
  });
  it("changed evidence, no read on the new figures yet → NEEDS_REASSESSMENT", () => {
    expect(deriveNextMoveValidity({ evidenceChanged: true, currentReadExists: false, findingStillRaised: true })).toBe("NEEDS_REASSESSMENT");
  });
  it("changed evidence, new read no longer raises the finding → SUPERSEDED (conclusion withdrawn)", () => {
    expect(deriveNextMoveValidity({ evidenceChanged: true, currentReadExists: true, findingStillRaised: false })).toBe("SUPERSEDED");
  });
  it("changed evidence, new read still raises the finding → STALE (decided on older numbers)", () => {
    expect(deriveNextMoveValidity({ evidenceChanged: true, currentReadExists: true, findingStillRaised: true })).toBe("STALE");
  });
  it.each(["NEEDS_REASSESSMENT", "SUPERSEDED", "STALE"] as const)("%s carries a heading and reason and no timing prompt", (validity) => {
    const v = deriveNextMove({ ...facts, evidenceChangedSince: true, validity });
    expect(v.validity).toBe(validity);
    expect(v.validityHeading).toBe(NEXT_MOVE_VALIDITY_NOTE[validity].heading);
    expect(v.validityHeading).not.toMatch(/next move/i);
    expect(v.validityNote).toBeTruthy();
    expect(v.prompt).toBeNull();
  });
});
