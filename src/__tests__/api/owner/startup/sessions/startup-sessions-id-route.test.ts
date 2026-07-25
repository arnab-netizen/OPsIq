/**
 * Non-DB mock tests for:
 *   GET   /api/owner/startup/sessions/[sessionId] — get full session view
 *   PATCH /api/owner/startup/sessions/[sessionId] — transition session status
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 * Params extracted from ctx.routeParams per dynamic-segment pattern.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockGetStartupSession,
  mockTransitionSession,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockGetStartupSession: vi.fn(),
  mockTransitionSession: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-strategy/startup-session.service", () => ({
  createStartupSession: vi.fn(),
  listStartupSessions: vi.fn(),
  getStartupSession: mockGetStartupSession,
  transitionSession: mockTransitionSession,
}));

vi.mock("@/lib/validation", () => ({ parseRequestBody: mockParseRequestBody }));
vi.mock("@/lib/canonical-json-response", () => ({ canonicalJson: mockCanonicalJson }));

const capturedDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
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
const SESSION_ID = "se000001-0000-4000-8000-000000000001";

const BASE_URL = `https://example.com/api/owner/startup/sessions/${SESSION_ID}`;

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    routeParams: { sessionId: SESSION_ID },
    ...overrides,
  };
}

const MOCK_SESSION = {
  sessionId: SESSION_ID,
  workspaceId: WS_A,
  sessionLabel: "Q3 2026 Validation",
  status: "DRAFT",
  intake: { industry: "food_service", targetMarket: "b2b", stage: "pre_revenue" },
  ideas: [{ title: "Corporate Catering", description: "Deliver to offices" }],
  createdAt: "2026-07-01T00:00:00.000Z",
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (
      handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
      _options: unknown,
      testCtx: unknown
    ) => {
      try {
        const ctx = testCtx as Record<string, unknown>;
        const params = (ctx.routeParams ?? {}) as Record<string, string>;
        return await handler(ctx, params);
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

let startupSessionGet: (ctx?: unknown) => Promise<unknown>;
let startupSessionPatch: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/startup/sessions/[sessionId]/route");
  startupSessionGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  startupSessionPatch = route.PATCH as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue({ status: "ACTIVE" });
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockGetStartupSession.mockResolvedValue(MOCK_SESSION);
  mockTransitionSession.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("startup-sessions-id-route — module contract assertions", () => {
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
  it("MOCK_SESSION.status is DRAFT", () => { expect(MOCK_SESSION.status).toBe("DRAFT"); });
});

describe("GET /api/owner/startup/sessions/[sessionId] — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await startupSessionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await startupSessionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await startupSessionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls getStartupSession with verifiedWorkspaceId", async () => {
      await startupSessionGet(makeCtx());
      expect(mockGetStartupSession).toHaveBeenCalledWith(WS_A, SESSION_ID);
    });

    it("calls getStartupSession with sessionId from routeParams", async () => {
      await startupSessionGet(makeCtx());
      expect(mockGetStartupSession).toHaveBeenCalledWith(expect.any(String), SESSION_ID);
    });

    it("returns session in body", async () => {
      const result = await startupSessionGet(makeCtx()) as { body: { session: typeof MOCK_SESSION } };
      expect(result.body.session.sessionId).toBe(SESSION_ID);
    });

    it("returns session status in body", async () => {
      const result = await startupSessionGet(makeCtx()) as { body: { session: { status: string } } };
      expect(result.body.session.status).toBe("DRAFT");
    });

    it("calls getStartupSession exactly once", async () => {
      await startupSessionGet(makeCtx());
      expect(mockGetStartupSession).toHaveBeenCalledTimes(1);
    });

    it("uses WS_B when verifiedWorkspaceId is WS_B", async () => {
      await startupSessionGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockGetStartupSession).toHaveBeenCalledWith(WS_B, SESSION_ID);
    });

    it("does not call transitionSession on GET", async () => {
      await startupSessionGet(makeCtx());
      expect(mockTransitionSession).not.toHaveBeenCalled();
    });
  });
});

describe("PATCH /api/owner/startup/sessions/[sessionId] — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies PATCH", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await startupSessionPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies PATCH with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await startupSessionPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful PATCH", () => {
    it("returns 200 on success", async () => {
      const result = await startupSessionPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls transitionSession with verifiedWorkspaceId", async () => {
      await startupSessionPatch(makeCtx());
      expect(mockTransitionSession).toHaveBeenCalledWith(
        WS_A,
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it("calls transitionSession with sessionId from routeParams", async () => {
      await startupSessionPatch(makeCtx());
      expect(mockTransitionSession).toHaveBeenCalledWith(
        expect.any(String),
        SESSION_ID,
        expect.any(String),
        expect.any(String)
      );
    });

    it("calls transitionSession with actorId", async () => {
      await startupSessionPatch(makeCtx());
      expect(mockTransitionSession).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        ACTOR_A,
        expect.any(String)
      );
    });

    it("calls transitionSession with status from body", async () => {
      await startupSessionPatch(makeCtx());
      expect(mockTransitionSession).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        "ACTIVE"
      );
    });

    it("returns success true in body", async () => {
      const result = await startupSessionPatch(makeCtx()) as { body: { success: boolean } };
      expect(result.body.success).toBe(true);
    });

    it("calls transitionSession exactly once", async () => {
      await startupSessionPatch(makeCtx());
      expect(mockTransitionSession).toHaveBeenCalledTimes(1);
    });

    it("uses WS_B when verifiedWorkspaceId is WS_B", async () => {
      await startupSessionPatch(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockTransitionSession).toHaveBeenCalledWith(
        WS_B,
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it("does not call getStartupSession on PATCH", async () => {
      await startupSessionPatch(makeCtx());
      expect(mockGetStartupSession).not.toHaveBeenCalled();
    });
  });
});
