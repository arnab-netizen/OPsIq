import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDecisionEvidence } from "./decision-evidence.service";
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

vi.mock("@/services/business-impact/business-impact.service", () => ({
  generateBusinessImpact: vi.fn(() =>
    Promise.resolve({
      impactLevel: "medium",
      estimatedLoss: 100000,
      timeImpact: { timelineToFailure: 10, urgencyWindow: "days" },
      recoveryImpact: { recoveryProbability: "medium", recoveryTimeline: 30 },
      ownerDecision: { required: false },
      topImpactDrivers: [],
    })
  ),
}));

vi.mock("@/services/financial-normalization/financial-normalization.service", () => ({
  normalizeFinancialImpact: vi.fn(() => ({
    revenueAtRiskPct: 10,
    monthlyImpact: 33333,
    marginImpactPct: 6,
    burnRateImpact: 13333,
    normalizedLevel: "medium",
    reasons: [],
  })),
}));

vi.mock("@/services/decision-control/decision-control.service", () => ({
  getPrimaryDecision: vi.fn(() =>
    Promise.resolve({
      decisionId: "dec-123",
      type: "recommended",
      actionId: null,
      title: "Test Decision",
      instruction: "Test instruction",
      consequence: "Test consequence",
      confidenceScore: 75,
      rationale: [],
    })
  ),
}));

