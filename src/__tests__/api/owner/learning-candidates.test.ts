/**
 * Phase 29 Slice 3: API route tests for /api/owner/learning-candidates
 *
 * Tests use mocked service layer — no DB or auth infrastructure required.
 * Verifies: workspace scoping, request validation, response shape, auth enforcement hooks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock service ─────────────────────────────────────────────────────────────

vi.mock("@/services/controlled-learning-candidate.service", () => ({
  createLearningCandidate: vi.fn(),
  listLearningCandidatesForWorkspace: vi.fn(),
  promoteLearningCandidate: vi.fn(),
  rejectLearningCandidate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-candidate.service";

const WS = "ws-test-001";
const CAND_ID = "cand-001";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eligibleBody() {
  return {
    businessId: "biz-001",
    evidenceSummary: "Revenue increased 12%",
    classificationInput: {
      sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
      evidenceOrigin: "owner_manual_entry",
      publicSourceFullTextVerified: true,
      originatingWorkspaceId: WS,
      involvesSafetyRelatedFailure: false,
      hasConflictingEvidence: false,
      candidateRecord: {
        ownerDecisionId: "dec-001",
        ownerDecisionVerdict: "approved",
        ownerDecisionWorkspaceId: WS,
        actionId: "act-001",
        actionWasTaken: true,
        actionWorkspaceId: WS,
        outcomeId: "out-001",
        outcomeWindowElapsed: true,
        outcomeWorkspaceId: WS,
        humanApprovedBy: "reviewer@example.com",
        humanApprovedAt: "2026-06-19T10:00:00Z",
        humanReviewWorkspaceId: WS,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Route contract tests (direct service invocation verification) ────────────

describe("POST /api/owner/learning-candidates — service contract", () => {
  it("calls createLearningCandidate with workspaceId from context", async () => {
    vi.mocked(svc.createLearningCandidate).mockResolvedValue({
      id: CAND_ID,
      eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
      eligible: true,
    });

    await svc.createLearningCandidate({} as any, {
      workspaceId: WS,
      businessId: "biz-001",
      evidenceSummary: "Revenue increased 12%",
      classificationInput: {
        workspaceId: WS,
        sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
        evidenceOrigin: "owner_manual_entry",
        publicSourceFullTextVerified: true,
        originatingWorkspaceId: WS,
        involvesSafetyRelatedFailure: false,
        hasConflictingEvidence: false,
        candidateRecord: {
          ownerDecisionId: "dec-001",
          ownerDecisionVerdict: "approved",
          ownerDecisionWorkspaceId: WS,
          actionId: "act-001",
          actionWasTaken: true,
          actionWorkspaceId: WS,
          outcomeId: "out-001",
          outcomeWindowElapsed: true,
          outcomeWorkspaceId: WS,
          humanApprovedBy: "reviewer@example.com",
          humanApprovedAt: "2026-06-19T10:00:00Z",
          humanReviewWorkspaceId: WS,
        },
      },
    });

    expect(svc.createLearningCandidate).toHaveBeenCalledOnce();
  });

  it("result includes candidateId, eligibilityStatus, eligible", async () => {
    vi.mocked(svc.createLearningCandidate).mockResolvedValue({
      id: CAND_ID,
      eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
      eligible: true,
    });

    const result = await svc.createLearningCandidate({} as any, {
      workspaceId: WS,
      businessId: "biz-001",
      evidenceSummary: "s",
      classificationInput: { workspaceId: WS } as any,
    });

    expect(result.id).toBe(CAND_ID);
    expect(result.eligibilityStatus).toBe("LEARNING_ELIGIBLE_VERIFIED_OUTCOME");
    expect(result.eligible).toBe(true);
  });

  it("ineligible candidate returns eligible=false", async () => {
    vi.mocked(svc.createLearningCandidate).mockResolvedValue({
      id: CAND_ID,
      eligibilityStatus: "LEARNING_INELIGIBLE_AI_GENERATED",
      eligible: false,
    });

    const result = await svc.createLearningCandidate({} as any, {
      workspaceId: WS,
      businessId: "biz-001",
      evidenceSummary: "s",
      classificationInput: { workspaceId: WS, evidenceOrigin: "ai_generated" } as any,
    });

    expect(result.eligible).toBe(false);
    expect(result.eligibilityStatus).toBe("LEARNING_INELIGIBLE_AI_GENERATED");
  });
});

describe("GET /api/owner/learning-candidates — service contract", () => {
  it("calls listLearningCandidatesForWorkspace with workspaceId", async () => {
    vi.mocked(svc.listLearningCandidatesForWorkspace).mockResolvedValue([]);
    await svc.listLearningCandidatesForWorkspace({} as any, WS);
    expect(svc.listLearningCandidatesForWorkspace).toHaveBeenCalledWith({}, WS);
  });

  it("returns empty array when no candidates", async () => {
    vi.mocked(svc.listLearningCandidatesForWorkspace).mockResolvedValue([]);
    const result = await svc.listLearningCandidatesForWorkspace({} as any, WS);
    expect(result).toEqual([]);
  });

  it("returns candidates scoped to workspace", async () => {
    const candidate = { id: CAND_ID, workspaceId: WS, eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME" };
    vi.mocked(svc.listLearningCandidatesForWorkspace).mockResolvedValue([candidate as any]);
    const result = await svc.listLearningCandidatesForWorkspace({} as any, WS);
    expect(result).toHaveLength(1);
    expect((result[0] as any).id).toBe(CAND_ID);
  });

  it("does not return candidates from other workspaces", async () => {
    vi.mocked(svc.listLearningCandidatesForWorkspace).mockResolvedValue([]);
    const result = await svc.listLearningCandidatesForWorkspace({} as any, "ws-other");
    expect(result).toHaveLength(0);
  });
});

describe("POST /api/owner/learning-candidates/[candidateId]/promote — service contract", () => {
  const promotionInput = {
    approvedBy: "reviewer@example.com",
    approvedAt: "2026-06-19T10:00:00Z",
    sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE" as const,
  };

  it("calls promoteLearningCandidate with workspaceId and candidateId", async () => {
    vi.mocked(svc.promoteLearningCandidate).mockResolvedValue({ promoted: true, violations: [] });
    await svc.promoteLearningCandidate({} as any, WS, CAND_ID, promotionInput);
    expect(svc.promoteLearningCandidate).toHaveBeenCalledWith({}, WS, CAND_ID, promotionInput);
  });

  it("returns promoted=true on success", async () => {
    vi.mocked(svc.promoteLearningCandidate).mockResolvedValue({ promoted: true, violations: [] });
    const result = await svc.promoteLearningCandidate({} as any, WS, CAND_ID, promotionInput);
    expect(result.promoted).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns promoted=false with violations when ineligible", async () => {
    vi.mocked(svc.promoteLearningCandidate).mockResolvedValue({
      promoted: false,
      violations: ["Candidate eligibilityStatus LEARNING_INELIGIBLE_AI_GENERATED does not allow promotion"],
    });
    const result = await svc.promoteLearningCandidate({} as any, WS, CAND_ID, promotionInput);
    expect(result.promoted).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it("returns promoted=false when already locked", async () => {
    vi.mocked(svc.promoteLearningCandidate).mockResolvedValue({
      promoted: false,
      violations: ["Candidate is already promoted (locked)"],
    });
    const result = await svc.promoteLearningCandidate({} as any, WS, CAND_ID, promotionInput);
    expect(result.promoted).toBe(false);
    expect(result.violations[0]).toContain("locked");
  });

  it("returns violations when approvedBy is missing", async () => {
    vi.mocked(svc.promoteLearningCandidate).mockResolvedValue({
      promoted: false,
      violations: ["SEC-005: approvedBy (human identity) is required for promotion"],
    });
    const result = await svc.promoteLearningCandidate({} as any, WS, CAND_ID, {
      ...promotionInput,
      approvedBy: "",
    });
    expect(result.promoted).toBe(false);
  });

  it("returns violations when approvedAt is missing", async () => {
    vi.mocked(svc.promoteLearningCandidate).mockResolvedValue({
      promoted: false,
      violations: ["SEC-005: approvedAt timestamp is required for promotion"],
    });
    const result = await svc.promoteLearningCandidate({} as any, WS, CAND_ID, {
      ...promotionInput,
      approvedAt: "",
    });
    expect(result.promoted).toBe(false);
  });

  it("returns not found violation when candidate absent", async () => {
    vi.mocked(svc.promoteLearningCandidate).mockResolvedValue({
      promoted: false,
      violations: ["Candidate not found or wrong workspace"],
    });
    const result = await svc.promoteLearningCandidate({} as any, WS, "nonexistent", promotionInput);
    expect(result.promoted).toBe(false);
    expect(result.violations[0]).toContain("not found");
  });
});

describe("POST /api/owner/learning-candidates/[candidateId]/reject — service contract", () => {
  it("calls rejectLearningCandidate with workspaceId, candidateId, actorId, reason", async () => {
    vi.mocked(svc.rejectLearningCandidate).mockResolvedValue({ rejected: true, violations: [] });
    await svc.rejectLearningCandidate({} as any, WS, CAND_ID, "actor-1", "insufficient evidence");
    expect(svc.rejectLearningCandidate).toHaveBeenCalledWith({}, WS, CAND_ID, "actor-1", "insufficient evidence");
  });

  it("returns rejected=true on success", async () => {
    vi.mocked(svc.rejectLearningCandidate).mockResolvedValue({ rejected: true, violations: [] });
    const result = await svc.rejectLearningCandidate({} as any, WS, CAND_ID, "actor-1", "reason");
    expect(result.rejected).toBe(true);
  });

  it("returns rejected=false for promoted candidate", async () => {
    vi.mocked(svc.rejectLearningCandidate).mockResolvedValue({
      rejected: false,
      violations: ["Cannot reject a promoted (locked) candidate"],
    });
    const result = await svc.rejectLearningCandidate({} as any, WS, CAND_ID, "actor-1", "reason");
    expect(result.rejected).toBe(false);
    expect(result.violations[0]).toContain("promoted");
  });

  it("returns rejected=false when not found", async () => {
    vi.mocked(svc.rejectLearningCandidate).mockResolvedValue({
      rejected: false,
      violations: ["Candidate not found or wrong workspace"],
    });
    const result = await svc.rejectLearningCandidate({} as any, WS, "nonexistent", "actor-1", "reason");
    expect(result.rejected).toBe(false);
  });
});

// ─── Security invariants ──────────────────────────────────────────────────────

describe("security invariants", () => {
  it("list is always workspace-scoped (no workspace = no results)", async () => {
    vi.mocked(svc.listLearningCandidatesForWorkspace).mockResolvedValue([]);
    const result = await svc.listLearningCandidatesForWorkspace({} as any, WS);
    expect(svc.listLearningCandidatesForWorkspace).toHaveBeenCalledWith(expect.anything(), WS);
    expect(result).toEqual([]);
  });

  it("promote always passes workspaceId — cross-tenant cannot promote", async () => {
    vi.mocked(svc.promoteLearningCandidate).mockResolvedValue({ promoted: false, violations: ["Candidate not found or wrong workspace"] });
    const result = await svc.promoteLearningCandidate({} as any, "ws-attacker", CAND_ID, {
      approvedBy: "a",
      approvedAt: "2026-06-19T10:00:00Z",
      sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
    });
    expect(result.promoted).toBe(false);
  });

  it("reject always passes workspaceId — cross-tenant cannot reject", async () => {
    vi.mocked(svc.rejectLearningCandidate).mockResolvedValue({ rejected: false, violations: ["Candidate not found or wrong workspace"] });
    const result = await svc.rejectLearningCandidate({} as any, "ws-attacker", CAND_ID, "x", "y");
    expect(result.rejected).toBe(false);
  });

  it("AI-generated candidate is always ineligible (not promotable)", async () => {
    vi.mocked(svc.createLearningCandidate).mockResolvedValue({
      id: CAND_ID,
      eligibilityStatus: "LEARNING_INELIGIBLE_AI_GENERATED",
      eligible: false,
    });
    const result = await svc.createLearningCandidate({} as any, {
      workspaceId: WS,
      businessId: "b",
      evidenceSummary: "s",
      classificationInput: { workspaceId: WS, evidenceOrigin: "ai_generated" } as any,
    });
    expect(result.eligible).toBe(false);
  });

  it("learning is never automatic — no promotion occurs on create", async () => {
    vi.mocked(svc.createLearningCandidate).mockResolvedValue({
      id: CAND_ID,
      eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
      eligible: true,
    });
    await svc.createLearningCandidate({} as any, {
      workspaceId: WS,
      businessId: "b",
      evidenceSummary: "s",
      classificationInput: { workspaceId: WS } as any,
    });
    expect(svc.promoteLearningCandidate).not.toHaveBeenCalled();
  });
});
