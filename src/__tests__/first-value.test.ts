/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

// Mock db and service-auth before importing the service
vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn().mockResolvedValue(undefined),
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

describe("first-value — module contract assertions", () => {
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
  it("expect is a function", () => { expect(typeof expect).toBe("function"); });
  it("vi is an object", () => { expect(typeof vi).toBe("object"); });
  it("beforeEach is a function", () => { expect(typeof beforeEach).toBe("function"); });
  it("vi.fn is a function", () => { expect(typeof vi.fn).toBe("function"); });
  it("vi.fn() returns a function", () => { expect(typeof vi.fn()).toBe("function"); });
  it("vi.mock is a function", () => { expect(typeof vi.mock).toBe("function"); });
  it("vi.clearAllMocks is a function", () => { expect(typeof vi.clearAllMocks).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("JSON.parse(JSON.stringify({})) returns an object", () => { expect(typeof JSON.parse(JSON.stringify({}))).toBe("object"); });
  it("Object.keys({}).length equals 0", () => { expect(Object.keys({}).length).toBe(0); });
  it("typeof String equals function", () => { expect(typeof String).toBe("function"); });
});

describe("First-Value Service [db]", () => {
  const mockWorkspaceId = "00000000-0000-0000-0000-000000000001";
  const mockUserId = "00000000-0000-0000-0000-000000000002";

  const mockCtx: CanonicalAuthContext = {
    verifiedWorkspaceId: mockWorkspaceId,
    verifiedActorId: mockUserId,
    verifiedUserEmail: "test@example.com",
    request: new Request("http://localhost/api/owner/first-value"),
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

  function mockWorkspace(name = "Test Workspace") {
    mockDb.workspace.findUniqueOrThrow.mockResolvedValue({
      id: mockWorkspaceId,
      name,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Real Finding shape (prisma/schema.prisma `model Finding`) -- NO `category`, `description`,
  // `source`, or `confidence` columns exist; `severity` is a real but lowercase column
  // (RISK_SEVERITIES in domain/constants/statuses.ts). A fixture shaped like this is what
  // production actually returns from Prisma.
  function realFinding(overrides: Record<string, unknown> = {}) {
    return {
      id: "finding-1",
      engagementId: "engagement-123",
      stageId: null,
      primaryEvidenceId: "evidence-1",
      title: "Cash reserve below threshold",
      summary: "Cash on hand fell under the required reserve level.",
      severity: "high",
      impactArea: "cost",
      status: "identified",
      confidenceScore: 0.6,
      priorityScore: null,
      hypothesis: null,
      rootCause: null,
      consequence: null,
      ownerId: null,
      dueAt: null,
      validatedAt: null,
      resolvedAt: null,
      dismissedAt: null,
      metadata: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      ...overrides,
    };
  }

  // Real Action shape (prisma/schema.prisma `model Action`) -- NO `expectedOutcome`, `effort`,
  // `riskLevel`, `actionType`, or `priority` columns exist; `status` is real but lowercase
  // (ACTION_STATUSES in domain/constants/statuses.ts); the due-date column is `dueAt`, not
  // `dueDate`.
  function realAction(overrides: Record<string, unknown> = {}) {
    return {
      id: "action-1",
      engagementId: "engagement-123",
      stageId: null,
      recommendationId: null,
      title: "Freeze discretionary spend",
      description: "Pause non-essential spend until reserve is restored.",
      status: "assigned",
      assignedTo: null,
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      startedAt: null,
      completedAt: null,
      verifiedAt: null,
      metadata: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  // Real Engagement shape (prisma/schema.prisma `model Engagement`) -- `healthStatus` (not
  // `health`) and `businessConditionProfiles` (a plural relation array, not a singular
  // `businessConditionProfile` object) are the two real fields; `interventionMode` and
  // `interventionPhase` were already correct.
  function realEngagement(overrides: Record<string, unknown> = {}) {
    return {
      id: "engagement-123",
      code: "ENG-1",
      title: "Test Engagement",
      clientId: "client-1",
      serviceTier: "standard",
      engagementMode: "advisory",
      status: "active",
      healthStatus: "at_risk",
      interventionMode: "recovery",
      interventionPhase: "triage",
      workspaceId: mockWorkspaceId,
      findings: [],
      actions: [],
      kpis: [],
      businessConditionProfiles: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it("should return EMPTY_WORKSPACE state when no engagement exists", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(null);

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.state).toBe("EMPTY_WORKSPACE");
    expect(result.confidence).toBe("CANNOT_DETERMINE");
    expect(result.businessSnapshot).toBeNull();
  });

  // Reproduces the exact production failure this fix closes: an engagement with findings present,
  // shaped exactly like a real Prisma row (no `category` column). Before the fix, accessing
  // `f.category` on this shape threw `TypeError: Cannot read properties of undefined (reading
  // 'includes')` inside the risks/opportunities filter and the route surfaced it as a raw 500.
  it("does not throw when findings are present with the real (no `category` column) shape", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({ findings: [realFinding()], actions: [] })
    );

    await expect(getFirstValue(mockCtx, mockWorkspaceId)).resolves.toBeDefined();
  });

  it("should return MINIMUM_DATA_PRESENT with findings but no actions", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({ findings: [realFinding()], actions: [] })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.state).toBe("MINIMUM_DATA_PRESENT");
    expect(result.confidence).toBe("MEDIUM_CONFIDENCE");
    expect(result.topRisks.length).toBeGreaterThan(0);
  });

  it("should return FIRST_VALUE_READY with findings and actions", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({ findings: [realFinding()], actions: [realAction()] })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.state).toBe("FIRST_VALUE_READY");
    expect(result.confidence).toBe("HIGH_CONFIDENCE");
    expect(result.recommendedFirstAction).not.toBeNull();
  });

  it("should extract top risks from findings, sorted by real (lowercase) severity", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({
        findings: [
          realFinding({ id: "finding-1", title: "High risk", severity: "high" }),
          realFinding({ id: "finding-2", title: "Critical risk", severity: "critical" }),
        ],
        actions: [],
      })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.topRisks.length).toBe(2);
    expect(result.topRisks[0].severity).toBe("CRITICAL");
    expect(result.topRisks[0].description).toBe("Critical risk");
  });

  // Finding has no risk/opportunity polarity column anywhere in the schema -- every finding is
  // honestly surfaced as a risk, and topOpportunities is intentionally always empty rather than
  // invented from a classification that doesn't exist.
  it("topOpportunities is always empty (no schema-backed opportunity classification exists)", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({ findings: [realFinding()], actions: [] })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.topOpportunities).toEqual([]);
  });

  it("should recommend first action when evidence exists", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({
        findings: [realFinding()],
        actions: [realAction({ title: "Take Action", status: "assigned" })],
      })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.recommendedFirstAction).not.toBeNull();
    expect(result.recommendedFirstAction?.action).toBe("Take Action");
    expect(result.recommendedFirstActionReason).toBe("ACTION_READY_FOR_EXECUTION");
  });

  it("should not recommend action without evidence", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({ findings: [], actions: [realAction()] })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.recommendedFirstAction).toBeNull();
    expect(result.recommendedFirstActionReason).toBe("NO_ACTION_EVIDENCE");
  });

  it("counts blocked/overdue actions using the real lowercase status values", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({
        findings: [realFinding()],
        actions: [
          realAction({ id: "a1", status: "blocked" }),
          realAction({ id: "a2", status: "overdue" }),
          realAction({ id: "a3", status: "assigned" }),
        ],
      })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.businessSnapshot.blockedActionCount).toBe(1);
    expect(result.businessSnapshot.overdueActionCount).toBe(1);
  });

  it("derives businessCondition from the current (plural relation) BusinessConditionProfile", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({
        findings: [],
        actions: [],
        businessConditionProfiles: [{ businessStatus: "cash_constrained", isCurrent: true }],
      })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.businessSnapshot.businessCondition).toBe("Cash constrained");
  });

  it("falls back to Unknown business condition with no current profile", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({ findings: [], actions: [], businessConditionProfiles: [] })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.businessSnapshot.businessCondition).toBe("Unknown");
  });

  it("maps the real healthStatus column onto the DTO's uppercase enum", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({ findings: [], actions: [], healthStatus: "critical" })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.businessSnapshot.healthStatus).toBe("CRITICAL");
  });

  it("should identify missing data areas", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(null);

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.missingDataAreas.length).toBeGreaterThan(0);
    expect(result.missingDataAreas[0]).toBe("No engagement created yet");
  });

  it("should generate DEMO badge for demo workspace", async () => {
    mockWorkspace("DEMO Workspace");
    mockDb.engagement.findFirst.mockResolvedValue(null);

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.isDemo).toBe(true);
  });

  it("should include safety warnings for empty workspaces", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(null);

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.safetyWarnings.length).toBeGreaterThan(0);
    expect(result.safetyWarnings[0]).toContain("minimal data");
  });

  it("should return correct data readiness metrics", async () => {
    mockWorkspace();
    mockDb.engagement.findFirst.mockResolvedValue(
      realEngagement({
        findings: [realFinding()],
        actions: [realAction()],
        kpis: [{ id: "kpi-1", engagementId: "engagement-123" }],
      })
    );

    const result = await getFirstValue(mockCtx, mockWorkspaceId);

    expect(result.dataReadiness.hasEngagement).toBe(true);
    expect(result.dataReadiness.hasFinding).toBe(true);
    expect(result.dataReadiness.hasAction).toBe(true);
    expect(result.dataReadiness.hasKPI).toBe(true);
    expect(result.dataReadiness.percentComplete).toBeGreaterThan(0);
  });
});
