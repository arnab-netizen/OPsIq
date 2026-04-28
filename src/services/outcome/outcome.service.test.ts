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
    mockDb.engagement = { findUnique: vi.fn() };
    mockDb.businessConditionProfile = { findFirst: vi.fn() };
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
      predictedImpactLevel: "critical",
      predictedConfidence: 75,
      predictedLossINR: 300000,
    },
  };

  const mockEngagement = {
    id: "eng-123",
    code: "ENG-001",
    title: "Test Engagement",
  };

  const mockCondition = {
    engagementId: "eng-123",
    estimatedMonthlyRevenue: 1000000,
  };

  it("records outcome with financial impact calculation", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.action.update.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(mockCondition);

    const outcome = await recordOutcome("action-123");

    expect(outcome.actionId).toBe("action-123");
    expect(outcome.engagementId).toBe("eng-123");
    expect(outcome.valueRecoveredINR).toBeGreaterThanOrEqual(0);
    expect(outcome.actualLossINR).toBeDefined();
  });

  it("calculates correct INR value recovery from critical to medium", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.action.update.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(mockCondition);

    const outcome = await recordOutcome("action-123");

    // Critical (30%) = 300,000; Medium (5%) = 50,000; Delta = 250,000
    expect(outcome.predictedImpact).toBe("critical");
    expect(outcome.actualImpact).toBe("medium");
    expect(outcome.valueRecoveredINR).toBe(250000);
  });

  it("stores outcome snapshot with financial data", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.action.update.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(mockCondition);

    await recordOutcome("action-123");

    expect(mockDb.action.update).toHaveBeenCalledWith({
      where: { id: "action-123" },
      data: {
        outcomeSnapshot: expect.objectContaining({
          predictedImpactLevel: "critical",
          actualImpactLevel: "medium",
          predictedLossINR: expect.any(Number),
          actualLossINR: expect.any(Number),
          valueRecoveredINR: expect.any(Number),
        }),
      },
    });
  });

  it("is deterministic - same input produces same output", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.action.update.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(mockCondition);

    const outcome1 = await recordOutcome("action-123");
    const outcome2 = await recordOutcome("action-123");

    expect(outcome1.valueRecoveredINR).toBe(outcome2.valueRecoveredINR);
    expect(outcome1.actualLossINR).toBe(outcome2.actualLossINR);
  });

  it("handles missing revenue data gracefully", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.action.update.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const outcome = await recordOutcome("action-123");

    expect(outcome).toBeDefined();
    expect(outcome.valueRecoveredINR).toBe(0); // Can't calculate without revenue
  });

  it("returns engagement outcomes with financial metrics", async () => {
    const mockDb = db as any;
    mockDb.action.findMany.mockResolvedValue([
      {
        ...mockAction,
        id: "action-1",
        status: "completed",
        completedAt: new Date(),
        outcomeSnapshot: {
          predictedImpactLevel: "critical",
          actualImpactLevel: "high",
          predictedLossINR: 300000,
          actualLossINR: 150000,
          valueRecoveredINR: 150000,
          accuracyScore: 90,
          timestamp: new Date().toISOString(),
          delta: { impactImprovement: "improved" },
        },
      },
      {
        ...mockAction,
        id: "action-2",
        status: "completed",
        completedAt: new Date(),
        outcomeSnapshot: {
          predictedImpactLevel: "high",
          actualImpactLevel: "medium",
          predictedLossINR: 150000,
          actualLossINR: 50000,
          valueRecoveredINR: 100000,
          accuracyScore: 80,
          timestamp: new Date().toISOString(),
          delta: { impactImprovement: "improved" },
        },
      },
    ]);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(mockCondition);

    const result = await getEngagementOutcomes("eng-123");

    expect(result.outcomes).toHaveLength(2);
    expect(result.totalValueRecoveredINR).toBe(250000);
    expect(result.financialMetrics.totalRecoveredINR).toBe(250000);
    expect(result.financialMetrics.avgPerActionINR).toBe(125000);
    expect(result.averageAccuracy).toBe(85);
  });

  it("calculates average INR value per action correctly", async () => {
    const mockDb = db as any;
    mockDb.action.findMany.mockResolvedValue([
      {
        ...mockAction,
        status: "completed",
        outcomeSnapshot: {
          predictedImpactLevel: "critical",
          actualImpactLevel: "high",
          predictedLossINR: 300000,
          actualLossINR: 150000,
          valueRecoveredINR: 150000,
        },
      },
      {
        ...mockAction,
        id: "action-2",
        status: "completed",
        outcomeSnapshot: {
          predictedImpactLevel: "high",
          actualImpactLevel: "medium",
          predictedLossINR: 150000,
          actualLossINR: 50000,
          valueRecoveredINR: 100000,
        },
      },
    ]);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(mockCondition);

    const result = await getEngagementOutcomes("eng-123");

    // (150000 + 100000) / 2 = 125000
    expect(result.financialMetrics.avgPerActionINR).toBe(125000);
  });

  it("calculates current financial risk from outcomes", async () => {
    const mockDb = db as any;
    mockDb.action.findMany.mockResolvedValue([
      {
        ...mockAction,
        status: "completed",
        outcomeSnapshot: {
          actualLossINR: 150000,
          valueRecoveredINR: 150000,
        },
      },
      {
        ...mockAction,
        id: "action-2",
        status: "completed",
        outcomeSnapshot: {
          actualLossINR: 50000,
          valueRecoveredINR: 100000,
        },
      },
    ]);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(mockCondition);

    const result = await getEngagementOutcomes("eng-123");

    // Sum of actual losses = 150000 + 50000 = 200000
    expect(result.financialMetrics.currentRiskINR).toBe(200000);
  });

  it("handles empty outcomes without crashing", async () => {
    const mockDb = db as any;
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const result = await getEngagementOutcomes("eng-123");

    expect(result.outcomes).toHaveLength(0);
    expect(result.totalValueRecoveredINR).toBe(0);
    expect(result.financialMetrics.avgPerActionINR).toBe(0);
    expect(result.averageAccuracy).toBe(0);
  });
});
