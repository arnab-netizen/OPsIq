import { describe, it, expect, beforeEach, vi } from "vitest";
import { getPrimaryDecision } from "./decision-control.service";
import { db } from "@/lib/db";

vi.mock("@/lib/db");
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

vi.mock("@/services/decision-confidence/decision-confidence.service", () => ({
  computeDecisionConfidence: vi.fn(() =>
    Promise.resolve({
      score: 75,
      level: "high",
      factors: [],
      deductions: [],
    })
  ),
}));

describe("DecisionControlService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as any;
    mockDb.engagement = { findUnique: vi.fn() };
    mockDb.action = { findMany: vi.fn() };
    mockDb.finding = { findMany: vi.fn() };
    mockDb.recommendation = { findMany: vi.fn() };
  });

  const mockEngagement = {
    id: "eng-123",
    code: "ENG-001",
    title: "Test Engagement",
    clientId: "client-1",
    healthStatus: "healthy",
    status: "active",
    interventionMode: "tactical",
  };

  it("forces immediate decision on critical drift", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        title: "Critical Action",
        priority: "critical",
        status: "in_progress",
        dueDate: new Date(Date.now() + 86400000),
        updatedAt: new Date(),
      },
    ]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);

    // Mock critical drift
    const { detectExecutionDrift } = await import(
      "@/services/execution-drift/execution-drift.service"
    );
    (detectExecutionDrift as any).mockResolvedValueOnce({
      engagementId: "eng-123",
      driftDetected: true,
      severity: "critical",
      reasons: ["Execution deviation detected"],
      affectedActions: ["action-1"],
      requiredAttention: true,
      requiredAction: "action-1",
      detectedAt: new Date().toISOString(),
    });

    const decision = await getPrimaryDecision("eng-123");

    expect(decision.type).toBe("immediate");
    expect(decision.title).toContain("drift");
    expect(decision.rationale.some((r) => r.includes("drift"))).toBe(true);
  });

  it("forces immediate decision on overdue critical actions", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        title: "Overdue Critical",
        priority: "critical",
        status: "pending",
        dueDate: new Date(Date.now() - 86400000), // 1 day overdue
        updatedAt: new Date(),
      },
    ]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);

    const decision = await getPrimaryDecision("eng-123");

    expect(decision.type).toBe("immediate");
    expect(decision.actionId).toBe("action-1");
    expect(decision.rationale.some((r) => r.includes("overdue"))).toBe(true);
  });

  it("sets urgent on blocked critical actions with critical findings", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        title: "Blocked Action",
        priority: "critical",
        status: "blocked",
        dueDate: new Date(Date.now() + 86400000),
        updatedAt: new Date(),
      },
    ]);
    mockDb.finding.findMany.mockResolvedValue([
      {
        id: "finding-1",
        title: "Critical Finding",
        severity: "critical",
        status: "open",
      },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);

    const decision = await getPrimaryDecision("eng-123");

    expect(decision.type).toBe("urgent");
    expect(decision.actionId).toBe("action-1");
    expect(decision.rationale.some((r) => r.includes("blocked"))).toBe(true);
    expect(decision.rationale.some((r) => r.includes("critical finding"))).toBe(true);
  });

  it("sets urgent on low confidence with critical findings", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.finding.findMany.mockResolvedValue([
      {
        id: "finding-1",
        title: "Critical Finding",
        severity: "critical",
        status: "open",
      },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);

    // Mock low confidence
    const { computeDecisionConfidence } = await import(
      "@/services/decision-confidence/decision-confidence.service"
    );
    (computeDecisionConfidence as any).mockResolvedValueOnce({
      score: 35,
      level: "low",
      factors: [],
      deductions: [],
    });

    const decision = await getPrimaryDecision("eng-123");

    expect(decision.type).toBe("urgent");
    expect(decision.rationale.some((r) => r.includes("confidence"))).toBe(true);
  });

  it("returns recommended for normal operations with unresolved findings", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        title: "Normal Action",
        priority: "medium",
        status: "in_progress",
        dueDate: new Date(Date.now() + 86400000),
        updatedAt: new Date(),
      },
    ]);
    mockDb.finding.findMany.mockResolvedValue([
      {
        id: "finding-1",
        title: "Medium Finding",
        severity: "medium",
        status: "open",
      },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);

    const decision = await getPrimaryDecision("eng-123");

    expect(decision.type).toBe("recommended");
    expect(decision.title).toBeTruthy();
    expect(decision.instruction).toBeTruthy();
  });

  it("includes recommendation when no critical issues exist", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([
      {
        id: "rec-1",
        title: "High Priority Recommendation",
        priority: "high",
        status: "pending",
      },
    ]);

    const decision = await getPrimaryDecision("eng-123");

    expect(decision.type).toBe("recommended");
    expect(decision.rationale.some((r) => r.includes("recommendation"))).toBe(true);
  });

  it("is deterministic - same input produces same output", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        title: "Test Action",
        priority: "critical",
        status: "pending",
        dueDate: new Date(Date.now() - 86400000),
        updatedAt: new Date(),
      },
    ]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);

    const decision1 = await getPrimaryDecision("eng-123");
    const decision2 = await getPrimaryDecision("eng-123");

    expect(decision1.type).toBe(decision2.type);
    expect(decision1.actionId).toBe(decision2.actionId);
    expect(decision1.title).toBe(decision2.title);
  });

  it("returns only one primary decision", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);

    const decision = await getPrimaryDecision("eng-123");

    expect(decision).toBeDefined();
    expect(decision.decisionId).toBeTruthy();
    expect(decision.type).toBeTruthy();
    expect(["immediate", "urgent", "recommended"]).toContain(decision.type);
  });

  it("deducts confidence on blocked/critical findings", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([
      {
        id: "action-1",
        title: "Blocked",
        priority: "critical",
        status: "blocked",
        dueDate: new Date(Date.now() + 86400000),
        updatedAt: new Date(),
      },
    ]);
    mockDb.finding.findMany.mockResolvedValue([
      {
        id: "finding-1",
        title: "Critical",
        severity: "critical",
        status: "open",
      },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);

    const { computeDecisionConfidence } = await import(
      "@/services/decision-confidence/decision-confidence.service"
    );
    (computeDecisionConfidence as any).mockResolvedValueOnce({
      score: 75,
      level: "high",
      factors: [],
      deductions: [],
    });

    const decision = await getPrimaryDecision("eng-123");

    expect(decision.confidenceScore).toBeLessThan(75);
  });
});
