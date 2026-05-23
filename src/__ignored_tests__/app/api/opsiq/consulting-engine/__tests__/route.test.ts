import { describe, it, expect, beforeEach, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";

vi.mock("@/lib/api-handler", () => ({
  withRequestContext: (handler: Function) => handler,
}));

vi.mock("@/lib/auth-guard", () => ({
  withAuth: vi.fn(async (opts: unknown) => ({
    session: { user: { id: "user-1" } },
    capability: opts.capability,
  })),
}));

vi.mock("@/lib/validation", () => ({
  parseRequestBody: vi.fn(),
  parseOrThrow: vi.fn(),
  uuidSchema: { parse: (val: string) => val },
}));

vi.mock("@/lib/visibility", () => ({
  assertEngagementAccess: vi.fn(async () => {}),
}));

vi.mock("@/services/consulting-engine/pipeline", () => ({
  runConsultingPipeline: vi.fn(),
}));

vi.mock("@/services/idempotency", () => ({
  checkIdempotencyKey: vi.fn(async () => ({ isNew: true })),
  recordIdempotencyResponse: vi.fn(async () => {}),
  recordIdempotencyError: vi.fn(async () => {}),
}));

import { POST } from "../run/route";
import { runConsultingPipeline } from "@/services/consulting-engine/pipeline";
import { parseRequestBody } from "@/lib/validation";
import { assertEngagementAccess } from "@/lib/visibility";

describe("POST /api/opsiq/consulting-engine/run", () => {
  const engagementId = uuidv4();
  const userId = "user-1";
  let mockRequest: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {
      json: vi.fn(),
      headers: {
        get: vi.fn((key: string) => {
          if (key === "idempotency-key") return "test-idempotency-key";
          return null;
        }),
      },
    };
  });

  it("requires valid engagementId in request body", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      engagementId,
    });

    vi.mocked(runConsultingPipeline).mockResolvedValueOnce({
      status: "SUCCESS",
      decisionMemo: {
        id: uuidv4(),
        engagementId,
        timestamp: new Date(),
        businessProblem: "Test",
        rootCauseDiagnosis: {
          id: uuidv4(),
          type: "operational_bottleneck",
          description: "Test",
          mechanismDescription: "Test",
          evidenceIds: [],
          confidence: "HIGH",
        },
        diagnosisConfidence: "HIGH",
        criticalConstraints: [],
        recommendedInterventions: [],
        scenarios: [],
        implementation: {
          firstInterventionId: uuidv4(),
          totalEstimatedDays: 0,
          criticalPathInterventions: [],
          contingencyRequired: false,
        },
        limitations: [],
        nextReviewTriggers: [],
      },
      recommendations: [],
      actions: [],
      warnings: [],
    });

    const response = await POST(mockRequest);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.status).toBe("SUCCESS");
    expect(result.data.decisionMemo).toBeDefined();
  });

  it("enforces engagement access check", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      engagementId,
    });

    vi.mocked(runConsultingPipeline).mockResolvedValueOnce({
      status: "SUCCESS",
      decisionMemo: null,
      recommendations: [],
      actions: [],
      warnings: [],
    });

    await POST(mockRequest);

    expect(assertEngagementAccess).toHaveBeenCalledWith(userId, engagementId, "");
  });

  it("passes authContext and workspaceId to pipeline", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      engagementId,
    });

    vi.mocked(runConsultingPipeline).mockResolvedValueOnce({
      status: "SUCCESS",
      decisionMemo: null,
      recommendations: [],
      actions: [],
      warnings: [],
    });

    await POST(mockRequest);

    expect(runConsultingPipeline).toHaveBeenCalledWith(
      engagementId,
      expect.objectContaining({
        session: { user: { id: userId } },
      }),
      "" // workspaceId from header (default empty string)
    );
  });

  it("returns INSUFFICIENT_DATA status with 400", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      engagementId,
    });

    vi.mocked(runConsultingPipeline).mockResolvedValueOnce({
      status: "INSUFFICIENT_DATA",
      decisionMemo: null,
      recommendations: [],
      actions: [],
      warnings: ["No validated findings available"],
    });

    const response = await POST(mockRequest);
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.success).toBe(false);
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.warnings).toContain("No validated findings available");
  });

  it("returns ERROR status with 400", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      engagementId,
    });

    vi.mocked(runConsultingPipeline).mockResolvedValueOnce({
      status: "ERROR",
      decisionMemo: null,
      recommendations: [],
      actions: [],
      warnings: ["Some error occurred"],
    });

    const response = await POST(mockRequest);
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.success).toBe(false);
    expect(result.status).toBe("ERROR");
  });

  it("handles engagement not found error", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      engagementId,
    });

    const error = new Error("Engagement not found");
    vi.mocked(runConsultingPipeline).mockRejectedValueOnce(error);

    const response = await POST(mockRequest);
    const result = await response.json();

    expect(response.status).toBe(404);
    expect(result.success).toBe(false);
    expect(result.error.code).toBe("ENGAGEMENT_NOT_FOUND");
  });

  it("includes recommendations and actions in response", async () => {
    const mockRec = { id: uuidv4(), title: "Rec" };
    const mockAction = { id: uuidv4(), title: "Action" };

    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      engagementId,
    });

    vi.mocked(runConsultingPipeline).mockResolvedValueOnce({
      status: "SUCCESS",
      decisionMemo: {
        id: uuidv4(),
        engagementId,
        timestamp: new Date(),
        businessProblem: "Test",
        rootCauseDiagnosis: {
          id: uuidv4(),
          type: "operational_bottleneck",
          description: "Test",
          mechanismDescription: "Test",
          evidenceIds: [],
          confidence: "HIGH",
        },
        diagnosisConfidence: "HIGH",
        criticalConstraints: [],
        recommendedInterventions: [],
        scenarios: [],
        implementation: {
          firstInterventionId: uuidv4(),
          totalEstimatedDays: 0,
          criticalPathInterventions: [],
          contingencyRequired: false,
        },
        limitations: [],
        nextReviewTriggers: [],
      },
      recommendations: [mockRec as any],
      actions: [mockAction as any],
      warnings: [],
    });

    const response = await POST(mockRequest);
    const result = await response.json();

    expect(result.data.recommendations).toHaveLength(1);
    expect(result.data.actions).toHaveLength(1);
    expect(result.data.recommendations[0].id).toBe(mockRec.id);
    expect(result.data.actions[0].id).toBe(mockAction.id);
  });
});
