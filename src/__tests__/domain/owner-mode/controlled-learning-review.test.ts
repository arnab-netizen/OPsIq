import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

import {
  createReview,
  listReviewsForCandidate,
  listReviewsForWorkspace,
  getReview,
} from "@/services/controlled-learning-review.service";

const mockPrisma = {
  controlledLearningReview: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  controlledLearningCandidate: {
    findFirst: vi.fn(),
  },
} as unknown as PrismaClient;

const mockCandidate = {
  id: "cand-1",
  workspaceId: "ws-1",
  businessId: "biz-1",
};

const mockReview = {
  id: "rev-1",
  workspaceId: "ws-1",
  candidateId: "cand-1",
  reviewerId: "user-1",
  decision: "APPROVED",
  reviewNotes: "Looks good",
  reviewedAt: new Date("2026-06-19T10:00:00Z"),
  createdAt: new Date("2026-06-19T10:01:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createReview", () => {
  it("creates a review with APPROVED decision", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningReview.create.mockResolvedValue(mockReview);

    const result = await createReview(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      reviewerId: "user-1",
      decision: "APPROVED",
      reviewNotes: "Looks good",
      reviewedAt: new Date("2026-06-19T10:00:00Z"),
    });

    expect(result).toMatchObject({ id: "rev-1", decision: "APPROVED" });
    expect(result.violations).toBeUndefined();
  });

  it("creates a review with REJECTED decision", async () => {
    const rejectedReview = { ...mockReview, id: "rev-2", decision: "REJECTED" };
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningReview.create.mockResolvedValue(rejectedReview);

    const result = await createReview(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      reviewerId: "user-1",
      decision: "REJECTED",
      reviewNotes: "Not ready",
      reviewedAt: new Date("2026-06-19T10:00:00Z"),
    });

    expect(result).toMatchObject({ decision: "REJECTED" });
    expect(result.violations).toBeUndefined();
  });

  it("creates a review with DEFERRED decision", async () => {
    const deferredReview = { ...mockReview, id: "rev-3", decision: "DEFERRED" };
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningReview.create.mockResolvedValue(deferredReview);

    const result = await createReview(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      reviewerId: "user-1",
      decision: "DEFERRED",
      reviewNotes: "Needs more data",
      reviewedAt: new Date("2026-06-19T10:00:00Z"),
    });

    expect(result).toMatchObject({ decision: "DEFERRED" });
    expect(result.violations).toBeUndefined();
  });

  it("returns violation for invalid decision", async () => {
    const result = await createReview(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      reviewerId: "user-1",
      decision: "INVALID" as any,
      reviewNotes: "oops",
      reviewedAt: new Date(),
    });

    expect(result.violations).toBeDefined();
    expect(result.violations![0]).toMatch(/Invalid decision/);
    expect((mockPrisma as any).controlledLearningCandidate.findFirst).not.toHaveBeenCalled();
    expect((mockPrisma as any).controlledLearningReview.create).not.toHaveBeenCalled();
  });

  it("returns violation when candidate not found", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    const result = await createReview(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-missing",
      reviewerId: "user-1",
      decision: "APPROVED",
      reviewNotes: "notes",
      reviewedAt: new Date(),
    });

    expect(result.violations).toEqual(["Candidate not found or wrong workspace"]);
    expect((mockPrisma as any).controlledLearningReview.create).not.toHaveBeenCalled();
  });

  it("blocks cross-tenant: candidate in different workspace not found", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    const result = await createReview(mockPrisma, {
      workspaceId: "ws-OTHER",
      candidateId: "cand-1",
      reviewerId: "user-1",
      decision: "APPROVED",
      reviewNotes: "cross-tenant attempt",
      reviewedAt: new Date(),
    });

    expect(result.violations).toEqual(["Candidate not found or wrong workspace"]);
  });

  it("passes workspaceId to candidate lookup for scoping", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    await createReview(mockPrisma, {
      workspaceId: "ws-specific",
      candidateId: "cand-1",
      reviewerId: "user-1",
      decision: "APPROVED",
      reviewNotes: "notes",
      reviewedAt: new Date(),
    });

    expect((mockPrisma as any).controlledLearningCandidate.findFirst).toHaveBeenCalledWith({
      where: { id: "cand-1", workspaceId: "ws-specific" },
    });
  });

  it("passes correct data to review create", async () => {
    const reviewedAt = new Date("2026-06-19T12:00:00Z");
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningReview.create.mockResolvedValue({ ...mockReview });

    await createReview(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      reviewerId: "user-99",
      decision: "REJECTED",
      reviewNotes: "Detailed notes",
      reviewedAt,
    });

    const createCall = (mockPrisma as any).controlledLearningReview.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      workspaceId: "ws-1",
      candidateId: "cand-1",
      reviewerId: "user-99",
      decision: "REJECTED",
      reviewNotes: "Detailed notes",
      reviewedAt,
    });
  });

  it("does not create review when decision is empty string", async () => {
    const result = await createReview(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      reviewerId: "user-1",
      decision: "" as any,
      reviewNotes: "notes",
      reviewedAt: new Date(),
    });

    expect(result.violations).toBeDefined();
    expect((mockPrisma as any).controlledLearningReview.create).not.toHaveBeenCalled();
  });
});

