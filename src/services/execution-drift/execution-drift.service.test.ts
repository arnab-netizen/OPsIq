import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectExecutionDrift, assessDriftTrend } from "./execution-drift.service";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

vi.mock("@/lib/db");
vi.mock("@/infra/logger");

describe("ExecutionDriftService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NotFoundError when engagement does not exist", async () => {
    const mockDb = db as any;
    mockDb.engagement = {
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(null),
    };

    await expect(detectExecutionDrift("nonexistent")).rejects.toThrow(NotFoundError);
  });

  it("detects no drift when engagement is healthy", async () => {
    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
      updatedAt: new Date(),
    };

    const mockDb = db as any;
    mockDb.engagement = {
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
    };
    mockDb.finding = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.recommendation = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.action = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.businessConditionProfile = {
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(false);
    expect(drift.severity).toBe("low");
    expect(drift.requiredAttention).toBe(false);
  });

  it("detects overdue critical actions", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const mockEngagement = {
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

    const mockDb = db as any;
    mockDb.engagement = {
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
    };
    mockDb.finding = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.recommendation = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.action = {
      findMany: vi.fn().mockResolvedValue(mockActions),
    };
    mockDb.businessConditionProfile = {
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(true);
    expect(drift.reasons.some((r) => r.includes("overdue"))).toBe(true);
    expect(drift.affectedActions).toContain("act-1");
    expect(drift.severity).toBe("high");
  });

  it("detects execution certainty blockers", async () => {
    const mockEngagement = {
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

    const mockDb = db as any;
    mockDb.engagement = {
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
    };
    mockDb.finding = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.recommendation = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.action = {
      findMany: vi.fn().mockResolvedValue(mockActions),
    };
    mockDb.businessConditionProfile = {
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(true);
    expect(drift.reasons.some((r) => r.includes("blocker"))).toBe(true);
    expect(["high", "critical"]).toContain(drift.severity);
  });

  it("detects critical health status", async () => {
    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "critical",
      interventionMode: "tactical",
      updatedAt: new Date(),
    };

    const mockDb = db as any;
    mockDb.engagement = {
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
    };
    mockDb.finding = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.recommendation = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.action = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.businessConditionProfile = {
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(true);
    expect(drift.severity).toBe("critical");
    expect(drift.requiredAttention).toBe(true);
  });

  it("detects unresolved critical findings", async () => {
    const mockEngagement = {
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

    const mockDb = db as any;
    mockDb.engagement = {
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
    };
    mockDb.finding = {
      findMany: vi.fn().mockResolvedValue(mockFindings),
    };
    mockDb.recommendation = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.action = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.businessConditionProfile = {
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.driftDetected).toBe(true);
    expect(drift.reasons.some((r) => r.includes("critical finding"))).toBe(true);
  });

  it("detects at-risk health status", async () => {
    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "at_risk",
      interventionMode: "tactical",
      updatedAt: new Date(),
    };

    const mockDb = db as any;
    mockDb.engagement = {
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
    };
    mockDb.finding = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.recommendation = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.action = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.businessConditionProfile = {
      findFirst: vi.fn().mockResolvedValue(null),
    };

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
    const mockEngagement = {
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

    const mockDb = db as any;
    mockDb.engagement = {
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
      findFirst: vi.fn().mockResolvedValue(mockEngagement),
    };
    mockDb.finding = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.recommendation = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.action = {
      findMany: vi.fn().mockResolvedValue(mockActions),
    };
    mockDb.businessConditionProfile = {
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const drift = await detectExecutionDrift("eng-123");

    expect(drift.reasons.length).toBeLessThanOrEqual(5);
    expect(drift.affectedActions.length).toBeLessThanOrEqual(10);
  });
});
