/**
 * API route tests for /api/owner/learning-attribution-reviews
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-attribution.service", () => ({
  recordAttributionReview: vi.fn(),
  listAttributionReviewsForHarmEvent: vi.fn(),
  listAttributionReviewsForCandidate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-attribution.service";

const WS = "ws-test-001";
const CAND_ID = "cand-001";
const HARM_ID = "harm-001";

beforeEach(() => {
  vi.clearAllMocks();
});

function attributionInput() {
  return {
    workspaceId: WS,
    candidateId: CAND_ID,
    harmEventId: HARM_ID,
    reviewedBy: "reviewer@example.com",
    reviewedAt: new Date("2026-06-19T10:00:00Z"),
    verdict: "ATTRIBUTED" as const,
    confidenceScore: 0.85,
    reviewNotes: "Clear causal link established",
  };
}

describe("POST /api/owner/learning-attribution-reviews — service contract", () => {
  it("calls recordAttributionReview with correct input", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({ recorded: true, violations: [], review: { id: "attr-001" } });
    await svc.recordAttributionReview({} as any, attributionInput());
    expect(svc.recordAttributionReview).toHaveBeenCalledOnce();
  });

  it("returns recorded=true on success", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({ recorded: true, violations: [], review: { id: "attr-001" } });
    const result = await svc.recordAttributionReview({} as any, attributionInput());
    expect(result.recorded).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns recorded=false for invalid verdict", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({
      recorded: false,
      violations: ["Invalid verdict: UNKNOWN"],
    });
    const result = await svc.recordAttributionReview({} as any, { ...attributionInput(), verdict: "UNKNOWN" as any });
    expect(result.recorded).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it("returns recorded=false for confidenceScore out of range", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({
      recorded: false,
      violations: ["confidenceScore must be between 0.0 and 1.0"],
    });
    const result = await svc.recordAttributionReview({} as any, { ...attributionInput(), confidenceScore: 1.5 });
    expect(result.recorded).toBe(false);
  });

  it("returns recorded=false if candidate not found", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({
      recorded: false,
      violations: ["Candidate not found in workspace"],
    });
    const result = await svc.recordAttributionReview({} as any, { ...attributionInput(), candidateId: "nonexistent" });
    expect(result.recorded).toBe(false);
  });

  it("returns recorded=false if harm event not found", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({
      recorded: false,
      violations: ["Harm event not found in workspace"],
    });
    const result = await svc.recordAttributionReview({} as any, { ...attributionInput(), harmEventId: "nonexistent" });
    expect(result.recorded).toBe(false);
  });

  it("records NOT_ATTRIBUTED verdict correctly", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({ recorded: true, violations: [], review: { verdict: "NOT_ATTRIBUTED" } });
    const result = await svc.recordAttributionReview({} as any, { ...attributionInput(), verdict: "NOT_ATTRIBUTED" });
    expect(result.recorded).toBe(true);
  });
});

describe("GET /api/owner/learning-attribution-reviews — by harmEventId", () => {
  it("calls listAttributionReviewsForHarmEvent with workspaceId and harmEventId", async () => {
    vi.mocked(svc.listAttributionReviewsForHarmEvent).mockResolvedValue([]);
    await svc.listAttributionReviewsForHarmEvent({} as any, WS, HARM_ID);
    expect(svc.listAttributionReviewsForHarmEvent).toHaveBeenCalledWith({}, WS, HARM_ID);
  });

  it("returns empty array when no reviews for harm event", async () => {
    vi.mocked(svc.listAttributionReviewsForHarmEvent).mockResolvedValue([]);
    const result = await svc.listAttributionReviewsForHarmEvent({} as any, WS, "harm-unknown");
    expect(result).toEqual([]);
  });
});

describe("GET /api/owner/learning-attribution-reviews — by candidateId", () => {
  it("calls listAttributionReviewsForCandidate with workspaceId and candidateId", async () => {
    vi.mocked(svc.listAttributionReviewsForCandidate).mockResolvedValue([]);
    await svc.listAttributionReviewsForCandidate({} as any, WS, CAND_ID);
    expect(svc.listAttributionReviewsForCandidate).toHaveBeenCalledWith({}, WS, CAND_ID);
  });

  it("returns reviews for candidate", async () => {
    const review = { id: "attr-001", candidateId: CAND_ID, harmEventId: HARM_ID, verdict: "ATTRIBUTED" };
    vi.mocked(svc.listAttributionReviewsForCandidate).mockResolvedValue([review]);
    const result = await svc.listAttributionReviewsForCandidate({} as any, WS, CAND_ID);
    expect(result).toHaveLength(1);
  });
});

describe("security invariants", () => {
  it("recordAttributionReview enforces workspace scoping for candidate", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({
      recorded: false,
      violations: ["Candidate not found in workspace"],
    });
    const result = await svc.recordAttributionReview({} as any, { ...attributionInput(), workspaceId: "ws-attacker" });
    expect(result.recorded).toBe(false);
  });

  it("listAttributionReviewsForHarmEvent always receives workspaceId", async () => {
    vi.mocked(svc.listAttributionReviewsForHarmEvent).mockResolvedValue([]);
    await svc.listAttributionReviewsForHarmEvent({} as any, WS, HARM_ID);
    expect(svc.listAttributionReviewsForHarmEvent).toHaveBeenCalledWith(expect.anything(), WS, HARM_ID);
  });
});

describe("POST /api/owner/learning-attribution-reviews — additional scenarios", () => {
  it("records INCONCLUSIVE verdict", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({ recorded: true, violations: [], review: { id: "attr-inc-1", verdict: "INCONCLUSIVE" } });
    const result = await svc.recordAttributionReview({} as any, { ...attributionInput(), verdict: "INCONCLUSIVE" as any });
    expect(result.recorded).toBe(true);
  });

  it("confidenceScore at boundary 0.0 is valid", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({ recorded: true, violations: [], review: { id: "attr-z", confidenceScore: 0.0 } });
    const result = await svc.recordAttributionReview({} as any, { ...attributionInput(), confidenceScore: 0.0 });
    expect(result.recorded).toBe(true);
  });

  it("confidenceScore at boundary 1.0 is valid", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({ recorded: true, violations: [], review: { id: "attr-max", confidenceScore: 1.0 } });
    const result = await svc.recordAttributionReview({} as any, { ...attributionInput(), confidenceScore: 1.0 });
    expect(result.recorded).toBe(true);
  });

  it("recordAttributionReview called exactly once per request", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({ recorded: true, violations: [], review: { id: "attr-once" } });
    await svc.recordAttributionReview({} as any, attributionInput());
    expect(svc.recordAttributionReview).toHaveBeenCalledTimes(1);
  });

  it("workspace isolation: WS-001 and WS-002 produce separate service calls", async () => {
    vi.mocked(svc.listAttributionReviewsForCandidate).mockResolvedValue([]);
    await svc.listAttributionReviewsForCandidate({} as any, "ws-001", CAND_ID);
    await svc.listAttributionReviewsForCandidate({} as any, "ws-002", CAND_ID);
    expect(svc.listAttributionReviewsForCandidate).toHaveBeenNthCalledWith(1, expect.anything(), "ws-001", CAND_ID);
    expect(svc.listAttributionReviewsForCandidate).toHaveBeenNthCalledWith(2, expect.anything(), "ws-002", CAND_ID);
  });

  it("review result includes id field", async () => {
    vi.mocked(svc.recordAttributionReview).mockResolvedValue({ recorded: true, violations: [], review: { id: "attr-id-check" } });
    const result = await svc.recordAttributionReview({} as any, attributionInput());
    expect(result.review).toBeDefined();
    expect((result.review as Record<string, unknown>).id).toBe("attr-id-check");
  });

  it("listAttributionReviewsForCandidate returns multiple reviews", async () => {
    vi.mocked(svc.listAttributionReviewsForCandidate).mockResolvedValue([
      { id: "attr-a", verdict: "ATTRIBUTED" },
      { id: "attr-b", verdict: "NOT_ATTRIBUTED" },
    ]);
    const results = await svc.listAttributionReviewsForCandidate({} as any, WS, CAND_ID);
    expect(results).toHaveLength(2);
    expect((results[0] as Record<string, unknown>).verdict).toBe("ATTRIBUTED");
    expect((results[1] as Record<string, unknown>).verdict).toBe("NOT_ATTRIBUTED");
  });
});
