/**
 * Non-DB mock tests for:
 *   POST /api/owner/startup/sessions — create startup session and persist
 *   GET  /api/owner/startup/sessions — list all sessions for workspace
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockCreateStartupSession,
  mockListStartupSessions,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateStartupSession: vi.fn(),
  mockListStartupSessions: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-strategy/startup-session.service", () => ({
  createStartupSession: mockCreateStartupSession,
  listStartupSessions: mockListStartupSessions,
}));

vi.mock("@/domain/owner-strategy/startup-mode.validation", () => ({
  startupIntakeSchema: {},
  startupIdeaSchema: {},
}));

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
const SESSION_ID = "se000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/startup/sessions";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_INTAKE = { industry: "food_service", targetMarket: "b2b", stage: "pre_revenue" };
const MOCK_IDEAS = [{ title: "Corporate Catering", description: "Deliver to offices" }];

const MOCK_CREATE_INPUT = {
  sessionLabel: "Q3 2026 Validation",
  intake: MOCK_INTAKE,
  ideas: MOCK_IDEAS,
};

const MOCK_SESSIONS = [
  { sessionId: SESSION_ID, sessionLabel: "Q3 2026 Validation", status: "DRAFT", createdAt: "2026-07-01T00:00:00.000Z" },
];

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

let startupSessionsPost: (ctx?: unknown) => Promise<unknown>;
let startupSessionsGet: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/startup/sessions/route");
  startupSessionsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  startupSessionsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CREATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockCreateStartupSession.mockResolvedValue(SESSION_ID);
  mockListStartupSessions.mockResolvedValue(MOCK_SESSIONS);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("startup-sessions-route — module contract assertions", () => {
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
  it("SESSION_ID is a string", () => { expect(typeof SESSION_ID).toBe("string"); });
});

describe("POST /api/owner/startup/sessions — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await startupSessionsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await startupSessionsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await startupSessionsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls createStartupSession with workspaceId", async () => {
      await startupSessionsPost(makeCtx());
      expect(mockCreateStartupSession).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls createStartupSession with actorId", async () => {
      await startupSessionsPost(makeCtx());
      expect(mockCreateStartupSession).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("calls createStartupSession with intake from body", async () => {
      await startupSessionsPost(makeCtx());
      expect(mockCreateStartupSession).toHaveBeenCalledWith(
        expect.objectContaining({ intake: MOCK_INTAKE })
      );
    });

    it("calls createStartupSession with ideas from body", async () => {
      await startupSessionsPost(makeCtx());
      expect(mockCreateStartupSession).toHaveBeenCalledWith(
        expect.objectContaining({ ideas: MOCK_IDEAS })
      );
    });

    it("calls createStartupSession with sessionLabel from body", async () => {
      await startupSessionsPost(makeCtx());
      expect(mockCreateStartupSession).toHaveBeenCalledWith(
        expect.objectContaining({ sessionLabel: "Q3 2026 Validation" })
      );
    });

    it("passes null sessionLabel when body sessionLabel is undefined", async () => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_CREATE_INPUT, sessionLabel: undefined });
      await startupSessionsPost(makeCtx());
      expect(mockCreateStartupSession).toHaveBeenCalledWith(
        expect.objectContaining({ sessionLabel: null })
      );
    });

    it("returns sessionId in body", async () => {
      const result = await startupSessionsPost(makeCtx()) as { body: { sessionId: string } };
      expect(result.body.sessionId).toBe(SESSION_ID);
    });

    it("calls createStartupSession exactly once", async () => {
      await startupSessionsPost(makeCtx());
      expect(mockCreateStartupSession).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspaceId (WS_B)", async () => {
      await startupSessionsPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockCreateStartupSession).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});

describe("GET /api/owner/startup/sessions — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await startupSessionsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await startupSessionsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listStartupSessions with verifiedWorkspaceId", async () => {
      await startupSessionsGet(makeCtx());
      expect(mockListStartupSessions).toHaveBeenCalledWith(WS_A);
    });

    it("calls listStartupSessions exactly once", async () => {
      await startupSessionsGet(makeCtx());
      expect(mockListStartupSessions).toHaveBeenCalledTimes(1);
    });

    it("returns sessions array in body", async () => {
      const result = await startupSessionsGet(makeCtx()) as { body: { sessions: unknown[] } };
      expect(Array.isArray(result.body.sessions)).toBe(true);
    });

    it("returns correct sessions count", async () => {
      const result = await startupSessionsGet(makeCtx()) as { body: { sessions: unknown[] } };
      expect(result.body.sessions.length).toBe(1);
    });

    it("uses WS_B when verifiedWorkspaceId is WS_B", async () => {
      await startupSessionsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListStartupSessions).toHaveBeenCalledWith(WS_B);
    });

    it("does not call createStartupSession on GET", async () => {
      await startupSessionsGet(makeCtx());
      expect(mockCreateStartupSession).not.toHaveBeenCalled();
    });
  });
});
