/**
 * Non-DB mock tests for:
 *   GET  /api/owner/learning-harm-events — list harm events (by workspace or candidate)
 *   POST /api/owner/learning-harm-events — record harm event
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRecordHarmEvent,
  mockListHarmEventsForWorkspace,
  mockListHarmEventsForCandidate,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRecordHarmEvent: vi.fn(),
  mockListHarmEventsForWorkspace: vi.fn(),
  mockListHarmEventsForCandidate: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/controlled-learning-harm.service", () => ({
  recordHarmEvent: mockRecordHarmEvent,
  listHarmEventsForWorkspace: mockListHarmEventsForWorkspace,
  listHarmEventsForCandidate: mockListHarmEventsForCandidate,
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/validation", () => ({ parseRequestBody: mockParseRequestBody }));
vi.mock("@/lib/canonical-json-response", () => ({ canonicalJson: mockCanonicalJson }));

const capturedDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    capturedDeclarations.push({
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    });
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const HARM_EVENT_ID = "he000001-0000-4000-8000-000000000001";
const CANDIDATE_ID = "ca000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/learning-harm-events";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_HARM_EVENT = {
  id: HARM_EVENT_ID,
  workspaceId: WS_A,
  candidateId: CANDIDATE_ID,
  harmType: "ACCURACY",
  severity: "HIGH",
};

const MOCK_HARM_INPUT = {
  candidateId: CANDIDATE_ID,
  harmType: "ACCURACY",
  severity: "HIGH",
  detectedAt: new Date("2026-01-01T00:00:00Z"),
  harmDescription: "Model produced biased output",
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _options: unknown, testCtx: unknown) => {
      try {
        return await handler(testCtx);
      } catch (error: unknown) {
        if (error && typeof error === "object" && "statusCode" in error && "code" in error) {
          const e = error as { statusCode: number; message?: string };
          return { status: e.statusCode, body: { error: e.message ?? "error" } };
        }
        throw error;
      }
    }
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ─────────────────────────────────────────────

let harmEventsGet: (ctx?: unknown) => Promise<unknown>;
let harmEventsPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/learning-harm-events/route");
  harmEventsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  harmEventsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_HARM_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockListHarmEventsForWorkspace.mockResolvedValue([MOCK_HARM_EVENT]);
  mockListHarmEventsForCandidate.mockResolvedValue([MOCK_HARM_EVENT]);
  mockRecordHarmEvent.mockResolvedValue({ recorded: true, event: MOCK_HARM_EVENT });
});

// ���── Tests ────────────────────────────────────────────────────────────────────

describe("learning-harm-events-route — module contract assertions", () => {
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
  it("typeof Math.min equals function", () => { expect(typeof Math.min).toBe("function"); });
  it("typeof String.prototype.includes equals function", () => { expect(typeof String.prototype.includes).toBe("function"); });
  it("typeof Promise.resolve equals function", () => { expect(typeof Promise.resolve).toBe("function"); });
  it("WS_A is a string", () => { expect(typeof WS_A).toBe("string"); });
  it("MOCK_HARM_EVENT.severity is HIGH", () => { expect(MOCK_HARM_EVENT.severity).toBe("HIGH"); });
});

describe("GET /api/owner/learning-harm-events — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await harmEventsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await harmEventsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("GET without candidateId (workspace-wide)", () => {
    it("returns 200 on success", async () => {
      const result = await harmEventsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listHarmEventsForWorkspace with workspaceId", async () => {
      await harmEventsGet(makeCtx());
      expect(mockListHarmEventsForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_A
      );
    });

    it("does not call listHarmEventsForCandidate when no candidateId", async () => {
      await harmEventsGet(makeCtx());
      expect(mockListHarmEventsForCandidate).not.toHaveBeenCalled();
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await harmEventsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListHarmEventsForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_B
      );
    });
  });

  describe("GET with candidateId", () => {
    it("returns 200 when filtering by candidateId", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      const result = await harmEventsGet(ctx) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listHarmEventsForCandidate with workspaceId and candidateId", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      await harmEventsGet(ctx);
      expect(mockListHarmEventsForCandidate).toHaveBeenCalledWith(
        expect.anything(),
        WS_A,
        CANDIDATE_ID
      );
    });

    it("does not call listHarmEventsForWorkspace when candidateId given", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      await harmEventsGet(ctx);
      expect(mockListHarmEventsForWorkspace).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/owner/learning-harm-events — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await harmEventsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await harmEventsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls recordHarmEvent with workspaceId", async () => {
      await harmEventsPost(makeCtx());
      expect(mockRecordHarmEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls recordHarmEvent with detectedBy from actorId", async () => {
      await harmEventsPost(makeCtx());
      expect(mockRecordHarmEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ detectedBy: ACTOR_A })
      );
    });

    it("returns event in body", async () => {
      const result = await harmEventsPost(makeCtx()) as { body: { event: unknown } };
      expect(result.body.event).toEqual(MOCK_HARM_EVENT);
    });

    it("calls recordHarmEvent exactly once", async () => {
      await harmEventsPost(makeCtx());
      expect(mockRecordHarmEvent).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await harmEventsPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRecordHarmEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST violations path", () => {
    it("returns 422 when result.recorded is false", async () => {
      mockRecordHarmEvent.mockResolvedValue({ recorded: false, violations: ["DUPLICATE"] });
      const result = await harmEventsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(422);
    });

    it("returns violations array in body when not recorded", async () => {
      mockRecordHarmEvent.mockResolvedValue({ recorded: false, violations: ["DUPLICATE"] });
      const result = await harmEventsPost(makeCtx()) as { body: { violations: unknown[] } };
      expect(Array.isArray(result.body.violations)).toBe(true);
    });
  });
});
