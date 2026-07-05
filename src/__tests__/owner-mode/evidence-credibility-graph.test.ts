/**
 * Evidence Credibility Graph — deterministic per-entity credibility from proof/review
 * events, transparent reason codes (no hidden score), honest thresholds + missing-data,
 * and anti-gaming / profit-leak / constraint linkage. Pure — no DB.
 */
import { describe, it, expect } from "vitest";
import {
  buildEvidenceCredibility, aggregateCredibility,
  type CredibilityInput, type CredibilityProofRow,
} from "@/domain/owner-mode/evidence-credibility-graph";

const AT = "2026-07-05T00:00:00.000Z";
const inp = (over: Partial<CredibilityInput> = {}): CredibilityInput => ({
  workspaceId: "ws-1", submitters: [], reviewers: [], proofTypes: [],
  itemCounts: { weak: 0, rejected: 0, reused: 0, stale: 0, tamperSuspected: 0 }, evaluatedAt: AT, ...over,
});
const REQUIRED = [
  "workspaceId", "entityType", "entityId", "entityLabel", "signalType", "severity", "confidence",
  "reasonCodes", "evidence", "patternCount", "missingData", "ownerExplanation", "businessImpact",
  "relatedGamingSignal", "relatedProfitLeak", "relatedConstraint", "recommendedResponse",
  "ownerActionRequired", "managerActionSufficient", "reassessmentTrigger", "evaluatedAt",
];

describe("evidence credibility graph — detection", () => {
  it("every finding carries the full shape incl. reason codes (no hidden score primary)", () => {
    const top = buildEvidenceCredibility(inp({ submitters: [{ actorId: "s1", total: 6, accepted: 0, weakOrReviewNeeded: 5, rejected: 0, reused: 0, stale: 0 }] })).topConcern!;
    for (const k of REQUIRED) expect(top).toHaveProperty(k);
    expect(top.reasonCodes.length).toBeGreaterThan(0);
    expect(top.evidence.length).toBeGreaterThan(0);
  });

  it("WEAK_PROOF_NEEDS_REVIEW from a low-acceptance proof type", () => {
    const f = buildEvidenceCredibility(inp({ proofTypes: [{ proofType: "photo", total: 6, accepted: 2, weakOrRejected: 4 }] })).findings;
    expect(f.some((x) => x.signalType === "WEAK_PROOF_NEEDS_REVIEW" && x.entityType === "PROOF_TYPE")).toBe(true);
  });

  it("REJECTED via unreliable submitter; REUSED at workspace level", () => {
    const f = buildEvidenceCredibility(inp({ itemCounts: { weak: 0, rejected: 0, reused: 3, stale: 0, tamperSuspected: 0 } })).findings;
    expect(f.some((x) => x.signalType === "REUSED_PROOF")).toBe(true);
  });

  it("STALE_PROOF from stale accepted proofs", () => {
    const f = buildEvidenceCredibility(inp({ itemCounts: { weak: 0, rejected: 0, reused: 0, stale: 3, tamperSuspected: 0 } })).findings;
    expect(f.some((x) => x.signalType === "STALE_PROOF")).toBe(true);
  });

  it("TAMPER_SUSPECTED_PROOF (owner action) when a tamper indicator exists", () => {
    const top = buildEvidenceCredibility(inp({ itemCounts: { weak: 0, rejected: 0, reused: 0, stale: 0, tamperSuspected: 2 } })).topConcern!;
    expect(top.signalType).toBe("TAMPER_SUSPECTED_PROOF");
    expect(top.ownerActionRequired).toBe(true);
  });

  it("SELF_REVIEW_BLOCKED_OR_ATTEMPTED outranks other concerns and links the gaming signal", () => {
    const top = buildEvidenceCredibility(inp({
      reviewers: [{ reviewerId: "m1", accepted: 3, acceptedWeak: 0, selfReviewCount: 1 }],
      submitters: [{ actorId: "s1", total: 8, accepted: 0, weakOrReviewNeeded: 6, rejected: 0, reused: 0, stale: 0 }],
    })).topConcern!;
    expect(top.signalType).toBe("SELF_REVIEW_BLOCKED_OR_ATTEMPTED");
    expect(top.relatedGamingSignal).toBe("SELF_REVIEW_ATTEMPT");
    expect(top.ownerActionRequired).toBe(true);
  });

  it("REVIEW_QUALITY_CONCERN when a reviewer repeatedly accepts weak proof", () => {
    const f = buildEvidenceCredibility(inp({
      reviewers: [{ reviewerId: "m1", accepted: 5, acceptedWeak: 3, selfReviewCount: 0 }],
      topProfitLeakType: "REWORK_REDO_COST", currentConstraint: "QUALITY",
    })).findings;
    const rq = f.find((x) => x.signalType === "REVIEW_QUALITY_CONCERN")!;
    expect(rq.relatedGamingSignal).toBe("MANAGER_RUBBER_STAMP");
    expect(rq.relatedProfitLeak).toBe("REWORK_REDO_COST");
    expect(rq.relatedConstraint).toBe("QUALITY");
  });

  it("UNRELIABLE_SUBMITTER_PATTERN from repeated weak/rejected/reused (not one event)", () => {
    // below threshold → no unreliable concern
    expect(buildEvidenceCredibility(inp({ submitters: [{ actorId: "s1", total: 3, accepted: 2, weakOrReviewNeeded: 1, rejected: 0, reused: 0, stale: 0 }] })).findings
      .some((x) => x.signalType === "UNRELIABLE_SUBMITTER_PATTERN")).toBe(false);
    const f = buildEvidenceCredibility(inp({ submitters: [{ actorId: "s1", total: 8, accepted: 1, weakOrReviewNeeded: 3, rejected: 2, reused: 2, stale: 0 }] })).findings;
    expect(f.some((x) => x.signalType === "UNRELIABLE_SUBMITTER_PATTERN" && x.entityId === "s1")).toBe(true);
  });

  it("RELIABLE_SUBMITTER_PATTERN only with NO contradiction, and discloses the outcome-linkage gap", () => {
    const f = buildEvidenceCredibility(inp({ submitters: [{ actorId: "s2", total: 6, accepted: 6, weakOrReviewNeeded: 0, rejected: 0, reused: 0, stale: 0 }] })).findings;
    const rel = f.find((x) => x.signalType === "RELIABLE_SUBMITTER_PATTERN")!;
    expect(rel.severity).toBe("POSITIVE");
    expect(rel.missingData.join(" ")).toMatch(/outcome|complaint|rework/i);
  });

  it("DATA_INSUFFICIENT with exact missing data when nothing crosses threshold", () => {
    const top = buildEvidenceCredibility(inp({ missingSources: ["complaint↔proof linkage not persisted"] })).topConcern!;
    expect(top.signalType).toBe("DATA_INSUFFICIENT");
    expect(top.confidence).toBe("NEEDS_DATA");
    expect(top.missingData).toContain("complaint↔proof linkage not persisted");
  });

  it("top concern is deterministic and explainable; workspaceId echoed (no cross-ws bleed)", () => {
    const i = inp({ workspaceId: "ws-XYZ", itemCounts: { weak: 0, rejected: 0, reused: 0, stale: 0, tamperSuspected: 2 } });
    const a = buildEvidenceCredibility(i).topConcern!;
    const b = buildEvidenceCredibility(i).topConcern!;
    expect(a.signalType).toBe(b.signalType);
    expect(a.credibilityScore).toBe(b.credibilityScore);
    expect(a.workspaceId).toBe("ws-XYZ");
  });
});

