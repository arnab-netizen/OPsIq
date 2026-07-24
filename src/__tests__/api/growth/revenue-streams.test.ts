/**
 * Non-DB mock tests for:
 *   GET  /api/growth/revenue-streams — list persisted revenue streams
 *   POST /api/growth/revenue-streams — create and persist a new revenue stream
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { mockListStreams, mockPersistStream, mockWithCanonical } = vi.hoisted(() => ({
  mockListStreams: vi.fn(),
  mockPersistStream: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/growth/revenue-engine", () => ({
  RevenueEngine: {
    listStreams: mockListStreams,
    persistStream: mockPersistStream,
  },
}));

// ─── Capture capability declarations ─────────────────────────────────────────

const capturedGetDecl: Record<string, unknown>[] = [];
const capturedPostDecl: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    const decl = {
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    };
    const src = handler.toString();
    if (src.includes("persistStream")) {
      capturedPostDecl.push(decl);
    } else {
      capturedGetDecl.push(decl);
    }
    return async (testCtx: unknown) => mockWithCanonical(handler, options, testCtx);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ACTOR_B = "ac000002-0000-4000-8000-000000000002";

const BASE_URL = "https://example.com/api/growth/revenue-streams";

const STREAM_1 = {
  id: "rs000001-0000-4000-8000-000000000001",
  workspaceId: WS_A,
  name: "SaaS Basic",
  model: "SUBSCRIPTION",
  billingCycle: "MONTHLY",
  basePrice: 99,
  currency: "USD",
  status: "ACTIVE",
};
const STREAM_2 = {
  id: "rs000002-0000-4000-8000-000000000002",
  workspaceId: WS_A,
  name: "SaaS Pro",
  model: "SUBSCRIPTION",
  billingCycle: "ANNUAL",
  basePrice: 999,
  currency: "USD",
  status: "DRAFT",
};

const CREATE_BODY = {
  name: "SaaS Enterprise",
  basePrice: 4999,
  currency: "USD",
  model: "SUBSCRIPTION",
  billingCycle: "ANNUAL",
  status: "DRAFT",
};

function makeCtx(
  body?: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: {
      url: BASE_URL,
      json: async () => body ?? {},
    },
    ...overrides,
  };
}

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _opts: unknown, testCtx: unknown) =>
      handler(testCtx)
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ──────────────────────────────────────────────

let revenueStreamsGet: (ctx?: unknown) => Promise<unknown>;
let revenueStreamsPost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/growth/revenue-streams/route");
  revenueStreamsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  revenueStreamsPost = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Growth Revenue Streams Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET is guarded by engagement:view with workspace", () => {
      expect(capturedGetDecl[0]?.requireCapabilities).toContain("engagement:view");
      expect(capturedGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("POST is guarded by engagement:update with workspace", () => {
      expect(capturedPostDecl[0]?.requireCapabilities).toContain("engagement:update");
      expect(capturedPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await revenueStreamsGet(makeCtx());
      expect((result as { status: number }).status).toBe(403);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await revenueStreamsPost(makeCtx(CREATE_BODY));
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/growth/revenue-streams ──────────────────────────────────────

  describe("GET /api/growth/revenue-streams", () => {
    it("returns streams from listStreams", async () => {
      mockListStreams.mockResolvedValueOnce([STREAM_1, STREAM_2]);
      const result = await revenueStreamsGet(makeCtx());
      expect(result).toEqual([STREAM_1, STREAM_2]);
    });

    it("passes workspaceId WS_A to listStreams", async () => {
      mockListStreams.mockResolvedValueOnce([STREAM_1]);
      await revenueStreamsGet(makeCtx(undefined, { verifiedWorkspaceId: WS_A }));
      expect(mockListStreams).toHaveBeenCalledWith(WS_A);
    });

    it("passes workspaceId WS_B to listStreams", async () => {
      mockListStreams.mockResolvedValueOnce([]);
      await revenueStreamsGet(makeCtx(undefined, { verifiedWorkspaceId: WS_B }));
      expect(mockListStreams).toHaveBeenCalledWith(WS_B);
    });

    it("workspace isolation: consecutive calls use respective workspaceIds", async () => {
      mockListStreams.mockResolvedValue([STREAM_1]);
      await revenueStreamsGet(makeCtx(undefined, { verifiedWorkspaceId: WS_A }));
      await revenueStreamsGet(makeCtx(undefined, { verifiedWorkspaceId: WS_B }));
      expect(mockListStreams).toHaveBeenNthCalledWith(1, WS_A);
      expect(mockListStreams).toHaveBeenNthCalledWith(2, WS_B);
    });

    it("calls listStreams exactly once per request", async () => {
      mockListStreams.mockResolvedValueOnce([]);
      await revenueStreamsGet(makeCtx());
      expect(mockListStreams).toHaveBeenCalledTimes(1);
    });

    it("returns empty array when no streams exist", async () => {
      mockListStreams.mockResolvedValueOnce([]);
      const result = await revenueStreamsGet(makeCtx());
      expect(result).toEqual([]);
    });

    it("does not call persistStream for GET", async () => {
      mockListStreams.mockResolvedValueOnce([]);
      await revenueStreamsGet(makeCtx());
      expect(mockPersistStream).not.toHaveBeenCalled();
    });
  });

  // ─── 3. POST /api/growth/revenue-streams ─────────────────────────────────────

  describe("POST /api/growth/revenue-streams", () => {
    it("returns 201 on success", async () => {
      mockPersistStream.mockResolvedValueOnce(STREAM_1);
      const result = await revenueStreamsPost(makeCtx(CREATE_BODY));
      expect(result.status).toBe(201);
    });

    it("returns created stream in body", async () => {
      mockPersistStream.mockResolvedValueOnce(STREAM_1);
      const result = await revenueStreamsPost(makeCtx(CREATE_BODY));
      expect(result.body).toEqual(STREAM_1);
    });

    it("passes workspaceId WS_A to persistStream", async () => {
      mockPersistStream.mockResolvedValueOnce(STREAM_1);
      await revenueStreamsPost(makeCtx(CREATE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockPersistStream).toHaveBeenCalledWith(WS_A, expect.anything(), expect.anything());
    });

    it("passes workspaceId WS_B to persistStream", async () => {
      mockPersistStream.mockResolvedValueOnce(STREAM_1);
      await revenueStreamsPost(makeCtx(CREATE_BODY, { verifiedWorkspaceId: WS_B }));
      expect(mockPersistStream).toHaveBeenCalledWith(WS_B, expect.anything(), expect.anything());
    });

    it("passes actorId to persistStream", async () => {
      mockPersistStream.mockResolvedValueOnce(STREAM_1);
      await revenueStreamsPost(makeCtx(CREATE_BODY, { verifiedActorId: ACTOR_B }));
      expect(mockPersistStream).toHaveBeenCalledWith(expect.anything(), ACTOR_B, expect.anything());
    });

    it("passes name from body to persistStream", async () => {
      mockPersistStream.mockResolvedValueOnce(STREAM_1);
      await revenueStreamsPost(makeCtx(CREATE_BODY));
      expect(mockPersistStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ name: "SaaS Enterprise" })
      );
    });

    it("passes basePrice from body to persistStream", async () => {
      mockPersistStream.mockResolvedValueOnce(STREAM_1);
      await revenueStreamsPost(makeCtx(CREATE_BODY));
      expect(mockPersistStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ basePrice: 4999 })
      );
    });

    it("passes status from body to persistStream", async () => {
      mockPersistStream.mockResolvedValueOnce(STREAM_1);
      await revenueStreamsPost(makeCtx({ ...CREATE_BODY, status: "ACTIVE" }));
      expect(mockPersistStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ status: "ACTIVE" })
      );
    });

    it("calls persistStream exactly once per request", async () => {
      mockPersistStream.mockResolvedValueOnce(STREAM_1);
      await revenueStreamsPost(makeCtx(CREATE_BODY));
      expect(mockPersistStream).toHaveBeenCalledTimes(1);
    });

    it("does not call listStreams for POST", async () => {
      mockPersistStream.mockResolvedValueOnce(STREAM_1);
      await revenueStreamsPost(makeCtx(CREATE_BODY));
      expect(mockListStreams).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive POSTs use respective workspaceIds", async () => {
      mockPersistStream.mockResolvedValue(STREAM_1);
      await revenueStreamsPost(makeCtx(CREATE_BODY, { verifiedWorkspaceId: WS_A }));
      await revenueStreamsPost(makeCtx(CREATE_BODY, { verifiedWorkspaceId: WS_B }));
      expect(mockPersistStream).toHaveBeenNthCalledWith(1, WS_A, expect.anything(), expect.anything());
      expect(mockPersistStream).toHaveBeenNthCalledWith(2, WS_B, expect.anything(), expect.anything());
    });
  });
});
