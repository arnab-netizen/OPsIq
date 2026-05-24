import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

// Mock db and service-auth before importing the service
vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findUniqueOrThrow: vi.fn(),
    },
    engagement: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/service-auth", () => ({
  requireServiceContext: vi.fn(),
}));

describe("First-Value Service [db]", () => {
  const mockWorkspaceId = "00000000-0000-0000-0000-000000000001";
  const mockUserId = "00000000-0000-0000-0000-000000000002";

  const mockCtx: CanonicalAuthContext = {
    verifiedWorkspaceId: mockWorkspaceId,
    verifiedActorId: mockUserId,
    verifiedUserEmail: "test@example.com",
    request: {} as any,
  };

  let getFirstValue: any;
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Import service after mocks are set up
    const serviceModule = await import("@/services/first-value.service");
    getFirstValue = serviceModule.getFirstValue;
    const dbModule = await import("@/lib/db");
    mockDb = dbModule.db;
  });

  it("should return EMPTY_WORKSPACE state when no engagement exists", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue(null);

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.state).toBe("EMPTY_WORKSPACE");
    expect(result.confidence).toBe("CANNOT_DETERMINE");
    expect(result.businessSnapshot).toBeNull();
  });

  it("should return MINIMUM_DATA_PRESENT with findings but no actions", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      name: "Test Engagement",
      businessConditionProfile: { industry: "Software" },
      interventionMode: "ADVISORY",
      interventionPhase: "DISCOVERY",
      health: "AT_RISK",
      status: "ACTIVE",
      findings: [
        {
          id: "finding-1",
          title: "Test Risk",
          description: "High risk identified",
          category: "OPERATIONAL_RISK",
          severity: "HIGH",
          confidence: "HIGH_CONFIDENCE",
          source: "ANALYSIS",
          status: "ACTIVE",
          createdAt: new Date(),
          engagementId: "engagement-123",
          externalId: "ext-1",
          supportingEvidenceIds: [],
          contradictingEvidenceIds: [],
        },
      ],
      actions: [],
      kpis: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.state).toBe("MINIMUM_DATA_PRESENT");
    expect(result.confidence).toBe("MEDIUM_CONFIDENCE");
    expect(result.topRisks.length).toBeGreaterThan(0);
  });

  it("should return FIRST_VALUE_READY with findings and actions", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      name: "Test Engagement",
      businessConditionProfile: { industry: "Software" },
      interventionMode: "ADVISORY",
      interventionPhase: "DISCOVERY",
      health: "AT_RISK",
      status: "ACTIVE",
      findings: [
        {
          id: "finding-1",
          title: "Test Risk",
          description: "High risk identified",
          category: "OPERATIONAL_RISK",
          severity: "HIGH",
          confidence: "HIGH_CONFIDENCE",
          source: "ANALYSIS",
          status: "ACTIVE",
          createdAt: new Date(),
          engagementId: "engagement-123",
          externalId: "ext-1",
          supportingEvidenceIds: [],
          contradictingEvidenceIds: [],
        },
      ],
      actions: [
        {
          id: "action-1",
          title: "Hire engineer",
          description: "Bring in contractor",
          actionType: "HIRING",
          priority: "HIGH",
          status: "RECOMMENDED",
          expectedOutcome: "Unblock roadmap",
          effort: "MEDIUM",
          riskLevel: "MEDIUM",
          recommendedBy: "ADVISOR",
          createdAt: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          engagementId: "engagement-123",
          externalId: "ext-action-1",
        },
      ],
      kpis: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.state).toBe("FIRST_VALUE_READY");
    expect(result.confidence).toBe("HIGH_CONFIDENCE");
    expect(result.recommendedFirstAction).not.toBeNull();
  });

  it("should extract top risks from findings", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      name: "Test Engagement",
      businessConditionProfile: { industry: "Software" },
      interventionMode: "ADVISORY",
      interventionPhase: "DISCOVERY",
      health: "AT_RISK",
      status: "ACTIVE",
      findings: [
        {
          id: "finding-1",
          title: "Critical Risk",
          description: "Critical issue",
          category: "OPERATIONAL_RISK",
          severity: "CRITICAL",
          confidence: "HIGH_CONFIDENCE",
          source: "ANALYSIS",
          status: "ACTIVE",
          createdAt: new Date(),
          engagementId: "engagement-123",
          externalId: "ext-1",
          supportingEvidenceIds: [],
          contradictingEvidenceIds: [],
        },
        {
          id: "finding-2",
          title: "High Risk",
          description: "High priority issue",
          category: "OPERATIONAL_RISK",
          severity: "HIGH",
          confidence: "MEDIUM_CONFIDENCE",
          source: "ANALYSIS",
          status: "ACTIVE",
          createdAt: new Date(),
          engagementId: "engagement-123",
          externalId: "ext-2",
          supportingEvidenceIds: [],
          contradictingEvidenceIds: [],
        },
      ],
      actions: [],
      kpis: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.topRisks.length).toBeGreaterThan(0);
    expect(result.topRisks[0].severity).toBe("CRITICAL");
  });

  it("should extract top opportunities from findings", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      name: "Test Engagement",
      businessConditionProfile: { industry: "Software" },
      interventionMode: "ADVISORY",
      interventionPhase: "DISCOVERY",
      health: "STABLE",
      status: "ACTIVE",
      findings: [
        {
          id: "finding-1",
          title: "Growth Opportunity",
          description: "Market expansion possible",
          category: "OPERATIONAL_OPPORTUNITY",
          severity: "HIGH",
          confidence: "HIGH_CONFIDENCE",
          source: "MARKET_ANALYSIS",
          status: "ACTIVE",
          createdAt: new Date(),
          engagementId: "engagement-123",
          externalId: "ext-1",
          supportingEvidenceIds: [],
          contradictingEvidenceIds: [],
        },
      ],
      actions: [],
      kpis: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.topOpportunities.length).toBeGreaterThan(0);
  });

  it("should recommend first action when evidence exists", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      name: "Test Engagement",
      businessConditionProfile: { industry: "Software" },
      interventionMode: "ADVISORY",
      interventionPhase: "DISCOVERY",
      health: "AT_RISK",
      status: "ACTIVE",
      findings: [
        {
          id: "finding-1",
          title: "Risk",
          description: "Issue",
          category: "OPERATIONAL_RISK",
          severity: "HIGH",
          confidence: "HIGH_CONFIDENCE",
          source: "ANALYSIS",
          status: "ACTIVE",
          createdAt: new Date(),
          engagementId: "engagement-123",
          externalId: "ext-1",
          supportingEvidenceIds: [],
          contradictingEvidenceIds: [],
        },
      ],
      actions: [
        {
          id: "action-1",
          title: "Take Action",
          description: "Fix the issue",
          actionType: "PROCESS_IMPROVEMENT",
          priority: "HIGH",
          status: "RECOMMENDED",
          expectedOutcome: "Reduce risk",
          effort: "SMALL",
          riskLevel: "LOW",
          recommendedBy: "ADVISOR",
          createdAt: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          engagementId: "engagement-123",
          externalId: "ext-action-1",
        },
      ],
      kpis: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.recommendedFirstAction).not.toBeNull();
    expect(result.recommendedFirstAction?.action).toBe("Take Action");
    expect(result.recommendedFirstActionReason).toBe("ACTION_READY_FOR_EXECUTION");
  });

  it("should not recommend action without evidence", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      name: "Test Engagement",
      businessConditionProfile: { industry: "Software" },
      interventionMode: "ADVISORY",
      interventionPhase: "DISCOVERY",
      health: "STABLE",
      status: "ACTIVE",
      findings: [],
      actions: [
        {
          id: "action-1",
          title: "Action",
          description: "Action without evidence",
          actionType: "PROCESS_IMPROVEMENT",
          priority: "MEDIUM",
          status: "RECOMMENDED",
          expectedOutcome: "Unknown",
          effort: "MEDIUM",
          riskLevel: "MEDIUM",
          recommendedBy: "ADVISOR",
          createdAt: new Date(),
          dueDate: new Date(),
          engagementId: "engagement-123",
          externalId: "ext-action-1",
        },
      ],
      kpis: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.recommendedFirstAction).toBeNull();
    expect(result.recommendedFirstActionReason).toBe("NO_ACTION_EVIDENCE");
  });

  it("should identify missing data areas", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue(null);

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.missingDataAreas.length).toBeGreaterThan(0);
    expect(result.missingDataAreas[0]).toBe("No engagement created yet");
  });

  it("should generate DEMO badge for demo workspace", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "DEMO Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue(null);

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.isDemo).toBe(true);
  });

  it("should include safety warnings for empty workspaces", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue(null);

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.safetyWarnings.length).toBeGreaterThan(0);
    expect(result.safetyWarnings[0]).toContain("minimal data");
  });

  it("should return correct data readiness metrics", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      name: "Test Engagement",
      businessConditionProfile: { industry: "Software" },
      interventionMode: "ADVISORY",
      interventionPhase: "DISCOVERY",
      health: "AT_RISK",
      status: "ACTIVE",
      findings: [
        {
          id: "finding-1",
          title: "Risk",
          description: "Issue",
          category: "OPERATIONAL_RISK",
          severity: "HIGH",
          confidence: "HIGH_CONFIDENCE",
          source: "ANALYSIS",
          status: "ACTIVE",
          createdAt: new Date(),
          engagementId: "engagement-123",
          externalId: "ext-1",
          supportingEvidenceIds: [],
          contradictingEvidenceIds: [],
        },
      ],
      actions: [
        {
          id: "action-1",
          title: "Action",
          description: "Action",
          actionType: "PROCESS_IMPROVEMENT",
          priority: "HIGH",
          status: "RECOMMENDED",
          expectedOutcome: "Improve",
          effort: "MEDIUM",
          riskLevel: "MEDIUM",
          recommendedBy: "ADVISOR",
          createdAt: new Date(),
          dueDate: new Date(),
          engagementId: "engagement-123",
          externalId: "ext-action-1",
        },
      ],
      kpis: [
        {
          id: "kpi-1",
          name: "Revenue",
          metricType: "CURRENCY",
          currentValue: 100000,
          benchmarkValue: 150000,
          trend: "INCREASING",
          lastMeasuredAt: new Date(),
          description: "Monthly revenue",
          engagementId: "engagement-123",
          externalId: "ext-kpi-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.dataReadiness.hasEngagement).toBe(true);
    expect(result.dataReadiness.hasFinding).toBe(true);
    expect(result.dataReadiness.hasAction).toBe(true);
    expect(result.dataReadiness.hasKPI).toBe(true);
    expect(result.dataReadiness.percentComplete).toBeGreaterThan(0);
  });
});
