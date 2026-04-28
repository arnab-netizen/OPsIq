import { describe, it, expect, beforeEach, vi } from "vitest";
import { recordOutcome, getEngagementOutcomes } from "./outcome.service";
import { db } from "@/lib/db";

vi.mock("@/lib/db");
vi.mock("@/services/decision-confidence/decision-confidence.service", () => ({
  computeDecisionConfidence: vi.fn(() =>
    Promise.resolve({
      score: 85,
      level: "high",
      factors: [],
      deductions: [],
    })
  ),
}));

vi.mock("@/services/business-impact/business-impact.service", () => ({
  generateBusinessImpact: vi.fn(() =>
    Promise.resolve({
      impactLevel: "medium",
      estimatedLoss: 50000,
      timeImpact: { timelineToFailure: 15, urgencyWindow: "days" },
      recoveryImpact: { recoveryProbability: "medium", recoveryTimeline: 30 },
      ownerDecision: { required: false },
      topImpactDrivers: [],
    })
  ),
}));

describe("OutcomeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as any;
    mockDb.action = { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() };
  });

  const mockAction = {
    id: "action-123",
    engagementId: "eng-123",
    recommendationId: "rec-123",
    title: "Test Action",
    status: "completed",
    completedAt: new Date(),
    completedBy: "user-1",
    priority: "high",
    outcomeSnapshot: {
      predictedImpactLevel: "high",
      predictedConfidence: 75,
    },
  };

  it("records outcome with correct delta calculation", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.action.update.mockResolvedValue(mockAction);

    const outcome = await recordOutcome("action-123");

    expect(outcome.actionId).toBe("action-123");
    expect(outcome.engagementId).toBe("eng-123");
    expect(outcome.predictedImpact).toBe("high");
    expect(outcome.actualImpact).toBe("medium");
    expect(outcome.delta).toContain("improved");
  });

  it("calculates accuracy score correctly", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.action.update.mockResolvedValue(mockAction);

    const outcome = await recordOutcome("action-123");

    expect(outcome.accuracyScore).toBeGreaterThanOrEqual(0);
    expect(outcome.accuracyScore).toBeLessThanOrEqual(100);
  });

  it("stores outcome snapshot in action record", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.action.update.mockResolvedValue(mockAction);

    await recordOutcome("action-123");

    expect(mockDb.action.update).toHaveBeenCalledWith({
      where: { id: "action-123" },
      data: {
        outcomeSnapshot: expect.objectContaining({
          predictedImpactLevel: "high",
          actualImpactLevel: "medium",
          accuracyScore: expect.any(Number),
          timestamp: expect.any(String),
        }),
      },
    });
  });

  it("is deterministic - same input produces same output", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.action.update.mockResolvedValue(mockAction);

    const outcome1 = await recordOutcome("action-123");
    const outcome2 = await recordOutcome("action-123");

    expect(outcome1.actionId).toBe(outcome2.actionId);
    expect(outcome1.predictedImpact).toBe(outcome2.predictedImpact);
    expect(outcome1.accuracyScore).toBe(outcome2.accuracyScore);
  });

  it("throws error if action not completed", async () => {
    const mockDb = db as any;
    const incompleteAction = { ...mockAction, completedAt: null };
    mockDb.action.findUnique.mockResolvedValue(incompleteAction);

    await expect(recordOutcome("action-123")).rejects.toThrow("must be completed");
  });

  it("handles missing outcome snapshot gracefully", async () => {
    const mockDb = db as any;
    const actionWithoutSnapshot = { ...mockAction, outcomeSnapshot: null };
    mockDb.action.findUnique.mockResolvedValue(actionWithoutSnapshot);
    mockDb.action.update.mockResolvedValue(actionWithoutSnapshot);

    const outcome = await recordOutcome("action-123");

    expect(outcome).toBeDefined();
    expect(outcome.predictedImpact).toBe("unknown");
  });

  it("returns engagement outcomes with metrics", async () => {
    const mockDb = db as any;
    mockDb.action.findMany.mockResolvedValue([
      {
        ...mockAction,
        status: "completed",
        outcomeSnapshot: {
          predictedImpactLevel: "critical",
          actualImpactLevel: "high",
          accuracyScore: 90,
          timestamp: new Date().toISOString(),
          delta: { impactImprovement: "improved" },
        },
      },
      {
        ...mockAction,
        id: "action-124",
        status: "completed",
        outcomeSnapshot: {
          predictedImpactLevel: "high",
          actualImpactLevel: "medium",
          accuracyScore: 80,
          timestamp: new Date().toISOString(),
          delta: { impactImprovement: "improved" },
        },
      },
    ]);

    const result = await getEngagementOutcomes("eng-123");

    expect(result.outcomes).toHaveLength(2);
    expect(result.averageAccuracy).toBe(85);
    expect(result.totalActionsCompleted).toBe(2);
    expect(result.totalValueRecovered).toBeGreaterThan(0);
  });

  it("calculates average accuracy correctly", async () => {
    const mockDb = db as any;
    mockDb.action.findMany.mockResolvedValue([
      {
        ...mockAction,
        status: "completed",
        outcomeSnapshot: { predictedImpactLevel: "high", actualImpactLevel: "medium", accuracyScore: 100 },
      },
      {
        ...mockAction,
        id: "action-124",
        status: "completed",
        outcomeSnapshot: { predictedImpactLevel: "high", actualImpactLevel: "high", accuracyScore: 90 },
      },
    ]);

    const result = await getEngagementOutcomes("eng-123");

    expect(result.averageAccuracy).toBe(95);
  });

  it("limits outcomes to last 10 completed actions", async () => {
    const mockDb = db as any;
    const manyActions = Array.from({ length: 15 }, (_, i) => ({
      ...mockAction,
      id: `action-${i}`,
      completedAt: new Date(Date.now() - i * 86400000),
      status: "completed",
      outcomeSnapshot: {
        predictedImpactLevel: "high",
        actualImpactLevel: "medium",
        accuracyScore: 85,
        timestamp: new Date().toISOString(),
        delta: { impactImprovement: "improved" },
      },
    }));
    mockDb.action.findMany.mockResolvedValue(manyActions.slice(0, 10));

    const result = await getEngagementOutcomes("eng-123");

    expect(result.outcomes).toHaveLength(10);
  });

  it("handles empty outcomes without crashing", async () => {
    const mockDb = db as any;
    mockDb.action.findMany.mockResolvedValue([]);

    const result = await getEngagementOutcomes("eng-123");

    expect(result.outcomes).toHaveLength(0);
    expect(result.averageAccuracy).toBe(0);
    expect(result.totalActionsCompleted).toBe(0);
    expect(result.totalValueRecovered).toBe(0);
  });
});
