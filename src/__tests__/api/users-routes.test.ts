/**
 * Non-DB mock tests for:
 *   GET  /api/users  — list users (USER_VIEW, service-actor only)
 *   POST /api/users  — create a user (USER_CREATE, idempotency required)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockListUsers,
  mockCreateUser,
  mockWithIdempotency,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockListUsers: vi.fn(),
  mockCreateUser: vi.fn(),
  mockWithIdempotency: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/user", () => ({
  listUsers: mockListUsers,
  createUser: mockCreateUser,
}));

vi.mock("@/infra/idempotency", () => ({
  withIdempotency: mockWithIdempotency,
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
    if (src.includes("createUser")) {
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
const IDEMPOTENCY_KEY = "idem-users-001";

const BASE_URL = "https://example.com/api/users";

const USER_1 = { id: "us000001-0000-4000-8000-000000000001", workspaceId: WS_A, email: "alice@example.com" };
const USER_2 = { id: "us000002-0000-4000-8000-000000000002", workspaceId: WS_A, email: "bob@example.com" };
const LIST_RESULT = { users: [USER_1, USER_2], total: 2 };
const EMPTY_RESULT = { users: [], total: 0 };
const CREATE_BODY = { email: "carol@example.com", name: "Carol" };
const CREATE_RESULT = { id: "us000003-0000-4000-8000-000000000003", workspaceId: WS_A, email: "carol@example.com" };

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    verifiedActorType: "service",
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
    verifiedActorType: "service",
    request: {
      url: BASE_URL,
      headers: { get: (k: string) => (k === "Idempotency-Key" ? idemKey : null) },
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
  mockWithIdempotency.mockImplementation(
    async (_key: string, _op: string, fn: () => Promise<unknown>) => ({
      isNew: true,
      result: await fn(),
    })
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ──────────────────────────────────────────────

let usersGet: (ctx?: unknown) => Promise<unknown>;
let usersPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/users/route");
  usersGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  usersPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Users Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET is guarded by USER_VIEW with workspace", () => {
      expect(capturedGetDecl[0]?.requireCapabilities).toContain("USER_VIEW");
      expect(capturedGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("POST is guarded by USER_CREATE with workspace", () => {
      expect(capturedPostDecl[0]?.requireCapabilities).toContain("USER_CREATE");
      expect(capturedPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await usersGet(makeCtx());
      expect((result as { status: number }).status).toBe(403);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await usersPost(makeCtxPost(CREATE_BODY));
      expect((result as { status: number }).status).toBe(403);
    });
  });

  // ─── 2. GET /api/users ───────────────────────────────────────────────────────

  describe("GET /api/users", () => {
    it("returns list result from listUsers when actor is service", async () => {
      mockListUsers.mockResolvedValueOnce(LIST_RESULT);
      const result = await usersGet(makeCtx());
      expect(result).toEqual(LIST_RESULT);
    });

    it("passes workspaceId WS_A to listUsers", async () => {
      mockListUsers.mockResolvedValueOnce(EMPTY_RESULT);
      await usersGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      expect(mockListUsers).toHaveBeenCalledWith(WS_A, expect.anything());
    });

    it("passes workspaceId WS_B to listUsers", async () => {
      mockListUsers.mockResolvedValueOnce(EMPTY_RESULT);
      await usersGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListUsers).toHaveBeenCalledWith(WS_B, expect.anything());
    });

    it("returns empty result when no users exist", async () => {
      mockListUsers.mockResolvedValueOnce(EMPTY_RESULT);
      const result = await usersGet(makeCtx());
      expect(result).toEqual(EMPTY_RESULT);
    });

    it("calls listUsers exactly once per request", async () => {
      mockListUsers.mockResolvedValueOnce(EMPTY_RESULT);
      await usersGet(makeCtx());
      expect(mockListUsers).toHaveBeenCalledTimes(1);
    });

    it("does not call createUser for GET", async () => {
      mockListUsers.mockResolvedValueOnce(EMPTY_RESULT);
      await usersGet(makeCtx());
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it("throws when verifiedActorType is not service", async () => {
      await expect(
        usersGet(makeCtx({ verifiedActorType: "user" }))
      ).rejects.toThrow();
    });

    it("workspace isolation: consecutive GETs use respective workspaceIds", async () => {
      mockListUsers.mockResolvedValue(EMPTY_RESULT);
      await usersGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      await usersGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListUsers).toHaveBeenNthCalledWith(1, WS_A, expect.anything());
      expect(mockListUsers).toHaveBeenNthCalledWith(2, WS_B, expect.anything());
    });
  });

  // ─── 3. POST /api/users ──────────────────────────────────────────────────────

  describe("POST /api/users", () => {
    it("returns created user on success", async () => {
      mockCreateUser.mockResolvedValueOnce(CREATE_RESULT);
      const result = await usersPost(makeCtxPost(CREATE_BODY));
      expect(result).toEqual(CREATE_RESULT);
    });

    it("calls createUser with workspaceId WS_A", async () => {
      mockCreateUser.mockResolvedValueOnce(CREATE_RESULT);
      await usersPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_A }));
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verifiedWorkspaceId: WS_A }),
        WS_A
      );
    });

    it("calls createUser with workspaceId WS_B", async () => {
      mockCreateUser.mockResolvedValueOnce(CREATE_RESULT);
      await usersPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_B }));
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verifiedWorkspaceId: WS_B }),
        WS_B
      );
    });

    it("calls withIdempotency exactly once per request", async () => {
      mockCreateUser.mockResolvedValueOnce(CREATE_RESULT);
      await usersPost(makeCtxPost(CREATE_BODY));
      expect(mockWithIdempotency).toHaveBeenCalledTimes(1);
    });

    it("throws when Idempotency-Key header is missing", async () => {
      await expect(
        usersPost(makeCtxPost(CREATE_BODY, null))
      ).rejects.toThrow();
    });

    it("does not call listUsers for POST", async () => {
      mockCreateUser.mockResolvedValueOnce(CREATE_RESULT);
      await usersPost(makeCtxPost(CREATE_BODY));
      expect(mockListUsers).not.toHaveBeenCalled();
    });

    it("does not call createUser on idempotency cache hit", async () => {
      mockWithIdempotency.mockResolvedValueOnce({ isNew: false, result: CREATE_RESULT });
      await usersPost(makeCtxPost(CREATE_BODY));
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it("returns cached result on idempotency cache hit", async () => {
      mockWithIdempotency.mockResolvedValueOnce({ isNew: false, result: CREATE_RESULT });
      const result = await usersPost(makeCtxPost(CREATE_BODY));
      expect(result).toEqual(CREATE_RESULT);
    });

    it("workspace isolation: consecutive POSTs use respective workspaceIds", async () => {
      mockCreateUser.mockResolvedValue(CREATE_RESULT);
      await usersPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_A }));
      await usersPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_B }));
      expect(mockCreateUser).toHaveBeenNthCalledWith(
        1, expect.anything(), expect.objectContaining({ verifiedWorkspaceId: WS_A }), WS_A
      );
      expect(mockCreateUser).toHaveBeenNthCalledWith(
        2, expect.anything(), expect.objectContaining({ verifiedWorkspaceId: WS_B }), WS_B
      );
    });
  });
});
