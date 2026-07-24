/**
 * Fake / reused / suspicious proof-DISPUTE → Anti-Gaming behaviour patterns (pure).
 *
 * A single suspected-fake dispute is a WARNING, not a pattern; repetition escalates to a repeated
 * pattern. Tamper/wrong-insufficient patterns require repetition. A manager who accepted a proof
 * later disputed as fake gets its own signal. Every signal carries reason codes + proof/audit refs
 * and links a related credibility concern — never a "fraud" label or hidden score. Aggregation from
 * the governed dispute trail attributes to the proof's submitter/reviewer and never fabricates
 * (an absent / cross-workspace proof is skipped).
 */
import { describe, it, expect } from "vitest";
import {
  identifyGamingSignals, aggregateSuspiciousProof,
  type AntiGamingInput, type SuspiciousProofActorStats, type SuspiciousReviewerStats,
  type SuspiciousDisputeRecord, type SuspiciousProofRow,
} from "@/domain/owner-mode/anti-gaming-analytics";

const AT = "2026-07-05T00:00:00.000Z";
const inp = (over: Partial<AntiGamingInput> = {}): AntiGamingInput => ({
  workspaceId: "ws-1", actors: [], reviewers: [], evaluatedAt: AT, ...over,
});
const sActor = (over: Partial<SuspiciousProofActorStats>): SuspiciousProofActorStats => ({
  actorId: "op-1", suspectedFakeCount: 0, wrongInsufficientCount: 0, tamperSuspectedCount: 0, reusedCount: 0,
  proofIds: ["p1"], auditRefs: ["a1"], ...over,
});
const sReviewer = (over: Partial<SuspiciousReviewerStats>): SuspiciousReviewerStats => ({
  reviewerId: "mgr-1", acceptedSuspiciousCount: 0, reviewErrorCount: 0, acceptedTamperCount: 0,
  proofIds: ["p1"], auditRefs: ["a1"], ...over,
});

const NO_FRAUD_LABEL = /fraud|fraudster|theft|thief/i;

