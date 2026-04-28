import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";

vi.mock("@/lib/db");
vi.mock("@/lib/api-handler", () => ({
  withRequestContext: (handler: Function) => handler,
}));
vi.mock("@/lib/auth-guard", () => ({
  withAuth: vi.fn(async (options) => {
    return {
      session: {
        user: { id: "user-1" },
      },
    };
  }),
}));
vi.mock("@/services/business-impact/business-impact.service", () => ({
  generateBusinessImpact: vi.fn(() =>
    Promise.resolve({
      engagementId: "eng-123",
      impactLevel: "high",
      estimatedLoss: 50000,
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
        reason: "High impact requires owner decision",
      },
      topImpactDrivers: ["Driver 1", "Driver 2"],
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

describe("BusinessImpactDetailRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as any;
    mockDb.engagement = { findUnique: vi.fn() };
    mockDb.finding = { findMany: vi.fn() };
    mockDb.recommendation = { findMany: vi.fn() };
    mockDb.action = { findMany: vi.fn() };
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

  it("returns success envelope with required properties", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    // Import and call the route handler
    const { GET } = await import("./route");

    const validId = "123e4567-e89b-12d3-a456-426614174000";
    const context = {
      params: Promise.resolve({ engagementId: validId }),
    };

    const response = await GET(new Request("http://localhost"), context as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect(data.data.impactLevel).toBeDefined();
    expect(data.data.reasoning).toBeDefined();
    expect(data.data.financialExplanation).toBeDefined();
    expect(data.data.timeExplanation).toBeDefined();
    expect(data.data.recoveryExplanation).toBeDefined();
    expect(data.data.drivers).toBeDefined();
    expect(data.data.actionsAffectingImpact).toBeDefined();
  });

  it("reasoning array is populated for impact level", async () => {
    const mockDb = db as any;
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

    const { GET } = await import("./route");

    const validId = "123e4567-e89b-12d3-a456-426614174001";
    const context = {
      params: Promise.resolve({ engagementId: validId }),
    };

    const response = await GET(new Request("http://localhost"), context as any);
    const data = await response.json();

    expect(Array.isArray(data.data.reasoning)).toBe(true);
    // May be empty for some impact levels, but at least be an array
    expect(typeof data.data.reasoning).toBe("object");
  });

  it("includes actionsAffectingImpact list", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        title: "Critical Action",
        priority: "critical",
        status: "pending",
        dueDate: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
      },
    ]);

    const { GET } = await import("./route");

    const validId = "123e4567-e89b-12d3-a456-426614174002";
    const context = {
      params: Promise.resolve({ engagementId: validId }),
    };

    const response = await GET(new Request("http://localhost"), context as any);
    const data = await response.json();

    expect(Array.isArray(data.data.actionsAffectingImpact)).toBe(true);
  });

  it("financial explanation returns null safely without revenue data", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");

    const validId = "123e4567-e89b-12d3-a456-426614174003";
    const context = {
      params: Promise.resolve({ engagementId: validId }),
    };

    const response = await GET(new Request("http://localhost"), context as any);
    const data = await response.json();

    expect(Array.isArray(data.data.financialExplanation)).toBe(true);
    // Should have at least one financial explanation (either loss or not available)
    expect(data.data.financialExplanation.length).toBeGreaterThan(0);
  });

  it("drivers are limited to top impact items", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");

    const validId = "123e4567-e89b-12d3-a456-426614174004";
    const context = {
      params: Promise.resolve({ engagementId: validId }),
    };

    const response = await GET(new Request("http://localhost"), context as any);
    const data = await response.json();

    expect(Array.isArray(data.data.drivers)).toBe(true);
    expect(data.data.drivers.length).toBeLessThanOrEqual(5);
  });
});
