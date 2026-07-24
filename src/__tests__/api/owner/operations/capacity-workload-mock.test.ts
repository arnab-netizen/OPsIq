/**
 * Non-DB mock tests for:
 *   GET  /api/owner/operations/businesses/[businessId]/capacity-snapshots
 *   POST /api/owner/operations/businesses/[businessId]/capacity-snapshots
 *   GET  /api/owner/operations/businesses/[businessId]/workload-snapshots
 *   POST /api/owner/operations/businesses/[businessId]/workload-snapshots
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockListCapacitySnapshots,
  mockSaveCapacitySnapshot,
  mockListOwnerWorkloadSnapshots,
  mockSaveOwnerWorkloadSnapshot,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockListCapacitySnapshots: vi.fn(),
  mockSaveCapacitySnapshot: vi.fn(),
  mockListOwnerWorkloadSnapshots: vi.fn(),
  mockSaveOwnerWorkloadSnapshot: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-operations/capacity-snapshot.service", () => ({
  listCapacitySnapshots: mockListCapacitySnapshots,
  saveCapacitySnapshot: mockSaveCapacitySnapshot,
}));

vi.mock("@/services/owner-operations/owner-workload-snapshot.service", () => ({
  listOwnerWorkloadSnapshots: mockListOwnerWorkloadSnapshots,
  saveOwnerWorkloadSnapshot: mockSaveOwnerWorkloadSnapshot,
}));

// ─── Capture capability declarations ─────────────────────────────────────────

const capturedCapacityGetDecl: Record<string, unknown>[] = [];
const capturedCapacityPostDecl: Record<string, unknown>[] = [];
const capturedWorkloadGetDecl: Record<string, unknown>[] = [];
const capturedWorkloadPostDecl: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    const decl = {
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    };
    const src = handler.toString();
    if (src.includes("listCapacitySnapshots")) {
      capturedCapacityGetDecl.push(decl);
    } else if (src.includes("saveCapacitySnapshot")) {
      capturedCapacityPostDecl.push(decl);
    } else if (src.includes("listOwnerWorkloadSnapshots")) {
      capturedWorkloadGetDecl.push(decl);
    } else {
      capturedWorkloadPostDecl.push(decl);
    }
    return async (testCtx: unknown, testParams: Record<string, string>) =>
      mockWithCanonical(handler, options, testCtx, testParams);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const BUSINESS_ID = "ab000001-0000-4000-8000-000000000001";

const PARAMS = { businessId: BUSINESS_ID };

const CAP_SNAP_1 = {
  id: "ca000001-0000-4000-8000-000000000001",
  workspaceId: WS_A,
  businessId: BUSINESS_ID,
  resources: [{ type: "engineer", utilization: 0.8 }],
  currentRevenue: 50000,
};

const CREATE_CAPACITY_BODY = {
  resources: [{ type: "engineer", utilization: 0.8 }],
  currentRevenue: 50000,
  safeUtilization: 0.75,
  expansionThreshold: 0.9,
};

const WL_SNAP_1 = {
  id: "wl000001-0000-4000-8000-000000000001",
  workspaceId: WS_A,
  businessId: BUSINESS_ID,
  ownerMinutesPerDay: 480,
  sustainableMinutesPerDay: 420,
};

const CREATE_WORKLOAD_BODY = {
  ownerMinutesPerDay: 480,
  sustainableMinutesPerDay: 420,
  ownerTasks: 12,
  hasDelegatableTasks: true,
};

const BASE_URL = "https://example.com/api/owner/operations/businesses";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: {
      url: `${BASE_URL}/${BUSINESS_ID}/capacity-snapshots`,
      json: async () => CREATE_CAPACITY_BODY,
    },
    ...overrides,
  };
}

function makeCtxWithBody(
  body: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: {
      url: `${BASE_URL}/${BUSINESS_ID}/capacity-snapshots`,
      json: async () => body,
    },
    ...overrides,
  };
}

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (
      handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
      _opts: unknown,
      testCtx: unknown,
      testParams: Record<string, string>
    ) => handler(testCtx, testParams ?? {})
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ──────────────────────────────────────────────

let capacityGet: (ctx?: unknown, params?: Record<string, string>) => Promise<CanonicalResult>;
let capacityPost: (ctx?: unknown, params?: Record<string, string>) => Promise<CanonicalResult>;
let workloadGet: (ctx?: unknown, params?: Record<string, string>) => Promise<CanonicalResult>;
let workloadPost: (ctx?: unknown, params?: Record<string, string>) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const [capacityRoute, workloadRoute] = await Promise.all([
    import(
      "@/app/api/owner/operations/businesses/[businessId]/capacity-snapshots/route"
    ),
    import(
      "@/app/api/owner/operations/businesses/[businessId]/workload-snapshots/route"
    ),
  ]);
  capacityGet = capacityRoute.GET as unknown as (
    ctx?: unknown,
    params?: Record<string, string>
  ) => Promise<CanonicalResult>;
  capacityPost = capacityRoute.POST as unknown as (
    ctx?: unknown,
    params?: Record<string, string>
  ) => Promise<CanonicalResult>;
  workloadGet = workloadRoute.GET as unknown as (
    ctx?: unknown,
    params?: Record<string, string>
  ) => Promise<CanonicalResult>;
  workloadPost = workloadRoute.POST as unknown as (
    ctx?: unknown,
    params?: Record<string, string>
  ) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Capacity & Workload Snapshot Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("capacity GET is guarded by owner:view with workspace", () => {
      expect(capturedCapacityGetDecl[0]?.requireCapabilities).toContain("owner:view");
      expect(capturedCapacityGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("capacity POST is guarded by owner:manage with workspace", () => {
      expect(capturedCapacityPostDecl[0]?.requireCapabilities).toContain("owner:manage");
      expect(capturedCapacityPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("workload GET is guarded by owner:view with workspace", () => {
      expect(capturedWorkloadGetDecl[0]?.requireCapabilities).toContain("owner:view");
      expect(capturedWorkloadGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("workload POST is guarded by owner:manage with workspace", () => {
      expect(capturedWorkloadPostDecl[0]?.requireCapabilities).toContain("owner:manage");
      expect(capturedWorkloadPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies capacity GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await capacityGet(makeCtx(), PARAMS);
      expect(result.status).toBe(403);
    });

    it("returns 403 when enforcement denies capacity POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await capacityPost(makeCtxWithBody(CREATE_CAPACITY_BODY), PARAMS);
      expect(result.status).toBe(403);
    });

    it("returns 403 when enforcement denies workload GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await workloadGet(makeCtx(), PARAMS);
      expect(result.status).toBe(403);
    });

    it("returns 403 when enforcement denies workload POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await workloadPost(makeCtxWithBody(CREATE_WORKLOAD_BODY), PARAMS);
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /capacity-snapshots ──────────────────────────────────────────────

  describe("GET /capacity-snapshots", () => {
    it("returns 200 with snapshots array in body", async () => {
      mockListCapacitySnapshots.mockResolvedValueOnce([CAP_SNAP_1]);
      const result = await capacityGet(makeCtx(), PARAMS);
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ snapshots: [CAP_SNAP_1] });
    });

    it("passes workspaceId WS_A to listCapacitySnapshots", async () => {
      mockListCapacitySnapshots.mockResolvedValueOnce([CAP_SNAP_1]);
      await capacityGet(makeCtx({ verifiedWorkspaceId: WS_A }), PARAMS);
      expect(mockListCapacitySnapshots).toHaveBeenCalledWith(WS_A, undefined, BUSINESS_ID);
    });

    it("passes workspaceId WS_B to listCapacitySnapshots", async () => {
      mockListCapacitySnapshots.mockResolvedValueOnce([]);
      await capacityGet(makeCtx({ verifiedWorkspaceId: WS_B }), PARAMS);
      expect(mockListCapacitySnapshots).toHaveBeenCalledWith(WS_B, undefined, BUSINESS_ID);
    });

    it("passes businessId from path params to listCapacitySnapshots", async () => {
      mockListCapacitySnapshots.mockResolvedValueOnce([CAP_SNAP_1]);
      await capacityGet(makeCtx(), PARAMS);
      expect(mockListCapacitySnapshots).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        BUSINESS_ID
      );
    });

    it("returns empty snapshots array when no records exist", async () => {
      mockListCapacitySnapshots.mockResolvedValueOnce([]);
      const result = await capacityGet(makeCtx(), PARAMS);
      expect(result.body).toEqual({ snapshots: [] });
    });

    it("calls listCapacitySnapshots exactly once per request", async () => {
      mockListCapacitySnapshots.mockResolvedValueOnce([]);
      await capacityGet(makeCtx(), PARAMS);
      expect(mockListCapacitySnapshots).toHaveBeenCalledTimes(1);
    });

    it("does not call saveCapacitySnapshot for GET", async () => {
      mockListCapacitySnapshots.mockResolvedValueOnce([]);
      await capacityGet(makeCtx(), PARAMS);
      expect(mockSaveCapacitySnapshot).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive GETs use respective workspaceIds", async () => {
      mockListCapacitySnapshots.mockResolvedValue([CAP_SNAP_1]);
      await capacityGet(makeCtx({ verifiedWorkspaceId: WS_A }), PARAMS);
      await capacityGet(makeCtx({ verifiedWorkspaceId: WS_B }), PARAMS);
      expect(mockListCapacitySnapshots).toHaveBeenNthCalledWith(1, WS_A, undefined, BUSINESS_ID);
      expect(mockListCapacitySnapshots).toHaveBeenNthCalledWith(2, WS_B, undefined, BUSINESS_ID);
    });
  });

  // ─── 3. POST /capacity-snapshots ─────────────────────────────────────────────

  describe("POST /capacity-snapshots", () => {
    it("returns 201 on success", async () => {
      mockSaveCapacitySnapshot.mockResolvedValueOnce(CAP_SNAP_1);
      const result = await capacityPost(makeCtxWithBody(CREATE_CAPACITY_BODY), PARAMS);
      expect(result.status).toBe(201);
    });

    it("returns created snapshot in body", async () => {
      mockSaveCapacitySnapshot.mockResolvedValueOnce(CAP_SNAP_1);
      const result = await capacityPost(makeCtxWithBody(CREATE_CAPACITY_BODY), PARAMS);
      expect(result.body).toEqual(CAP_SNAP_1);
    });

    it("passes workspaceId WS_A to saveCapacitySnapshot", async () => {
      mockSaveCapacitySnapshot.mockResolvedValueOnce(CAP_SNAP_1);
      await capacityPost(
        makeCtxWithBody(CREATE_CAPACITY_BODY, { verifiedWorkspaceId: WS_A }),
        PARAMS
      );
      expect(mockSaveCapacitySnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes workspaceId WS_B to saveCapacitySnapshot", async () => {
      mockSaveCapacitySnapshot.mockResolvedValueOnce(CAP_SNAP_1);
      await capacityPost(
        makeCtxWithBody(CREATE_CAPACITY_BODY, { verifiedWorkspaceId: WS_B }),
        PARAMS
      );
      expect(mockSaveCapacitySnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes businessId from path params to saveCapacitySnapshot", async () => {
      mockSaveCapacitySnapshot.mockResolvedValueOnce(CAP_SNAP_1);
      await capacityPost(makeCtxWithBody(CREATE_CAPACITY_BODY), PARAMS);
      expect(mockSaveCapacitySnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: BUSINESS_ID })
      );
    });

    it("passes resources from body to saveCapacitySnapshot", async () => {
      mockSaveCapacitySnapshot.mockResolvedValueOnce(CAP_SNAP_1);
      await capacityPost(makeCtxWithBody(CREATE_CAPACITY_BODY), PARAMS);
      expect(mockSaveCapacitySnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: [{ type: "engineer", utilization: 0.8 }],
        })
      );
    });

    it("passes currentRevenue from body to saveCapacitySnapshot", async () => {
      mockSaveCapacitySnapshot.mockResolvedValueOnce(CAP_SNAP_1);
      await capacityPost(makeCtxWithBody(CREATE_CAPACITY_BODY), PARAMS);
      expect(mockSaveCapacitySnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ currentRevenue: 50000 })
      );
    });

    it("calls saveCapacitySnapshot exactly once per request", async () => {
      mockSaveCapacitySnapshot.mockResolvedValueOnce(CAP_SNAP_1);
      await capacityPost(makeCtxWithBody(CREATE_CAPACITY_BODY), PARAMS);
      expect(mockSaveCapacitySnapshot).toHaveBeenCalledTimes(1);
    });

    it("does not call listCapacitySnapshots for POST", async () => {
      mockSaveCapacitySnapshot.mockResolvedValueOnce(CAP_SNAP_1);
      await capacityPost(makeCtxWithBody(CREATE_CAPACITY_BODY), PARAMS);
      expect(mockListCapacitySnapshots).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive POSTs use respective workspaceIds", async () => {
      mockSaveCapacitySnapshot.mockResolvedValue(CAP_SNAP_1);
      await capacityPost(
        makeCtxWithBody(CREATE_CAPACITY_BODY, { verifiedWorkspaceId: WS_A }),
        PARAMS
      );
      await capacityPost(
        makeCtxWithBody(CREATE_CAPACITY_BODY, { verifiedWorkspaceId: WS_B }),
        PARAMS
      );
      expect(mockSaveCapacitySnapshot).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ workspaceId: WS_A })
      );
      expect(mockSaveCapacitySnapshot).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  // ─── 4. GET /workload-snapshots ──────────────────────────────────────────────

  describe("GET /workload-snapshots", () => {
    it("returns 200 with snapshots array in body", async () => {
      mockListOwnerWorkloadSnapshots.mockResolvedValueOnce([WL_SNAP_1]);
      const result = await workloadGet(makeCtx(), PARAMS);
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ snapshots: [WL_SNAP_1] });
    });

    it("passes workspaceId WS_A to listOwnerWorkloadSnapshots", async () => {
      mockListOwnerWorkloadSnapshots.mockResolvedValueOnce([WL_SNAP_1]);
      await workloadGet(makeCtx({ verifiedWorkspaceId: WS_A }), PARAMS);
      expect(mockListOwnerWorkloadSnapshots).toHaveBeenCalledWith(WS_A, undefined, BUSINESS_ID);
    });

    it("passes workspaceId WS_B to listOwnerWorkloadSnapshots", async () => {
      mockListOwnerWorkloadSnapshots.mockResolvedValueOnce([]);
      await workloadGet(makeCtx({ verifiedWorkspaceId: WS_B }), PARAMS);
      expect(mockListOwnerWorkloadSnapshots).toHaveBeenCalledWith(WS_B, undefined, BUSINESS_ID);
    });

    it("passes businessId from path params to listOwnerWorkloadSnapshots", async () => {
      mockListOwnerWorkloadSnapshots.mockResolvedValueOnce([WL_SNAP_1]);
      await workloadGet(makeCtx(), PARAMS);
      expect(mockListOwnerWorkloadSnapshots).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        BUSINESS_ID
      );
    });

    it("returns empty snapshots array when no records exist", async () => {
      mockListOwnerWorkloadSnapshots.mockResolvedValueOnce([]);
      const result = await workloadGet(makeCtx(), PARAMS);
      expect(result.body).toEqual({ snapshots: [] });
    });

    it("calls listOwnerWorkloadSnapshots exactly once per request", async () => {
      mockListOwnerWorkloadSnapshots.mockResolvedValueOnce([]);
      await workloadGet(makeCtx(), PARAMS);
      expect(mockListOwnerWorkloadSnapshots).toHaveBeenCalledTimes(1);
    });

    it("does not call saveOwnerWorkloadSnapshot for GET", async () => {
      mockListOwnerWorkloadSnapshots.mockResolvedValueOnce([]);
      await workloadGet(makeCtx(), PARAMS);
      expect(mockSaveOwnerWorkloadSnapshot).not.toHaveBeenCalled();
    });

    it("does not call capacity snapshot service for workload GET", async () => {
      mockListOwnerWorkloadSnapshots.mockResolvedValueOnce([]);
      await workloadGet(makeCtx(), PARAMS);
      expect(mockListCapacitySnapshots).not.toHaveBeenCalled();
      expect(mockSaveCapacitySnapshot).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive GETs use respective workspaceIds", async () => {
      mockListOwnerWorkloadSnapshots.mockResolvedValue([WL_SNAP_1]);
      await workloadGet(makeCtx({ verifiedWorkspaceId: WS_A }), PARAMS);
      await workloadGet(makeCtx({ verifiedWorkspaceId: WS_B }), PARAMS);
      expect(mockListOwnerWorkloadSnapshots).toHaveBeenNthCalledWith(
        1,
        WS_A,
        undefined,
        BUSINESS_ID
      );
      expect(mockListOwnerWorkloadSnapshots).toHaveBeenNthCalledWith(
        2,
        WS_B,
        undefined,
        BUSINESS_ID
      );
    });
  });

  // ─── 5. POST /workload-snapshots ─────────────────────────────────────────────

  describe("POST /workload-snapshots", () => {
    it("returns 201 on success", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValueOnce(WL_SNAP_1);
      const result = await workloadPost(makeCtxWithBody(CREATE_WORKLOAD_BODY), PARAMS);
      expect(result.status).toBe(201);
    });

    it("returns created snapshot in body", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValueOnce(WL_SNAP_1);
      const result = await workloadPost(makeCtxWithBody(CREATE_WORKLOAD_BODY), PARAMS);
      expect(result.body).toEqual(WL_SNAP_1);
    });

    it("passes workspaceId WS_A to saveOwnerWorkloadSnapshot", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValueOnce(WL_SNAP_1);
      await workloadPost(
        makeCtxWithBody(CREATE_WORKLOAD_BODY, { verifiedWorkspaceId: WS_A }),
        PARAMS
      );
      expect(mockSaveOwnerWorkloadSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes workspaceId WS_B to saveOwnerWorkloadSnapshot", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValueOnce(WL_SNAP_1);
      await workloadPost(
        makeCtxWithBody(CREATE_WORKLOAD_BODY, { verifiedWorkspaceId: WS_B }),
        PARAMS
      );
      expect(mockSaveOwnerWorkloadSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes businessId from path params to saveOwnerWorkloadSnapshot", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValueOnce(WL_SNAP_1);
      await workloadPost(makeCtxWithBody(CREATE_WORKLOAD_BODY), PARAMS);
      expect(mockSaveOwnerWorkloadSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: BUSINESS_ID })
      );
    });

    it("passes ownerMinutesPerDay from body to saveOwnerWorkloadSnapshot", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValueOnce(WL_SNAP_1);
      await workloadPost(makeCtxWithBody(CREATE_WORKLOAD_BODY), PARAMS);
      expect(mockSaveOwnerWorkloadSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ ownerMinutesPerDay: 480 })
      );
    });

    it("passes sustainableMinutesPerDay from body to saveOwnerWorkloadSnapshot", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValueOnce(WL_SNAP_1);
      await workloadPost(makeCtxWithBody(CREATE_WORKLOAD_BODY), PARAMS);
      expect(mockSaveOwnerWorkloadSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ sustainableMinutesPerDay: 420 })
      );
    });

    it("calls saveOwnerWorkloadSnapshot exactly once per request", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValueOnce(WL_SNAP_1);
      await workloadPost(makeCtxWithBody(CREATE_WORKLOAD_BODY), PARAMS);
      expect(mockSaveOwnerWorkloadSnapshot).toHaveBeenCalledTimes(1);
    });

    it("does not call listOwnerWorkloadSnapshots for POST", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValueOnce(WL_SNAP_1);
      await workloadPost(makeCtxWithBody(CREATE_WORKLOAD_BODY), PARAMS);
      expect(mockListOwnerWorkloadSnapshots).not.toHaveBeenCalled();
    });

    it("does not call capacity snapshot service for workload POST", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValueOnce(WL_SNAP_1);
      await workloadPost(makeCtxWithBody(CREATE_WORKLOAD_BODY), PARAMS);
      expect(mockListCapacitySnapshots).not.toHaveBeenCalled();
      expect(mockSaveCapacitySnapshot).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive POSTs use respective workspaceIds", async () => {
      mockSaveOwnerWorkloadSnapshot.mockResolvedValue(WL_SNAP_1);
      await workloadPost(
        makeCtxWithBody(CREATE_WORKLOAD_BODY, { verifiedWorkspaceId: WS_A }),
        PARAMS
      );
      await workloadPost(
        makeCtxWithBody(CREATE_WORKLOAD_BODY, { verifiedWorkspaceId: WS_B }),
        PARAMS
      );
      expect(mockSaveOwnerWorkloadSnapshot).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ workspaceId: WS_A })
      );
      expect(mockSaveOwnerWorkloadSnapshot).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});
