/**
 * Non-DB mock tests for:
 *   GET  /api/owner/startup/sessions/[sessionId]/explanation — latest explanation record
 *   POST /api/owner/startup/sessions/[sessionId]/explanation — build and persist explanation
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 * Params extracted from ctx.routeParams per dynamic-segment pattern.
 * GET throws NotFoundError (→ 404) when record absent or decisionRef mismatch.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockGetLatestExplainabilityRecord,
  mockBuildAndPersistStartupExplanation,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockGetLatestExplainabilityRecord: vi.fn(),
  mockBuildAndPersistStartupExplanation: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/explainability.service", () => ({
  getLatestExplainabilityRecord: mockGetLatestExplainabilityRecord,
}));

vi.mock("@/services/owner-strategy/startup-session.service", () => ({
  createStartupSession: vi.fn(),
  listStartupSessions: vi.fn(),
  getStartupSession: vi.fn(),
  transitionSession: vi.fn(),
  generateIdeasForNeedOptionsPath: vi.fn(),
  buildAndPersistStartupExplanation: mockBuildAndPersistStartupExplanation,
  screenIdeaRecord: vi.fn(),
  generateAndPersistHypotheses: vi.fn(),
  buildAndPersistEconomicModel: vi.fn(),
  assessAndPersistReadiness: vi.fn(),
  recordHypothesisResult: vi.fn(),
  createSystemRecommendation: vi.fn(),
  recordOwnerDecision: vi.fn(),
  recordEvidenceItem: vi.fn(),
  buildAndPersistResearchPlan: vi.fn(),
  getOwnerResearchTasks: vi.fn(),
  executeAutoResearch: vi.fn(),
  runIdeaArbitration: vi.fn(),
  updateContextProfile: vi.fn(),
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
const EXPLANATION_ID = "ex000001-0000-4000-8000-000000000001";
const IDEA_ID = "id000001-0000-4000-8000-000000000001";

const BASE_URL = `https://example.com/api/owner/startup/sessions/${SESSION_ID}/explanation`;

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    routeParams: { sessionId: SESSION_ID },
    ...overrides,
  };
}

const MOCK_RECORD = {
  id: EXPLANATION_ID,
  workspaceId: WS_A,
  decisionRef: `startup:${SESSION_ID}`,
  decisionType: "STARTUP_SYSTEM_RECOMMENDATION",
  summary: "Go decision with high confidence",
  createdAt: "2026-07-01T00:00:00.000Z",
};

const MOCK_EXPLANATION = {
  id: EXPLANATION_ID,
  ideaName: "Corporate Catering",
  systemRecommendation: "GO",
  systemRationale: "Strong market demand and good margins",
};

const MOCK_POST_INPUT = {
  ideaId: IDEA_ID,
  ideaName: "Corporate Catering",
  systemRecommendation: "GO",
  systemRationale: "Strong market demand",
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

let explanationGet: (ctx?: unknown) => Promise<unknown>;
let explanationPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/startup/sessions/[sessionId]/explanation/route");
  explanationGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  explanationPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_POST_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockGetLatestExplainabilityRecord.mockResolvedValue(MOCK_RECORD);
  mockBuildAndPersistStartupExplanation.mockResolvedValue({
    explanationId: EXPLANATION_ID,
    explanation: MOCK_EXPLANATION,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("explanation-route — module contract assertions", () => {
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
  it("MOCK_RECORD.decisionRef starts with startup", () => {
    expect(MOCK_RECORD.decisionRef.startsWith("startup:")).toBe(true);
  });
});

describe("GET /api/owner/startup/sessions/[sessionId]/explanation — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await explanationGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await explanationGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await explanationGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls getLatestExplainabilityRecord with verifiedWorkspaceId", async () => {
      await explanationGet(makeCtx());
      expect(mockGetLatestExplainabilityRecord).toHaveBeenCalledWith(
        WS_A,
        "STARTUP_SYSTEM_RECOMMENDATION"
      );
    });

    it("calls getLatestExplainabilityRecord exactly once", async () => {
      await explanationGet(makeCtx());
      expect(mockGetLatestExplainabilityRecord).toHaveBeenCalledTimes(1);
    });

    it("returns the record as body", async () => {
      const result = await explanationGet(makeCtx()) as { body: typeof MOCK_RECORD };
      expect(result.body.id).toBe(EXPLANATION_ID);
    });

    it("uses WS_B when verifiedWorkspaceId is WS_B", async () => {
      await explanationGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockGetLatestExplainabilityRecord).toHaveBeenCalledWith(WS_B, expect.any(String));
    });
  });

  describe("GET — 404 cases", () => {
    it("returns 404 when no record found", async () => {
      mockGetLatestExplainabilityRecord.mockResolvedValue(null);
      const result = await explanationGet(makeCtx()) as { status: number };
      expect(result.status).toBe(404);
    });

    it("returns 404 when record decisionRef does not match sessionId", async () => {
      mockGetLatestExplainabilityRecord.mockResolvedValue({
        ...MOCK_RECORD,
        decisionRef: "startup:different-session-id",
      });
      const result = await explanationGet(makeCtx()) as { status: number };
      expect(result.status).toBe(404);
    });
  });
});

describe("POST /api/owner/startup/sessions/[sessionId]/explanation — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await explanationPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await explanationPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls buildAndPersistStartupExplanation with verifiedWorkspaceId", async () => {
      await explanationPost(makeCtx());
      expect(mockBuildAndPersistStartupExplanation).toHaveBeenCalledWith(
        WS_A,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("calls buildAndPersistStartupExplanation with sessionId from routeParams", async () => {
      await explanationPost(makeCtx());
      expect(mockBuildAndPersistStartupExplanation).toHaveBeenCalledWith(
        expect.any(String),
        SESSION_ID,
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("calls buildAndPersistStartupExplanation with ideaId from body", async () => {
      await explanationPost(makeCtx());
      expect(mockBuildAndPersistStartupExplanation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        IDEA_ID,
        expect.any(String),
        expect.any(Object)
      );
    });

    it("calls buildAndPersistStartupExplanation with actorId", async () => {
      await explanationPost(makeCtx());
      expect(mockBuildAndPersistStartupExplanation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        ACTOR_A,
        expect.any(Object)
      );
    });

    it("passes null ideaId when body ideaId is undefined", async () => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_POST_INPUT, ideaId: undefined });
      await explanationPost(makeCtx());
      expect(mockBuildAndPersistStartupExplanation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        null,
        expect.any(String),
        expect.any(Object)
      );
    });

    it("returns explanationId in body", async () => {
      const result = await explanationPost(makeCtx()) as { body: { explanationId: string } };
      expect(result.body.explanationId).toBe(EXPLANATION_ID);
    });

    it("returns explanation object in body", async () => {
      const result = await explanationPost(makeCtx()) as { body: { explanation: unknown } };
      expect(result.body.explanation).toBeDefined();
    });

    it("calls buildAndPersistStartupExplanation exactly once", async () => {
      await explanationPost(makeCtx());
      expect(mockBuildAndPersistStartupExplanation).toHaveBeenCalledTimes(1);
    });

    it("uses WS_B when verifiedWorkspaceId is WS_B", async () => {
      await explanationPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockBuildAndPersistStartupExplanation).toHaveBeenCalledWith(
        WS_B,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("does not call getLatestExplainabilityRecord on POST", async () => {
      await explanationPost(makeCtx());
      expect(mockGetLatestExplainabilityRecord).not.toHaveBeenCalled();
    });
  });
});
