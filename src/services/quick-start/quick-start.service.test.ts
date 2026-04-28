import { describe, it, expect, beforeEach, vi } from "vitest";
import { createQuickStartEngagement } from "./quick-start.service";
import { db } from "@/lib/db";

vi.mock("@/lib/db");
vi.mock("../business-impact/business-impact.service", () => ({
  generateBusinessImpact: vi.fn(() =>
    Promise.resolve({
      impactLevel: "high",
      estimatedLoss: 250000,
      ownerDecision: { required: false, reason: "" },
      timeImpact: { timelineToFailure: 15, urgencyWindow: "days" },
      recoveryImpact: { recoveryProbability: "medium", recoveryTimeline: 30 },
      topImpactDrivers: [],
    })
  ),
}));
vi.mock("../execution-certainty", () => ({
  calculateExecutionCertainty: vi.fn(() => ({
    score: 75,
    level: "high",
    blockers: [],
    factors: [],
    reasons: [],
  })),
}));
vi.mock("../execution-drift/execution-drift.service", () => ({
  detectExecutionDrift: vi.fn(() =>
    Promise.resolve({
      severity: "medium",
      confidenceGap: 15,
      blockers: [],
      findings: [],
      reasons: [],
    })
  ),
}));
vi.mock("../decision-confidence/decision-confidence.service", () => ({
  computeDecisionConfidence: vi.fn(() =>
    Promise.resolve({
      score: 70,
      level: "high",
      factors: [],
      deductions: [],
    })
  ),
}));
vi.mock("../financial/financial-mapping.service", () => ({
  getFinancialDelta: vi.fn(() => ({
    predictedLoss: 500000,
    actualLoss: 250000,
    valueRecovered: 250000,
  })),
}));

