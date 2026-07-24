/**
 * Non-DB mock tests for:
 *   POST /api/owner/override-arbitration             — createArbitrationOverride
 *   GET  /api/owner/override-arbitration?recordId=X  — getLatestOverride
 *   GET  /api/owner/override-arbitration             — listOverrides
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockCreateArbitrationOverride,
  mockGetLatestOverride,
  mockListOverrides,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateArbitrationOverride: vi.fn(),
  mockGetLatestOverride: vi.fn(),
  mockListOverrides: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/owner-override.service", () => ({
  createArbitrationOverride: mockCreateArbitrationOverride,
  getLatestOverride: mockGetLatestOverride,
  listOverrides: mockListOverrides,
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
    // POST handler has createArbitrationOverride; GET handler has getLatestOverride
    if (handler.toString().includes("getLatestOverride")) {
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
const RECORD_ID = "ab600000-0000-4000-8000-000000000001";
const OVERRIDE_ID = "ab600000-0000-4000-8000-000000000002";
const OBJ_ID = "ab600000-0000-4000-8000-000000000003";

const BASE_URL = "https://example.com/api/owner/override-arbitration";

function makeGetCtx(queryParams: Record<string, string> = {}, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: url.toString() },
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

const OVERRIDE = {
  id: OVERRIDE_ID,
  workspaceId: WS_A,
  overriddenRecordId: RECORD_ID,
  overrideObjectiveId: OBJ_ID,
  overrideRationale: "Owner judgment overrides system recommendation based on market intelligence.",
  decision: "EXECUTE_NOW",
  actorId: ACTOR_A,
  createdAt: "2026-01-01T00:00:00.000Z",
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

let overrideGet: (ctx?: unknown) => Promise<CanonicalResult>;
let overridePost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/override-arbitration/route");
  overrideGet = route.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  overridePost = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Owner Override Arbitration Routes — non-DB mock tests", () => {
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
      const result = await overrideGet(makeGetCtx());
      expect(result.status).toBe(403);
    });

    it("POST returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await overridePost(
        makePostCtx({ overriddenRecordId: RECORD_ID, overrideRationale: "Valid reason for override", decision: "EXECUTE_NOW" })
      );
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/owner/override-arbitration?recordId=X ───────────────────────

  describe("GET /api/owner/override-arbitration?recordId=X (getLatestOverride)", () => {
    it("returns 200 with override when recordId provided and found", async () => {
      mockGetLatestOverride.mockResolvedValueOnce(OVERRIDE);
      const result = await overrideGet(makeGetCtx({ recordId: RECORD_ID }));
      expect(result.status).toBe(200);
      expect(result.body.override).toBeDefined();
    });

    it("returns 200 with null when recordId provided but no override", async () => {
      mockGetLatestOverride.mockResolvedValueOnce(null);
      const result = await overrideGet(makeGetCtx({ recordId: RECORD_ID }));
      expect(result.status).toBe(200);
      expect(result.body.override).toBeNull();
    });

    it("passes workspaceId (WS_A) and recordId to getLatestOverride", async () => {
      mockGetLatestOverride.mockResolvedValueOnce(OVERRIDE);
      await overrideGet(makeGetCtx({ recordId: RECORD_ID }, { verifiedWorkspaceId: WS_A }));
      expect(mockGetLatestOverride).toHaveBeenCalledWith(WS_A, RECORD_ID);
    });

    it("passes workspaceId (WS_B) to getLatestOverride", async () => {
      mockGetLatestOverride.mockResolvedValueOnce(null);
      await overrideGet(makeGetCtx({ recordId: RECORD_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockGetLatestOverride).toHaveBeenCalledWith(WS_B, RECORD_ID);
    });

    it("calls getLatestOverride (not listOverrides) when recordId present", async () => {
      mockGetLatestOverride.mockResolvedValueOnce(OVERRIDE);
      await overrideGet(makeGetCtx({ recordId: RECORD_ID }));
      expect(mockGetLatestOverride).toHaveBeenCalledTimes(1);
      expect(mockListOverrides).not.toHaveBeenCalled();
    });
  });

  // ─── 3. GET /api/owner/override-arbitration (listOverrides) ──────────────────

  describe("GET /api/owner/override-arbitration (listOverrides)", () => {
    it("returns 200 with overrides array when no recordId param", async () => {
      mockListOverrides.mockResolvedValueOnce([OVERRIDE]);
      const result = await overrideGet(makeGetCtx());
      expect(result.status).toBe(200);
      expect(Array.isArray(result.body.overrides)).toBe(true);
    });

    it("returns empty overrides array when none exist", async () => {
      mockListOverrides.mockResolvedValueOnce([]);
      const result = await overrideGet(makeGetCtx());
      expect(result.status).toBe(200);
      expect((result.body.overrides as unknown[]).length).toBe(0);
    });

    it("passes workspaceId (WS_A) to listOverrides", async () => {
      mockListOverrides.mockResolvedValueOnce([]);
      await overrideGet(makeGetCtx({}, { verifiedWorkspaceId: WS_A }));
      expect(mockListOverrides).toHaveBeenCalledWith(WS_A);
    });

    it("passes workspaceId (WS_B) to listOverrides", async () => {
      mockListOverrides.mockResolvedValueOnce([]);
      await overrideGet(makeGetCtx({}, { verifiedWorkspaceId: WS_B }));
      expect(mockListOverrides).toHaveBeenCalledWith(WS_B);
    });

    it("calls listOverrides (not getLatestOverride) when no recordId param", async () => {
      mockListOverrides.mockResolvedValueOnce([]);
      await overrideGet(makeGetCtx());
      expect(mockListOverrides).toHaveBeenCalledTimes(1);
      expect(mockGetLatestOverride).not.toHaveBeenCalled();
    });
  });

  // ─── 4. POST /api/owner/override-arbitration ─────────────────────────────────

  describe("POST /api/owner/override-arbitration", () => {
    const POST_BODY = {
      overriddenRecordId: RECORD_ID,
      overrideRationale: "Owner has direct market intelligence justifying override decision.",
      decision: "EXECUTE_NOW",
    };

    it("returns 201 with override on success", async () => {
      mockCreateArbitrationOverride.mockResolvedValueOnce(OVERRIDE);
      const result = await overridePost(makePostCtx(POST_BODY));
      expect(result.status).toBe(201);
      expect(result.body.override).toBeDefined();
    });

    it("passes workspaceId (WS_A) to createArbitrationOverride", async () => {
      mockCreateArbitrationOverride.mockResolvedValueOnce(OVERRIDE);
      await overridePost(makePostCtx(POST_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockCreateArbitrationOverride).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes workspaceId (WS_B) to createArbitrationOverride", async () => {
      mockCreateArbitrationOverride.mockResolvedValueOnce({ ...OVERRIDE, workspaceId: WS_B });
      await overridePost(makePostCtx(POST_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_URL, json: async () => POST_BODY },
      }));
      expect(mockCreateArbitrationOverride).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes actorId (ACTOR_A) to createArbitrationOverride", async () => {
      mockCreateArbitrationOverride.mockResolvedValueOnce(OVERRIDE);
      await overridePost(makePostCtx(POST_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockCreateArbitrationOverride).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("passes actorId (ACTOR_B) to createArbitrationOverride", async () => {
      mockCreateArbitrationOverride.mockResolvedValueOnce(OVERRIDE);
      await overridePost(makePostCtx(POST_BODY, {
        verifiedActorId: ACTOR_B,
        request: { url: BASE_URL, json: async () => POST_BODY },
      }));
      expect(mockCreateArbitrationOverride).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_B })
      );
    });

    it("passes overriddenRecordId from body to service", async () => {
      mockCreateArbitrationOverride.mockResolvedValueOnce(OVERRIDE);
      await overridePost(makePostCtx(POST_BODY));
      expect(mockCreateArbitrationOverride).toHaveBeenCalledWith(
        expect.objectContaining({ overriddenRecordId: RECORD_ID })
      );
    });

    it("passes decision from body to service", async () => {
      mockCreateArbitrationOverride.mockResolvedValueOnce(OVERRIDE);
      await overridePost(makePostCtx({ ...POST_BODY, decision: "DELAY" }));
      expect(mockCreateArbitrationOverride).toHaveBeenCalledWith(
        expect.objectContaining({ decision: "DELAY" })
      );
    });

    it("accepts all valid decision values", async () => {
      const decisions = ["EXECUTE_NOW", "DELAY", "CANCEL", "MERGE", "SPLIT", "ESCALATE"] as const;
      for (const decision of decisions) {
        vi.resetAllMocks();
        allowAll();
        mockCreateArbitrationOverride.mockResolvedValueOnce({ ...OVERRIDE, decision });
        const result = await overridePost(makePostCtx({ ...POST_BODY, decision }));
        expect(result.status).toBe(201);
      }
    });

    it("calls createArbitrationOverride exactly once per request", async () => {
      mockCreateArbitrationOverride.mockResolvedValueOnce(OVERRIDE);
      await overridePost(makePostCtx(POST_BODY));
      expect(mockCreateArbitrationOverride).toHaveBeenCalledTimes(1);
    });

    it("does not call getLatestOverride or listOverrides on POST", async () => {
      mockCreateArbitrationOverride.mockResolvedValueOnce(OVERRIDE);
      await overridePost(makePostCtx(POST_BODY));
      expect(mockGetLatestOverride).not.toHaveBeenCalled();
      expect(mockListOverrides).not.toHaveBeenCalled();
    });
  });

  // ─── 5. Workspace isolation ───────────────────────────────────────────────────

  describe("workspace isolation", () => {
    it("GET list: two calls with different workspaceIds use respective IDs", async () => {
      mockListOverrides.mockResolvedValueOnce([OVERRIDE]).mockResolvedValueOnce([]);
      await overrideGet(makeGetCtx({}, { verifiedWorkspaceId: WS_A }));
      await overrideGet(makeGetCtx({}, { verifiedWorkspaceId: WS_B }));
      expect(mockListOverrides).toHaveBeenNthCalledWith(1, WS_A);
      expect(mockListOverrides).toHaveBeenNthCalledWith(2, WS_B);
    });

    it("POST: two calls with different workspaceIds use respective IDs", async () => {
      const body = { overriddenRecordId: RECORD_ID, overrideRationale: "Valid reason here please.", decision: "EXECUTE_NOW" };
      mockCreateArbitrationOverride.mockResolvedValueOnce(OVERRIDE).mockResolvedValueOnce({ ...OVERRIDE, workspaceId: WS_B });
      await overridePost(makePostCtx(body, { verifiedWorkspaceId: WS_A }));
      await overridePost(makePostCtx(body, { verifiedWorkspaceId: WS_B, request: { url: BASE_URL, json: async () => body } }));
      expect(mockCreateArbitrationOverride).toHaveBeenNthCalledWith(1, expect.objectContaining({ workspaceId: WS_A }));
      expect(mockCreateArbitrationOverride).toHaveBeenNthCalledWith(2, expect.objectContaining({ workspaceId: WS_B }));
    });
  });
});
