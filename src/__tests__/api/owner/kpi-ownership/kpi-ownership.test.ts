/**
 * Non-DB mock tests for:
 *   GET  /api/owner/kpi-ownership           — listKPIOwnership
 *   POST /api/owner/kpi-ownership (UPSERT)  — createKPIOwnership
 *   POST /api/owner/kpi-ownership (UPDATE)  — updateKPIOwnership
 *   POST /api/owner/kpi-ownership (RECORD_REVIEW) — updateKPIOwnership with lastReviewedAt
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockCreateKPIOwnership,
  mockUpdateKPIOwnership,
  mockListKPIOwnership,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateKPIOwnership: vi.fn(),
  mockUpdateKPIOwnership: vi.fn(),
  mockListKPIOwnership: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/kpi-ownership.service", () => ({
  createKPIOwnership: mockCreateKPIOwnership,
  updateKPIOwnership: mockUpdateKPIOwnership,
  listKPIOwnership: mockListKPIOwnership,
}));

const capturedGetDeclarations: Record<string, unknown>[] = [];
const capturedPostDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    const decl = {
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    };
    // GET handler has listKPIOwnership; POST has createKPIOwnership / updateKPIOwnership
    if (handler.toString().includes("listKPIOwnership")) {
      capturedGetDeclarations.push(decl);
    } else {
      capturedPostDeclarations.push(decl);
    }
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ACTOR_B = "ac000002-0000-4000-8000-000000000002";
const RECORD_ID = "ab400000-0000-4000-8000-000000000001";
const OWNER_USER_ID = "ab400000-0000-4000-8000-000000000002";
const OBJ_ID = "ab400000-0000-4000-8000-000000000003";

const BASE_URL = "https://example.com/api/owner/kpi-ownership";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL, json: async () => ({}) },
    ...overrides,
  };
}

function makePostCtx(body: Record<string, unknown>, ctxOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL, json: async () => body },
    ...ctxOverrides,
  };
}

const KPI_RECORD = {
  id: RECORD_ID,
  workspaceId: WS_A,
  metricName: "monthly_revenue",
  metricLabel: "Monthly Revenue",
  ownerUserId: OWNER_USER_ID,
  reviewCadence: "WEEKLY",
  targetValue: 50000,
  currentValue: 42000,
  unit: "USD",
  linkedObjectiveId: null,
  lastReviewedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (
      handler: (ctx: unknown) => Promise<unknown>,
      _options: unknown,
      testCtx: unknown
    ) => {
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

// ─── Import handlers after mocks ──────────────────────────────────────────────

let kpiGet: (ctx?: unknown) => Promise<CanonicalResult>;
let kpiPost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/kpi-ownership/route");
  kpiGet = route.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  kpiPost = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Owner KPI Ownership Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET is guarded by owner:manage", () => {
      const decl = capturedGetDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("GET requires workspace enforcement", () => {
      const decl = capturedGetDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("POST is guarded by owner:manage", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("POST requires workspace enforcement", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("GET returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await kpiGet(makeCtx());
      expect(result.status).toBe(403);
    });

    it("POST returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await kpiPost(
        makePostCtx({ action: "UPSERT", metricName: "rev", metricLabel: "Revenue", ownerUserId: OWNER_USER_ID, reviewCadence: "WEEKLY" })
      );
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/owner/kpi-ownership ─────────────────────────────────────────

  describe("GET /api/owner/kpi-ownership", () => {
    it("returns 200 with kpis array", async () => {
      mockListKPIOwnership.mockResolvedValueOnce([KPI_RECORD]);
      const result = await kpiGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      expect(result.status).toBe(200);
      expect(Array.isArray(result.body.kpis)).toBe(true);
    });

    it("returns empty array when no KPIs", async () => {
      mockListKPIOwnership.mockResolvedValueOnce([]);
      const result = await kpiGet(makeCtx());
      expect(result.status).toBe(200);
      expect((result.body.kpis as unknown[]).length).toBe(0);
    });

    it("passes workspaceId (WS_A) to listKPIOwnership", async () => {
      mockListKPIOwnership.mockResolvedValueOnce([]);
      await kpiGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      expect(mockListKPIOwnership).toHaveBeenCalledWith(WS_A);
    });

    it("passes workspaceId (WS_B) to listKPIOwnership", async () => {
      mockListKPIOwnership.mockResolvedValueOnce([]);
      await kpiGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListKPIOwnership).toHaveBeenCalledWith(WS_B);
    });

    it("calls listKPIOwnership exactly once", async () => {
      mockListKPIOwnership.mockResolvedValueOnce([KPI_RECORD]);
      await kpiGet(makeCtx());
      expect(mockListKPIOwnership).toHaveBeenCalledTimes(1);
    });

    it("does not call createKPIOwnership or updateKPIOwnership on GET", async () => {
      mockListKPIOwnership.mockResolvedValueOnce([]);
      await kpiGet(makeCtx());
      expect(mockCreateKPIOwnership).not.toHaveBeenCalled();
      expect(mockUpdateKPIOwnership).not.toHaveBeenCalled();
    });
  });

  // ─── 3. POST UPSERT /api/owner/kpi-ownership ─────────────────────────────────

  describe("POST UPSERT /api/owner/kpi-ownership", () => {
    const UPSERT_BODY = {
      action: "UPSERT",
      metricName: "monthly_revenue",
      metricLabel: "Monthly Revenue",
      ownerUserId: OWNER_USER_ID,
      reviewCadence: "WEEKLY",
    };

    it("returns 200 with record on UPSERT", async () => {
      mockCreateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      const result = await kpiPost(makePostCtx(UPSERT_BODY));
      expect(result.status).toBe(200);
      expect(result.body.record).toBeDefined();
    });

    it("passes workspaceId (WS_A) to createKPIOwnership", async () => {
      mockCreateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(UPSERT_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockCreateKPIOwnership).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes workspaceId (WS_B) to createKPIOwnership", async () => {
      mockCreateKPIOwnership.mockResolvedValueOnce({ ...KPI_RECORD, workspaceId: WS_B });
      await kpiPost(makePostCtx(UPSERT_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_URL, json: async () => UPSERT_BODY },
      }));
      expect(mockCreateKPIOwnership).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes actorId to createKPIOwnership", async () => {
      mockCreateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(UPSERT_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockCreateKPIOwnership).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("passes metricName and metricLabel to createKPIOwnership", async () => {
      mockCreateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(UPSERT_BODY));
      expect(mockCreateKPIOwnership).toHaveBeenCalledWith(
        expect.objectContaining({ metricName: "monthly_revenue", metricLabel: "Monthly Revenue" })
      );
    });

    it("returns 400 when UPSERT missing metricName", async () => {
      const result = await kpiPost(makePostCtx({
        action: "UPSERT",
        metricLabel: "Revenue",
        ownerUserId: OWNER_USER_ID,
        reviewCadence: "WEEKLY",
      }));
      expect(result.status).toBe(400);
    });

    it("does not call updateKPIOwnership on UPSERT", async () => {
      mockCreateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(UPSERT_BODY));
      expect(mockUpdateKPIOwnership).not.toHaveBeenCalled();
    });
  });

  // ─── 4. POST UPDATE /api/owner/kpi-ownership ─────────────────────────────────

  describe("POST UPDATE /api/owner/kpi-ownership", () => {
    const UPDATE_BODY = {
      action: "UPDATE",
      recordId: RECORD_ID,
      metricLabel: "Updated Revenue Label",
      reviewCadence: "MONTHLY",
    };

    it("returns 200 with updated record", async () => {
      mockUpdateKPIOwnership.mockResolvedValueOnce({ ...KPI_RECORD, metricLabel: "Updated Revenue Label" });
      const result = await kpiPost(makePostCtx(UPDATE_BODY));
      expect(result.status).toBe(200);
      expect(result.body.record).toBeDefined();
    });

    it("passes workspaceId to updateKPIOwnership", async () => {
      mockUpdateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(UPDATE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockUpdateKPIOwnership).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes recordId to updateKPIOwnership", async () => {
      mockUpdateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(UPDATE_BODY));
      expect(mockUpdateKPIOwnership).toHaveBeenCalledWith(
        expect.objectContaining({ recordId: RECORD_ID })
      );
    });

    it("returns 400 when UPDATE missing recordId", async () => {
      const result = await kpiPost(makePostCtx({
        action: "UPDATE",
        metricLabel: "Revenue",
      }));
      expect(result.status).toBe(400);
    });

    it("does not call createKPIOwnership on UPDATE", async () => {
      mockUpdateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(UPDATE_BODY));
      expect(mockCreateKPIOwnership).not.toHaveBeenCalled();
    });
  });

  // ─── 5. POST RECORD_REVIEW /api/owner/kpi-ownership ──────────────────────────

  describe("POST RECORD_REVIEW /api/owner/kpi-ownership", () => {
    const REVIEW_BODY = {
      action: "RECORD_REVIEW",
      recordId: RECORD_ID,
      lastReviewedAt: "2026-07-24T12:00:00.000Z",
    };

    it("returns 200 with updated record on RECORD_REVIEW", async () => {
      mockUpdateKPIOwnership.mockResolvedValueOnce({ ...KPI_RECORD, lastReviewedAt: "2026-07-24T12:00:00.000Z" });
      const result = await kpiPost(makePostCtx(REVIEW_BODY));
      expect(result.status).toBe(200);
    });

    it("returns 400 when RECORD_REVIEW missing recordId", async () => {
      const result = await kpiPost(makePostCtx({
        action: "RECORD_REVIEW",
        lastReviewedAt: "2026-07-24T12:00:00.000Z",
      }));
      expect(result.status).toBe(400);
    });

    it("passes recordId to updateKPIOwnership on RECORD_REVIEW", async () => {
      mockUpdateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(REVIEW_BODY));
      expect(mockUpdateKPIOwnership).toHaveBeenCalledWith(
        expect.objectContaining({ recordId: RECORD_ID })
      );
    });

    it("does not call createKPIOwnership on RECORD_REVIEW", async () => {
      mockUpdateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(REVIEW_BODY));
      expect(mockCreateKPIOwnership).not.toHaveBeenCalled();
    });
  });

  // ─── 6. Workspace isolation ───────────────────────────────────────────────────

  describe("workspace isolation", () => {
    it("GET: two calls with different workspaceIds call listKPIOwnership with respective IDs", async () => {
      mockListKPIOwnership.mockResolvedValueOnce([KPI_RECORD]).mockResolvedValueOnce([]);
      await kpiGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      await kpiGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListKPIOwnership).toHaveBeenNthCalledWith(1, WS_A);
      expect(mockListKPIOwnership).toHaveBeenNthCalledWith(2, WS_B);
    });

    it("POST: two UPSERT calls with different workspaceIds call createKPIOwnership with respective IDs", async () => {
      const body = { action: "UPSERT", metricName: "rev", metricLabel: "Revenue", ownerUserId: OWNER_USER_ID, reviewCadence: "WEEKLY" };
      mockCreateKPIOwnership.mockResolvedValueOnce(KPI_RECORD).mockResolvedValueOnce({ ...KPI_RECORD, workspaceId: WS_B });
      await kpiPost(makePostCtx(body, { verifiedWorkspaceId: WS_A }));
      await kpiPost(makePostCtx(body, { verifiedWorkspaceId: WS_B, request: { url: BASE_URL, json: async () => body } }));
      expect(mockCreateKPIOwnership).toHaveBeenNthCalledWith(1, expect.objectContaining({ workspaceId: WS_A }));
      expect(mockCreateKPIOwnership).toHaveBeenNthCalledWith(2, expect.objectContaining({ workspaceId: WS_B }));
    });
  });

  // ─── 7. Actor isolation ───────────────────────────────────────────────────────

  describe("actor isolation", () => {
    it("POST UPSERT: actorId from ctx is passed to createKPIOwnership", async () => {
      const body = { action: "UPSERT", metricName: "rev", metricLabel: "Revenue", ownerUserId: OWNER_USER_ID, reviewCadence: "WEEKLY" };
      mockCreateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(body, { verifiedActorId: ACTOR_B, request: { url: BASE_URL, json: async () => body } }));
      expect(mockCreateKPIOwnership).toHaveBeenCalledWith(expect.objectContaining({ actorId: ACTOR_B }));
    });

    it("POST UPDATE: actorId from ctx is passed to updateKPIOwnership", async () => {
      const body = { action: "UPDATE", recordId: RECORD_ID, reviewCadence: "DAILY" };
      mockUpdateKPIOwnership.mockResolvedValueOnce(KPI_RECORD);
      await kpiPost(makePostCtx(body, { verifiedActorId: ACTOR_B, request: { url: BASE_URL, json: async () => body } }));
      expect(mockUpdateKPIOwnership).toHaveBeenCalledWith(expect.objectContaining({ actorId: ACTOR_B }));
    });
  });
});