describe("listReviewsForCandidate", () => {
  it("returns reviews for a valid candidate in the workspace", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningReview.findMany.mockResolvedValue([mockReview]);

    const result = await listReviewsForCandidate(mockPrisma, "ws-1", "cand-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "rev-1" });
  });

  it("returns empty array when candidate not in workspace", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    const result = await listReviewsForCandidate(mockPrisma, "ws-OTHER", "cand-1");

    expect(result).toEqual([]);
    expect((mockPrisma as any).controlledLearningReview.findMany).not.toHaveBeenCalled();
  });

  it("enforces workspace isolation in candidate lookup", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    await listReviewsForCandidate(mockPrisma, "ws-isolation", "cand-1");

    expect((mockPrisma as any).controlledLearningCandidate.findFirst).toHaveBeenCalledWith({
      where: { id: "cand-1", workspaceId: "ws-isolation" },
    });
  });

  it("queries reviews with both workspaceId and candidateId filters", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningReview.findMany.mockResolvedValue([]);

    await listReviewsForCandidate(mockPrisma, "ws-1", "cand-1");

    expect((mockPrisma as any).controlledLearningReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1", candidateId: "cand-1" },
        orderBy: { reviewedAt: "desc" },
      })
    );
  });

  it("returns empty array when candidate has no reviews", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningReview.findMany.mockResolvedValue([]);

    const result = await listReviewsForCandidate(mockPrisma, "ws-1", "cand-1");

    expect(result).toEqual([]);
  });

  it("returns multiple reviews sorted by reviewedAt desc", async () => {
    const reviews = [
      { ...mockReview, id: "rev-2", reviewedAt: new Date("2026-06-19T12:00:00Z") },
      { ...mockReview, id: "rev-1", reviewedAt: new Date("2026-06-19T10:00:00Z") },
    ];
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningReview.findMany.mockResolvedValue(reviews);

    const result = await listReviewsForCandidate(mockPrisma, "ws-1", "cand-1");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("rev-2");
  });
});

describe("listReviewsForWorkspace", () => {
  it("returns all reviews for a workspace", async () => {
    const reviews = [mockReview, { ...mockReview, id: "rev-2", candidateId: "cand-2" }];
    (mockPrisma as any).controlledLearningReview.findMany.mockResolvedValue(reviews);

    const result = await listReviewsForWorkspace(mockPrisma, "ws-1");

    expect(result).toHaveLength(2);
  });

  it("filters by workspaceId only", async () => {
    (mockPrisma as any).controlledLearningReview.findMany.mockResolvedValue([]);

    await listReviewsForWorkspace(mockPrisma, "ws-1");

    expect((mockPrisma as any).controlledLearningReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1" },
        orderBy: { reviewedAt: "desc" },
      })
    );
  });

  it("returns empty array when workspace has no reviews", async () => {
    (mockPrisma as any).controlledLearningReview.findMany.mockResolvedValue([]);

    const result = await listReviewsForWorkspace(mockPrisma, "ws-empty");

    expect(result).toEqual([]);
  });

  it("does not cross-contaminate workspaces", async () => {
    (mockPrisma as any).controlledLearningReview.findMany.mockResolvedValue([]);

    await listReviewsForWorkspace(mockPrisma, "ws-2");

    const callArg = (mockPrisma as any).controlledLearningReview.findMany.mock.calls[0][0];
    expect(callArg.where.workspaceId).toBe("ws-2");
    expect(callArg.where.workspaceId).not.toBe("ws-1");
  });
});

describe("getReview", () => {
  it("returns review for correct workspace", async () => {
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue(mockReview);

    const result = await getReview(mockPrisma, "ws-1", "rev-1");

    expect(result).toMatchObject({ id: "rev-1", workspaceId: "ws-1" });
  });

  it("returns null when review not found", async () => {
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue(null);

    const result = await getReview(mockPrisma, "ws-1", "rev-missing");

    expect(result).toBeNull();
  });

  it("returns null when review belongs to different workspace", async () => {
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue(null);

    const result = await getReview(mockPrisma, "ws-OTHER", "rev-1");

    expect(result).toBeNull();
  });

  it("enforces workspace scoping in the query", async () => {
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue(null);

    await getReview(mockPrisma, "ws-1", "rev-1");

    expect((mockPrisma as any).controlledLearningReview.findFirst).toHaveBeenCalledWith({
      where: { id: "rev-1", workspaceId: "ws-1" },
    });
  });

  it("returns full review object when found", async () => {
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue(mockReview);

    const result = await getReview(mockPrisma, "ws-1", "rev-1");

    expect(result?.reviewNotes).toBe("Looks good");
    expect(result?.reviewerId).toBe("user-1");
    expect(result?.reviewedAt).toEqual(new Date("2026-06-19T10:00:00Z"));
  });

  it("returns null (not throws) when workspaceId is wrong", async () => {
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue(null);

    await expect(getReview(mockPrisma, "ws-wrong", "rev-1")).resolves.toBeNull();
  });
});
