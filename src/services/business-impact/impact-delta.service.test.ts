import { describe, it, expect, beforeEach, vi } from "vitest";
import { calculateImpactDelta } from "./impact-delta.service";
import { db } from "@/lib/db";

vi.mock("@/lib/db");
vi.mock("@/services/business-impact/business-impact.service", () => ({
  generateBusinessImpact: vi.fn(() =>
    Promise.resolve({
      engagementId: "eng-123",
      impactLevel: "high",
      estimatedLoss: 100000,
      timeImpact: {
        timelineToFailure: 14,
        urgencyWindow: "days",
      },
      recoveryImpact: {
        recoveryProbability: "medium",
        recoveryTimeline: 30,
      },
      ownerDecision: {
        required: true,
      },
      topImpactDrivers: ["Driver 1"],
    })
  ),
}));
vi.mock("@/services/execution-drift/execution-drift.service", () => ({
  detectExecutionDrift: vi.fn(() =>
    Promise.resolve({
      driftDetected: false,
      severity: "low",
      reasons: [],
    })
  ),
}));
vi.mock("@/services/execution-certainty", () => ({
  calculateExecutionCertainty: vi.fn(() => ({
    score: 65,
    level: "medium",
    blockers: [],
    risks: [],
    reasons: [],
  })),
}));

describe("ImpactDeltaService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as any;
    mockDb.action = { findUnique: vi.fn() };
    mockDb.engagement = { findUnique: vi.fn() };
  });

  const mockEngagement = {
    id: "eng-123",
    code: "ENG-001",
    title: "Test Engagement",
    clientId: "client-1",
    healthStatus: "healthy",
    workspaceId: "workspace-123",
  };

  const mockAction = {
    id: "action-123",
    engagementId: "eng-123",
    title: "Critical Security Fix",
    priority: "critical",
    status: "pending",
    dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day overdue
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    engagement: mockEngagement,
  };

  it("completion improves impact level", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);

    const delta = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");

    expect(delta.ifCompleted.impactLevel).toBe("medium"); // high → medium
    const severityOrder = ["low", "medium", "high", "critical", "existential"];
    const currentIndex = severityOrder.indexOf(delta.current.impactLevel);
    const completedIndex = severityOrder.indexOf(delta.ifCompleted.impactLevel);
    expect(completedIndex).toBeLessThan(currentIndex);
  });

  it("completion reduces estimated loss", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);

    const delta = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");

    expect(delta.ifCompleted.estimatedLossReduction).toBeDefined();
    expect(delta.ifCompleted.estimatedLossReduction).toBeGreaterThan(0);
    expect(delta.ifCompleted.estimatedLoss).toBeLessThan(delta.current.estimatedLoss!);
  });

  it("completion improves recovery probability", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);

    const delta = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");

    expect(delta.ifCompleted.recoveryProbability).toBe("high"); // medium → high
  });

  it("delay worsens impact", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);

    const delta = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");

    expect(delta.ifDelayed.estimatedLoss).toBeGreaterThanOrEqual(delta.current.estimatedLoss!);
    expect(delta.ifDelayed.additionalLoss).toBeGreaterThanOrEqual(0);
  });

  it("delay increases loss by time factor", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);

    const delta = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");

    expect(delta.ifDelayed.additionalLoss).toBeDefined();
    expect(delta.ifDelayed.delayPenaltyDays).toBeGreaterThan(0);
  });

  it("ignore produces worst-case scenario", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);

    const delta = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");

    expect(delta.ifIgnored.impactLevel).toBe("existential"); // high → critical → existential
    expect(delta.ifIgnored.recoveryProbability).toBe("low");
    expect(delta.ifIgnored.estimatedLoss).toBeGreaterThan(delta.current.estimatedLoss!);
  });

  it("returns deterministic output", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);

    const delta1 = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");
    const delta2 = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");

    expect(delta1.ifCompleted.impactLevel).toBe(delta2.ifCompleted.impactLevel);
    expect(delta1.ifCompleted.estimatedLossReduction).toBe(
      delta2.ifCompleted.estimatedLossReduction
    );
    expect(delta1.ifDelayed.additionalLoss).toBe(delta2.ifDelayed.additionalLoss);
  });

  it("handles null loss safely", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);

    // Mock business impact with null loss
    const { generateBusinessImpact } = await import(
      "@/services/business-impact/business-impact.service"
    );
    (generateBusinessImpact as any).mockResolvedValueOnce({
      engagementId: "eng-123",
      impactLevel: "high",
      estimatedLoss: null, // null loss
      timeImpact: {
        timelineToFailure: null,
        urgencyWindow: "unknown",
      },
      recoveryImpact: {
        recoveryProbability: "medium",
        recoveryTimeline: 30,
      },
      ownerDecision: { required: true },
      topImpactDrivers: [],
    });

    const delta = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");

    expect(delta.ifCompleted.estimatedLossReduction).toBeNull();
    expect(delta.ifDelayed.additionalLoss).toBeNull();
    expect(delta.ifIgnored.lossEscalation).toBeNull();
    // Should not crash
    expect(delta).toBeDefined();
  });

  it("includes action title in result", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);

    const delta = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");

    expect(delta.actionTitle).toBe("Critical Security Fix");
  });

  it("includes current scenario", async () => {
    const mockDb = db as any;
    mockDb.action.findUnique.mockResolvedValue(mockAction);
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);

    const delta = await calculateImpactDelta("eng-123", "action-123", "user-1", "workspace-123");

    expect(delta.current.impactLevel).toBe("high");
    expect(delta.current.estimatedLoss).toBe(100000);
    expect(delta.current.recoveryProbability).toBe("medium");
  });
});
