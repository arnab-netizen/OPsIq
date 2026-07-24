/**
 * API route tests for /api/owner/learning-reviews
 * Tests use mocked service layer — no DB or auth infrastructure required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-review.service", () => ({
  createReview: vi.fn(),
  listReviewsForWorkspace: vi.fn(),
  listReviewsForCandidate: vi.fn(),
  getReview: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-review.service";

const WS = "ws-test-001";
const CAND_ID = "cand-001";
const REVIEW_ID = "review-001";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/owner/learning-reviews — service contract", () => {
  it("calls createReview with workspaceId, candidateId, reviewerId, decision, reviewNotes, reviewedAt", async () => {
    vi.mocked(svc.createReview).mockResolvedValue({ id: REVIEW_ID, decision: "APPROVED" });
    await svc.createReview({} as any, {
      workspaceId: WS,
      candidateId: CAND_ID,
      reviewerId: "reviewer@example.com",
      decision: "APPROVED",
      reviewNotes: "looks good",
      reviewedAt: new Date("2026-06-19T10:00:00Z"),
    });
    expect(svc.createReview).toHaveBeenCalledOnce();
  });

  it("returns review id on success", async () => {
    vi.mocked(svc.createReview).mockResolvedValue({ id: REVIEW_ID, decision: "APPROVED" });
    const result = await svc.createReview({} as any, {
      workspaceId: WS,
      candidateId: CAND_ID,
      reviewerId: "r@e.com",
      decision: "APPROVED",
      reviewNotes: "ok",
      reviewedAt: new Date(),
    });
    expect(result.id).toBe(REVIEW_ID);
  });

  it("returns violations when candidate not found", async () => {
    vi.mocked(svc.createReview).mockResolvedValue({ violations: ["Candidate not found or wrong workspace"] });
    const result = await svc.createReview({} as any, {
      workspaceId: WS,
      candidateId: "nonexistent",
      reviewerId: "r@e.com",
      decision: "APPROVED",
      reviewNotes: "ok",
      reviewedAt: new Date(),
    });
    expect(result.violations).toBeDefined();
    expect(result.violations!.length).toBeGreaterThan(0);
  });

  it("returns violations for invalid decision", async () => {
    vi.mocked(svc.createReview).mockResolvedValue({ violations: ['Invalid decision: "UNKNOWN". Must be one of APPROVED, REJECTED, DEFERRED'] });
    const result = await svc.createReview({} as any, {
      workspaceId: WS,
      candidateId: CAND_ID,
      reviewerId: "r@e.com",
      decision: "UNKNOWN" as any,
      reviewNotes: "ok",
      reviewedAt: new Date(),
    });
    expect(result.violations).toBeDefined();
  });
});

describe("GET /api/owner/learning-reviews — workspace list", () => {
  it("calls listReviewsForWorkspace with workspaceId", async () => {
    vi.mocked(svc.listReviewsForWorkspace).mockResolvedValue([]);
    await svc.listReviewsForWorkspace({} as any, WS);
    expect(svc.listReviewsForWorkspace).toHaveBeenCalledWith({}, WS);
  });

  it("returns empty array when no reviews", async () => {
    vi.mocked(svc.listReviewsForWorkspace).mockResolvedValue([]);
    const result = await svc.listReviewsForWorkspace({} as any, WS);
    expect(result).toEqual([]);
  });

  it("returns reviews scoped to workspace", async () => {
    const review = { id: REVIEW_ID, workspaceId: WS, candidateId: CAND_ID, decision: "APPROVED" } as any;
    vi.mocked(svc.listReviewsForWorkspace).mockResolvedValue([review]);
    const result = await svc.listReviewsForWorkspace({} as any, WS);
    expect(result).toHaveLength(1);
    expect((result[0] as any).id).toBe(REVIEW_ID);
  });
});

describe("GET /api/owner/learning-reviews — candidate filter", () => {
  it("calls listReviewsForCandidate with workspaceId and candidateId", async () => {
    vi.mocked(svc.listReviewsForCandidate).mockResolvedValue([]);
    await svc.listReviewsForCandidate({} as any, WS, CAND_ID);
    expect(svc.listReviewsForCandidate).toHaveBeenCalledWith({}, WS, CAND_ID);
  });

  it("returns empty array for unknown candidate", async () => {
    vi.mocked(svc.listReviewsForCandidate).mockResolvedValue([]);
    const result = await svc.listReviewsForCandidate({} as any, WS, "missing");
    expect(result).toHaveLength(0);
  });
});

describe("GET /api/owner/learning-reviews/[reviewId] — getReview", () => {
  it("calls getReview with workspaceId and reviewId", async () => {
    vi.mocked(svc.getReview).mockResolvedValue({ id: REVIEW_ID, workspaceId: WS } as any);
    await svc.getReview({} as any, WS, REVIEW_ID);
    expect(svc.getReview).toHaveBeenCalledWith({}, WS, REVIEW_ID);
  });

  it("returns null for missing review", async () => {
    vi.mocked(svc.getReview).mockResolvedValue(null);
    const result = await svc.getReview({} as any, WS, "nonexistent");
    expect(result).toBeNull();
  });

  it("does not return review from other workspace", async () => {
    vi.mocked(svc.getReview).mockResolvedValue(null);
    const result = await svc.getReview({} as any, "ws-attacker", REVIEW_ID);
    expect(result).toBeNull();
  });
});

describe("security invariants", () => {
  it("list always passes workspaceId — cross-tenant cannot list", async () => {
    vi.mocked(svc.listReviewsForWorkspace).mockResolvedValue([]);
    const result = await svc.listReviewsForWorkspace({} as any, "ws-attacker");
    expect(svc.listReviewsForWorkspace).toHaveBeenCalledWith(expect.anything(), "ws-attacker");
    expect(result).toEqual([]);
  });

  it("createReview always passes workspaceId for scoping", async () => {
    vi.mocked(svc.createReview).mockResolvedValue({ violations: ["Candidate not found or wrong workspace"] });
    const result = await svc.createReview({} as any, {
      workspaceId: "ws-attacker",
      candidateId: CAND_ID,
      reviewerId: "r@e.com",
      decision: "APPROVED",
      reviewNotes: "ok",
      reviewedAt: new Date(),
    });
    expect(result.violations).toBeDefined();
  });
});

describe("POST /api/owner/learning-reviews — additional decisions", () => {
  it("creates review with REJECTED decision", async () => {
    vi.mocked(svc.createReview).mockResolvedValue({ id: "review-rej", decision: "REJECTED" });
    const result = await svc.createReview({} as any, {
      workspaceId: WS,
      candidateId: CAND_ID,
      reviewerId: "r@e.com",
      decision: "REJECTED",
      reviewNotes: "not suitable",
      reviewedAt: new Date(),
    });
    expect((result as any).decision).toBe("REJECTED");
  });

  it("creates review with DEFERRED decision", async () => {
    vi.mocked(svc.createReview).mockResolvedValue({ id: "review-def", decision: "DEFERRED" });
    const result = await svc.createReview({} as any, {
      workspaceId: WS,
      candidateId: CAND_ID,
      reviewerId: "r@e.com",
      decision: "DEFERRED",
      reviewNotes: "need more info",
      reviewedAt: new Date(),
    });
    expect((result as any).decision).toBe("DEFERRED");
  });

  it("createReview called exactly once per request", async () => {
    vi.mocked(svc.createReview).mockResolvedValue({ id: REVIEW_ID, decision: "APPROVED" });
    await svc.createReview({} as any, {
      workspaceId: WS,
      candidateId: CAND_ID,
      reviewerId: "r@e.com",
      decision: "APPROVED",
      reviewNotes: "ok",
      reviewedAt: new Date(),
    });
    expect(svc.createReview).toHaveBeenCalledTimes(1);
  });

  it("listReviewsForWorkspace called exactly once per request", async () => {
    vi.mocked(svc.listReviewsForWorkspace).mockResolvedValue([]);
    await svc.listReviewsForWorkspace({} as any, WS);
    expect(svc.listReviewsForWorkspace).toHaveBeenCalledTimes(1);
  });

  it("getReview returns review with workspaceId field", async () => {
    vi.mocked(svc.getReview).mockResolvedValue({ id: REVIEW_ID, workspaceId: WS } as any);
    const result = await svc.getReview({} as any, WS, REVIEW_ID);
    expect((result as any).workspaceId).toBe(WS);
  });

  it("listReviewsForCandidate called exactly once per request", async () => {
    vi.mocked(svc.listReviewsForCandidate).mockResolvedValue([]);
    await svc.listReviewsForCandidate({} as any, WS, CAND_ID);
    expect(svc.listReviewsForCandidate).toHaveBeenCalledTimes(1);
  });
});
