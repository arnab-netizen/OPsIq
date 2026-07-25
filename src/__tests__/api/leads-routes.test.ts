/**
 * Non-DB mock tests for:
 *   GET  /api/leads  — list leads (LEAD_VIEW)
 *   POST /api/leads  — create a lead (LEAD_CREATE, idempotency required)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockListLeads,
  mockCreateLead,
  mockCheckIdempotencyKey,
  mockRecordIdempotencyResponse,
  mockRecordIdempotencyError,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockListLeads: vi.fn(),
  mockCreateLead: vi.fn(),
  mockCheckIdempotencyKey: vi.fn(),
  mockRecordIdempotencyResponse: vi.fn(),
  mockRecordIdempotencyError: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/lead", () => ({
  listLeads: mockListLeads,
  createLead: mockCreateLead,
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
    if (src.includes("createLead")) {
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
const IDEMPOTENCY_KEY = "idem-leads-001";

const BASE_URL = "https://example.com/api/leads";

const LEAD_1 = {
  id: "ld000001-0000-4000-8000-000000000001",
  workspaceId: WS_A,
  companyName: "Prospect A",
};
const LEAD_2 = {
  id: "ld000002-0000-4000-8000-000000000002",
  workspaceId: WS_A,
  companyName: "Prospect B",
};

const LIST_RESULT = { leads: [LEAD_1, LEAD_2], total: 2 };
const EMPTY_RESULT = { leads: [], total: 0 };

const CREATE_BODY = {
  companyName: "New Prospect",
  contactName: "Jane Smith",
  source: "referral",
};
const CREATE_RESULT = {
  id: "ld000003-0000-4000-8000-000000000003",
  workspaceId: WS_A,
  companyName: "New Prospect",
};

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

let leadsGet: (ctx?: unknown) => Promise<unknown>;
let leadsPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/leads/route");
  leadsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  leadsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Leads Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET is guarded by LEAD_VIEW with workspace", () => {
      expect(capturedGetDecl[0]?.requireCapabilities).toContain("LEAD_VIEW");
      expect(capturedGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("POST is guarded by LEAD_CREATE with workspace", () => {
      expect(capturedPostDecl[0]?.requireCapabilities).toContain("LEAD_CREATE");
      expect(capturedPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await leadsGet(makeCtx());
      expect((result as { status: number }).status).toBe(403);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await leadsPost(makeCtxPost(CREATE_BODY));
      expect((result as { status: number }).status).toBe(403);
    });
  });

  // ─── 2. GET /api/leads ───────────────────────────────────────────────────────

  describe("GET /api/leads", () => {
    it("returns list result from listLeads", async () => {
      mockListLeads.mockResolvedValueOnce(LIST_RESULT);
      const result = await leadsGet(makeCtx());
      expect(result).toEqual(LIST_RESULT);
    });

    it("passes workspaceId WS_A to listLeads", async () => {
      mockListLeads.mockResolvedValueOnce(EMPTY_RESULT);
      await leadsGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      expect(mockListLeads).toHaveBeenCalledWith(WS_A, expect.anything());
    });

    it("passes workspaceId WS_B to listLeads", async () => {
      mockListLeads.mockResolvedValueOnce(EMPTY_RESULT);
      await leadsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListLeads).toHaveBeenCalledWith(WS_B, expect.anything());
    });

    it("returns empty result when no leads exist", async () => {
      mockListLeads.mockResolvedValueOnce(EMPTY_RESULT);
      const result = await leadsGet(makeCtx());
      expect(result).toEqual(EMPTY_RESULT);
    });

    it("calls listLeads exactly once per request", async () => {
      mockListLeads.mockResolvedValueOnce(EMPTY_RESULT);
      await leadsGet(makeCtx());
      expect(mockListLeads).toHaveBeenCalledTimes(1);
    });

    it("does not call createLead for GET", async () => {
      mockListLeads.mockResolvedValueOnce(EMPTY_RESULT);
      await leadsGet(makeCtx());
      expect(mockCreateLead).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive GETs use respective workspaceIds", async () => {
      mockListLeads.mockResolvedValue(EMPTY_RESULT);
      await leadsGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      await leadsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListLeads).toHaveBeenNthCalledWith(1, WS_A, expect.anything());
      expect(mockListLeads).toHaveBeenNthCalledWith(2, WS_B, expect.anything());
    });
  });

  // ─── 3. POST /api/leads ──────────────────────────────────────────────────────

  describe("POST /api/leads", () => {
    it("returns created lead on success (fresh key)", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateLead.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      const result = await leadsPost(makeCtxPost(CREATE_BODY));
      expect(result).toEqual(CREATE_RESULT);
    });

    it("calls createLead with workspaceId WS_A", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateLead.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await leadsPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_A }));
      expect(mockCreateLead).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verifiedWorkspaceId: WS_A }),
        WS_A
      );
    });

    it("calls createLead with workspaceId WS_B", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateLead.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await leadsPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_B }));
      expect(mockCreateLead).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verifiedWorkspaceId: WS_B }),
        WS_B
      );
    });

    it("records idempotency response after createLead succeeds", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateLead.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await leadsPost(makeCtxPost(CREATE_BODY));
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
      const result = await leadsPost(makeCtxPost(CREATE_BODY));
      expect(result).toEqual(CREATE_RESULT);
    });

    it("does not call createLead on idempotency cache hit", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({
        isNew: false,
        cachedResponse: { body: CREATE_RESULT },
      });
      await leadsPost(makeCtxPost(CREATE_BODY));
      expect(mockCreateLead).not.toHaveBeenCalled();
    });

    it("does not call listLeads for POST", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateLead.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await leadsPost(makeCtxPost(CREATE_BODY));
      expect(mockListLeads).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive POSTs use respective workspaceIds", async () => {
      mockCheckIdempotencyKey.mockResolvedValue({ isNew: true });
      mockCreateLead.mockResolvedValue(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValue(undefined);
      await leadsPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_A }));
      await leadsPost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_B }));
      expect(mockCreateLead).toHaveBeenNthCalledWith(
        1, expect.anything(), expect.objectContaining({ verifiedWorkspaceId: WS_A }), WS_A
      );
      expect(mockCreateLead).toHaveBeenNthCalledWith(
        2, expect.anything(), expect.objectContaining({ verifiedWorkspaceId: WS_B }), WS_B
      );
    });

    it("WS_A and WS_B fixtures are distinct workspace IDs", () => {
      expect(WS_A).not.toBe(WS_B);
    });
  });
});
