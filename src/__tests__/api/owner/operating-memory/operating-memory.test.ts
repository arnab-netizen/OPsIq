/**
 * Non-DB mock tests for:
 *   GET  /api/owner/operating-memory — getMemoryEntries
 *   POST /api/owner/operating-memory (action=UPSERT) — upsertMemoryEntry
 *   POST /api/owner/operating-memory (action=EXPIRE) — expireMemoryEntry
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockUpsertMemoryEntry,
  mockGetMemoryEntries,
  mockExpireMemoryEntry,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockUpsertMemoryEntry: vi.fn(),
  mockGetMemoryEntries: vi.fn(),
  mockExpireMemoryEntry: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/operating-memory.service", () => ({
  upsertMemoryEntry: mockUpsertMemoryEntry,
  getMemoryEntries: mockGetMemoryEntries,
  expireMemoryEntry: mockExpireMemoryEntry,
  writeMemoryEntry: mockUpsertMemoryEntry,
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
    // GET handler reads searchParams; POST handler calls parseRequestBody
    if (handler.toString().includes("searchParams")) {
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
const ENTRY_ID = "ab300000-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/operating-memory";

function makeGetCtx(
  params: Record<string, string> = {},
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: url.toString() },
    ...overrides,
  };
}

function makePostCtx(
  body: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL, json: async () => body },
    ...overrides,
  };
}

const MEMORY_ENTRY = {
  id: ENTRY_ID,
  workspaceId: WS_A,
  memoryType: "APPROVAL",
  sourceModel: "OwnerApprovalRecord",
  sourceId: "src-001",
  key: "approval:src-001",
  summary: "Owner approved vendor contract",
  version: 1,
  supersededById: null,
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

let memoryGet: (ctx?: unknown) => Promise<CanonicalResult>;
let memoryPost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/operating-memory/route");
  memoryGet = route.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  memoryPost = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Owner Operating Memory Routes — non-DB mock tests", () => {
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
      const result = await memoryGet(makeGetCtx());
      expect(result.status).toBe(403);
    });

    it("POST returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await memoryPost(
        makePostCtx({ memoryType: "APPROVAL", sourceId: "src-001" })
      );
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/owner/operating-memory ──────────────────────────────────────

  describe("GET /api/owner/operating-memory", () => {
    it("returns 200 with entries when entries exist", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([MEMORY_ENTRY]);
      const result = await memoryGet(makeGetCtx());
      expect(result.status).toBe(200);
    });

    it("returns entries as array in body", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([MEMORY_ENTRY]);
      const result = await memoryGet(makeGetCtx());
      expect(Array.isArray(result.body.entries)).toBe(true);
    });

    it("returns empty array when no entries", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([]);
      const result = await memoryGet(makeGetCtx());
      expect(result.status).toBe(200);
      expect((result.body.entries as unknown[]).length).toBe(0);
    });

    it("passes workspaceId (WS_A) to getMemoryEntries", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([]);
      await memoryGet(makeGetCtx({}, { verifiedWorkspaceId: WS_A }));
      expect(mockGetMemoryEntries).toHaveBeenCalledWith(WS_A, expect.any(Object));
    });

    it("passes workspaceId (WS_B) to getMemoryEntries", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([]);
      await memoryGet(makeGetCtx({}, { verifiedWorkspaceId: WS_B, request: { url: BASE_URL } }));
      expect(mockGetMemoryEntries).toHaveBeenCalledWith(WS_B, expect.any(Object));
    });

    it("passes memoryType query param to service", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([MEMORY_ENTRY]);
      await memoryGet(makeGetCtx({ memoryType: "APPROVAL" }));
      expect(mockGetMemoryEntries).toHaveBeenCalledWith(
        WS_A,
        expect.objectContaining({ memoryType: "APPROVAL" })
      );
    });

    it("passes key query param to service", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([MEMORY_ENTRY]);
      await memoryGet(makeGetCtx({ key: "approval:src-001" }));
      expect(mockGetMemoryEntries).toHaveBeenCalledWith(
        WS_A,
        expect.objectContaining({ key: "approval:src-001" })
      );
    });

    it("passes both memoryType and key when both present", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([MEMORY_ENTRY]);
      await memoryGet(makeGetCtx({ memoryType: "SOP", key: "sop:proc-001" }));
      expect(mockGetMemoryEntries).toHaveBeenCalledWith(
        WS_A,
        expect.objectContaining({ memoryType: "SOP", key: "sop:proc-001" })
      );
    });

    it("passes no memoryType filter when not in URL", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([]);
      await memoryGet(makeGetCtx());
      const callArgs = mockGetMemoryEntries.mock.calls[0];
      expect(callArgs[1].memoryType).toBeUndefined();
    });

    it("calls getMemoryEntries exactly once", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([]);
      await memoryGet(makeGetCtx());
      expect(mockGetMemoryEntries).toHaveBeenCalledTimes(1);
    });

    it("does not call upsertMemoryEntry or expireMemoryEntry on GET", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([]);
      await memoryGet(makeGetCtx());
      expect(mockUpsertMemoryEntry).not.toHaveBeenCalled();
      expect(mockExpireMemoryEntry).not.toHaveBeenCalled();
    });
  });

  // ─── 3. POST UPSERT /api/owner/operating-memory ──────────────────────────────

  describe("POST UPSERT /api/owner/operating-memory", () => {
    it("returns 201 with entry on UPSERT", async () => {
      mockUpsertMemoryEntry.mockResolvedValueOnce(MEMORY_ENTRY);
      const result = await memoryPost(
        makePostCtx({ memoryType: "APPROVAL", sourceId: "src-001", summary: "Approved" })
      );
      expect(result.status).toBe(201);
    });

    it("returns entry in body on UPSERT", async () => {
      mockUpsertMemoryEntry.mockResolvedValueOnce(MEMORY_ENTRY);
      const result = await memoryPost(
        makePostCtx({ memoryType: "APPROVAL", sourceId: "src-001", summary: "Approved" })
      );
      expect(result.body.entry).toBeDefined();
    });

    it("passes workspaceId (WS_A) to upsertMemoryEntry", async () => {
      mockUpsertMemoryEntry.mockResolvedValueOnce(MEMORY_ENTRY);
      await memoryPost(
        makePostCtx(
          { memoryType: "APPROVAL", sourceId: "src-001", summary: "Approved" },
          { verifiedWorkspaceId: WS_A }
        )
      );
      expect(mockUpsertMemoryEntry).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes workspaceId (WS_B) to upsertMemoryEntry", async () => {
      mockUpsertMemoryEntry.mockResolvedValueOnce({ ...MEMORY_ENTRY, workspaceId: WS_B });
      await memoryPost(
        makePostCtx(
          { memoryType: "APPROVAL", sourceId: "src-001", summary: "Approved" },
          { verifiedWorkspaceId: WS_B, request: { url: BASE_URL, json: async () => ({ memoryType: "APPROVAL", sourceId: "src-001", summary: "Approved" }) } }
        )
      );
      expect(mockUpsertMemoryEntry).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes actorId (ACTOR_A) to upsertMemoryEntry", async () => {
      mockUpsertMemoryEntry.mockResolvedValueOnce(MEMORY_ENTRY);
      await memoryPost(
        makePostCtx(
          { memoryType: "APPROVAL", sourceId: "src-001", summary: "Approved" },
          { verifiedActorId: ACTOR_A }
        )
      );
      expect(mockUpsertMemoryEntry).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("passes actorId (ACTOR_B) to upsertMemoryEntry", async () => {
      mockUpsertMemoryEntry.mockResolvedValueOnce(MEMORY_ENTRY);
      await memoryPost(
        makePostCtx(
          { memoryType: "APPROVAL", sourceId: "src-002", summary: "Reviewed" },
          { verifiedActorId: ACTOR_B, request: { url: BASE_URL, json: async () => ({ memoryType: "APPROVAL", sourceId: "src-002", summary: "Reviewed" }) } }
        )
      );
      expect(mockUpsertMemoryEntry).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_B })
      );
    });

    it("passes memoryType from body to upsertMemoryEntry", async () => {
      mockUpsertMemoryEntry.mockResolvedValueOnce(MEMORY_ENTRY);
      await memoryPost(
        makePostCtx({ memoryType: "DO_NOT_REPEAT", sourceId: "src-001", summary: "DNR" })
      );
      expect(mockUpsertMemoryEntry).toHaveBeenCalledWith(
        expect.objectContaining({ memoryType: "DO_NOT_REPEAT" })
      );
    });

    it("passes sourceId from body to upsertMemoryEntry", async () => {
      mockUpsertMemoryEntry.mockResolvedValueOnce(MEMORY_ENTRY);
      await memoryPost(
        makePostCtx({ memoryType: "APPROVAL", sourceId: "specific-src-456", summary: "Approved" })
      );
      expect(mockUpsertMemoryEntry).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: "specific-src-456" })
      );
    });

    it("calls upsertMemoryEntry exactly once", async () => {
      mockUpsertMemoryEntry.mockResolvedValueOnce(MEMORY_ENTRY);
      await memoryPost(
        makePostCtx({ memoryType: "APPROVAL", sourceId: "src-001", summary: "Approved" })
      );
      expect(mockUpsertMemoryEntry).toHaveBeenCalledTimes(1);
    });

    it("does not call expireMemoryEntry on UPSERT", async () => {
      mockUpsertMemoryEntry.mockResolvedValueOnce(MEMORY_ENTRY);
      await memoryPost(
        makePostCtx({ memoryType: "APPROVAL", sourceId: "src-001", summary: "Approved" })
      );
      expect(mockExpireMemoryEntry).not.toHaveBeenCalled();
    });
  });

  // ─── 4. POST EXPIRE /api/owner/operating-memory ──────────────────────────────

  describe("POST EXPIRE /api/owner/operating-memory", () => {
    it("returns 200 with ok:true on EXPIRE", async () => {
      mockExpireMemoryEntry.mockResolvedValueOnce({ count: 1 });
      const result = await memoryPost(
        makePostCtx({ action: "EXPIRE", memoryType: "APPROVAL", sourceId: "src-001" })
      );
      expect(result.status).toBe(200);
      expect(result.body.ok).toBe(true);
    });

    it("calls expireMemoryEntry (not upsertMemoryEntry) on EXPIRE", async () => {
      mockExpireMemoryEntry.mockResolvedValueOnce({ count: 1 });
      await memoryPost(
        makePostCtx({ action: "EXPIRE", memoryType: "APPROVAL", sourceId: "src-001" })
      );
      expect(mockExpireMemoryEntry).toHaveBeenCalledTimes(1);
      expect(mockUpsertMemoryEntry).not.toHaveBeenCalled();
    });

    it("passes workspaceId to expireMemoryEntry", async () => {
      mockExpireMemoryEntry.mockResolvedValueOnce({ count: 1 });
      await memoryPost(
        makePostCtx(
          { action: "EXPIRE", memoryType: "APPROVAL", sourceId: "src-001" },
          { verifiedWorkspaceId: WS_A }
        )
      );
      expect(mockExpireMemoryEntry).toHaveBeenCalledWith(WS_A, "APPROVAL", "src-001");
    });

    it("passes memoryType to expireMemoryEntry", async () => {
      mockExpireMemoryEntry.mockResolvedValueOnce({ count: 1 });
      await memoryPost(
        makePostCtx({ action: "EXPIRE", memoryType: "DO_NOT_REPEAT", sourceId: "src-dnr-1" })
      );
      expect(mockExpireMemoryEntry).toHaveBeenCalledWith(
        expect.any(String),
        "DO_NOT_REPEAT",
        expect.any(String)
      );
    });

    it("passes sourceId to expireMemoryEntry", async () => {
      mockExpireMemoryEntry.mockResolvedValueOnce({ count: 1 });
      await memoryPost(
        makePostCtx({ action: "EXPIRE", memoryType: "APPROVAL", sourceId: "expire-target-999" })
      );
      expect(mockExpireMemoryEntry).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "expire-target-999"
      );
    });
  });

  // ─── 5. Workspace isolation ───────────────────────────────────────────────────

  describe("workspace isolation", () => {
    it("GET: two calls with different workspaceIds call service with respective IDs", async () => {
      mockGetMemoryEntries.mockResolvedValueOnce([MEMORY_ENTRY]).mockResolvedValueOnce([]);

      await memoryGet(makeGetCtx({}, { verifiedWorkspaceId: WS_A }));
      await memoryGet(makeGetCtx({}, { verifiedWorkspaceId: WS_B, request: { url: BASE_URL } }));

      expect(mockGetMemoryEntries).toHaveBeenNthCalledWith(1, WS_A, expect.any(Object));
      expect(mockGetMemoryEntries).toHaveBeenNthCalledWith(2, WS_B, expect.any(Object));
    });

    it("POST: two calls with different workspaceIds call service with respective IDs", async () => {
      mockUpsertMemoryEntry
        .mockResolvedValueOnce(MEMORY_ENTRY)
        .mockResolvedValueOnce({ ...MEMORY_ENTRY, workspaceId: WS_B });

      await memoryPost(
        makePostCtx({ memoryType: "APPROVAL", sourceId: "src-1", summary: "s" }, { verifiedWorkspaceId: WS_A })
      );
      await memoryPost(
        makePostCtx(
          { memoryType: "APPROVAL", sourceId: "src-2", summary: "s" },
          { verifiedWorkspaceId: WS_B, request: { url: BASE_URL, json: async () => ({ memoryType: "APPROVAL", sourceId: "src-2", summary: "s" }) } }
        )
      );

      expect(mockUpsertMemoryEntry).toHaveBeenNthCalledWith(
        1, expect.objectContaining({ workspaceId: WS_A })
      );
      expect(mockUpsertMemoryEntry).toHaveBeenNthCalledWith(
        2, expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});
