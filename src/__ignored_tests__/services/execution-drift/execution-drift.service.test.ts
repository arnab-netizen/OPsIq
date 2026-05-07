import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectExecutionDrift, assessDriftTrend } from "./execution-drift.service";
import { NotFoundError } from "@/infra/errors";
import { mockEngagement } from "@/__tests__/test-fixtures";

vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    finding: {
      findMany: vi.fn(),
    },
    recommendation: {
      findMany: vi.fn(),
    },
    action: {
      findMany: vi.fn(),
    },
    businessConditionProfile: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/infra/logger");

describe("ExecutionDriftService", () => {
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    mockDb = db;
  });

  it("throws NotFoundError when engagement does not exist", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);

    await expect(detectExecutionDrift("nonexistent")).rejects.toThrow(NotFoundError);
  });

  it("detects no drift when engagement is healthy", async () => {
    const testEngagement = {
      ...mockEngagement,
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
      updatedAt: new Date(),
    };

    mockDb.engagement.findFirst.mockResolvedValue(testEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(false);
    expect(drift.severity).toBe("low");
    expect(drift.requiredAttention).toBe(false);
  });

  it("detects overdue critical actions", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const testEngagement = {
      ...mockEngagement,
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
      updatedAt: now,
    };

    const mockActions = [
      {
        id: "act-1",
        title: "Overdue Critical",
        priority: "critical",
        status: "in_progress",
        dueDate: yesterday,
        createdAt: now,
      },
    ];

    mockDb.engagement.findFirst.mockResolvedValue(testEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue(mockActions);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(true);
    expect(drift.reasons.some((r) => r.includes("overdue"))).toBe(true);
    expect(drift.affectedActions).toContain("act-1");
    expect(drift.severity).toBe("high");
  });

  it("detects execution certainty blockers", async () => {
    const testEngagement = {
      ...mockEngagement,
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
      updatedAt: new Date(),
    };

    const mockActions = [
      {
        id: "act-1",
        title: "Blocked Action",
        priority: "critical",
        status: "blocked",
        dueDate: null,
        createdAt: new Date(),
      },
    ];

    mockDb.engagement.findFirst.mockResolvedValue(testEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue(mockActions);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(true);
    expect(drift.reasons.some((r) => r.includes("blocker"))).toBe(true);
    expect(["high", "critical"]).toContain(drift.severity);
  });

  it("detects critical health status", async () => {
    const testEngagement = {
      ...mockEngagement,
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "critical",
      interventionMode: "tactical",
      updatedAt: new Date(),
    };

    mockDb.engagement.findFirst.mockResolvedValue(testEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(true);
    expect(drift.severity).toBe("critical");
    expect(drift.requiredAttention).toBe(true);
  });

  it("detects unresolved critical findings", async () => {
    const testEngagement = {
      ...mockEngagement,
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
      updatedAt: new Date(),
    };

    const mockFindings = [
      {
        id: "find-1",
        title: "Critical Issue",
        severity: "critical",
        status: "open",
        verified: false,
        createdAt: new Date(),
      },
    ];

    mockDb.engagement.findFirst.mockResolvedValue(testEngagement);
    mockDb.finding.findMany.mockResolvedValue(mockFindings);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(true);
    expect(drift.reasons.some((r) => r.includes("critical finding"))).toBe(true);
  });

  it("detects at-risk health status", async () => {
    const testEngagement = {
      ...mockEngagement,
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "at_risk",
      interventionMode: "tactical",
      updatedAt: new Date(),
    };

    mockDb.engagement.findFirst.mockResolvedValue(testEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(true);
    expect(["medium", "high", "critical"]).toContain(drift.severity);
  });

  it("assesses drift trend improving", () => {
    const previousDrift = {
      engagementId: "eng-123",
      driftDetected: true,
      severity: "critical" as const,
      reasons: ["Critical issue"],
      affectedActions: [],
      requiredAttention: true,
      detectedAt: new Date().toISOString(),
    };

    const currentDrift = {
      engagementId: "eng-123",
      driftDetected: true,
      severity: "high" as const,
      reasons: ["Some issue"],
      affectedActions: [],
      requiredAttention: true,
      detectedAt: new Date().toISOString(),
    };

    const trend = assessDriftTrend(currentDrift, previousDrift);

    expect(trend.trending).toBe("improving");
  });

  it("assesses drift trend worsening", () => {
    const previousDrift = {
      engagementId: "eng-123",
      driftDetected: true,
      severity: "low" as const,
      reasons: ["Minor issue"],
      affectedActions: [],
      requiredAttention: false,
      detectedAt: new Date().toISOString(),
    };

    const currentDrift = {
      engagementId: "eng-123",
      driftDetected: true,
      severity: "high" as const,
      reasons: ["Major issue"],
      affectedActions: [],
      requiredAttention: true,
      detectedAt: new Date().toISOString(),
    };

    const trend = assessDriftTrend(currentDrift, previousDrift);

    expect(trend.trending).toBe("worsening");
  });

  it("limits reasons and affected actions", async () => {
    const testEngagement = {
      ...mockEngagement,
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "critical",
      interventionMode: "tactical",
      updatedAt: new Date(),
    };

    const mockActions = Array.from({ length: 15 }, (_, i) => ({
      id: `act-${i}`,
      title: `Action ${i}`,
      priority: "critical",
      status: "blocked",
      dueDate: null,
      createdAt: new Date(),
    }));

    mockDb.engagement.findFirst.mockResolvedValue(testEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue(mockActions);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.reasons.length).toBeLessThanOrEqual(5);
    expect(drift.affectedActions.length).toBeLessThanOrEqual(10);
  });
});