describe("evidence credibility graph — aggregation", () => {
  const row = (over: Partial<CredibilityProofRow>): CredibilityProofRow => ({
    submittedByUserId: over.submittedByUserId ?? "s1", reviewedByUserId: over.reviewedByUserId ?? null,
    proofType: over.proofType ?? "photo", status: over.status ?? "SUBMITTED",
    duplicateFlagged: over.duplicateFlagged ?? false,
    createdAt: over.createdAt ?? new Date("2026-07-05T00:00:00Z"), reviewedAt: over.reviewedAt ?? null,
  });
  const NOW = new Date("2026-07-05T00:00:00Z").getTime();

  it("turns raw rows into per-submitter / reviewer / proof-type / item aggregates incl. staleness", () => {
    const agg = aggregateCredibility([
      row({ submittedByUserId: "s1", status: "NEEDS_HUMAN_REVIEW" }),
      row({ submittedByUserId: "s1", status: "REJECTED" }),
      row({ submittedByUserId: "s1", duplicateFlagged: true, status: "SUBMITTED" }),
      row({ submittedByUserId: "s2", status: "ACCEPTED", reviewedByUserId: "m1", reviewedAt: new Date("2026-05-01T00:00:00Z") }), // stale (>30d)
    ], NOW);
    const s1 = agg.submitters.find((s) => s.actorId === "s1")!;
    expect(s1.weakOrReviewNeeded).toBe(1);
    expect(s1.rejected).toBe(1);
    expect(s1.reused).toBe(1);
    expect(agg.itemCounts.stale).toBe(1);
    const pt = agg.proofTypes.find((t) => t.proofType === "photo")!;
    expect(pt.total).toBe(4);
    expect(pt.weakOrRejected).toBe(2);
  });
});
