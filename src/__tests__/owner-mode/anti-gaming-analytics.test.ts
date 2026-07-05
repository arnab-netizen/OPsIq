/**
 * Cross-Event Anti-Gaming Analytics — deterministic cross-event pattern detection with
 * transparent reason codes (no black-box score), honest thresholds (one weak event is not a
 * pattern), missing-data behaviour, and constraint/profit-leak linkage. Pure — no DB.
 */
import { describe, it, expect } from "vitest";
import {
  identifyGamingSignals, aggregateProofEvents,
  type AntiGamingInput, type ActorProofStats, type ReviewerStats, type ProofEventRow,
} from "@/domain/owner-mode/anti-gaming-analytics";

const AT = "2026-07-05T00:00:00.000Z";
const inp = (over: Partial<AntiGamingInput> = {}): AntiGamingInput => ({
  workspaceId: "ws-1", actors: [], reviewers: [], evaluatedAt: AT, ...over,
});
const actor = (over: Partial<ActorProofStats>): ActorProofStats => ({
  actorId: over.actorId ?? "staff-1", totalProofs: over.totalProofs ?? 5, weakOrReviewNeeded: 0,
  rejected: 0, duplicateFlagged: 0, overdue: 0, ...over,
});
const reviewer = (over: Partial<ReviewerStats>): ReviewerStats => ({
  reviewerId: over.reviewerId ?? "mgr-1", accepted: 0, acceptedWeak: 0, selfReviewCount: 0, ...over,
});

const REQUIRED = [
  "workspaceId", "actorId", "actorRole", "signalType", "reasonCodes", "severity", "confidence",
  "evidence", "patternCount", "missingData", "ownerExplanation", "businessImpact",
  "relatedProfitLeak", "relatedConstraint", "recommendedResponse", "ownerActionRequired",
  "managerActionSufficient", "trainingOrProcessRecommendation", "reassessmentTrigger", "evaluatedAt",
];

