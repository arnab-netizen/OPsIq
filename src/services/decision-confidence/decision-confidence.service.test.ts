import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeDecisionConfidence } from "./decision-confidence.service";

vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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
  detectExecutionDrift: vi.fn(() =>
    Promise.resolve({
      engagementId: "eng-123",
      driftDetected: false,
      severity: "low",
      reasons: [],
      affectedActions: [],
      requiredAttention: false,
      requiredAction: null,
      detectedAt: new Date().toISOString(),
    })
  ),
}));

describe("DecisionConfidenceService", () => {
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    mockDb = db;
  });

  const mockEngagement = {
    id: "eng-123",
    code: "ENG-001",
    title: "Test Engagement",
    clientId: "client-1",
    healthStatus: "healthy" as const,
    status: "active",
    interventionMode: "tactical",
  };

  it("achieves very_high confidence with strong signals", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        title: "Action 1",
        priority: "high",
        status: "in_progress",
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10), // 10 days in future
        updatedAt: new Date(), // Recently updated
      },
    ]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    // Mock high execution certainty
    const { calculateExecutionCertainty } = await import(
      "@/services/execution-certainty"
    );
    (calculateExecutionCertainty as any).mockReturnValue({
      score: 80,
      level: "high",
      blockers: [],
      risks: [],
      reasons: [],
    });

    const result = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1" });

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.level).toBe("very_high");
  });

  it("deducts points for low execution certainty", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    // Mock low execution certainty
    const { calculateExecutionCertainty } = await import(
      "@/services/execution-certainty"
    );
    (calculateExecutionCertainty as any).mockReturnValue({
      score: 35,
      level: "low",
      blockers: [],
      risks: [],
      reasons: [],
    });

    const result = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1" });

    const lowCertaintyDeduction = result.deductions.find(
      (d) => d.reason.includes("certainty")
    );
    expect(lowCertaintyDeduction).toBeDefined();
    expect(lowCertaintyDeduction?.points).toBe(25);
  });

  it("deducts points for critical drift severity", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    // Mock critical drift
    const { detectExecutionDrift } = await import(
      "@/services/execution-drift/execution-drift.service"
    );
    (detectExecutionDrift as any).mockResolvedValueOnce({
      engagementId: "eng-123",
      driftDetected: true,
      severity: "critical",
      reasons: ["Critical drift detected"],
      affectedActions: [],
      requiredAttention: true,
      requiredAction: null,
      detectedAt: new Date().toISOString(),
    });

    const result = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1" });

    const driftDeduction = result.deductions.find((d) =>
      d.reason.includes("drift")
    );
    expect(driftDeduction).toBeDefined();
    expect(driftDeduction?.points).toBe(25);
  });

  it("deducts points for overdue critical actions", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        title: "Critical Action",
        priority: "critical",
        status: "pending",
        dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day overdue
        updatedAt: new Date(),
      },
    ]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const result = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1" });

    const overdueDeduction = result.deductions.find((d) =>
      d.reason.includes("overdue")
    );
    expect(overdueDeduction).toBeDefined();
    expect(overdueDeduction?.points).toBe(20);
  });

  it("deducts points for blockers", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    // Mock blockers
    const { calculateExecutionCertainty } = await import(
      "@/services/execution-certainty"
    );
    (calculateExecutionCertainty as any).mockReturnValue({
      score: 75,
      level: "high",
      blockers: ["blocker-1", "blocker-2"],
      risks: [],
      reasons: [],
    });

    const result = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1" });

    const blockerDeduction = result.deductions.find((d) =>
      d.reason.includes("blocker")
    );
    expect(blockerDeduction).toBeDefined();
    expect(blockerDeduction?.points).toBe(15);
  });

  it("deducts points for unresolved critical findings", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([
      {
        id: "finding-1",
        severity: "critical",
        status: "open",
        verified: false,
      },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const result = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1" });

    const findingDeduction = result.deductions.find((d) =>
      d.reason.includes("finding")
    );
    expect(findingDeduction).toBeDefined();
    expect(findingDeduction?.points).toBe(15);
  });

  it("deducts points for stale actions (no updates in 7 days)", async () => {
    const sevenDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    mockDb.engagement.findFirst.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        title: "Stale Action",
        priority: "high",
        status: "in_progress",
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
        updatedAt: sevenDaysAgo,
      },
    ]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const result = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1" });

    const staleDeduction = result.deductions.find((d) =>
      d.reason.includes("7 days")
    );
    expect(staleDeduction).toBeDefined();
    expect(staleDeduction?.points).toBe(10);
  });

  it("does not apply stale deduction if no actions exist", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]); // No actions
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const result = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1" });

    const staleDeduction = result.deductions.find((d) =>
      d.reason.includes("7 days")
    );
    expect(staleDeduction).toBeUndefined(); // Should not exist
  });

  it("clamps score to 0-100", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([
      {
        id: "finding-1",
        severity: "critical",
        status: "open",
        verified: false,
      },
      {
        id: "finding-2",
        severity: "critical",
        status: "open",
        verified: false,
      },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        priority: "critical",
        status: "pending",
        dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
        updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
    ]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    // Mock very low execution certainty
    const { calculateExecutionCertainty } = await import(
      "@/services/execution-certainty"
    );
    (calculateExecutionCertainty as any).mockReturnValue({
      score: 20,
      level: "low",
      blockers: ["blocker-1"],
      risks: [],
      reasons: [],
    });

    const result = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1" });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("is deterministic - same input produces same output", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(mockEngagement);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const asOf = new Date("2026-04-28T12:00:00Z");
    const result1 = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1", asOf });
    const result2 = await computeDecisionConfidence({ engagementId: "eng-123", workspaceId: "workspace-1", asOf });

    expect(result1.score).toBe(result2.score);
    expect(result1.level).toBe(result2.level);
    expect(result1.deductions).toEqual(result2.deductions);
  });
});
