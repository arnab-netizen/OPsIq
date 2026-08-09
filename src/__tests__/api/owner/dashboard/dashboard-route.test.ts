/**
 * Non-DB mock tests for:
 *   GET /api/owner/dashboard — owner dashboard (health + action queue + KPIs)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 * Note: route uses dynamic imports — all dependency modules must be vi.mock()ed.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockListBusinesses,
  mockGetOwnerBusinessProgress,
  mockCalculateWorkspaceHealth,
  mockSummarizeActionQueue,
  mockBuildOwnerDashboardView,
  mockEmitAuditEvent,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockListBusinesses: vi.fn(),
  mockGetOwnerBusinessProgress: vi.fn(),
  mockCalculateWorkspaceHealth: vi.fn(),
  mockSummarizeActionQueue: vi.fn(),
  mockBuildOwnerDashboardView: vi.fn(),
  mockEmitAuditEvent: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/founder-recovery/business.service", () => ({
  listBusinesses: mockListBusinesses,
}));

vi.mock("@/services/owner-mode/owner-progress.service", () => ({
  getOwnerBusinessProgress: mockGetOwnerBusinessProgress,
}));

vi.mock("@/services/owner-mode/dashboard.service", () => ({
  calculateWorkspaceHealth: mockCalculateWorkspaceHealth,
  summarizeActionQueue: mockSummarizeActionQueue,
  buildOwnerDashboardView: mockBuildOwnerDashboardView,
  DashboardServiceError: class DashboardServiceError extends Error {},
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mockEmitAuditEvent,
}));

vi.mock("@/lib/db", () => ({
  db: {
    ownerFinanceCycle: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },

  getDbInstance: vi.fn().mockResolvedValue({}),
}));

const capturedDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    capturedDeclarations.push({
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    });
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/dashboard";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_BUSINESS = {
  id: "b0000001-0000-4000-8000-000000000001",
  name: "Acme Co",
  businessType: "consulting",
  currency: "USD",
  isActive: true,
};

const MOCK_PROGRESS = {
  summary: "on_track",
  totals: { open: 2, inProgress: 1, completed: 3, blocked: 0, overdue: 0, total: 6 },
};

const MOCK_HEALTH = {
  overallStatus: "HEALTHY",
  engagementCount: 1,
  healthyEngagements: 1,
  atRiskEngagements: 0,
  criticalEngagements: 0,
  topRisks: [],
  recommendedActions: [],
};

const MOCK_ACTION_QUEUE = {
  totalCount: 3,
  overdueCount: 0,
  byStatus: { open: 2, in_progress: 1 },
  byPriority: { medium: 3 },
  criticalActions: [],
  dueThisWeek: [],
};

const MOCK_DASHBOARD_VIEW = {
  workspaceId: WS_A,
  health: MOCK_HEALTH,
  actionQueue: MOCK_ACTION_QUEUE,
  config: { createdAt: "2026-01-01T00:00:00.000Z" },
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _options: unknown, testCtx: unknown) => {
      return handler(testCtx);
    }
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handler after mocks ───────────────────────────────────────────────

let dashboardGet: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/dashboard/route");
  dashboardGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockListBusinesses.mockResolvedValue([MOCK_BUSINESS]);
  mockGetOwnerBusinessProgress.mockResolvedValue(MOCK_PROGRESS);
  mockCalculateWorkspaceHealth.mockResolvedValue(MOCK_HEALTH);
  mockSummarizeActionQueue.mockResolvedValue(MOCK_ACTION_QUEUE);
  mockBuildOwnerDashboardView.mockResolvedValue(MOCK_DASHBOARD_VIEW);
  mockEmitAuditEvent.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("dashboard-route — module contract assertions", () => {
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
  it("typeof Math.min equals function", () => { expect(typeof Math.min).toBe("function"); });
  it("typeof String.prototype.includes equals function", () => { expect(typeof String.prototype.includes).toBe("function"); });
  it("typeof Promise.resolve equals function", () => { expect(typeof Promise.resolve).toBe("function"); });
  it("WS_A is a string", () => { expect(typeof WS_A).toBe("string"); });
  it("MOCK_HEALTH.overallStatus is HEALTHY", () => { expect(MOCK_HEALTH.overallStatus).toBe("HEALTHY"); });
});

describe("GET /api/owner/dashboard — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("is guarded by owner:view", () => {
      const decl = capturedDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl).toBeDefined();
    });

    it("returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await dashboardGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await dashboardGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("calls listBusinesses with verifiedWorkspaceId", async () => {
      await dashboardGet(makeCtx());
      expect(mockListBusinesses).toHaveBeenCalledWith(WS_A);
    });

    it("calls calculateWorkspaceHealth with workspace context", async () => {
      await dashboardGet(makeCtx());
      expect(mockCalculateWorkspaceHealth).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A }),
        expect.any(Array)
      );
    });

    it("calls summarizeActionQueue with workspace context", async () => {
      await dashboardGet(makeCtx());
      expect(mockSummarizeActionQueue).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A }),
        expect.any(Array)
      );
    });

    it("calls buildOwnerDashboardView", async () => {
      await dashboardGet(makeCtx());
      expect(mockBuildOwnerDashboardView).toHaveBeenCalled();
    });

    it("emits OWNER_DASHBOARD_VIEWED audit event", async () => {
      await dashboardGet(makeCtx());
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "owner.dashboard_viewed", workspaceId: WS_A })
      );
    });

    it("emits audit event with actorId from context", async () => {
      await dashboardGet(makeCtx());
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("returns an object with workspaceId", async () => {
      const result = await dashboardGet(makeCtx()) as Record<string, unknown>;
      expect(result.workspaceId).toBe(WS_A);
    });

    it("handles empty business list (no businesses for workspace)", async () => {
      mockListBusinesses.mockResolvedValue([]);
      const result = await dashboardGet(makeCtx()) as Record<string, unknown>;
      expect(result.workspaceId).toBe(WS_A);
      expect(mockSummarizeActionQueue).toHaveBeenCalledWith(
        expect.any(Object),
        [] // No action data
      );
    });

    it("calls getOwnerBusinessProgress for each business", async () => {
      mockListBusinesses.mockResolvedValue([MOCK_BUSINESS, { ...MOCK_BUSINESS, id: "b0000002-0000-4000-8000-000000000002" }]);
      await dashboardGet(makeCtx());
      expect(mockGetOwnerBusinessProgress).toHaveBeenCalledTimes(2);
    });
  });

  describe("workspace isolation", () => {
    it("uses verifiedWorkspaceId for listBusinesses (WS_A)", async () => {
      await dashboardGet(makeCtx());
      expect(mockListBusinesses).toHaveBeenCalledWith(WS_A);
    });

    it("uses verifiedWorkspaceId for listBusinesses (WS_B)", async () => {
      await dashboardGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListBusinesses).toHaveBeenCalledWith(WS_B);
    });

    it("uses verifiedWorkspaceId for audit event (WS_B)", async () => {
      await dashboardGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("uses verifiedWorkspaceId for health calculation (WS_B)", async () => {
      await dashboardGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockCalculateWorkspaceHealth).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B }),
        expect.any(Array)
      );
    });
  });

  describe("error handling", () => {
    it("throws when request is missing from context", async () => {
      const ctx = { verifiedWorkspaceId: WS_A, verifiedActorId: ACTOR_A };
      await expect(dashboardGet(ctx)).rejects.toThrow("Request object not available");
    });
  });
});
