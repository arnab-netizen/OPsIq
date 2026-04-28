import { describe, it, expect, beforeEach, vi } from "vitest";
import { getOperatorReviewQueue } from "./operator-review.service";
import { db } from "@/lib/db";

vi.mock("@/lib/db");
vi.mock("../execution-drift/execution-drift.service", () => ({
  detectExecutionDrift: vi.fn(),
}));
vi.mock("../execution-certainty", () => ({
  calculateExecutionCertainty: vi.fn(),
}));
vi.mock("../business-impact/business-impact.service", () => ({
  generateBusinessImpact: vi.fn(),
}));
vi.mock("../decision-confidence/decision-confidence.service", () => ({
  computeDecisionConfidence: vi.fn(),
}));
vi.mock("../financial/financial-mapping.service", () => ({
  getFinancialDelta: vi.fn(),
}));

describe("OperatorReviewService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as any;
    mockDb.engagement = { findMany: vi.fn() };
    mockDb.finding = { findMany: vi.fn() };
    mockDb.recommendation = { findMany: vi.fn() };
    mockDb.action = { findMany: vi.fn() };
  });

  const mockEngagement = {
    id: "eng-1",
    code: "ENG-001",
    title: "Test Engagement",
    status: "active",
    updatedAt: new Date(),
    client: { name: "Test Client" },
    businessConditionProfile: [
      {
        estimatedMonthlyRevenue: 1000000,
      },
    ],
  };

  it("returns critical priority when drift is critical", async () => {
    const mockDb = db as any;
    const { detectExecutionDrift } = await import("../execution-drift/execution-drift.service");
    const { calculateExecutionCertainty } = await import("../execution-certainty");
    const { generateBusinessImpact } = await import("../business-impact/business-impact.service");
    const { computeDecisionConfidence } = await import("../decision-confidence/decision-confidence.service");
    const { getFinancialDelta } = await import("../financial/financial-mapping.service");

    mockDb.engagement.findMany.mockResolvedValue([mockEngagement]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    detectExecutionDrift.mockResolvedValue({
      severity: "critical",
      confidenceGap: 30,
      blockers: [],
      findings: [],
      reasons: ["Critical drift detected"],
    });

    calculateExecutionCertainty.mockReturnValue({
      score: 40,
      level: "low",
      blockers: ["Drift detected"],
      factors: [],
      reasons: [],
    });

    generateBusinessImpact.mockResolvedValue({
      impactLevel: "high",
      estimatedLoss: 150000,
      ownerDecision: { required: false, reason: "" },
      timeImpact: { timelineToFailure: 10, urgencyWindow: "days" },
      recoveryImpact: { recoveryProbability: "medium", recoveryTimeline: 30 },
      topImpactDrivers: [],
    });

    computeDecisionConfidence.mockResolvedValue({
      score: 60,
      level: "medium",
      factors: [],
      deductions: [],
    });

    getFinancialDelta.mockReturnValue({
      predictedLoss: 300000,
      actualLoss: 150000,
      valueRecovered: 150000,
    });

    const queue = await getOperatorReviewQueue();

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].priority).toBe("critical");
    expect(queue.items[0].reason).toBe("Critical execution drift detected");
    expect(queue.counts.critical).toBe(1);
    expect(queue.counts.total).toBe(1);
  });

  it("returns high priority when business impact is critical", async () => {
    const mockDb = db as any;
    const { detectExecutionDrift } = await import("../execution-drift/execution-drift.service");
    const { calculateExecutionCertainty } = await import("../execution-certainty");
    const { generateBusinessImpact } = await import("../business-impact/business-impact.service");
    const { computeDecisionConfidence } = await import("../decision-confidence/decision-confidence.service");
    const { getFinancialDelta } = await import("../financial/financial-mapping.service");

    mockDb.engagement.findMany.mockResolvedValue([mockEngagement]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    detectExecutionDrift.mockResolvedValue({
      severity: "low",
      confidenceGap: 5,
      blockers: [],
      findings: [],
      reasons: [],
    });

    calculateExecutionCertainty.mockReturnValue({
      score: 80,
      level: "high",
      blockers: [],
      factors: [],
      reasons: [],
    });

    generateBusinessImpact.mockResolvedValue({
      impactLevel: "critical",
      estimatedLoss: 300000,
      ownerDecision: { required: false, reason: "" },
      timeImpact: { timelineToFailure: 10, urgencyWindow: "days" },
      recoveryImpact: { recoveryProbability: "medium", recoveryTimeline: 30 },
      topImpactDrivers: [],
    });

    computeDecisionConfidence.mockResolvedValue({
      score: 85,
      level: "high",
      factors: [],
      deductions: [],
    });

    getFinancialDelta.mockReturnValue({
      predictedLoss: 300000,
      actualLoss: 300000,
      valueRecovered: 0,
    });

    const queue = await getOperatorReviewQueue();

    expect(queue.items[0].priority).toBe("high");
    expect(queue.items[0].reason).toBe("Critical business impact");
    expect(queue.counts.high).toBe(1);
  });

  it("returns medium priority when drift is detected", async () => {
    const mockDb = db as any;
    const { detectExecutionDrift } = await import("../execution-drift/execution-drift.service");
    const { calculateExecutionCertainty } = await import("../execution-certainty");
    const { generateBusinessImpact } = await import("../business-impact/business-impact.service");
    const { computeDecisionConfidence } = await import("../decision-confidence/decision-confidence.service");
    const { getFinancialDelta } = await import("../financial/financial-mapping.service");

    mockDb.engagement.findMany.mockResolvedValue([mockEngagement]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    detectExecutionDrift.mockResolvedValue({
      severity: "high",
      confidenceGap: 20,
      blockers: [],
      findings: [],
      reasons: ["High drift detected"],
    });

    calculateExecutionCertainty.mockReturnValue({
      score: 65,
      level: "medium",
      blockers: [],
      factors: [],
      reasons: [],
    });

    generateBusinessImpact.mockResolvedValue({
      impactLevel: "medium",
      estimatedLoss: 50000,
      ownerDecision: { required: false, reason: "" },
      timeImpact: { timelineToFailure: 20, urgencyWindow: "days" },
      recoveryImpact: { recoveryProbability: "high", recoveryTimeline: 15 },
      topImpactDrivers: [],
    });

    computeDecisionConfidence.mockResolvedValue({
      score: 70,
      level: "high",
      factors: [],
      deductions: [],
    });

    getFinancialDelta.mockReturnValue({
      predictedLoss: 150000,
      actualLoss: 50000,
      valueRecovered: 100000,
    });

    const queue = await getOperatorReviewQueue();

    expect(queue.items[0].priority).toBe("medium");
    expect(queue.items[0].reason).toBe("High execution drift");
  });

  it("handles empty engagement list", async () => {
    const mockDb = db as any;
    mockDb.engagement.findMany.mockResolvedValue([]);

    const queue = await getOperatorReviewQueue();

    expect(queue.items).toHaveLength(0);
    expect(queue.counts.total).toBe(0);
    expect(queue.counts.critical).toBe(0);
    expect(queue.counts.high).toBe(0);
    expect(queue.counts.medium).toBe(0);
    expect(queue.counts.low).toBe(0);
  });

  it("sorts items by priority then value at risk", async () => {
    const mockDb = db as any;
    const { detectExecutionDrift } = await import("../execution-drift/execution-drift.service");
    const { calculateExecutionCertainty } = await import("../execution-certainty");
    const { generateBusinessImpact } = await import("../business-impact/business-impact.service");
    const { computeDecisionConfidence } = await import("../decision-confidence/decision-confidence.service");
    const { getFinancialDelta } = await import("../financial/financial-mapping.service");

    const eng1 = { ...mockEngagement, id: "eng-1" };
    const eng2 = { ...mockEngagement, id: "eng-2" };
    const eng3 = { ...mockEngagement, id: "eng-3" };

    mockDb.engagement.findMany.mockResolvedValue([eng1, eng2, eng3]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    detectExecutionDrift.mockResolvedValue({
      severity: "low",
      confidenceGap: 0,
      blockers: [],
      findings: [],
      reasons: [],
    });

    calculateExecutionCertainty.mockReturnValue({
      score: 85,
      level: "high",
      blockers: [],
      factors: [],
      reasons: [],
    });

    generateBusinessImpact.mockResolvedValue({
      impactLevel: "low",
      estimatedLoss: 10000,
      ownerDecision: { required: false, reason: "" },
      timeImpact: { timelineToFailure: 30, urgencyWindow: "days" },
      recoveryImpact: { recoveryProbability: "high", recoveryTimeline: 7 },
      topImpactDrivers: [],
    });

    computeDecisionConfidence.mockResolvedValue({
      score: 90,
      level: "high",
      factors: [],
      deductions: [],
    });

    // Set different values at risk for sorting test
    getFinancialDelta.mockImplementationOnce(() => ({
      predictedLoss: 10000,
      actualLoss: 5000,
      valueRecovered: 5000,
    }))
      .mockImplementationOnce(() => ({
        predictedLoss: 300000,
        actualLoss: 200000,
        valueRecovered: 100000,
      }))
      .mockImplementationOnce(() => ({
        predictedLoss: 100000,
        actualLoss: 80000,
        valueRecovered: 20000,
      }));

    const queue = await getOperatorReviewQueue();

    // eng2 should be first (highest value at risk: 200000)
    // eng3 should be second (80000)
    // eng1 should be third (5000)
    expect(queue.items[0].engagementId).toBe("eng-2");
    expect(queue.items[0].valueAtRiskINR).toBe(200000);
    expect(queue.items[1].engagementId).toBe("eng-3");
    expect(queue.items[1].valueAtRiskINR).toBe(80000);
    expect(queue.items[2].engagementId).toBe("eng-1");
    expect(queue.items[2].valueAtRiskINR).toBe(5000);
  });

  it("is deterministic - same input produces same output", async () => {
    const mockDb = db as any;
    const { detectExecutionDrift } = await import("../execution-drift/execution-drift.service");
    const { calculateExecutionCertainty } = await import("../execution-certainty");
    const { generateBusinessImpact } = await import("../business-impact/business-impact.service");
    const { computeDecisionConfidence } = await import("../decision-confidence/decision-confidence.service");
    const { getFinancialDelta } = await import("../financial/financial-mapping.service");

    mockDb.engagement.findMany.mockResolvedValue([mockEngagement]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    detectExecutionDrift.mockResolvedValue({
      severity: "critical",
      confidenceGap: 30,
      blockers: [],
      findings: [],
      reasons: ["Critical drift"],
    });

    calculateExecutionCertainty.mockReturnValue({
      score: 40,
      level: "low",
      blockers: [],
      factors: [],
      reasons: [],
    });

    generateBusinessImpact.mockResolvedValue({
      impactLevel: "high",
      estimatedLoss: 150000,
      ownerDecision: { required: false, reason: "" },
      timeImpact: { timelineToFailure: 10, urgencyWindow: "days" },
      recoveryImpact: { recoveryProbability: "medium", recoveryTimeline: 30 },
      topImpactDrivers: [],
    });

    computeDecisionConfidence.mockResolvedValue({
      score: 60,
      level: "medium",
      factors: [],
      deductions: [],
    });

    getFinancialDelta.mockReturnValue({
      predictedLoss: 300000,
      actualLoss: 150000,
      valueRecovered: 150000,
    });

    const queue1 = await getOperatorReviewQueue();
    const queue2 = await getOperatorReviewQueue();

    expect(queue1.items[0].priority).toBe(queue2.items[0].priority);
    expect(queue1.items[0].reason).toBe(queue2.items[0].reason);
    expect(queue1.counts).toEqual(queue2.counts);
  });
});
