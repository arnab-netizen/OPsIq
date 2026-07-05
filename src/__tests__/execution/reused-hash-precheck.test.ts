/**
 * Dedicated reused-hash / duplicate-proof precheck (pure). Deterministic policy: unique → PASS;
 * same hash across DIFFERENT tasks → NEEDS_REVIEW (same operator = HIGH, different = MEDIUM w/ lower
 * attribution); same-task reuse → ALLOWED (no false warning); cross-workspace match → BLOCKED, no
 * IDs leaked; missing/malformed hash → DATA_INSUFFICIENT. Never a fraud label.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateReusedHash, buildReusedHashAnalysis,
  DuplicateProofStatus, DuplicateSignalType,
  type ReusedHashProof,
} from "@/domain/execution/reused-hash-precheck";
import { identifyGamingSignals } from "@/domain/owner-mode/anti-gaming-analytics";
import { buildEvidenceCredibility } from "@/domain/owner-mode/evidence-credibility-graph";

const AT = "2026-07-05T00:00:00.000Z";
const H = "a".repeat(64); // well-formed sha256-length hex
const H2 = "b".repeat(64);
const NO_FRAUD = /fraud|fraudster|theft|thief/i;

const p = (over: Partial<ReusedHashProof>): ReusedHashProof => ({
  id: "p1", workspaceId: "ws-1", fileHash: H, taskId: "t1", submittedByUserId: "op-1", ...over,
});

describe("reused-hash precheck — policy", () => {
  it("a unique hash returns PASS_NO_DUPLICATE", () => {
    const f = evaluateReusedHash(p({}), [p({ id: "p2", fileHash: H2, taskId: "t2" })], AT);
    expect(f.status).toBe(DuplicateProofStatus.PASS_NO_DUPLICATE);
    expect(f.matchedProofIds).toEqual([]);
  });

  it("same hash across different tasks → NEEDS_REVIEW_DUPLICATE (EXACT_REUSED_HASH, HASH match)", () => {
    const f = evaluateReusedHash(p({}), [p({ id: "p2", taskId: "t2" })], AT);
    expect(f.status).toBe(DuplicateProofStatus.NEEDS_REVIEW_DUPLICATE);
    expect(f.signalType).toBe(DuplicateSignalType.EXACT_REUSED_HASH);
    expect(f.matchType).toBe("HASH");
    expect(f.matchedProofIds).toEqual(["p2"]);
    expect(f.matchedActionIds).toEqual(["t2"]);
    expect(f.severity).toBe("HIGH"); // same operator across tasks
    expect(f.reasonCodes).toContain("SAME_OPERATOR_CROSS_TASK_REUSE");
    expect(JSON.stringify(f)).not.toMatch(NO_FRAUD);
  });

  it("different operator reuse lowers attribution confidence (MEDIUM)", () => {
    const f = evaluateReusedHash(p({}), [p({ id: "p2", taskId: "t2", submittedByUserId: "op-2" })], AT);
    expect(f.status).toBe(DuplicateProofStatus.NEEDS_REVIEW_DUPLICATE);
    expect(f.severity).toBe("MEDIUM");
    expect(f.confidence).toBe("MEDIUM");
    expect(f.reasonCodes).toContain("DIFFERENT_OPERATOR_LOWER_ATTRIBUTION");
  });

  it("same-task reuse is ALLOWED_DUPLICATE, not a false warning", () => {
    const f = evaluateReusedHash(p({}), [p({ id: "p2", taskId: "t1" })], AT);
    expect(f.status).toBe(DuplicateProofStatus.ALLOWED_DUPLICATE);
    expect(f.signalType).toBe(DuplicateSignalType.SAME_TASK_ALLOWED_DUPLICATE);
    expect(f.severity).toBe("NONE");
  });

  it("a missing / malformed hash is DATA_INSUFFICIENT (not a pass)", () => {
    expect(evaluateReusedHash(p({ fileHash: null }), [], AT).status).toBe(DuplicateProofStatus.DATA_INSUFFICIENT);
    expect(evaluateReusedHash(p({ fileHash: "not-a-hash" }), [p({ id: "p2", fileHash: "not-a-hash", taskId: "t2" })], AT).status).toBe(DuplicateProofStatus.DATA_INSUFFICIENT);
  });

  it("a cross-workspace-only match is BLOCKED and never exposes the other workspace's IDs", () => {
    const foreignProof = "pFOREIGN", foreignWs = "wsFOREIGN", foreignTask = "tFOREIGN";
    const f = evaluateReusedHash(p({}), [p({ id: foreignProof, workspaceId: foreignWs, taskId: foreignTask })], AT);
    expect(f.status).toBe(DuplicateProofStatus.BLOCKED_CROSS_WORKSPACE);
    expect(f.matchedProofIds).toEqual([]);
    expect(f.matchedActionIds).toEqual([]);
    // No cross-workspace identifier anywhere in the serialized finding.
    const s = JSON.stringify(f);
    expect(s).not.toContain(foreignProof);
    expect(s).not.toContain(foreignWs);
    expect(s).not.toContain(foreignTask);
  });

  it("a same-workspace cross-task match is kept even when a cross-workspace match also exists (no leak)", () => {
    const foreignProof = "pFOREIGN", foreignWs = "wsFOREIGN";
    const f = evaluateReusedHash(p({}), [p({ id: "p2", taskId: "t2" }), p({ id: foreignProof, workspaceId: foreignWs, taskId: "tFOREIGN" })], AT);
    expect(f.status).toBe(DuplicateProofStatus.NEEDS_REVIEW_DUPLICATE);
    expect(f.matchedProofIds).toEqual(["p2"]); // cross-workspace id never included
    expect(f.reasonCodes).toContain("CROSS_WORKSPACE_MATCH_IGNORED");
    expect(JSON.stringify(f)).not.toContain(foreignWs);
  });
});

describe("reused-hash precheck — workspace analysis", () => {
  it("surfaces NEEDS_REVIEW findings + per-submitter cross-task reuse counts", () => {
    const proofs = [
      p({ id: "a", taskId: "t1" }), p({ id: "b", taskId: "t2" }), // op-1 reuses H across t1/t2
      p({ id: "c", fileHash: H2, taskId: "t3", submittedByUserId: "op-2" }), // unique
    ];
    const a = buildReusedHashAnalysis("ws-1", proofs, AT);
    expect(a.needsReviewCount).toBe(2); // both a and b flag each other
    expect(a.topFinding?.status).toBe(DuplicateProofStatus.NEEDS_REVIEW_DUPLICATE);
    expect(a.submitterReuse.find((s) => s.actorId === "op-1")?.count).toBe(2);
    expect(a.submitterReuse.some((s) => s.actorId === "op-2")).toBe(false);
  });

  it("a clean workspace fabricates no finding", () => {
    const a = buildReusedHashAnalysis("ws-clean", [p({ id: "x", fileHash: H, taskId: "t1" }), p({ id: "y", fileHash: H2, taskId: "t2" })], AT);
    expect(a.needsReviewCount).toBe(0);
    expect(a.topFinding).toBeNull();
    expect(a.submitterReuse).toEqual([]);
  });
});

describe("reused-hash precheck — feeds anti-gaming + credibility (deterministic)", () => {
  it("repeated cross-task reuse by one actor drives a deterministic REUSED_PROOF_PATTERN (anti-gaming)", () => {
    const a = identifyGamingSignals({
      workspaceId: "ws-1", actors: [], reviewers: [],
      reusedHashActors: [{ actorId: "op-1", crossTaskReuseCount: 2, proofIds: ["a", "b"], matchType: "HASH" }],
      currentConstraint: "STAFF", topProfitLeakType: "WEAK_PROOF_REWORK_RISK", evaluatedAt: AT,
    });
    const sig = a.signals.find((s) => s.signalType === "REUSED_PROOF_PATTERN")!;
    expect(sig).toBeTruthy();
    expect(sig.actorId).toBe("op-1");
    expect(sig.reasonCodes).toContain("EXACT_REUSED_HASH");
    expect(sig.evidence.some((e) => /proof refs/i.test(e))).toBe(true);
    expect(sig.relatedProfitLeak).toBe("WEAK_PROOF_REWORK_RISK");
    expect(sig.relatedConstraint).toBe("STAFF");
  });

  it("deterministic reuse drives an attributed REUSED_PROOF credibility concern", () => {
    const a = buildEvidenceCredibility({
      workspaceId: "ws-1", submitters: [], reviewers: [], proofTypes: [],
      itemCounts: { weak: 0, rejected: 0, reused: 0, stale: 0, tamperSuspected: 0 },
      submitterReusedHash: [{ actorId: "op-1", count: 2, proofIds: ["a", "b"] }],
      currentConstraint: "STAFF", evaluatedAt: AT,
    });
    const c = a.findings.find((f) => f.signalType === "REUSED_PROOF")!;
    expect(c).toBeTruthy();
    expect(c.entityType).toBe("SUBMITTER");
    expect(c.entityId).toBe("op-1");
    expect(c.relatedGamingSignal).toBe("REUSED_PROOF_PATTERN");
    expect(c.reasonCodes).toContain("EXACT_REUSED_HASH");
  });
});
