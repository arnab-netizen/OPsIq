/**
 * Jarvis 360 Slice 10 — decision arbitration (pure). No DB.
 */
import { describe, it, expect } from "vitest";
import { arbitrate, type ArbitrationCandidate } from "@/domain/owner-mode/decision-arbitration";

function cand(over: Partial<ArbitrationCandidate>): ArbitrationCandidate {
  return { id: "x", blockedBy: [], riskOfAction: 0.2, riskOfInaction: 0.2, confidence: 0.8, ownerGoalAligned: false, reversible: true, ...over };
}

describe("arbitrate", () => {
  it("blocks a candidate with a hard constraint and names the dominant one", () => {
    const r = arbitrate([cand({ id: "a", blockedBy: ["capacity", "cash"], riskOfInaction: 0.1 })]);
    const a = r.decisions.find((d) => d.id === "a")!;
    expect(a.verdict).toBe("blocked");
    expect(a.dominantConstraint).toBe("cash"); // cash outranks capacity
    expect(a.reconsiderWhen).toMatch(/cash/);
    expect(r.recommended).toBeNull();
  });

  it("defers (not blocks) an urgent blocked candidate", () => {
    const r = arbitrate([cand({ id: "a", blockedBy: ["data"], riskOfInaction: 0.9 })]);
    expect(r.decisions[0].verdict).toBe("deferred");
  });

  it("legal/security dominates everything and needs owner approval", () => {
    const r = arbitrate([cand({ id: "a", blockedBy: ["legal_security", "cash"] })]);
    const a = r.decisions[0];
    expect(a.dominantConstraint).toBe("legal_security");
    expect(a.ownerApprovalRequired).toBe(true);
  });

  it("recommends the goal-aligned, lower-risk, higher-confidence option", () => {
    const r = arbitrate([
      cand({ id: "safe", ownerGoalAligned: true, riskOfAction: 0.2, confidence: 0.9 }),
      cand({ id: "risky", ownerGoalAligned: false, riskOfAction: 0.6, confidence: 0.7 }),
    ]);
    expect(r.recommended?.id).toBe("safe");
    expect(r.decisions.find((d) => d.id === "risky")!.verdict).toBe("rejected");
  });

  it("flags owner approval for an irreversible or high-action-risk winner", () => {
    const r = arbitrate([cand({ id: "a", reversible: false, ownerGoalAligned: true })]);
    expect(r.recommended?.ownerApprovalRequired).toBe(true);
  });
});
