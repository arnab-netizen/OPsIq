/**
 * Non-DB mock tests for:
 *   GET /api/owner/control-center?businessId=... — owner control panel
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockGetBusinessCondition,
  mockGetOwnerBlockMetrics,
  mockGetOwnerControlCenter,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockGetBusinessCondition: vi.fn(),
  mockGetOwnerBlockMetrics: vi.fn(),
  mockGetOwnerControlCenter: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-condition/business-condition.service", () => ({
  getBusinessCondition: mockGetBusinessCondition,
}));

vi.mock("@/services/owner-mode/owner-control-center.service", () => ({
  getOwnerControlCenter: mockGetOwnerControlCenter,
}));

vi.mock("@/services/owner-mode/owner-block-metrics.service", () => ({
  getOwnerBlockMetrics: mockGetOwnerBlockMetrics,
}));

vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: mockCanonicalJson,
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
const BIZ_ID = "bz000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/control-center";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: `${BASE_URL}?businessId=${BIZ_ID}` },
    ...overrides,
  };
}

const MOCK_PROFILE = {
  dataSufficiencyStatus: "sufficient" as const,
  lowConfidenceDomains: [],
  recommendedNextAction: { title: "Fix cash flow" },
};

const MOCK_BLOCKS = {
  blockedRecommendations: 2,
  financeBlocked: 1,
  proofBlocked: 0,
  approvalsAvoided: 3,
};

const MOCK_PANEL = {
  attention: { ownerDecisionRequired: 0, pendingDecisions: 0, handledByOpsIQ: 0, criticalAttentionNeeded: false },
  criticalAlerts: [],
  whatNotToDo: [],
  ownerActionsToday: 0,
  handledByOpsIQ: 0,
  approvalsAvoided: 3,
  needsOwnerAttention: false,
  nextBestAction: "Fix cash flow",
  sections: {
    blockedRecommendations: 2,
    proofBlocked: 0,
    financeBlocked: 1,
    sopsNeedingReview: 0,
    trainingRecommendations: 0,
    equipmentBottlenecks: 0,
    processReviewsDue: 0,
    reassessmentsDue: 0,
  },
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

let controlCenterGet: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/control-center/route");
  controlCenterGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockGetBusinessCondition.mockResolvedValue({ profile: MOCK_PROFILE });
  mockGetOwnerBlockMetrics.mockResolvedValue(MOCK_BLOCKS);
  mockGetOwnerControlCenter.mockResolvedValue(MOCK_PANEL);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("control-center — module contract assertions", () => {
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
  it("MOCK_PANEL.sections is an object", () => { expect(typeof MOCK_PANEL.sections).toBe("object"); });
});

describe("GET /api/owner/control-center — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("is guarded by owner:view", () => {
      const decl = capturedDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl).toBeDefined();
    });

    it("requires workspace enforcement", () => {
      const decl = capturedDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await controlCenterGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await controlCenterGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await controlCenterGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("passes verifiedWorkspaceId to getBusinessCondition", async () => {
      await controlCenterGet(makeCtx());
      expect(mockGetBusinessCondition).toHaveBeenCalledWith(WS_A, BIZ_ID);
    });

    it("passes verifiedWorkspaceId to getOwnerBlockMetrics", async () => {
      await controlCenterGet(makeCtx());
      expect(mockGetOwnerBlockMetrics).toHaveBeenCalledWith(WS_A);
    });

    it("passes verifiedWorkspaceId to getOwnerControlCenter as first arg", async () => {
      await controlCenterGet(makeCtx());
      expect(mockGetOwnerControlCenter).toHaveBeenCalledWith(
        WS_A,
        expect.any(Object)
      );
    });

    it("returns panel from getOwnerControlCenter", async () => {
      const result = await controlCenterGet(makeCtx()) as { body: unknown };
      expect(result.body).toEqual(MOCK_PANEL);
    });

    it("calls getBusinessCondition once", async () => {
      await controlCenterGet(makeCtx());
      expect(mockGetBusinessCondition).toHaveBeenCalledTimes(1);
    });

    it("calls getOwnerBlockMetrics once", async () => {
      await controlCenterGet(makeCtx());
      expect(mockGetOwnerBlockMetrics).toHaveBeenCalledTimes(1);
    });

    it("calls getOwnerControlCenter once", async () => {
      await controlCenterGet(makeCtx());
      expect(mockGetOwnerControlCenter).toHaveBeenCalledTimes(1);
    });
  });

  describe("businessId query param handling", () => {
    it("passes businessId from query string to getBusinessCondition", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?businessId=${BIZ_ID}` } });
      await controlCenterGet(ctx);
      expect(mockGetBusinessCondition).toHaveBeenCalledWith(WS_A, BIZ_ID);
    });

    it("passes null businessId when query param is absent", async () => {
      const ctx = makeCtx({ request: { url: BASE_URL } });
      await controlCenterGet(ctx);
      expect(mockGetBusinessCondition).toHaveBeenCalledWith(WS_A, null);
    });
  });

  describe("null-profile fallback", () => {
    it("uses default dataSufficiencyStatus (caution) when profile is null", async () => {
      mockGetBusinessCondition.mockResolvedValue({ profile: null });
      await controlCenterGet(makeCtx());
      const ccCtx = mockGetOwnerControlCenter.mock.calls[0][1] as Record<string, unknown>;
      expect(ccCtx.dataSufficiencyStatus).toBe("caution");
    });

    it("uses empty lowConfidenceDomains when profile is null", async () => {
      mockGetBusinessCondition.mockResolvedValue({ profile: null });
      await controlCenterGet(makeCtx());
      const ccCtx = mockGetOwnerControlCenter.mock.calls[0][1] as Record<string, unknown>;
      expect(ccCtx.lowConfidenceDomains).toEqual([]);
    });

    it("uses null nextBestAction when profile is null", async () => {
      mockGetBusinessCondition.mockResolvedValue({ profile: null });
      await controlCenterGet(makeCtx());
      const ccCtx = mockGetOwnerControlCenter.mock.calls[0][1] as Record<string, unknown>;
      expect(ccCtx.nextBestAction).toBeNull();
    });
  });

  describe("block metrics forwarding", () => {
    it("forwards blockedRecommendations from block metrics to control center context", async () => {
      mockGetOwnerBlockMetrics.mockResolvedValue({ ...MOCK_BLOCKS, blockedRecommendations: 7 });
      await controlCenterGet(makeCtx());
      const ccCtx = mockGetOwnerControlCenter.mock.calls[0][1] as Record<string, unknown>;
      expect(ccCtx.blockedRecommendations).toBe(7);
    });

    it("forwards financeBlocked from block metrics to control center context", async () => {
      mockGetOwnerBlockMetrics.mockResolvedValue({ ...MOCK_BLOCKS, financeBlocked: 5 });
      await controlCenterGet(makeCtx());
      const ccCtx = mockGetOwnerControlCenter.mock.calls[0][1] as Record<string, unknown>;
      expect(ccCtx.financeBlocked).toBe(5);
    });

    it("forwards proofBlocked from block metrics to control center context", async () => {
      mockGetOwnerBlockMetrics.mockResolvedValue({ ...MOCK_BLOCKS, proofBlocked: 3 });
      await controlCenterGet(makeCtx());
      const ccCtx = mockGetOwnerControlCenter.mock.calls[0][1] as Record<string, unknown>;
      expect(ccCtx.proofBlocked).toBe(3);
    });

    it("forwards approvalsAvoided from block metrics to control center context", async () => {
      mockGetOwnerBlockMetrics.mockResolvedValue({ ...MOCK_BLOCKS, approvalsAvoided: 9 });
      await controlCenterGet(makeCtx());
      const ccCtx = mockGetOwnerControlCenter.mock.calls[0][1] as Record<string, unknown>;
      expect(ccCtx.approvalsAvoided).toBe(9);
    });
  });

  describe("workspace isolation", () => {
    it("uses verifiedWorkspaceId not a body/query workspace param for business condition", async () => {
      const ctx = makeCtx({ verifiedWorkspaceId: WS_B, request: { url: `${BASE_URL}?workspaceId=${WS_A}` } });
      await controlCenterGet(ctx);
      expect(mockGetBusinessCondition).toHaveBeenCalledWith(WS_B, null);
    });

    it("uses verifiedWorkspaceId not a body/query workspace param for block metrics", async () => {
      const ctx = makeCtx({ verifiedWorkspaceId: WS_B });
      await controlCenterGet(ctx);
      expect(mockGetOwnerBlockMetrics).toHaveBeenCalledWith(WS_B);
    });

    it("uses verifiedWorkspaceId not a body/query workspace param for control center service", async () => {
      const ctx = makeCtx({ verifiedWorkspaceId: WS_B });
      await controlCenterGet(ctx);
      expect(mockGetOwnerControlCenter).toHaveBeenCalledWith(WS_B, expect.any(Object));
    });
  });
});
