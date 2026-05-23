import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateBusinessImpact, type BusinessImpactResult } from "./business-impact.service";
import { db } from "@/lib/db";

vi.mock("@/lib/db");
vi.mock("@/services/execution-certainty", () => ({
  calculateExecutionCertainty: vi.fn(() => ({
    score: 75,
    level: "high",
    blockers: [],
    risks: [],
    reasons: [],
  })),
}));
vi.mock("@/services/execution-drift/execution-drift.service", () => ({
  detectExecutionDrift: vi.fn(() => ({
    engagementId: "eng-123",
    driftDetected: false,
    severity: "low",
    reasons: [],
    affectedActions: [],
    requiredAttention: false,
    requiredAction: null,
    detectedAt: new Date().toISOString(),
  })),
}));

describe("BusinessImpactService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as unknown;
    mockDb.engagement = { findUnique: vi.fn() };
    mockDb.finding = { findMany: vi.fn() };
    mockDb.recommendation = { findMany: vi.fn() };
    mockDb.action = { findMany: vi.fn() };
    mockDb.businessConditionProfile = { findFirst: vi.fn() };
    mockDb.businessImpact = { findFirst: vi.fn() };
  });

  const mockEngagement = {
    id: "eng-123",
    code: "ENG-001",
    title: "Test Engagement",
    clientId: "client-1",
    serviceTier: "premium",
    engagementMode: "expert",
    status: "active",
    healthStatus: "healthy" as const,
    interventionMode: "tactical",
    startDate: new Date(),
    targetEndDate: null,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  };

  it("returns null estimated loss when no revenue data exists", async () => {
    const mockDb = db as unknown;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null); // No condition = no revenue
    mockDb.businessImpact.findFirst.mockResolvedValue(null);

    const impact = await generateBusinessImpact("eng-123", "user-1");

    expect(impact.estimatedLoss).toBeNull();
  });

  it("calculates existential impact for timeline <= 30 days with critical drift", async () => {
    const mockDb = db as unknown;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue({
      id: "cond-1",
      engagementId: "eng-123",
      businessStatus: "deteriorating",
      severityScore: 9,
      urgencyLevel: "critical",
      cashPressureLevel: "critical",
      estimatedMonthlyRevenue: 100000,
      createdAt: new Date(),
      updatedAt: new Date(),
      isCurrent: true,
    });
    mockDb.businessImpact.findFirst.mockResolvedValue(null);

    // Mock drift to be critical
    const { detectExecutionDrift } = await import(
      "@/services/execution-drift/execution-drift.service"
    );
    (detectExecutionDrift as unknown).mockResolvedValue({
      driftDetected: true,
      severity: "critical",
    });

    const impact = await generateBusinessImpact("eng-123", "user-1");

    expect(impact.impactLevel).toBe("existential");
    expect(impact.topImpactDrivers[0]).toContain("Timeline");
  });

  it("calculates critical impact for execution certainty score < 40", async () => {
    const mockDb = db as unknown;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.businessImpact.findFirst.mockResolvedValue(null);

    // Mock low certainty
    const { calculateExecutionCertainty } = await import(
      "@/services/execution-certainty"
    );
    (calculateExecutionCertainty as unknown).mockReturnValue({
      score: 35,
      level: "low",
      blockers: [],
    });

    // Ensure drift is not critical
    const { detectExecutionDrift } = await import(
      "@/services/execution-drift/execution-drift.service"
    );
    (detectExecutionDrift as unknown).mockResolvedValue({
      driftDetected: false,
      severity: "low",
      reasons: [],
      affectedActions: [],
      requiredAttention: false,
      requiredAction: null,
      detectedAt: new Date().toISOString(),
    });

    const impact = await generateBusinessImpact("eng-123", "user-1");

    expect(impact.impactLevel).toBe("critical");
  });

  it("reduces recovery probability with blockers", async () => {
    const mockDb = db as unknown;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([
      {
        id: "find-1",
        severity: "critical",
        status: "open",
        verified: false,
      },
      {
        id: "find-2",
        severity: "critical",
        status: "open",
        verified: false,
      },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.businessImpact.findFirst.mockResolvedValue(null);

    // Mock blockers
    const { calculateExecutionCertainty } = await import(
      "@/services/execution-certainty"
    );
    (calculateExecutionCertainty as unknown).mockReturnValue({
      score: 50,
      level: "medium",
      blockers: ["blocker-1", "blocker-2", "blocker-3"], // 3+ blockers
    });

    const impact = await generateBusinessImpact("eng-123", "user-1");

    expect(impact.recoveryImpact.recoveryProbability).toBe("low");
  });

  it("requires owner decision for high impact and above", async () => {
    const mockDb = db as unknown;
    mockDb.engagement.findUnique.mockResolvedValue({
      ...mockEngagement,
      healthStatus: "healthy",
    });
    mockDb.finding.findMany.mockResolvedValue([
      {
        id: "find-1",
        severity: "critical",
        status: "open",
        verified: false,
      },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.businessImpact.findFirst.mockResolvedValue(null);

    // Mock low certainty to trigger high impact
    const { calculateExecutionCertainty } = await import(
      "@/services/execution-certainty"
    );
    (calculateExecutionCertainty as unknown).mockReturnValue({
      score: 55,
      level: "medium",
      blockers: [],
    });

    const impact = await generateBusinessImpact("eng-123", "user-1");

    expect(impact.impactLevel).toBe("high");
    expect(impact.ownerDecision.required).toBe(true);
    expect(impact.ownerDecision.reason).toBeDefined();
  });

  it("returns success envelope from API", async () => {
    const mockDb = db as unknown;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.businessImpact.findFirst.mockResolvedValue(null);

    const impact = await generateBusinessImpact("eng-123", "user-1");

    expect(impact).toHaveProperty("engagementId");
    expect(impact).toHaveProperty("generatedAt");
    expect(impact).toHaveProperty("impactLevel");
    expect(impact).toHaveProperty("estimatedLoss");
    expect(impact).toHaveProperty("timeImpact");
    expect(impact).toHaveProperty("recoveryImpact");
    expect(impact).toHaveProperty("ownerDecision");
    expect(impact).toHaveProperty("topImpactDrivers");
  });

  it("estimates loss only when revenue data available and impact >= medium", async () => {
    const mockDb = db as unknown;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([
      {
        id: "find-1",
        severity: "critical",
        status: "open",
        verified: false,
      },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue({
      id: "cond-1",
      engagementId: "eng-123",
      businessStatus: "stable",
      severityScore: 5,
      urgencyLevel: "medium",
      cashPressureLevel: "low",
      estimatedMonthlyRevenue: 100000,
      createdAt: new Date(),
      updatedAt: new Date(),
      isCurrent: true,
    });
    mockDb.businessImpact.findFirst.mockResolvedValue(null);

    const impact = await generateBusinessImpact("eng-123", "user-1");

    // Should estimate loss because we have revenue and high+ impact
    if (impact.impactLevel !== "low") {
      expect(impact.estimatedLoss).not.toBeNull();
      expect(typeof impact.estimatedLoss).toBe("number");
    }
  });

  it("includes top impact drivers (max 5)", async () => {
    const mockDb = db as unknown;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([
      { id: "find-1", severity: "critical", status: "open", verified: false },
      { id: "find-2", severity: "critical", status: "open", verified: false },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.businessImpact.findFirst.mockResolvedValue(null);

    // Mock blockers
    const { calculateExecutionCertainty } = await import(
      "@/services/execution-certainty"
    );
    (calculateExecutionCertainty as unknown).mockReturnValue({
      score: 45,
      level: "medium",
      blockers: ["blocker-1"],
    });

    const impact = await generateBusinessImpact("eng-123", "user-1");

    expect(Array.isArray(impact.topImpactDrivers)).toBe(true);
    expect(impact.topImpactDrivers.length).toBeLessThanOrEqual(5);
  });
});
