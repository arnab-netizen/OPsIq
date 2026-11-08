/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findUniqueOrThrow: vi.fn(),
    },
    engagement: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/service-auth", () => ({
  requireServiceContext: vi.fn(),
}));

describe("Workspace Setup Service [db]", () => {
  const mockWorkspaceId = "00000000-0000-0000-0000-000000000001";
  const mockUserId = "00000000-0000-0000-0000-000000000002";

  const mockCtx: CanonicalAuthContext = {
    verifiedWorkspaceId: mockWorkspaceId,
    verifiedActorId: mockUserId,
    verifiedUserEmail: "test@example.com",
    request: new Request("http://localhost/api/owner/workspace-setup"),
  };

  let getWorkspaceSetup: any;
  let saveWorkspaceSetup: any;
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const serviceModule = await import("@/services/workspace-setup.service");
    getWorkspaceSetup = serviceModule.getWorkspaceSetup;
    saveWorkspaceSetup = serviceModule.saveWorkspaceSetup;
    const dbModule = await import("@/lib/db");
    mockDb = dbModule.db;
  });

  it("should return WORKSPACE_EXISTS when no engagement exists", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      slug: "test-workspace",
      description: null,
      createdBy: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue(null);

    const result = await getWorkspaceSetup(mockCtx, mockWorkspaceId);

    expect(result.setupState).toBe("WORKSPACE_EXISTS");
    expect(result.firstValueReady).toBe(false);
    expect(result.progress.progressPercent).toBe(0);
  });

  it("should mark as MINIMUM_SETUP_COMPLETE when all required fields are present", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Business",
      slug: "test-business",
      description: null,
      createdBy: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      code: "WS-001",
      title: "Setup",
      clientId: "client-123",
      serviceTier: "standard",
      engagementMode: "advisory",
      metadata: {
        businessName: "Test Business",
        industryCategory: "Tech",
        operatingLocation: "US",
        revenueModel: "SaaS",
        monthlyRevenueEstimate: "$50,000",
        monthlyCostEstimate: "$30,000",
        teamSizeCapacity: "5-10",
        customerSegment: "Enterprise",
        mainCurrentProblem: "Scaling",
        ownerTimeConstraint: "10 hrs/week",
      },
    });

    const result = await getWorkspaceSetup(mockCtx, mockWorkspaceId);

    expect(result.setupState).toBe("MINIMUM_SETUP_COMPLETE");
    expect(result.firstValueReady).toBe(true);
    expect(result.progress.progressPercent).toBe(100);
  });


  it("should save setup data and create engagement if missing", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Business",
      slug: "test-business",
      description: null,
      createdBy: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue(null);

    mockDb.engagement.create.mockResolvedValue({
      id: "engagement-123",
      code: "WS-001",
      title: "Setup",
      clientId: "client-123",
      serviceTier: "standard",
      engagementMode: "advisory",
      workspaceId: mockWorkspaceId,
      metadata: {
        businessName: "Test Business",
        industryCategory: "Tech",
      },
    });

    const input = {
      businessBasics: {
        businessName: "Test Business",
        industryCategory: "Tech",
        operatingLocationMarket: "US",
        revenueModel: "SaaS",
      },
      ownerConstraints: {
        ownerTimeConstraint: "10 hrs/week",
      },
      financialBasics: {
        monthlyRevenueEstimate: "$50,000",
        monthlyCostEstimate: "$30,000",
      },
      capacityBasics: {
        teamSizeCapacity: "5-10",
      },
      customerBasics: {
        customerSegment: "Enterprise",
        mainCurrentProblem: "Scaling",
      },
    };

    const result = await saveWorkspaceSetup(mockCtx, mockWorkspaceId, input);

    expect(result.success).toBe(true);
    expect(result.workspaceId).toBe(mockWorkspaceId);
    expect(mockDb.engagement.create).toHaveBeenCalled();
  });

  it("should update existing engagement metadata", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Business",
      slug: "test-business",
      description: null,
      createdBy: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      code: "WS-001",
      title: "Setup",
      clientId: "client-123",
      serviceTier: "standard",
      engagementMode: "advisory",
      metadata: {
        businessName: "Old Name",
      },
    });

    mockDb.engagement.update.mockResolvedValue({
      id: "engagement-123",
      metadata: {
        businessName: "New Name",
      },
    });

    const input = {
      businessBasics: {
        businessName: "New Name",
      },
    };

    const result = await saveWorkspaceSetup(mockCtx, mockWorkspaceId, input);

    expect(result.success).toBe(true);
    expect(mockDb.engagement.update).toHaveBeenCalled();
  });


  it("should include missing data warning when setup incomplete", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test Workspace",
      slug: "test-workspace",
      description: null,
      createdBy: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      code: "WS-001",
      title: "Setup",
      clientId: "client-123",
      serviceTier: "standard",
      engagementMode: "advisory",
      metadata: {
        businessName: "Test",
      },
    });

    const result = await getWorkspaceSetup(mockCtx, mockWorkspaceId);

    expect(result.safetyWarnings).toContain(
      "Setup is incomplete. First-value visibility cannot be computed yet."
    );
  });

  it("should compute progress percent correctly", async () => {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name: "Test",
      slug: "test",
      description: null,
      createdBy: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.engagement.findFirst.mockResolvedValue({
      id: "engagement-123",
      workspaceId: mockWorkspaceId,
      code: "WS-001",
      title: "Setup",
      clientId: "client-123",
      serviceTier: "standard",
      engagementMode: "advisory",
      metadata: {
        businessName: "Test",
        industryCategory: "Tech",
        operatingLocation: "US",
        revenueModel: "SaaS",
        monthlyRevenueEstimate: "$50,000",
      },
    });

    const result = await getWorkspaceSetup(mockCtx, mockWorkspaceId);

    expect(result.progress.progressPercent).toBe(50);
  });

});
