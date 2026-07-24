/**
 * Jarvis 360 Slice 10 — decision arbitration (pure). No DB.
 */
import { describe, it, expect } from "vitest";
import { arbitrate, type ArbitrationCandidate } from "@/domain/owner-mode/decision-arbitration";

function cand(over: Partial<ArbitrationCandidate>): ArbitrationCandidate {
  return { id: "x", blockedBy: [], riskOfAction: 0.2, riskOfInaction: 0.2, confidence: 0.8, ownerGoalAligned: false, reversible: true, ...over };
}

describe("arbitrate — module contract assertions", () => {
  it("arbitrate is a function", () => {
    expect(typeof arbitrate).toBe("function");
  });
  it("cand() returns an object with id field", () => {
    expect(cand({ id: "test" })).toHaveProperty("id", "test");
  });
  it("cand() default blockedBy is empty array", () => {
    expect(cand({})).toHaveProperty("blockedBy");
    expect(Array.isArray(cand({}).blockedBy)).toBe(true);
  });
  it("arbitrate returns an object", () => {
    expect(typeof arbitrate([])).toBe("object");
  });
  it("arbitrate result has decisions field", () => {
    expect(arbitrate([])).toHaveProperty("decisions");
  });
  it("arbitrate result has recommended field", () => {
    expect(arbitrate([])).toHaveProperty("recommended");
  });
  it("decisions is an array", () => {
    expect(Array.isArray(arbitrate([]).decisions)).toBe(true);
  });
  it("empty candidates returns null recommended", () => {
    expect(arbitrate([]).recommended).toBeNull();
  });
  it("unblocked goal-aligned candidate can be recommended", () => {
    const r = arbitrate([cand({ id: "a", ownerGoalAligned: true })]);
    expect(r.recommended?.id).toBe("a");
  });
  it("blocked candidate has verdict 'blocked' or 'deferred'", () => {
    const r = arbitrate([cand({ id: "a", blockedBy: ["cash"] })]);
    const d = r.decisions.find(x => x.id === "a")!;
    expect(["blocked", "deferred"]).toContain(d.verdict);
  });
  it("each decision has verdict field", () => {
    const r = arbitrate([cand({ id: "a" })]);
    expect(r.decisions[0]).toHaveProperty("verdict");
  });
  it("each decision has id field matching input", () => {
    const r = arbitrate([cand({ id: "my-id" })]);
    expect(r.decisions[0].id).toBe("my-id");
  });
  it("cand default riskOfAction is 0.2", () => {
    expect(cand({}).riskOfAction).toBe(0.2);
  });
  it("cand default reversible is true", () => {
    expect(cand({}).reversible).toBe(true);
  });
  it("two candidates result in two decisions", () => {
    const r = arbitrate([cand({ id: "a" }), cand({ id: "b" })]);
    expect(r.decisions).toHaveLength(2);
  });
});

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