describe("QuickStartService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as any;
    mockDb.client = { create: vi.fn() };
    mockDb.engagement = { create: vi.fn() };
    mockDb.businessConditionProfile = { create: vi.fn() };
    mockDb.finding = { create: vi.fn() };
  });

  it("creates engagement from minimal input", async () => {
    const mockDb = db as any;
    const mockClient = { id: "client-1", name: "Test Business", status: "active" };
    const mockEngagement = {
      id: "eng-1",
      code: "QUICK-START-123456",
      title: "Test Business - Quick Start",
      status: "active",
      clientId: "client-1",
    };
    const mockCondition = {
      engagementId: "eng-1",
      estimatedMonthlyRevenue: 1000000,
      isCurrent: true,
      currentPerformanceLevel: "critical",
    };
    const mockFinding = {
      id: "finding-1",
      engagementId: "eng-1",
      title: "Cash flow issue",
      description: "Cash flow issue",
      severity: "critical",
      verified: false,
      stage: "identified",
    };

    mockDb.client.create.mockResolvedValue(mockClient);
    mockDb.engagement.create.mockResolvedValue(mockEngagement);
    mockDb.businessConditionProfile.create.mockResolvedValue(mockCondition);
    mockDb.finding.create.mockResolvedValue(mockFinding);

    const result = await createQuickStartEngagement({
      businessName: "Test Business",
      problems: ["Cash flow issue"],
    });

    expect(result.clientId).toBe("client-1");
    expect(result.engagementId).toBe("eng-1");
    expect(result.businessImpact).toBe("high");
    expect(result.executionCertainty).toBe(75);
    expect(result.valueAtRiskINR).toBe(250000);
  });

  it("handles missing revenue with default value", async () => {
    const mockDb = db as any;
    mockDb.client.create.mockResolvedValue({ id: "client-2" });
    mockDb.engagement.create.mockResolvedValue({ id: "eng-2", clientId: "client-2" });
    mockDb.businessConditionProfile.create.mockImplementation((opts: any) => {
      expect(opts.data.estimatedMonthlyRevenue).toBe(1000000);
      return Promise.resolve({ engagementId: "eng-2" });
    });
    mockDb.finding.create.mockResolvedValue({
      id: "finding-1",
      severity: "critical",
      verified: false,
    });

    const result = await createQuickStartEngagement({
      businessName: "No Revenue Business",
      problems: ["Problem 1"],
    });

    expect(result.clientId).toBe("client-2");
  });

  it("creates findings from multiple problems with varying severity", async () => {
    const mockDb = db as any;
    const findingInputs: any[] = [];

    mockDb.client.create.mockResolvedValue({ id: "client-3" });
    mockDb.engagement.create.mockResolvedValue({ id: "eng-3", clientId: "client-3" });
    mockDb.businessConditionProfile.create.mockResolvedValue({ engagementId: "eng-3" });
    mockDb.finding.create.mockImplementation((opts: any) => {
      findingInputs.push(opts.data);
      return Promise.resolve({
        id: `finding-${findingInputs.length}`,
        ...opts.data,
      });
    });

    await createQuickStartEngagement({
      businessName: "Multi-Problem Business",
      problems: ["Critical issue", "High issue", "Medium issue"],
    });

    expect(findingInputs).toHaveLength(3);
    expect(findingInputs[0].severity).toBe("critical");
    expect(findingInputs[1].severity).toBe("high");
    expect(findingInputs[2].severity).toBe("medium");
    expect(findingInputs[0].title).toBe("Critical issue");
    expect(findingInputs[1].title).toBe("High issue");
  });

  it("returns deterministic result with same input", async () => {
    const mockDb = db as any;
    mockDb.client.create.mockResolvedValue({ id: "client-4" });
    mockDb.engagement.create.mockResolvedValue({ id: "eng-4", clientId: "client-4" });
    mockDb.businessConditionProfile.create.mockResolvedValue({ engagementId: "eng-4" });
    mockDb.finding.create.mockResolvedValue({
      id: "finding-1",
      severity: "critical",
      verified: false,
    });

    const input = {
      businessName: "Deterministic Business",
      monthlyRevenueINR: 5000000,
      problems: ["Issue 1"],
    };

    const result1 = await createQuickStartEngagement(input);
    const result2 = await createQuickStartEngagement(input);

    expect(result1.primaryDecision).toBe(result2.primaryDecision);
    expect(result1.businessImpact).toBe(result2.businessImpact);
    expect(result1.executionCertainty).toBe(result2.executionCertainty);
    expect(result1.valueAtRiskINR).toBe(result2.valueAtRiskINR);
  });

  it("determines primary decision based on impact and drift", async () => {
    const mockDb = db as any;
    const { generateBusinessImpact } = await import("../business-impact/business-impact.service");
    const { detectExecutionDrift } = await import("../execution-drift/execution-drift.service");

    mockDb.client.create.mockResolvedValue({ id: "client-5" });
    mockDb.engagement.create.mockResolvedValue({ id: "eng-5", clientId: "client-5" });
    mockDb.businessConditionProfile.create.mockResolvedValue({ engagementId: "eng-5" });
    mockDb.finding.create.mockResolvedValue({
      id: "finding-1",
      severity: "critical",
      verified: false,
    });

    // Test case: critical impact -> should recommend intervention within 7 days
    generateBusinessImpact.mockResolvedValueOnce({
      impactLevel: "critical",
      estimatedLoss: 500000,
      ownerDecision: { required: false, reason: "" },
      timeImpact: { timelineToFailure: 5, urgencyWindow: "days" },
      recoveryImpact: { recoveryProbability: "medium", recoveryTimeline: 30 },
      topImpactDrivers: [],
    });
    detectExecutionDrift.mockResolvedValueOnce({
      severity: "low",
      confidenceGap: 5,
      blockers: [],
      findings: [],
      reasons: [],
    });

    const result = await createQuickStartEngagement({
      businessName: "Critical Impact Business",
      problems: ["Critical issue"],
    });

    expect(result.primaryDecision).toContain("7 days");
  });

  it("throws error for missing required inputs", async () => {
    await expect(
      createQuickStartEngagement({
        businessName: "",
        problems: ["Issue"],
      })
    ).rejects.toThrow();

    await expect(
      createQuickStartEngagement({
        businessName: "Business",
        problems: [],
      })
    ).rejects.toThrow();
  });
});
