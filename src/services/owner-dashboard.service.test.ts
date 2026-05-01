import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOwnerDashboard } from "./owner-dashboard.service";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";

vi.mock("@/lib/db");
vi.mock("@/infra/logger");
vi.mock("@/lib/auth-guard", () => ({
  requireCapabilityForService: vi.fn(),
}));

const mockAuthContext = {
  session: {
    user: { id: "user-1", email: "test@test.com", name: "Test", isActive: true },
    sessionId: "session-123",
    expiresAt: new Date(),
  },
  policy: {
    userId: "user-1",
    roles: [],
    capabilities: [CAPABILITIES.ENGAGEMENT_VIEW],
  },
};
const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";

describe("OwnerDashboardService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NotFoundError when engagement does not exist", async () => {
    const mockDb = db as any;
    mockDb.engagement = {
      findUnique: vi.fn().mockResolvedValue(null),
    };

    await expect(getOwnerDashboard("nonexistent", mockAuthContext as any, mockWorkspaceId)).rejects.toThrow(NotFoundError);
  });

  it("returns dashboard with basic engagement info", async () => {
    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test Engagement",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
    };

    const mockDb = db as any;
    mockDb.engagement = {
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
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

    const dashboard = await getOwnerDashboard("eng-123", mockAuthContext as any, mockWorkspaceId);

    expect(dashboard.engagementId).toBe("eng-123");
    expect(dashboard.engagementCode).toBe("ENG-001");
    expect(dashboard.engagementTitle).toBe("Test Engagement");
    expect(dashboard.healthStatus).toBe("healthy");
  });

  it("includes execution certainty in dashboard", async () => {
    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
    };

    const mockDb = db as any;
    mockDb.engagement = {
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
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

    const dashboard = await getOwnerDashboard("eng-123", mockAuthContext as any, mockWorkspaceId);

    expect(dashboard.executionCertainty).toBeDefined();
    expect(dashboard.executionCertainty).toHaveProperty("score");
    expect(dashboard.executionCertainty).toHaveProperty("level");
    expect(dashboard.executionCertainty).toHaveProperty("blockers");
  });

  it("identifies overdue actions", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
    };

    const mockActions = [
      {
        id: "act-1",
        title: "Overdue Action",
        priority: "critical",
        status: "in_progress",
        dueDate: yesterday,
      },
      {
        id: "act-2",
        title: "On-track Action",
        priority: "high",
        status: "pending",
        dueDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
      },
    ];

    const mockDb = db as any;
    mockDb.engagement = {
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
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

    const dashboard = await getOwnerDashboard("eng-123", mockAuthContext as any, mockWorkspaceId);

    expect(dashboard.overdueActions.length).toBe(1);
    expect(dashboard.overdueActions[0].title).toBe("Overdue Action");
    expect(dashboard.overdueActions[0].urgency).toBe("overdue");
  });

  it("identifies critical actions", async () => {
    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
    };

    const mockActions = [
      {
        id: "act-1",
        title: "Critical Action",
        priority: "critical",
        status: "pending",
        dueDate: null,
      },
      {
        id: "act-2",
        title: "Completed Critical",
        priority: "critical",
        status: "completed",
        dueDate: null,
      },
    ];

    const mockDb = db as any;
    mockDb.engagement = {
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
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

    const dashboard = await getOwnerDashboard("eng-123", mockAuthContext as any, mockWorkspaceId);

    expect(dashboard.criticalActions.length).toBe(1);
    expect(dashboard.criticalActions[0].title).toBe("Critical Action");
  });

  it("identifies open recommendations", async () => {
    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
    };

    const mockRecommendations = [
      {
        id: "rec-1",
        title: "Open Recommendation",
        priority: "high",
        status: "in_progress",
      },
      {
        id: "rec-2",
        title: "Completed Rec",
        priority: "medium",
        status: "completed",
      },
    ];

    const mockDb = db as any;
    mockDb.engagement = {
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
    };
    mockDb.finding = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.recommendation = {
      findMany: vi.fn().mockResolvedValue(mockRecommendations),
    };
    mockDb.action = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.businessConditionProfile = {
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const dashboard = await getOwnerDashboard("eng-123", mockAuthContext as any, mockWorkspaceId);

    expect(dashboard.openRecommendations.length).toBe(1);
    expect(dashboard.openRecommendations[0].title).toBe("Open Recommendation");
  });

  it("prioritizes next best action: overdue first", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
    };

    const mockActions = [
      {
        id: "act-1",
        title: "Overdue Critical",
        priority: "critical",
        status: "in_progress",
        dueDate: yesterday,
      },
    ];

    const mockDb = db as any;
    mockDb.engagement = {
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
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

    const dashboard = await getOwnerDashboard("eng-123", mockAuthContext as any, mockWorkspaceId);

    expect(dashboard.nextBestAction).toBeDefined();
    expect(dashboard.nextBestAction?.type).toBe("action");
    expect(dashboard.nextBestAction?.title).toBe("Overdue Critical");
  });

  it("computes business impact based on health and certainty", async () => {
    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
    };

    const mockDb = db as any;
    mockDb.engagement = {
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
    };
    mockDb.finding = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.recommendation = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockDb.action = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "act-1",
          title: "Completed Action",
          priority: "high",
          status: "completed",
          dueDate: null,
        },
      ]),
    };
    mockDb.businessConditionProfile = {
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const dashboard = await getOwnerDashboard("eng-123", mockAuthContext as any, mockWorkspaceId);

    expect(dashboard.businessImpact).toBeDefined();
    expect(dashboard.businessImpact.summary).toBeDefined();
    expect(Array.isArray(dashboard.businessImpact.keyRisks)).toBe(true);
    expect(Array.isArray(dashboard.businessImpact.opportunities)).toBe(true);
  });

  it("handles missing data gracefully", async () => {
    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "stable",
      interventionMode: "strategic",
    };

    const mockDb = db as any;
    mockDb.engagement = {
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
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

    const dashboard = await getOwnerDashboard("eng-123", mockAuthContext as any, mockWorkspaceId);

    expect(dashboard).toBeDefined();
    expect(dashboard.nextBestAction).toBeNull();
    expect(dashboard.overdueActions.length).toBe(0);
    expect(dashboard.criticalActions.length).toBe(0);
  });

  it("limits returned action and recommendation counts", async () => {
    const mockEngagement = {
      id: "eng-123",
      code: "ENG-001",
      title: "Test",
      status: "active",
      healthStatus: "healthy",
      interventionMode: "tactical",
    };

    const mockActions = Array.from({ length: 10 }, (_, i) => ({
      id: `act-${i}`,
      title: `Action ${i}`,
      priority: "high",
      status: "in_progress",
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    }));

    const mockDb = db as any;
    mockDb.engagement = {
      findUnique: vi.fn().mockResolvedValue(mockEngagement),
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

    const dashboard = await getOwnerDashboard("eng-123", mockAuthContext as any, mockWorkspaceId);

    expect(dashboard.overdueActions.length).toBeLessThanOrEqual(5);
  });
});
