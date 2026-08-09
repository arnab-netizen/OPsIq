/**
 * Non-DB mock tests for:
 *   GET  /api/evidence  — list evidence (EVIDENCE_VIEW)
 *   POST /api/evidence  — create evidence (EVIDENCE_SUBMIT, idempotency required)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockListEvidence,
  mockCreateEvidence,
  mockCheckIdempotencyKey,
  mockRecordIdempotencyResponse,
  mockRecordIdempotencyError,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockListEvidence: vi.fn(),
  mockCreateEvidence: vi.fn(),
  mockCheckIdempotencyKey: vi.fn(),
  mockRecordIdempotencyResponse: vi.fn(),
  mockRecordIdempotencyError: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/evidence", () => ({
  listEvidence: mockListEvidence,
  createEvidence: mockCreateEvidence,
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
    if (src.includes("createEvidence")) {
      capturedPostDecl.push(decl);
    } else {
      capturedGetDecl.push(decl);
    }
    return async (testCtx: unknown) => mockWithCanonical(handler, options, testCtx);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: unknown; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "idem-evidence-001";

const BASE_URL = "https://example.com/api/evidence";

const EV_1 = {
  id: "ev000001-0000-4000-8000-000000000001",
  workspaceId: WS_A,
  title: "Client interview notes",
  evidenceType: "interview",
};
const EV_2 = {
  id: "ev000002-0000-4000-8000-000000000002",
  workspaceId: WS_A,
  title: "Financial metrics export",
  evidenceType: "metric",
};

const LIST_RESULT = { evidence: [EV_1, EV_2], total: 2 };
const EMPTY_RESULT = { evidence: [], total: 0 };

const CREATE_BODY = {
  engagementId: "ab000001-0000-4000-8000-000000000001",
  title: "New evidence record",
  evidenceType: "document",
};
const CREATE_RESULT = {
  id: "ev000003-0000-4000-8000-000000000003",
  workspaceId: WS_A,
  title: "New evidence record",
};

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    verifiedSessionSnapshot: { actorId: ACTOR_A },
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
    verifiedSessionSnapshot: { actorId: ACTOR_A },
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

let evidenceGet: (ctx?: unknown) => Promise<unknown>;
let evidencePost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/evidence/route");
  evidenceGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  evidencePost = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Evidence Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET is guarded by EVIDENCE_VIEW with workspace", () => {
      expect(capturedGetDecl[0]?.requireCapabilities).toContain("evidence:view");
      expect(capturedGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("POST is guarded by EVIDENCE_SUBMIT with workspace", () => {
      expect(capturedPostDecl[0]?.requireCapabilities).toContain("evidence:submit");
      expect(capturedPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await evidenceGet(makeCtx());
      expect((result as { status: number }).status).toBe(403);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await evidencePost(makeCtxPost(CREATE_BODY));
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/evidence ────────────────────────────────────────────────────

  describe("GET /api/evidence", () => {
    it("returns list result from listEvidence", async () => {
      mockListEvidence.mockResolvedValueOnce(LIST_RESULT);
      const result = await evidenceGet(makeCtx());
      expect(result).toEqual(LIST_RESULT);
    });

    it("passes workspaceId WS_A to listEvidence", async () => {
      mockListEvidence.mockResolvedValueOnce(EMPTY_RESULT);
      await evidenceGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      expect(mockListEvidence).toHaveBeenCalledWith(WS_A, expect.anything());
    });

    it("passes workspaceId WS_B to listEvidence", async () => {
      mockListEvidence.mockResolvedValueOnce(EMPTY_RESULT);
      await evidenceGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListEvidence).toHaveBeenCalledWith(WS_B, expect.anything());
    });

    it("returns empty result when no evidence exists", async () => {
      mockListEvidence.mockResolvedValueOnce(EMPTY_RESULT);
      const result = await evidenceGet(makeCtx());
      expect(result).toEqual(EMPTY_RESULT);
    });

    it("calls listEvidence exactly once per request", async () => {
      mockListEvidence.mockResolvedValueOnce(EMPTY_RESULT);
      await evidenceGet(makeCtx());
      expect(mockListEvidence).toHaveBeenCalledTimes(1);
    });

    it("does not call createEvidence for GET", async () => {
      mockListEvidence.mockResolvedValueOnce(EMPTY_RESULT);
      await evidenceGet(makeCtx());
      expect(mockCreateEvidence).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive GETs use respective workspaceIds", async () => {
      mockListEvidence.mockResolvedValue(EMPTY_RESULT);
      await evidenceGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      await evidenceGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListEvidence).toHaveBeenNthCalledWith(1, WS_A, expect.anything());
      expect(mockListEvidence).toHaveBeenNthCalledWith(2, WS_B, expect.anything());
    });
  });

  // ─── 3. POST /api/evidence ───────────────────────────────────────────────────

  describe("POST /api/evidence", () => {
    it("returns 400 when idempotency-key header is missing", async () => {
      const result = await evidencePost(makeCtxPost(CREATE_BODY, null));
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ error: expect.any(String) });
    });

    it("returns 201 and created evidence on success (fresh key)", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateEvidence.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      const result = await evidencePost(makeCtxPost(CREATE_BODY));
      expect(result.status).toBe(201);
      expect(result.body).toEqual(CREATE_RESULT);
    });

    it("passes workspaceId WS_A to createEvidence", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateEvidence.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await evidencePost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_A }));
      expect(mockCreateEvidence).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verifiedWorkspaceId: WS_A }),
        WS_A
      );
    });

    it("passes workspaceId WS_B to createEvidence", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateEvidence.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await evidencePost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_B }));
      expect(mockCreateEvidence).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verifiedWorkspaceId: WS_B }),
        WS_B
      );
    });

    it("records idempotency response after createEvidence succeeds", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateEvidence.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await evidencePost(makeCtxPost(CREATE_BODY));
      expect(mockRecordIdempotencyResponse).toHaveBeenCalledWith(
        IDEMPOTENCY_KEY,
        201,
        CREATE_RESULT
      );
    });

    it("returns cached response status and body on idempotency cache hit", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({
        isNew: false,
        cachedResponse: { body: CREATE_RESULT, status: 201 },
      });
      const result = await evidencePost(makeCtxPost(CREATE_BODY));
      expect(result.status).toBe(201);
      expect(result.body).toEqual(CREATE_RESULT);
    });

    it("does not call createEvidence on idempotency cache hit", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({
        isNew: false,
        cachedResponse: { body: CREATE_RESULT, status: 201 },
      });
      await evidencePost(makeCtxPost(CREATE_BODY));
      expect(mockCreateEvidence).not.toHaveBeenCalled();
    });

    it("does not call listEvidence for POST", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({ isNew: true });
      mockCreateEvidence.mockResolvedValueOnce(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValueOnce(undefined);
      await evidencePost(makeCtxPost(CREATE_BODY));
      expect(mockListEvidence).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive POSTs use respective workspaceIds", async () => {
      mockCheckIdempotencyKey.mockResolvedValue({ isNew: true });
      mockCreateEvidence.mockResolvedValue(CREATE_RESULT);
      mockRecordIdempotencyResponse.mockResolvedValue(undefined);
      await evidencePost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_A }));
      await evidencePost(makeCtxPost(CREATE_BODY, IDEMPOTENCY_KEY, { verifiedWorkspaceId: WS_B }));
      expect(mockCreateEvidence).toHaveBeenNthCalledWith(
        1, expect.anything(), expect.objectContaining({ verifiedWorkspaceId: WS_A }), WS_A
      );
      expect(mockCreateEvidence).toHaveBeenNthCalledWith(
        2, expect.anything(), expect.objectContaining({ verifiedWorkspaceId: WS_B }), WS_B
      );
    });
  });
});