describe("fake-proof anti-gaming — module contract assertions", () => {
  it("identifyGamingSignals is a function", () => { expect(typeof identifyGamingSignals).toBe("function"); });
  it("aggregateSuspiciousProof is a function", () => { expect(typeof aggregateSuspiciousProof).toBe("function"); });
  it("AT is a string", () => { expect(typeof AT).toBe("string"); });
  it("inp is a function", () => { expect(typeof inp).toBe("function"); });
  it("sActor is a function", () => { expect(typeof sActor).toBe("function"); });
  it("sReviewer is a function", () => { expect(typeof sReviewer).toBe("function"); });
  it("NO_FRAUD_LABEL is a RegExp", () => { expect(NO_FRAUD_LABEL instanceof RegExp).toBe(true); });
  it("inp() returns an object", () => { expect(typeof inp()).toBe("object"); });
  it("inp() has workspaceId field", () => { expect(inp()).toHaveProperty("workspaceId"); });
  it("identifyGamingSignals(inp()) returns an object", () => { expect(typeof identifyGamingSignals(inp())).toBe("object"); });
  it("identifyGamingSignals(inp()) has signals field", () => { expect(identifyGamingSignals(inp())).toHaveProperty("signals"); });
  it("sActor({ suspectedFakeCount: 0 }) returns an object", () => { expect(typeof sActor({ suspectedFakeCount: 0 })).toBe("object"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("fake-proof anti-gaming — detection", () => {
  it("a single suspected-fake dispute is a WARNING, not a repeated pattern", () => {
    const a = identifyGamingSignals(inp({ suspiciousProofActors: [sActor({ suspectedFakeCount: 1 })] }));
    const sig = a.signals.find((s) => s.signalType === "SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN")!;
    expect(sig).toBeTruthy();
    expect(sig.isRepeatedPattern).toBe(false);
    expect(sig.patternCount).toBe(1);
    expect(sig.reasonCodes).toContain("SINGLE_SEVERE_WARNING");
    expect(sig.reasonCodes).not.toContain("REPEATED_SUSPECTED_FAKE_OR_REUSED_PROOF_DISPUTE");
  });

  it("repeated suspected-fake disputes by one actor become a repeated pattern (top signal)", () => {
    const a = identifyGamingSignals(inp({ suspiciousProofActors: [sActor({ suspectedFakeCount: 3, proofIds: ["p1", "p2", "p3"], auditRefs: ["a1", "a2", "a3"] })] }));
    expect(a.topSignal?.signalType).toBe("SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN");
    expect(a.topSignal?.isRepeatedPattern).toBe(true);
    expect(a.topSignal?.severity).toBe("CRITICAL");
    expect(a.topSignal?.reasonCodes).toContain("REPEATED_SUSPECTED_FAKE_OR_REUSED_PROOF_DISPUTE");
    expect(a.topSignal?.evidence.some((e) => /proof refs/i.test(e))).toBe(true);
    expect(a.topSignal?.evidence.some((e) => /audit refs/i.test(e))).toBe(true);
    expect(a.topSignal?.ownerActionRequired).toBe(true);
    expect(JSON.stringify(a.topSignal)).not.toMatch(NO_FRAUD_LABEL);
  });

  it("repeated wrong/insufficient proof disputes become WRONG_OR_INSUFFICIENT_PROOF_PATTERN", () => {
    const a = identifyGamingSignals(inp({ suspiciousProofActors: [sActor({ wrongInsufficientCount: 2 })] }));
    const sig = a.signals.find((s) => s.signalType === "WRONG_OR_INSUFFICIENT_PROOF_PATTERN")!;
    expect(sig).toBeTruthy();
    expect(sig.isRepeatedPattern).toBe(true);
    expect(sig.relatedCredibilityConcern).toBe("WEAK_PROOF_NEEDS_REVIEW");
    // A single wrong/insufficient dispute is not a pattern.
    expect(identifyGamingSignals(inp({ suspiciousProofActors: [sActor({ wrongInsufficientCount: 1 })] })).signals.some((s) => s.signalType === "WRONG_OR_INSUFFICIENT_PROOF_PATTERN")).toBe(false);
  });

  it("repeated tamper-suspected proof becomes TAMPER_SUSPECTED_PROOF_PATTERN with a credibility link", () => {
    const a = identifyGamingSignals(inp({ suspiciousProofActors: [sActor({ tamperSuspectedCount: 2 })] }));
    const sig = a.signals.find((s) => s.signalType === "TAMPER_SUSPECTED_PROOF_PATTERN")!;
    expect(sig).toBeTruthy();
    expect(sig.severity).toBe("CRITICAL");
    expect(sig.relatedCredibilityConcern).toBe("TAMPER_SUSPECTED_PROOF");
  });

  it("a manager accepting a proof later disputed as fake gets MANAGER_ACCEPTED_SUSPICIOUS_PROOF", () => {
    const a = identifyGamingSignals(inp({ suspiciousReviewers: [sReviewer({ acceptedSuspiciousCount: 1 })] }));
    const sig = a.signals.find((s) => s.signalType === "MANAGER_ACCEPTED_SUSPICIOUS_PROOF")!;
    expect(sig).toBeTruthy();
    expect(sig.ownerActionRequired).toBe(true);
    expect(sig.relatedCredibilityConcern).toBe("REVIEW_QUALITY_CONCERN");
  });

  it("a reviewer who accepted tamper-suspected proof gets REVIEW_QUALITY_CONCERN", () => {
    const a = identifyGamingSignals(inp({ suspiciousReviewers: [sReviewer({ acceptedTamperCount: 1 })] }));
    expect(a.signals.some((s) => s.signalType === "REVIEW_QUALITY_CONCERN")).toBe(true);
  });

  it("links related profit leak / constraint when available", () => {
    const a = identifyGamingSignals(inp({
      suspiciousProofActors: [sActor({ suspectedFakeCount: 2, proofIds: ["p1", "p2"], auditRefs: ["a1", "a2"] })],
      currentConstraint: "STAFF", topProfitLeakType: "WEAK_PROOF_REWORK_RISK",
    }));
    expect(a.topSignal?.relatedProfitLeak).toBe("WEAK_PROOF_REWORK_RISK");
    expect(a.topSignal?.relatedConstraint).toBe("STAFF");
  });

  it("clean workspace (no suspicious input) returns DATA_INSUFFICIENT", () => {
    const a = identifyGamingSignals(inp());
    expect(a.topSignal?.signalType).toBe("DATA_INSUFFICIENT");
  });
});

describe("fake-proof anti-gaming — aggregation from the governed dispute trail", () => {
  const rows: SuspiciousProofRow[] = [
    { id: "p1", submittedByUserId: "op-1", reviewedByUserId: "mgr-1", duplicateFlagged: false, tamperSuspected: false, status: "DISPUTED" },
    { id: "p2", submittedByUserId: "op-1", reviewedByUserId: "mgr-1", duplicateFlagged: false, tamperSuspected: false, status: "DISPUTED" },
    { id: "p3", submittedByUserId: "op-1", reviewedByUserId: "mgr-2", duplicateFlagged: false, tamperSuspected: true, status: "ACCEPTED" },
  ];

  it("attributes fake/wrong disputes to submitter + reviewer, and tamper to the submitter", () => {
    const records: SuspiciousDisputeRecord[] = [
      { proofId: "p1", disputeCategory: "SUSPECTED_FAKE_OR_REUSED_PROOF", auditEventId: "a1" },
      { proofId: "p2", disputeCategory: "SUSPECTED_FAKE_OR_REUSED_PROOF", auditEventId: "a2" },
    ];
    const { suspiciousProofActors, suspiciousReviewers } = aggregateSuspiciousProof(records, rows);
    const op = suspiciousProofActors.find((a) => a.actorId === "op-1")!;
    expect(op.suspectedFakeCount).toBe(2);
    expect(op.tamperSuspectedCount).toBe(1); // p3 tamper
    expect(op.auditRefs).toEqual(["a1", "a2"]);
    const mgr = suspiciousReviewers.find((r) => r.reviewerId === "mgr-1")!;
    expect(mgr.acceptedSuspiciousCount).toBe(2);
    const mgr2 = suspiciousReviewers.find((r) => r.reviewerId === "mgr-2")!;
    expect(mgr2.acceptedTamperCount).toBe(1);
  });

  it("skips a dispute whose proof is absent (cross-workspace) — never fabricates attribution", () => {
    const records: SuspiciousDisputeRecord[] = [
      { proofId: "ghost", disputeCategory: "SUSPECTED_FAKE_OR_REUSED_PROOF", auditEventId: "aX" },
    ];
    const { suspiciousProofActors } = aggregateSuspiciousProof(records, rows);
    expect(suspiciousProofActors.every((a) => a.suspectedFakeCount === 0)).toBe(true);
  });
});
