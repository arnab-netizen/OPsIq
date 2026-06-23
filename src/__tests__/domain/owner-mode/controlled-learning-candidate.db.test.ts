/**
 * Phase 29 Slice 2: DB/runtime tests for controlled-learning-candidate.service.ts
 * Uses mock PrismaClient — no real DB connection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createLearningCandidate,
  classifyAndCreateLearningCandidate,
  getLearningCandidate,
  listLearningCandidatesForWorkspace,
  promoteLearningCandidate,
  rejectLearningCandidate,
  assertCandidateImmutableInDB,
  buildLearningCandidateAuditEntry,
} from "../../../services/controlled-learning-candidate.service";
import type { ControlledLearningCandidateInput } from "../../../domain/owner-mode/controlled-learning";

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockAuditCreate = vi.fn();

const mockPrisma = {
  controlledLearningCandidate: {
    create: mockCreate,
    findFirst: mockFindFirst,
    findMany: mockFindMany,
    update: mockUpdate,
  },
  controlledLearningCandidateAuditEntry: {
    create: mockAuditCreate,
  },
} as any;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = "workspace-001";
const BIZ = "biz-001";

function makeEligibleInput(overrides: Partial<ControlledLearningCandidateInput> = {}): ControlledLearningCandidateInput {
  return {
    workspaceId: WS,
    sourceLabel: "HUMAN_VERIFIED_CANDIDATE",
    evidenceOrigin: "owner_manual_entry",
    publicSourceFullTextVerified: false,
    originatingWorkspaceId: WS,
    involvesSafetyRelatedFailure: false,
    hasConflictingEvidence: false,
    candidateRecord: {
      ownerDecisionId: "dec-1",
      ownerDecisionVerdict: "approved",
      ownerDecisionWorkspaceId: WS,
      actionId: "act-1",
      actionWasTaken: true,
      actionWorkspaceId: WS,
      outcomeId: "out-1",
      outcomeWindowElapsed: true,
      outcomeWorkspaceId: WS,
      humanApprovedBy: "alice",
      humanApprovedAt: "2026-06-01T00:00:00Z",
      humanReviewWorkspaceId: WS,
    },
    ...overrides,
  };
}

function makeCreateInput(classificationOverrides: Partial<ControlledLearningCandidateInput> = {}) {
  return {
    workspaceId: WS,
    businessId: BIZ,
    evidenceSummary: "Test summary",
    classificationInput: makeEligibleInput(classificationOverrides),
  };
}

function makeCandidateRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    workspaceId: WS,
    eligibilityStatus: "LEARNING_ELIGIBLE_HUMAN_REVIEWED",
    promotionLocked: false,
    ...overrides,
  };
}

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockCreate.mockResolvedValue(makeCandidateRecord());
  mockFindFirst.mockResolvedValue(null);
  mockFindMany.mockResolvedValue([]);
  mockUpdate.mockResolvedValue(makeCandidateRecord({ promotionLocked: true }));
  mockAuditCreate.mockResolvedValue({ id: "audit-1" });
});

// ─── createLearningCandidate ──────────────────────────────────────────────────

describe("createLearningCandidate", () => {
  it("persists an eligible candidate with SUBMITTED audit", async () => {
    const result = await createLearningCandidate(mockPrisma, makeCreateInput());
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockAuditCreate).toHaveBeenCalledOnce();
    expect(result.eligible).toBe(true);
  });

  it("stores REJECTED status for ai_generated evidence", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_AI_GENERATED" }));
    const result = await createLearningCandidate(mockPrisma, makeCreateInput({ evidenceOrigin: "ai_generated" }));
    expect(result.eligible).toBe(false);
    expect(result.eligibilityStatus).toBe("LEARNING_INELIGIBLE_AI_GENERATED");
  });

  it("stores REJECTED status for synthetic_benchmark evidence", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_SYNTHETIC" }));
    const result = await createLearningCandidate(mockPrisma, makeCreateInput({ evidenceOrigin: "synthetic_benchmark" }));
    expect(result.eligible).toBe(false);
    expect(result.eligibilityStatus).toBe("LEARNING_INELIGIBLE_SYNTHETIC");
  });

  it("stores REJECTED status for search_snippet_only evidence", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED" }));
    const result = await createLearningCandidate(mockPrisma, makeCreateInput({ evidenceOrigin: "search_snippet_only" }));
    expect(result.eligible).toBe(false);
  });

  it("stores REJECTED status when owner decision verdict is not approved", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_NO_OWNER_DECISION" }));
    const input = makeCreateInput({
      candidateRecord: {
        ...makeEligibleInput().candidateRecord,
        ownerDecisionVerdict: "rejected",
      },
    });
    const result = await createLearningCandidate(mockPrisma, input);
    expect(result.eligible).toBe(false);
  });

  it("stores REJECTED status when actionWasTaken is false", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_NO_ACTION_TAKEN" }));
    const input = makeCreateInput({
      candidateRecord: {
        ...makeEligibleInput().candidateRecord,
        actionWasTaken: false,
      },
    });
    const result = await createLearningCandidate(mockPrisma, input);
    expect(result.eligible).toBe(false);
  });

  it("stores REJECTED status when outcomeWindowElapsed is false", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_NO_OUTCOME_WINDOW" }));
    const input = makeCreateInput({
      candidateRecord: {
        ...makeEligibleInput().candidateRecord,
        outcomeWindowElapsed: false,
      },
    });
    const result = await createLearningCandidate(mockPrisma, input);
    expect(result.eligible).toBe(false);
  });

  it("returns REJECTED for cross-tenant origin", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_CROSS_TENANT" }));
    const input = makeCreateInput({ originatingWorkspaceId: "other-workspace" });
    const result = await createLearningCandidate(mockPrisma, input);
    expect(result.eligible).toBe(false);
    expect(result.eligibilityStatus).toBe("LEARNING_INELIGIBLE_CROSS_TENANT");
  });

  it("throws when classificationInput.workspaceId does not match input.workspaceId", async () => {
    const input = {
      workspaceId: WS,
      businessId: BIZ,
      evidenceSummary: "summary",
      classificationInput: makeEligibleInput({ workspaceId: "other-ws" }),
    };
    await expect(createLearningCandidate(mockPrisma, input)).rejects.toThrow("Cross-tenant violation");
  });

  it("writes an audit entry on candidate creation", async () => {
    await createLearningCandidate(mockPrisma, makeCreateInput());
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: WS, action: expect.stringMatching(/SUBMITTED|REJECTED/) }),
      })
    );
  });

  it("computes fingerprint from workspaceId + ownerDecisionId + actionId + outcomeId", async () => {
    await createLearningCandidate(mockPrisma, makeCreateInput());
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.auditFingerprint).toBe("workspace-001::dec-1::act-1::out-1");
  });

  it("throws when workspaceId is empty", async () => {
    const input = { ...makeCreateInput(), workspaceId: "" };
    await expect(createLearningCandidate(mockPrisma, input)).rejects.toThrow();
  });

  it("persists sourceRecommendationId when provided", async () => {
    const input = { ...makeCreateInput(), sourceRecommendationId: "rec-99" };
    await createLearningCandidate(mockPrisma, input);
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.sourceRecommendationId).toBe("rec-99");
  });

  it("persists null sourceRecommendationId when not provided", async () => {
    await createLearningCandidate(mockPrisma, makeCreateInput());
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.sourceRecommendationId).toBeNull();
  });

  it("serializes metadata as JSON string", async () => {
    const input = { ...makeCreateInput(), metadata: { foo: "bar" } };
    await createLearningCandidate(mockPrisma, input);
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.metadata).toBe(JSON.stringify({ foo: "bar" }));
  });

  it("serializes empty metadata when not provided", async () => {
    await createLearningCandidate(mockPrisma, makeCreateInput());
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.metadata).toBe("{}");
  });

  it("writes REJECTED audit for ineligible candidate", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_AI_GENERATED" }));
    await createLearningCandidate(mockPrisma, makeCreateInput({ evidenceOrigin: "ai_generated" }));
    const auditCall = mockAuditCreate.mock.calls[0][0];
    expect(auditCall.data.action).toBe("REJECTED");
  });

  it("writes SUBMITTED audit for eligible candidate", async () => {
    await createLearningCandidate(mockPrisma, makeCreateInput());
    const auditCall = mockAuditCreate.mock.calls[0][0];
    expect(auditCall.data.action).toBe("SUBMITTED");
  });
});

// ─── classifyAndCreateLearningCandidate ──────────────────────────────────────

describe("classifyAndCreateLearningCandidate", () => {
  it("delegates to createLearningCandidate and returns same result", async () => {
    const result = await classifyAndCreateLearningCandidate(mockPrisma, makeCreateInput());
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.eligible).toBe(true);
  });

  it("writes audit entry via delegation", async () => {
    await classifyAndCreateLearningCandidate(mockPrisma, makeCreateInput());
    expect(mockAuditCreate).toHaveBeenCalledOnce();
  });
});

// ─── getLearningCandidate ─────────────────────────────────────────────────────

describe("getLearningCandidate", () => {
  it("returns candidate when found", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord());
    const result = await getLearningCandidate(mockPrisma, WS, "cand-1");
    expect(result).toMatchObject({ id: "cand-1", workspaceId: WS });
  });

  it("returns null when candidate not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await getLearningCandidate(mockPrisma, WS, "missing");
    expect(result).toBeNull();
  });

  it("passes workspaceId filter to findFirst", async () => {
    await getLearningCandidate(mockPrisma, WS, "cand-1");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) })
    );
  });

  it("throws when workspaceId is empty", async () => {
    await expect(getLearningCandidate(mockPrisma, "", "cand-1")).rejects.toThrow();
  });
});

// ─── listLearningCandidatesForWorkspace ───────────────────────────────────────

describe("listLearningCandidatesForWorkspace", () => {
  it("calls findMany with workspaceId filter", async () => {
    await listLearningCandidatesForWorkspace(mockPrisma, WS);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS } })
    );
  });

  it("returns empty array when no candidates exist", async () => {
    const result = await listLearningCandidatesForWorkspace(mockPrisma, WS);
    expect(result).toEqual([]);
  });

  it("returns list of candidates when they exist", async () => {
    mockFindMany.mockResolvedValue([makeCandidateRecord(), makeCandidateRecord({ id: "cand-2" })]);
    const result = await listLearningCandidatesForWorkspace(mockPrisma, WS);
    expect(result).toHaveLength(2);
  });

  it("throws when workspaceId is empty", async () => {
    await expect(listLearningCandidatesForWorkspace(mockPrisma, "")).rejects.toThrow();
  });
});

// ─── promoteLearningCandidate ─────────────────────────────────────────────────

describe("promoteLearningCandidate", () => {
  const promotionInput = {
    approvedBy: "alice",
    approvedAt: "2026-06-19T00:00:00Z",
    sourceLabel: "HUMAN_VERIFIED_CANDIDATE" as const,
  };

  it("promotes eligible candidate and sets promotionLocked=true", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord());
    const result = await promoteLearningCandidate(mockPrisma, WS, "cand-1", promotionInput);
    expect(result.promoted).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ promotionLocked: true }) })
    );
  });

  it("fails when candidate is already locked", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord({ promotionLocked: true }));
    const result = await promoteLearningCandidate(mockPrisma, WS, "cand-1", promotionInput);
    expect(result.promoted).toBe(false);
    expect(result.violations[0]).toMatch(/already promoted/);
  });

  it("fails when eligibilityStatus does not allow promotion", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_AI_GENERATED" }));
    const result = await promoteLearningCandidate(mockPrisma, WS, "cand-1", promotionInput);
    expect(result.promoted).toBe(false);
  });

  it("fails when approvedBy is missing", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord());
    const result = await promoteLearningCandidate(mockPrisma, WS, "cand-1", {
      ...promotionInput,
      approvedBy: "",
    });
    expect(result.promoted).toBe(false);
    expect(result.violations.some((v) => v.includes("approvedBy"))).toBe(true);
  });

  it("fails when approvedAt is missing", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord());
    const result = await promoteLearningCandidate(mockPrisma, WS, "cand-1", {
      ...promotionInput,
      approvedAt: "",
    });
    expect(result.promoted).toBe(false);
    expect(result.violations.some((v) => v.includes("approvedAt"))).toBe(true);
  });

  it("throws when workspaceId is empty", async () => {
    await expect(promoteLearningCandidate(mockPrisma, "", "cand-1", promotionInput)).rejects.toThrow();
  });

  it("returns not promoted when candidate not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await promoteLearningCandidate(mockPrisma, WS, "missing", promotionInput);
    expect(result.promoted).toBe(false);
    expect(result.violations[0]).toMatch(/not found/);
  });

  it("writes PROMOTED audit entry on success", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord());
    await promoteLearningCandidate(mockPrisma, WS, "cand-1", promotionInput);
    const auditCall = mockAuditCreate.mock.calls[0][0];
    expect(auditCall.data.action).toBe("PROMOTED");
  });

  it("does not call update when candidate not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    await promoteLearningCandidate(mockPrisma, WS, "missing", promotionInput);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("sets humanReviewed=true and reviewerId on promotion", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord());
    await promoteLearningCandidate(mockPrisma, WS, "cand-1", promotionInput);
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.humanReviewed).toBe(true);
    expect(updateCall.data.reviewerId).toBe("alice");
  });
});

// ─── rejectLearningCandidate ──────────────────────────────────────────────────

describe("rejectLearningCandidate", () => {
  it("rejects a non-promoted candidate successfully", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord());
    const result = await rejectLearningCandidate(mockPrisma, WS, "cand-1", "admin", "Insufficient evidence");
    expect(result.rejected).toBe(true);
  });

  it("fails to reject a promoted (locked) candidate", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord({ promotionLocked: true }));
    const result = await rejectLearningCandidate(mockPrisma, WS, "cand-1", "admin", "reason");
    expect(result.rejected).toBe(false);
    expect(result.violations[0]).toMatch(/promoted/);
  });

  it("returns not rejected when candidate not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await rejectLearningCandidate(mockPrisma, WS, "missing", "admin", "reason");
    expect(result.rejected).toBe(false);
    expect(result.violations[0]).toMatch(/not found/);
  });

  it("throws when workspaceId is empty", async () => {
    await expect(rejectLearningCandidate(mockPrisma, "", "cand-1", "admin", "reason")).rejects.toThrow();
  });

  it("writes REJECTED audit entry", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord());
    await rejectLearningCandidate(mockPrisma, WS, "cand-1", "admin", "Bad data");
    const auditCall = mockAuditCreate.mock.calls[0][0];
    expect(auditCall.data.action).toBe("REJECTED");
    expect(auditCall.data.detail).toBe("Bad data");
  });

  it("accepts null actorId for system-initiated rejections", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord());
    const result = await rejectLearningCandidate(mockPrisma, WS, "cand-1", null, "System rule triggered");
    expect(result.rejected).toBe(true);
    const auditCall = mockAuditCreate.mock.calls[0][0];
    expect(auditCall.data.actorId).toBeNull();
  });
});

// ─── assertCandidateImmutableInDB ─────────────────────────────────────────────

describe("assertCandidateImmutableInDB", () => {
  it("throws when promoted candidate status would be changed", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME" }));
    await expect(
      assertCandidateImmutableInDB(mockPrisma, WS, "cand-1", "LEARNING_INELIGIBLE_UNVERIFIED")
    ).rejects.toThrow(/Append-only violation/);
  });

  it("does not throw when candidate not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      assertCandidateImmutableInDB(mockPrisma, WS, "missing", "LEARNING_INELIGIBLE_UNVERIFIED")
    ).resolves.toBeUndefined();
  });

  it("does not throw for non-promoted status", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_UNVERIFIED" }));
    await expect(
      assertCandidateImmutableInDB(mockPrisma, WS, "cand-1", "LEARNING_ELIGIBLE_HUMAN_REVIEWED")
    ).resolves.toBeUndefined();
  });

  it("throws when LEARNING_ELIGIBLE_HUMAN_REVIEWED candidate is mutated to different status", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_ELIGIBLE_HUMAN_REVIEWED" }));
    await expect(
      assertCandidateImmutableInDB(mockPrisma, WS, "cand-1", "LEARNING_INELIGIBLE_SYNTHETIC")
    ).rejects.toThrow(/Append-only violation/);
  });

  it("does not throw when status remains LEARNING_ELIGIBLE_VERIFIED_OUTCOME unchanged", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME" }));
    await expect(
      assertCandidateImmutableInDB(mockPrisma, WS, "cand-1", "LEARNING_ELIGIBLE_VERIFIED_OUTCOME")
    ).resolves.toBeUndefined();
  });

  it("throws when workspaceId is empty", async () => {
    await expect(
      assertCandidateImmutableInDB(mockPrisma, "", "cand-1", "LEARNING_ELIGIBLE_HUMAN_REVIEWED")
    ).rejects.toThrow();
  });
});

// ─── buildLearningCandidateAuditEntry ────────────────────────────────────────

describe("buildLearningCandidateAuditEntry", () => {
  const now = "2026-06-19T12:00:00Z";

  it("returns correct audit entry structure", () => {
    const entry = buildLearningCandidateAuditEntry(WS, "cand-1", "SUBMITTED", "alice", "Created", now);
    expect(entry).toEqual({
      workspaceId: WS,
      candidateId: "cand-1",
      action: "SUBMITTED",
      actorId: "alice",
      detail: "Created",
      timestamp: now,
    });
  });

  it("throws on empty candidateId", () => {
    expect(() =>
      buildLearningCandidateAuditEntry(WS, "", "SUBMITTED", null, "detail", now)
    ).toThrow("candidateId is required");
  });

  it("throws on empty detail", () => {
    expect(() =>
      buildLearningCandidateAuditEntry(WS, "cand-1", "SUBMITTED", null, "", now)
    ).toThrow("detail is required");
  });

  it("throws on empty timestamp", () => {
    expect(() =>
      buildLearningCandidateAuditEntry(WS, "cand-1", "SUBMITTED", null, "detail", "")
    ).toThrow("timestamp is required");
  });

  it("accepts null actorId", () => {
    const entry = buildLearningCandidateAuditEntry(WS, "cand-1", "REJECTED", null, "System rejection", now);
    expect(entry.actorId).toBeNull();
  });

  it("accepts PROMOTED action", () => {
    const entry = buildLearningCandidateAuditEntry(WS, "cand-1", "PROMOTED", "admin", "Promoted", now);
    expect(entry.action).toBe("PROMOTED");
  });

  it("accepts HUMAN_APPROVED action", () => {
    const entry = buildLearningCandidateAuditEntry(WS, "cand-1", "HUMAN_APPROVED", "admin", "Approved", now);
    expect(entry.action).toBe("HUMAN_APPROVED");
  });

  it("throws when workspaceId is empty", () => {
    expect(() =>
      buildLearningCandidateAuditEntry("", "cand-1", "SUBMITTED", null, "detail", now)
    ).toThrow();
  });

  it("preserves exact timestamp string", () => {
    const ts = "2026-06-19T15:30:00.000Z";
    const entry = buildLearningCandidateAuditEntry(WS, "cand-1", "SUBMITTED", "alice", "detail", ts);
    expect(entry.timestamp).toBe(ts);
  });

  it("returns different actorId per call", () => {
    const e1 = buildLearningCandidateAuditEntry(WS, "cand-1", "SUBMITTED", "alice", "detail", now);
    const e2 = buildLearningCandidateAuditEntry(WS, "cand-1", "SUBMITTED", "bob", "detail", now);
    expect(e1.actorId).toBe("alice");
    expect(e2.actorId).toBe("bob");
  });
});

// ─── Additional edge case tests ───────────────────────────────────────────────

describe("edge cases", () => {
  it("createLearningCandidate: safety-related failure yields REJECTED", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_SAFETY_RELATED" }));
    const input = makeCreateInput({ involvesSafetyRelatedFailure: true });
    const result = await createLearningCandidate(mockPrisma, input);
    expect(result.eligible).toBe(false);
    expect(result.eligibilityStatus).toBe("LEARNING_INELIGIBLE_SAFETY_RELATED");
  });

  it("createLearningCandidate: conflicting evidence yields REJECTED", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_CONFLICTING_EVIDENCE" }));
    const input = makeCreateInput({ hasConflictingEvidence: true });
    const result = await createLearningCandidate(mockPrisma, input);
    expect(result.eligible).toBe(false);
  });

  it("createLearningCandidate: REAL_SOURCE_BACKED_CANDIDATE without full-text verification yields REJECTED", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED" }));
    const input = makeCreateInput({
      sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
      publicSourceFullTextVerified: false,
    });
    const result = await createLearningCandidate(mockPrisma, input);
    expect(result.eligible).toBe(false);
  });

  it("createLearningCandidate: REAL_SOURCE_BACKED_CANDIDATE with full-text verification is ELIGIBLE", async () => {
    mockCreate.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME" }));
    const input = makeCreateInput({
      sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
      publicSourceFullTextVerified: true,
    });
    const result = await createLearningCandidate(mockPrisma, input);
    expect(result.eligibilityStatus).toBe("LEARNING_ELIGIBLE_VERIFIED_OUTCOME");
  });

  it("listLearningCandidatesForWorkspace: orders by createdAt desc", async () => {
    await listLearningCandidatesForWorkspace(mockPrisma, WS);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });

  it("promoteLearningCandidate: LEARNING_ELIGIBLE_VERIFIED_OUTCOME allows promotion", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord({ eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME" }));
    const result = await promoteLearningCandidate(mockPrisma, WS, "cand-1", {
      approvedBy: "alice",
      approvedAt: "2026-06-19T00:00:00Z",
      sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
    });
    expect(result.promoted).toBe(true);
  });

  it("rejectLearningCandidate: writes actorId to audit entry", async () => {
    mockFindFirst.mockResolvedValue(makeCandidateRecord());
    await rejectLearningCandidate(mockPrisma, WS, "cand-1", "manager", "Policy violation");
    const auditCall = mockAuditCreate.mock.calls[0][0];
    expect(auditCall.data.actorId).toBe("manager");
  });

  it("assertCandidateImmutableInDB: passes workspaceId to findFirst", async () => {
    mockFindFirst.mockResolvedValue(null);
    await assertCandidateImmutableInDB(mockPrisma, WS, "cand-1", "LEARNING_INELIGIBLE_UNVERIFIED");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) })
    );
  });
});
