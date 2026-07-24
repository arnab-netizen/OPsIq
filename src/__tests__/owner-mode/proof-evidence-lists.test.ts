/**
 * Per-proof evidence lists for anti-gaming + credibility signals (pure).
 *
 * With proof rows carrying `id`, the aggregation collects per-actor/reviewer/proof-type proof IDs and
 * each signal exposes supportingProofIds + sourceCompleteness=COMPLETE (adjudication-suppressible).
 * Without proof-level ids (aggregate-only stats), the signal stays sourceCompleteness=BLOCKED_BY_DATA
 * with a missing-source note (fail-visible, never suppressed). No fabricated proof IDs.
 */
import { describe, it, expect } from "vitest";
import {
  identifyGamingSignals, aggregateProofEvents,
  type ProofEventRow, type AntiGamingInput, type ReviewerStats,
} from "@/domain/owner-mode/anti-gaming-analytics";
import {
  buildEvidenceCredibility, aggregateCredibility,
  type CredibilityProofRow,
} from "@/domain/owner-mode/evidence-credibility-graph";

const AT = "2026-07-05T00:00:00.000Z";
const NOW = Date.parse(AT);
const inp = (over: Partial<AntiGamingInput> = {}): AntiGamingInput => ({ workspaceId: "ws-1", actors: [], reviewers: [], evaluatedAt: AT, ...over });

const gRow = (over: Partial<ProofEventRow>): ProofEventRow => ({ id: over.id, submittedByUserId: "op-1", reviewedByUserId: null, status: "NEEDS_HUMAN_REVIEW", duplicateFlagged: false, createdAt: new Date(NOW), ...over });
const cRow = (over: Partial<CredibilityProofRow>): CredibilityProofRow => ({ id: over.id, submittedByUserId: "op-1", reviewedByUserId: null, proofType: "photo", status: "NEEDS_HUMAN_REVIEW", duplicateFlagged: false, createdAt: new Date(NOW), reviewedAt: null, ...over });

describe("proof evidence lists — module contract assertions", () => {
  it("identifyGamingSignals is a function", () => { expect(typeof identifyGamingSignals).toBe("function"); });
  it("aggregateProofEvents is a function", () => { expect(typeof aggregateProofEvents).toBe("function"); });
  it("buildEvidenceCredibility is a function", () => { expect(typeof buildEvidenceCredibility).toBe("function"); });
  it("aggregateCredibility is a function", () => { expect(typeof aggregateCredibility).toBe("function"); });
  it("AT is a string", () => { expect(typeof AT).toBe("string"); });
  it("NOW is a number", () => { expect(typeof NOW).toBe("number"); });
  it("inp is a function", () => { expect(typeof inp).toBe("function"); });
  it("gRow is a function", () => { expect(typeof gRow).toBe("function"); });
  it("cRow is a function", () => { expect(typeof cRow).toBe("function"); });
  it("inp() returns an object with workspaceId field", () => { expect(inp()).toHaveProperty("workspaceId"); });
  it("inp().workspaceId is 'ws-1'", () => { expect(inp().workspaceId).toBe("ws-1"); });
  it("aggregateProofEvents([], NOW) returns an object with actors field", () => { expect(aggregateProofEvents([], NOW)).toHaveProperty("actors"); });
  it("aggregateProofEvents([], NOW).actors is an array", () => { expect(Array.isArray(aggregateProofEvents([], NOW).actors)).toBe(true); });
  it("identifyGamingSignals(inp()).signals is an array", () => { expect(Array.isArray(identifyGamingSignals(inp()).signals)).toBe(true); });
});

