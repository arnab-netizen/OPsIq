/**
 * Non-DB mock tests for:
 *   GET  /api/clients  — list clients (CLIENT_VIEW)
 *   POST /api/clients  — create a client (CLIENT_CREATE, idempotency required)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockListClients,
  mockCreateClient,
  mockCheckIdempotencyKey,
  mockRecordIdempotencyResponse,
  mockRecordIdempotencyError,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockListClients: vi.fn(),
  mockCreateClient: vi.fn(),
  mockCheckIdempotencyKey: vi.fn(),
  mockRecordIdempotencyResponse: vi.fn(),
  mockRecordIdempotencyError: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/client-account", () => ({
  listClients: mockListClients,
  createClient: mockCreateClient,
}));

vi.mock("@/services/idempotency", () => ({
  checkIdempotencyKey: mockCheckIdempotencyKey,
  recordIdempotencyResponse: mockRecordIdempotencyResponse,
  recordIdempotencyError: mockRecordIdempotencyError,
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
    if (src.includes("createClient")) {
      capturedPostDecl.push(decl);
    } else {
      capturedGetDecl.push(decl);
    }
    return async (testCtx: unknown) => mockWithCanonical(handler, options, testCtx);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "idem-clients-001";

const BASE_URL = "https://example.com/api/clients";

const CLIENT_1 = { id: "cl000001-0000-4000-8000-000000000001", workspaceId: WS_A, name: "Acme Corp" };
const CLIENT_2 = { id: "cl000002-0000-4000-8000-000000000002", workspaceId: WS_A, name: "Beta Inc" };

const LIST_RESULT = { clients: [CLIENT_1, CLIENT_2], total: 2 };
const EMPTY_RESULT = { clients: [], total: 0 };

const CREATE_BODY = { name: "Gamma Ltd", industry: "Tech", legalName: "Gamma Limited" };
const CREATE_RESULT = { id: "cl000003-0000-4000-8000-000000000003", workspaceId: WS_A, name: "Gamma Ltd" };

function makeCtx(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: {
      url: BASE_URL,
      headers: { get: (_k: string) => null },
      json: async () => CREATE_BODY,
    },
    ...overrides,
  };
}

function makeCtxPost(
  body: Record<string, unknown>,
  idemKey: string | null = IDEMPOTENCY_KEY,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: {
      url: BASE_URL,
      headers: { get: (k: string) => (k === "idempotency-key" ? idemKey : null) },
      json: async () => body,
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

let clientsGet: (ctx?: unknown) => Promise<unknown>;
let clientsPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/clients/route");
  clientsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  clientsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Clients Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET is guarded by CLIENT_VIEW with workspace", () => {
      expect(capturedGetDecl[0]?.requireCapabilities).toContain("CLIENT_VIEW");
      expect(capturedGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("POST is guarded by CLIENT_CREATE with workspace", () => {
      expect(capturedPostDecl[0]?.requireCapabilities).toContain("CLIENT_CREATE");
      expect(capturedPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await clientsGet(makeCtx());
      expect((result as { status: number }).status).toBe(403);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await clientsPost(makeCtxPost(CREATE_BODY));
      expect((result as { status: number }).status).toBe(403);
    });
  });

  // ─── 2. GET /api/clients ─────────────────────────────────────────────────────

  describe("GET /api/clients", () => {
    it("returns list result from listClients", async () => {
      mockListClients.mockResolvedValueOnce(LIST_RESULT);
      const result = await clientsGet(makeCtx());
      expect(result).toEqual(LIST_RESULT);
    });

    it("passes workspaceId WS_A to listClients", async () => {
      mockListClients.mockResolvedValueOnce(EMPTY_RESULT);
      await clientsGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      expect(mockListClients).toHaveBeenCalledWith(WS_A, expect.anything());
    });

    it("passes workspaceId WS_B to listClients", async () => {
      mockListClients.mockResolvedValueOnce(EMPTY_RESULT);
      await clientsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListClients).toHaveBeenCalledWith(WS_B, expect.anything());
    });

    it("returns empty result when no clients exist", async () => {
      mockListClients.mockResolvedValueOnce(EMPTY_RESULT);
      const result = await clientsGet(makeCtx());
      expect(result).toEqual(EMPTY_RESULT);
    });

    it("calls listClients exactly once per request", async () => {
      mockListClients.mockResolvedValueOnce(EMPTY_RESULT);
      await clientsGet(makeCtx());
      expect(mockListClients).toHaveBeenCalledTimes(1);
    });

    it("does not call createClient for GET", async () => {
      mockListClients.mockResolvedValueOnce(EMPTY_RESULT);
      await clientsGet(makeCtx());
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive GETs use respective workspaceIds", async () => {
      mockListClients.mockResolvedValue(EMPTY_RESULT);
      await clientsGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      await clientsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListClients).toHaveBeenNthCalledWith(1, WS_A, expect.anything());
      expect(mockListClients).toHaveBeenNthCalledWith(2, WS_B, expect.anything());
    });
  });

  // ─── 3. POST /api/clients ────────────────────────────────────────────────────

  describe("POST /api/clients", () => {
    it("returns created client on success (fresh key)", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateClient.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      const result = await clientsPost(makeCtxPost(CREATE_BODY));
      expect(result).toEqual(CREATE_RESULT);
    });

    it("calls createClient with workspaceId WS_A", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateClient.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await clientsPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_A }));
      expect(mockCreateClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verifiedWorkspaceId: WS_A }),
        WS_A
      );
    });

    it("calls createClient with workspaceId WS_B", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateClient.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await clientsPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_B }));
      expect(mockCreateClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verifiedWorkspaceId: WS_B }),
        WS_B
      );
    });

    it("records idempotency response after createClient succeeds", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateClient.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await clientsPost(makeCtxPost(CREATE_BODY));
      expect(mockRecordIdempotencyResponse).toHaveBeenCalledWith(
        IDEMPOTENCY_KEY,
        201,
        CREATE_RESULT
      );
    });

    it("returns cached body when idempotency key is not new", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({
        isNew: false,
        cachedResponse: { body: CREATE_RESULT },
      });
      const result = await clientsPost(makeCtxPost(CREATE_BODY));
      expect(result).toEqual(CREATE_RESULT);
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it("does not call createClient on idempotency cache hit", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({
        isNew: false,
        cachedResponse: { body: CREATE_RESULT },
      });
      await clientsPost(makeCtxPost(CREATE_BODY));
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it("does not call listClients for POST", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateClient.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await clientsPost(makeCtxPost(CREATE_BODY));
      expect(mockListClients).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive POSTs use respective workspaceIds", async () => {
      mockCheckIdempotencyKey.mockResolvedValue({ isNew: true });
      mockCreateClient.mockResolvedValue(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValue(undefined);
      await clientsPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_A }));
      await clientsPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_B }));
      expect(mockCreateClient).toHaveBeenNthCalledWith(
        1, expect.anything(), expect.objectContaining({ verifiedWorkspaceId: WS_A }), WS_A
      );
      expect(mockCreateClient).toHaveBeenNthCalledWith(
        2, expect.anything(), expect.objectContaining({ verifiedWorkspaceId: WS_B }), WS_B
      );
    });
  });
});
