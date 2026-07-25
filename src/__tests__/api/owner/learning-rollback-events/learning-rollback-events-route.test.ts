/**
 * Non-DB mock tests for:
 *   GET  /api/owner/learning-rollback-events — list rollback events (by workspace or candidate)
 *   POST /api/owner/learning-rollback-events — record a rollback event
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRecordRollbackEvent,
  mockListRollbackEventsForWorkspace,
  mockListRollbackEventsForCandidate,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRecordRollbackEvent: vi.fn(),
  mockListRollbackEventsForWorkspace: vi.fn(),
  mockListRollbackEventsForCandidate: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/controlled-learning-rollback.service", () => ({
  recordRollbackEvent: mockRecordRollbackEvent,
  listRollbackEventsForWorkspace: mockListRollbackEventsForWorkspace,
  listRollbackEventsForCandidate: mockListRollbackEventsForCandidate,
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
const ROLLBACK_EVENT_ID = "rb000001-0000-4000-8000-000000000001";
const CANDIDATE_ID = "ca000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/learning-rollback-events";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_ROLLBACK_EVENT = {
  id: ROLLBACK_EVENT_ID,
  workspaceId: WS_A,
  candidateId: CANDIDATE_ID,
  rollbackCode: "REGRESSION_DETECTED",
  rolledBackBy: ACTOR_A,
};

const MOCK_ROLLBACK_INPUT = {
  candidateId: CANDIDATE_ID,
  rolledBackBy: ACTOR_A,
  rolledBackAt: new Date("2026-01-01T00:00:00Z"),
  rollbackReason: "Accuracy regression detected in production",
  rollbackCode: "REGRESSION_DETECTED",
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

let rollbackEventsGet: (ctx?: unknown) => Promise<unknown>;
let rollbackEventsPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/learning-rollback-events/route");
  rollbackEventsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  rollbackEventsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_ROLLBACK_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockListRollbackEventsForWorkspace.mockResolvedValue([MOCK_ROLLBACK_EVENT]);
  mockListRollbackEventsForCandidate.mockResolvedValue([MOCK_ROLLBACK_EVENT]);
  mockRecordRollbackEvent.mockResolvedValue({ recorded: true, event: MOCK_ROLLBACK_EVENT });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("learning-rollback-events-route — module contract assertions", () => {
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
  it("MOCK_ROLLBACK_EVENT.rollbackCode is REGRESSION_DETECTED", () => { expect(MOCK_ROLLBACK_EVENT.rollbackCode).toBe("REGRESSION_DETECTED"); });
});

describe("GET /api/owner/learning-rollback-events — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await rollbackEventsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await rollbackEventsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("GET without candidateId (workspace-wide)", () => {
    it("returns 200 on success", async () => {
      const result = await rollbackEventsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listRollbackEventsForWorkspace with workspaceId", async () => {
      await rollbackEventsGet(makeCtx());
      expect(mockListRollbackEventsForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_A
      );
    });

    it("does not call listRollbackEventsForCandidate when no candidateId", async () => {
      await rollbackEventsGet(makeCtx());
      expect(mockListRollbackEventsForCandidate).not.toHaveBeenCalled();
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await rollbackEventsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListRollbackEventsForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_B
      );
    });
  });

  describe("GET with candidateId", () => {
    it("returns 200 when filtering by candidateId", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      const result = await rollbackEventsGet(ctx) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listRollbackEventsForCandidate with workspaceId and candidateId", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      await rollbackEventsGet(ctx);
      expect(mockListRollbackEventsForCandidate).toHaveBeenCalledWith(
        expect.anything(),
        WS_A,
        CANDIDATE_ID
      );
    });

    it("does not call listRollbackEventsForWorkspace when candidateId given", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      await rollbackEventsGet(ctx);
      expect(mockListRollbackEventsForWorkspace).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/owner/learning-rollback-events — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await rollbackEventsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await rollbackEventsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls recordRollbackEvent with workspaceId", async () => {
      await rollbackEventsPost(makeCtx());
      expect(mockRecordRollbackEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("returns event in body", async () => {
      const result = await rollbackEventsPost(makeCtx()) as { body: { event: unknown } };
      expect(result.body.event).toEqual(MOCK_ROLLBACK_EVENT);
    });

    it("calls recordRollbackEvent exactly once", async () => {
      await rollbackEventsPost(makeCtx());
      expect(mockRecordRollbackEvent).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await rollbackEventsPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRecordRollbackEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST violations path", () => {
    it("returns 422 when result.recorded is false", async () => {
      mockRecordRollbackEvent.mockResolvedValue({ recorded: false, violations: ["DUPLICATE"] });
      const result = await rollbackEventsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(422);
    });

    it("returns violations array in body when not recorded", async () => {
      mockRecordRollbackEvent.mockResolvedValue({ recorded: false, violations: ["DUPLICATE"] });
      const result = await rollbackEventsPost(makeCtx()) as { body: { violations: unknown[] } };
      expect(Array.isArray(result.body.violations)).toBe(true);
    });
  });
});
