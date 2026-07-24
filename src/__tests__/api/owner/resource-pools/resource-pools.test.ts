/**
 * Non-DB mock tests for:
 *   GET  /api/owner/resource-pools                    — listResourcePools
 *   POST /api/owner/resource-pools (CREATE_POOL)      — createResourcePool
 *   POST /api/owner/resource-pools (ALLOCATE)         — allocateResource
 *   POST /api/owner/resource-pools (RELEASE)          — releaseAllocation
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockCreateResourcePool,
  mockAllocateResource,
  mockReleaseAllocation,
  mockListResourcePools,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateResourcePool: vi.fn(),
  mockAllocateResource: vi.fn(),
  mockReleaseAllocation: vi.fn(),
  mockListResourcePools: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/resource-pool.service", () => ({
  createResourcePool: mockCreateResourcePool,
  allocateResource: mockAllocateResource,
  releaseAllocation: mockReleaseAllocation,
  listResourcePools: mockListResourcePools,
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
    if (handler.toString().includes("listResourcePools")) {
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
const POOL_ID = "ab500000-0000-4000-8000-000000000001";
const OBJ_ID = "ab500000-0000-4000-8000-000000000002";
const ALLOC_ID = "ab500000-0000-4000-8000-000000000003";

const BASE_URL = "https://example.com/api/owner/resource-pools";

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

const POOL = {
  id: POOL_ID,
  workspaceId: WS_A,
  resourceType: "BUDGET",
  label: "Q3 Marketing Budget",
  totalCapacity: 100000,
  unit: "USD",
  isActive: true,
  periodStart: null,
  periodEnd: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const ALLOCATION = {
  id: ALLOC_ID,
  workspaceId: WS_A,
  poolId: POOL_ID,
  objectiveId: OBJ_ID,
  allocationAmount: 25000,
  status: "ALLOCATED",
  priority: 50,
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

let poolsGet: (ctx?: unknown) => Promise<CanonicalResult>;
let poolsPost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/resource-pools/route");
  poolsGet = route.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  poolsPost = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Owner Resource Pools Routes — non-DB mock tests", () => {
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
      const result = await poolsGet(makeCtx());
      expect(result.status).toBe(403);
    });

    it("POST returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await poolsPost(
        makePostCtx({ action: "CREATE_POOL", resourceType: "BUDGET", label: "Q3", totalCapacity: 100000, unit: "USD" })
      );
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/owner/resource-pools ────────────────────────────────────────

  describe("GET /api/owner/resource-pools", () => {
    it("returns 200 with pools array", async () => {
      mockListResourcePools.mockResolvedValueOnce([POOL]);
      const result = await poolsGet(makeCtx());
      expect(result.status).toBe(200);
      expect(Array.isArray(result.body.pools)).toBe(true);
    });

    it("returns empty array when no pools", async () => {
      mockListResourcePools.mockResolvedValueOnce([]);
      const result = await poolsGet(makeCtx());
      expect(result.status).toBe(200);
      expect((result.body.pools as unknown[]).length).toBe(0);
    });

    it("passes workspaceId (WS_A) to listResourcePools", async () => {
      mockListResourcePools.mockResolvedValueOnce([]);
      await poolsGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      expect(mockListResourcePools).toHaveBeenCalledWith(WS_A);
    });

    it("passes workspaceId (WS_B) to listResourcePools", async () => {
      mockListResourcePools.mockResolvedValueOnce([]);
      await poolsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListResourcePools).toHaveBeenCalledWith(WS_B);
    });

    it("calls listResourcePools exactly once", async () => {
      mockListResourcePools.mockResolvedValueOnce([POOL]);
      await poolsGet(makeCtx());
      expect(mockListResourcePools).toHaveBeenCalledTimes(1);
    });

    it("does not call createResourcePool, allocateResource, or releaseAllocation on GET", async () => {
      mockListResourcePools.mockResolvedValueOnce([]);
      await poolsGet(makeCtx());
      expect(mockCreateResourcePool).not.toHaveBeenCalled();
      expect(mockAllocateResource).not.toHaveBeenCalled();
      expect(mockReleaseAllocation).not.toHaveBeenCalled();
    });
  });

  // ─── 3. POST CREATE_POOL ──────────────────────────────────────────────────────

  describe("POST CREATE_POOL /api/owner/resource-pools", () => {
    const CREATE_BODY = {
      action: "CREATE_POOL",
      resourceType: "BUDGET",
      label: "Q3 Marketing Budget",
      totalCapacity: 100000,
      unit: "USD",
    };

    it("returns 201 with pool on CREATE_POOL", async () => {
      mockCreateResourcePool.mockResolvedValueOnce(POOL);
      const result = await poolsPost(makePostCtx(CREATE_BODY));
      expect(result.status).toBe(201);
      expect(result.body.pool).toBeDefined();
    });

    it("passes workspaceId (WS_A) to createResourcePool", async () => {
      mockCreateResourcePool.mockResolvedValueOnce(POOL);
      await poolsPost(makePostCtx(CREATE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockCreateResourcePool).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes actorId to createResourcePool", async () => {
      mockCreateResourcePool.mockResolvedValueOnce(POOL);
      await poolsPost(makePostCtx(CREATE_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockCreateResourcePool).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("passes resourceType and label to createResourcePool", async () => {
      mockCreateResourcePool.mockResolvedValueOnce(POOL);
      await poolsPost(makePostCtx(CREATE_BODY));
      expect(mockCreateResourcePool).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: "BUDGET", label: "Q3 Marketing Budget" })
      );
    });

    it("returns 400 when CREATE_POOL missing required fields", async () => {
      const result = await poolsPost(makePostCtx({
        action: "CREATE_POOL",
        resourceType: "BUDGET",
        // missing label, totalCapacity, unit
      }));
      expect(result.status).toBe(400);
    });

    it("does not call allocateResource or releaseAllocation on CREATE_POOL", async () => {
      mockCreateResourcePool.mockResolvedValueOnce(POOL);
      await poolsPost(makePostCtx(CREATE_BODY));
      expect(mockAllocateResource).not.toHaveBeenCalled();
      expect(mockReleaseAllocation).not.toHaveBeenCalled();
    });
  });

  // ─── 4. POST ALLOCATE ─────────────────────────────────────────────────────────

  describe("POST ALLOCATE /api/owner/resource-pools", () => {
    const ALLOCATE_BODY = {
      action: "ALLOCATE",
      poolId: POOL_ID,
      objectiveId: OBJ_ID,
      allocationAmount: 25000,
    };

    it("returns 201 with allocation on ALLOCATE", async () => {
      mockAllocateResource.mockResolvedValueOnce(ALLOCATION);
      const result = await poolsPost(makePostCtx(ALLOCATE_BODY));
      expect(result.status).toBe(201);
      expect(result.body.allocation).toBeDefined();
    });

    it("passes workspaceId to allocateResource", async () => {
      mockAllocateResource.mockResolvedValueOnce(ALLOCATION);
      await poolsPost(makePostCtx(ALLOCATE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockAllocateResource).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes poolId and objectiveId to allocateResource", async () => {
      mockAllocateResource.mockResolvedValueOnce(ALLOCATION);
      await poolsPost(makePostCtx(ALLOCATE_BODY));
      expect(mockAllocateResource).toHaveBeenCalledWith(
        expect.objectContaining({ poolId: POOL_ID, objectiveId: OBJ_ID })
      );
    });

    it("passes allocationAmount to allocateResource", async () => {
      mockAllocateResource.mockResolvedValueOnce(ALLOCATION);
      await poolsPost(makePostCtx(ALLOCATE_BODY));
      expect(mockAllocateResource).toHaveBeenCalledWith(
        expect.objectContaining({ allocationAmount: 25000 })
      );
    });

    it("returns 400 when ALLOCATE missing required fields", async () => {
      const result = await poolsPost(makePostCtx({
        action: "ALLOCATE",
        poolId: POOL_ID,
        // missing objectiveId and allocationAmount
      }));
      expect(result.status).toBe(400);
    });

    it("does not call createResourcePool or releaseAllocation on ALLOCATE", async () => {
      mockAllocateResource.mockResolvedValueOnce(ALLOCATION);
      await poolsPost(makePostCtx(ALLOCATE_BODY));
      expect(mockCreateResourcePool).not.toHaveBeenCalled();
      expect(mockReleaseAllocation).not.toHaveBeenCalled();
    });
  });

  // ─── 5. POST RELEASE ──────────────────────────────────────────────────────────

  describe("POST RELEASE /api/owner/resource-pools", () => {
    const RELEASE_BODY = {
      action: "RELEASE",
      allocationId: ALLOC_ID,
    };

    it("returns 200 with released allocation on RELEASE", async () => {
      mockReleaseAllocation.mockResolvedValueOnce({ ...ALLOCATION, status: "RELEASED" });
      const result = await poolsPost(makePostCtx(RELEASE_BODY));
      expect(result.status).toBe(200);
      expect(result.body.allocation).toBeDefined();
    });

    it("passes workspaceId to releaseAllocation", async () => {
      mockReleaseAllocation.mockResolvedValueOnce({ ...ALLOCATION, status: "RELEASED" });
      await poolsPost(makePostCtx(RELEASE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockReleaseAllocation).toHaveBeenCalledWith(WS_A, expect.any(String), ALLOC_ID);
    });

    it("passes actorId to releaseAllocation", async () => {
      mockReleaseAllocation.mockResolvedValueOnce({ ...ALLOCATION, status: "RELEASED" });
      await poolsPost(makePostCtx(RELEASE_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockReleaseAllocation).toHaveBeenCalledWith(expect.any(String), ACTOR_A, ALLOC_ID);
    });

    it("passes allocationId to releaseAllocation", async () => {
      mockReleaseAllocation.mockResolvedValueOnce({ ...ALLOCATION, status: "RELEASED" });
      await poolsPost(makePostCtx(RELEASE_BODY));
      expect(mockReleaseAllocation).toHaveBeenCalledWith(expect.any(String), expect.any(String), ALLOC_ID);
    });

    it("returns 400 when RELEASE missing allocationId", async () => {
      const result = await poolsPost(makePostCtx({ action: "RELEASE" }));
      expect(result.status).toBe(400);
    });

    it("does not call createResourcePool or allocateResource on RELEASE", async () => {
      mockReleaseAllocation.mockResolvedValueOnce({ ...ALLOCATION, status: "RELEASED" });
      await poolsPost(makePostCtx(RELEASE_BODY));
      expect(mockCreateResourcePool).not.toHaveBeenCalled();
      expect(mockAllocateResource).not.toHaveBeenCalled();
    });
  });

  // ─── 6. Workspace isolation ───────────────────────────────────────────────────

  describe("workspace isolation", () => {
    it("GET: two calls with different workspaceIds call service with respective IDs", async () => {
      mockListResourcePools.mockResolvedValueOnce([POOL]).mockResolvedValueOnce([]);
      await poolsGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      await poolsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListResourcePools).toHaveBeenNthCalledWith(1, WS_A);
      expect(mockListResourcePools).toHaveBeenNthCalledWith(2, WS_B);
    });

    it("POST ALLOCATE: two calls with different workspaceIds call service with respective IDs", async () => {
      const body = { action: "ALLOCATE", poolId: POOL_ID, objectiveId: OBJ_ID, allocationAmount: 1000 };
      mockAllocateResource.mockResolvedValueOnce(ALLOCATION).mockResolvedValueOnce({ ...ALLOCATION, workspaceId: WS_B });
      await poolsPost(makePostCtx(body, { verifiedWorkspaceId: WS_A }));
      await poolsPost(makePostCtx(body, { verifiedWorkspaceId: WS_B, request: { url: BASE_URL, json: async () => body } }));
      expect(mockAllocateResource).toHaveBeenNthCalledWith(1, expect.objectContaining({ workspaceId: WS_A }));
      expect(mockAllocateResource).toHaveBeenNthCalledWith(2, expect.objectContaining({ workspaceId: WS_B }));
    });
  });

  // ─── 7. Actor isolation ───────────────────────────────────────────────────────

  describe("actor isolation", () => {
    it("POST CREATE_POOL: actorId (ACTOR_B) passed to createResourcePool", async () => {
      const body = { action: "CREATE_POOL", resourceType: "TIME_HOURS", label: "Dev Hours", totalCapacity: 80, unit: "hours" };
      mockCreateResourcePool.mockResolvedValueOnce(POOL);
      await poolsPost(makePostCtx(body, { verifiedActorId: ACTOR_B, request: { url: BASE_URL, json: async () => body } }));
      expect(mockCreateResourcePool).toHaveBeenCalledWith(expect.objectContaining({ actorId: ACTOR_B }));
    });
  });
});