describe("DecisionEvidenceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as any;
    mockDb.engagement = { findUnique: vi.fn() };
    mockDb.action = { findMany: vi.fn() };
    mockDb.finding = { findMany: vi.fn() };
    mockDb.recommendation = { findMany: vi.fn() };
    mockDb.businessConditionProfile = { findFirst: vi.fn() };
  });

  const mockEngagement = {
    id: "eng-123",
    code: "ENG-001",
    title: "Test Engagement",
    healthStatus: "healthy",
  };

  it("includes all input categories in evidence", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([
      { id: "action-1", title: "Action 1", priority: "high", status: "in_progress", dueDate: new Date() },
    ]);
    mockDb.finding.findMany.mockResolvedValue([
      { id: "finding-1", title: "Finding 1", severity: "medium", status: "open", verified: false },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([
      { id: "rec-1", title: "Rec 1", priority: "high", status: "pending" },
    ]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue({
      estimatedMonthlyRevenue: 1000000,
    });

    const evidence = await getDecisionEvidence("eng-123");

    expect(evidence.inputs.actions.items).toHaveLength(1);
    expect(evidence.inputs.findings.items).toHaveLength(1);
    expect(evidence.inputs.recommendations.items).toHaveLength(1);
    expect(evidence.inputs.metrics).toBeDefined();
  });

  it("populates reasoning with triggers and rules", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.finding.findMany.mockResolvedValue([
      { id: "finding-1", title: "Critical", severity: "critical", status: "open", verified: false },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const evidence = await getDecisionEvidence("eng-123");

    expect(evidence.reasoning.triggers).toBeDefined();
    expect(evidence.reasoning.triggers.length).toBeGreaterThan(0);
    expect(evidence.reasoning.rulesApplied).toHaveLength(6);
    expect(evidence.reasoning.priorityLogic).toContain("Priority Order");
  });

  it("calculates confidence breakdown correctly", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([
      { id: "action-1", title: "Action", priority: "high", status: "in_progress", dueDate: new Date() },
    ]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue({ estimatedMonthlyRevenue: 1000000 });

    const evidence = await getDecisionEvidence("eng-123");

    expect(evidence.confidenceBreakdown.executionCertainty).toBe(75);
    expect(evidence.confidenceBreakdown.dataCompleteness).toBeGreaterThanOrEqual(0);
    expect(evidence.confidenceBreakdown.dataCompleteness).toBeLessThanOrEqual(100);
    expect(evidence.confidenceBreakdown.riskLevel).toBeGreaterThanOrEqual(0);
    expect(evidence.confidenceBreakdown.riskLevel).toBeLessThanOrEqual(100);
    expect(evidence.confidenceBreakdown.overallScore).toBeGreaterThanOrEqual(-100);
    expect(evidence.confidenceBreakdown.overallScore).toBeLessThanOrEqual(100);
  });

  it("includes impact basis with financial and timeline data", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue({ estimatedMonthlyRevenue: 1000000 });

    const evidence = await getDecisionEvidence("eng-123");

    expect(evidence.impactBasis).toBeDefined();
    expect(evidence.impactBasis.financial).toBeDefined();
    expect(evidence.impactBasis.timelineToFailureHours).toBeDefined();
    expect(evidence.impactBasis.recoveryProbabilityPct).toBeGreaterThanOrEqual(0);
    expect(evidence.impactBasis.recoveryProbabilityPct).toBeLessThanOrEqual(100);
    expect(evidence.impactBasis.driftSeverityScore).toBeGreaterThanOrEqual(0);
    expect(evidence.impactBasis.driftSeverityScore).toBeLessThanOrEqual(100);
  });

  it("is deterministic - same input produces same output", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([
      { id: "action-1", title: "Action", priority: "critical", status: "pending", dueDate: new Date(Date.now() - 86400000) },
    ]);
    mockDb.finding.findMany.mockResolvedValue([
      { id: "finding-1", title: "Finding", severity: "critical", status: "open", verified: false },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const evidence1 = await getDecisionEvidence("eng-123");
    const evidence2 = await getDecisionEvidence("eng-123");

    expect(evidence1.decisionId).toBe(evidence2.decisionId);
    expect(evidence1.inputs.actions.total).toBe(evidence2.inputs.actions.total);
    expect(evidence1.reasoning.triggers.length).toBe(evidence2.reasoning.triggers.length);
    expect(evidence1.confidenceBreakdown.overallScore).toBe(evidence2.confidenceBreakdown.overallScore);
  });

  it("handles empty inputs without crashing", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const evidence = await getDecisionEvidence("eng-123");

    expect(evidence).toBeDefined();
    expect(evidence.inputs.actions.total).toBe(0);
    expect(evidence.inputs.findings.total).toBe(0);
    expect(evidence.inputs.recommendations.total).toBe(0);
    expect(evidence.reasoning.triggers).toBeDefined();
    expect(evidence.reasoning.triggers.length).toBeGreaterThan(0);
  });

  it("calculates action categories correctly", async () => {
    const mockDb = db as any;
    const futureDate = new Date(Date.now() + 86400000);
    const pastDate = new Date(Date.now() - 86400000);

    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([
      { id: "action-1", title: "Critical Overdue", priority: "critical", status: "pending", dueDate: pastDate },
      { id: "action-2", title: "Blocked", priority: "high", status: "blocked", dueDate: futureDate },
      { id: "action-3", title: "On Track", priority: "medium", status: "in_progress", dueDate: futureDate },
    ]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const evidence = await getDecisionEvidence("eng-123");

    expect(evidence.inputs.actions.total).toBe(3);
    expect(evidence.inputs.actions.overdue).toBe(1);
    expect(evidence.inputs.actions.blocked).toBe(1);
    expect(evidence.inputs.actions.critical).toBe(1);
  });

  it("categorizes findings by severity and status", async () => {
    const mockDb = db as any;
    mockDb.engagement.findUnique.mockResolvedValue(mockEngagement);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.finding.findMany.mockResolvedValue([
      { id: "f1", title: "Critical Open", severity: "critical", status: "open", verified: false },
      { id: "f2", title: "Critical Resolved", severity: "critical", status: "resolved", verified: true },
      { id: "f3", title: "Medium Open", severity: "medium", status: "open", verified: false },
    ]);
    mockDb.recommendation.findMany.mockResolvedValue([]);
    mockDb.businessConditionProfile.findFirst.mockResolvedValue(null);

    const evidence = await getDecisionEvidence("eng-123");

    expect(evidence.inputs.findings.total).toBe(3);
    expect(evidence.inputs.findings.critical).toBe(2);
    expect(evidence.inputs.findings.unresolved).toBe(2);
  });
});