describe("anti-gaming — per-proof evidence lists", () => {
  it("aggregateProofEvents collects per-actor / per-reviewer proof IDs", () => {
    const { actors, reviewers } = aggregateProofEvents([
      gRow({ id: "p1", status: "NEEDS_HUMAN_REVIEW" }),
      gRow({ id: "p2", status: "REJECTED" }),
      gRow({ id: "p3", submittedByUserId: "mgr", reviewedByUserId: "mgr", status: "ACCEPTED", duplicateFlagged: true }),
    ], NOW);
    expect(actors.find((a) => a.actorId === "op-1")?.weakProofIds).toEqual(["p1"]);
    expect(actors.find((a) => a.actorId === "op-1")?.rejectedProofIds).toEqual(["p2"]);
    expect(reviewers.find((r) => r.reviewerId === "mgr")?.selfReviewProofIds).toEqual(["p3"]);
    expect(reviewers.find((r) => r.reviewerId === "mgr")?.acceptedWeakProofIds).toEqual(["p3"]);
  });

  it("a self-review signal is COMPLETE + carries supporting proof IDs (adjudication-suppressible)", () => {
    const reviewers: ReviewerStats[] = [{ reviewerId: "mgr", accepted: 2, acceptedWeak: 0, selfReviewCount: 2, selfReviewProofIds: ["p1", "p2"] }];
    const sig = identifyGamingSignals(inp({ reviewers })).signals.find((s) => s.signalType === "SELF_REVIEW_ATTEMPT")!;
    expect(sig.supportingProofIds).toEqual(["p1", "p2"]);
    expect(sig.sourceCompleteness).toBe("COMPLETE");
    expect(sig.evidence.some((e) => /proof refs/i.test(e))).toBe(true);
  });

  it("a self-review signal WITHOUT proof-level ids stays fail-visible (BLOCKED_BY_DATA)", () => {
    const reviewers: ReviewerStats[] = [{ reviewerId: "mgr", accepted: 2, acceptedWeak: 0, selfReviewCount: 2 }];
    const sig = identifyGamingSignals(inp({ reviewers })).signals.find((s) => s.signalType === "SELF_REVIEW_ATTEMPT")!;
    expect(sig.supportingProofIds).toBeUndefined();
    expect(sig.sourceCompleteness).toBe("BLOCKED_BY_DATA");
    expect(sig.missingData.length).toBeGreaterThan(0);
  });

  it("a rubber-stamp signal is COMPLETE with reviewer's accepted-weak proof IDs", () => {
    const reviewers: ReviewerStats[] = [{ reviewerId: "mgr", accepted: 3, acceptedWeak: 2, selfReviewCount: 0, acceptedWeakProofIds: ["p1", "p2"] }];
    const sig = identifyGamingSignals(inp({ reviewers })).signals.find((s) => s.signalType === "MANAGER_RUBBER_STAMP")!;
    expect(sig.supportingProofIds).toEqual(["p1", "p2"]);
    expect(sig.sourceCompleteness).toBe("COMPLETE");
  });
});

describe("credibility — per-proof evidence lists", () => {
  it("aggregateCredibility collects per-submitter / per-reviewer / per-type proof IDs", () => {
    const agg = aggregateCredibility([
      cRow({ id: "p1", status: "NEEDS_HUMAN_REVIEW" }),
      cRow({ id: "p2", status: "REJECTED" }),
      cRow({ id: "p3", submittedByUserId: "mgr", reviewedByUserId: "mgr", status: "ACCEPTED", duplicateFlagged: true }),
    ], NOW);
    expect(agg.submitters.find((s) => s.actorId === "op-1")?.unreliableProofIds).toEqual(["p1", "p2"]);
    expect(agg.reviewers.find((r) => r.reviewerId === "mgr")?.selfReviewProofIds).toEqual(["p3"]);
    expect(agg.proofTypes.find((t) => t.proofType === "photo")?.weakOrRejectedProofIds).toEqual(["p1", "p2"]);
  });

  it("a self-review concern is COMPLETE + carries proof IDs; an unreliable-submitter concern too", () => {
    const graph = buildEvidenceCredibility({
      workspaceId: "ws-1",
      submitters: [{ actorId: "op-1", total: 5, accepted: 0, weakOrReviewNeeded: 3, rejected: 1, reused: 1, stale: 0, unreliableProofIds: ["p1", "p2", "p3", "p4", "p5"] }],
      reviewers: [{ reviewerId: "mgr", accepted: 2, acceptedWeak: 0, selfReviewCount: 2, selfReviewProofIds: ["p6", "p7"] }],
      proofTypes: [], itemCounts: { weak: 0, rejected: 0, reused: 0, stale: 0, tamperSuspected: 0 }, evaluatedAt: AT,
    });
    const self = graph.findings.find((f) => f.signalType === "SELF_REVIEW_BLOCKED_OR_ATTEMPTED")!;
    expect(self.supportingProofIds).toEqual(["p6", "p7"]);
    expect(self.sourceCompleteness).toBe("COMPLETE");
    const unrel = graph.findings.find((f) => f.signalType === "UNRELIABLE_SUBMITTER_PATTERN")!;
    expect(unrel.supportingProofIds?.length).toBe(5);
    expect(unrel.sourceCompleteness).toBe("COMPLETE");
  });

  it("an unreliable-submitter concern WITHOUT proof ids stays BLOCKED_BY_DATA", () => {
    const graph = buildEvidenceCredibility({
      workspaceId: "ws-1",
      submitters: [{ actorId: "op-1", total: 5, accepted: 0, weakOrReviewNeeded: 3, rejected: 1, reused: 1, stale: 0 }],
      reviewers: [], proofTypes: [], itemCounts: { weak: 0, rejected: 0, reused: 0, stale: 0, tamperSuspected: 0 }, evaluatedAt: AT,
    });
    const unrel = graph.findings.find((f) => f.signalType === "UNRELIABLE_SUBMITTER_PATTERN")!;
    expect(unrel.supportingProofIds).toBeUndefined();
    expect(unrel.sourceCompleteness).toBe("BLOCKED_BY_DATA");
    expect(unrel.missingData.length).toBeGreaterThan(0);
  });
});