describe("anti-gaming analytics — detection", () => {
  it("every signal carries the full shape incl. reason codes (no hidden score)", () => {
    const top = identifyGamingSignals(inp({ actors: [actor({ weakOrReviewNeeded: 5 })] })).topSignal!;
    for (const k of REQUIRED) expect(top).toHaveProperty(k);
    expect(top.reasonCodes.length).toBeGreaterThan(0);
    expect(top.evidence.length).toBeGreaterThan(0);
    expect(top).not.toHaveProperty("score"); // no opaque punitive score field
  });

  it("REPEATED_WEAK_PROOF from a staff pattern (>= threshold), not a single event", () => {
    expect(identifyGamingSignals(inp({ actors: [actor({ weakOrReviewNeeded: 1 })] })).topSignal!.signalType).toBe("DATA_INSUFFICIENT");
    const s = identifyGamingSignals(inp({ actors: [actor({ weakOrReviewNeeded: 4 })] })).signals;
    expect(s.some((x) => x.signalType === "REPEATED_WEAK_PROOF")).toBe(true);
  });

  it("REUSED_PROOF_PATTERN from duplicate-flagged proofs", () => {
    const s = identifyGamingSignals(inp({ actors: [actor({ duplicateFlagged: 3 })] })).signals;
    const reused = s.find((x) => x.signalType === "REUSED_PROOF_PATTERN")!;
    expect(reused.reasonCodes).toContain("DUPLICATE_FILE_HASH");
  });

  it("REPEATED_REJECTED_PROOF from repeated rejections", () => {
    const s = identifyGamingSignals(inp({ actors: [actor({ rejected: 3 })] })).signals;
    expect(s.some((x) => x.signalType === "REPEATED_REJECTED_PROOF")).toBe(true);
  });

  it("LATE_COMPLETION_PATTERN from repeated overdue proof", () => {
    const s = identifyGamingSignals(inp({ actors: [actor({ overdue: 5 })] })).signals;
    expect(s.some((x) => x.signalType === "LATE_COMPLETION_PATTERN")).toBe(true);
  });

  it("SELF_REVIEW_ATTEMPT outranks softer signals and requires owner action", () => {
    const top = identifyGamingSignals(inp({
      reviewers: [reviewer({ selfReviewCount: 1 })],
      actors: [actor({ weakOrReviewNeeded: 5 })],
    })).topSignal!;
    expect(top.signalType).toBe("SELF_REVIEW_ATTEMPT");
    expect(top.ownerActionRequired).toBe(true);
    expect(top.managerActionSufficient).toBe(false);
  });

  it("MANAGER_RUBBER_STAMP from repeated weak/duplicate acceptances, linked to a quality leak", () => {
    const top = identifyGamingSignals(inp({
      reviewers: [reviewer({ acceptedWeak: 3 })],
      topProfitLeakType: "REWORK_REDO_COST", currentConstraint: "QUALITY",
    })).topSignal!;
    expect(top.signalType).toBe("MANAGER_RUBBER_STAMP");
    expect(top.relatedProfitLeak).toBe("REWORK_REDO_COST");
    expect(top.relatedConstraint).toBe("QUALITY");
  });

  it("OWNER_REVIEW_BURDEN_CREATED_BY_STAFF links to the owner-bottleneck leak", () => {
    const s = identifyGamingSignals(inp({ actors: [actor({ weakOrReviewNeeded: 4 })] })).signals;
    const burden = s.find((x) => x.signalType === "OWNER_REVIEW_BURDEN_CREATED_BY_STAFF")!;
    expect(burden.relatedProfitLeak).toBe("OWNER_BOTTLENECK_COST");
  });

  it("DATA_INSUFFICIENT with exact missing data when no pattern crosses threshold", () => {
    const top = identifyGamingSignals(inp({ missingSources: ["complaint↔proof linkage not persisted"] })).topSignal!;
    expect(top.signalType).toBe("DATA_INSUFFICIENT");
    expect(top.confidence).toBe("NEEDS_DATA");
    expect(top.missingData).toContain("complaint↔proof linkage not persisted");
  });

  it("top signal is deterministic and explainable", () => {
    const i = inp({ reviewers: [reviewer({ selfReviewCount: 2 })], actors: [actor({ duplicateFlagged: 3 })] });
    const a = identifyGamingSignals(i).topSignal!;
    const b = identifyGamingSignals(i).topSignal!;
    expect(a.signalType).toBe(b.signalType);
    expect(a.signalScore).toBe(b.signalScore);
  });

  it("echoes caller workspaceId (pure fn — no cross-workspace bleed)", () => {
    const top = identifyGamingSignals(inp({ workspaceId: "ws-XYZ", actors: [actor({ weakOrReviewNeeded: 5 })] })).topSignal!;
    expect(top.workspaceId).toBe("ws-XYZ");
  });
});

describe("anti-gaming analytics — proof-event aggregation", () => {
  const row = (over: Partial<ProofEventRow>): ProofEventRow => ({
    submittedByUserId: over.submittedByUserId ?? "s1", reviewedByUserId: over.reviewedByUserId ?? null,
    status: over.status ?? "SUBMITTED", duplicateFlagged: over.duplicateFlagged ?? false,
    createdAt: over.createdAt ?? new Date("2026-07-05T00:00:00Z"),
  });
  const NOW = new Date("2026-07-05T00:00:00Z").getTime();

  it("turns raw rows into per-actor / per-reviewer counts", () => {
    const { actors, reviewers } = aggregateProofEvents([
      row({ submittedByUserId: "s1", status: "NEEDS_HUMAN_REVIEW" }),
      row({ submittedByUserId: "s1", status: "AI_PRECHECK_FAILED" }),
      row({ submittedByUserId: "s1", status: "REJECTED" }),
      row({ submittedByUserId: "s1", duplicateFlagged: true, status: "SUBMITTED" }),
      row({ submittedByUserId: "s2", reviewedByUserId: "s2", status: "ACCEPTED", duplicateFlagged: true }),
      row({ submittedByUserId: "s3", status: "PENDING_SUBMISSION", createdAt: new Date("2026-06-01T00:00:00Z") }),
    ], NOW);
    const s1 = actors.find((a) => a.actorId === "s1")!;
    expect(s1.weakOrReviewNeeded).toBe(2);
    expect(s1.rejected).toBe(1);
    expect(s1.duplicateFlagged).toBe(1);
    const s3 = actors.find((a) => a.actorId === "s3")!;
    expect(s3.overdue).toBe(1);
    const rev = reviewers.find((r) => r.reviewerId === "s2")!;
    expect(rev.selfReviewCount).toBe(1); // reviewer === submitter
    expect(rev.acceptedWeak).toBe(1);
  });
});
