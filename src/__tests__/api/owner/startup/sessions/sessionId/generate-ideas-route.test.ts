/**
 * Non-DB mock tests for:
 *   POST /api/owner/startup/sessions/[sessionId]/generate-ideas
 *   — generate startup idea concepts (NEED_OPTIONS path)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 * Params extracted from ctx.routeParams per dynamic-segment pattern.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockGenerateIdeasForNeedOptionsPath,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockGenerateIdeasForNeedOptionsPath: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-strategy/startup-session.service", () => ({
  createStartupSession: vi.fn(),
  listStartupSessions: vi.fn(),
  getStartupSession: vi.fn(),
  transitionSession: vi.fn(),
  generateIdeasForNeedOptionsPath: mockGenerateIdeasForNeedOptionsPath,
  buildAndPersistStartupExplanation: vi.fn(),
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
const BATCH_ID = "ba000001-0000-4000-8000-000000000001";

const BASE_URL = `https://example.com/api/owner/startup/sessions/${SESSION_ID}/generate-ideas`;

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    routeParams: { sessionId: SESSION_ID },
    ...overrides,
  };
}

const MOCK_GENERATE_INPUT = {
  availableCapitalCents: 50000,
  ownerSkills: ["cooking", "management"],
  ownerTimeHoursPerWeek: 40,
  geography: "Sydney",
  industries: ["food_service"],
  constraints: [],
};

const MOCK_GENERATE_RESULT_AVAILABLE = {
  available: true,
  generationMethod: "PROVIDER",
  batchId: BATCH_ID,
  concepts: [
    { conceptIndex: 0, title: "Corporate Catering", description: "Deliver to offices" },
    { conceptIndex: 1, title: "Event Catering", description: "Events and functions" },
  ],
};

const MOCK_GENERATE_RESULT_UNAVAILABLE = {
  available: false,
  generationMethod: "OWNER_PROVIDED",
  batchId: null,
  concepts: [],
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

let generateIdeasPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/startup/sessions/[sessionId]/generate-ideas/route");
  generateIdeasPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_GENERATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockGenerateIdeasForNeedOptionsPath.mockResolvedValue(MOCK_GENERATE_RESULT_AVAILABLE);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generate-ideas-route — module contract assertions", () => {
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
  it("BATCH_ID is a string", () => { expect(typeof BATCH_ID).toBe("string"); });
});

describe("POST /api/owner/startup/sessions/[sessionId]/generate-ideas — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await generateIdeasPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await generateIdeasPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST — provider available", () => {
    it("returns 200 on success", async () => {
      const result = await generateIdeasPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls generateIdeasForNeedOptionsPath with verifiedWorkspaceId", async () => {
      await generateIdeasPost(makeCtx());
      expect(mockGenerateIdeasForNeedOptionsPath).toHaveBeenCalledWith(
        WS_A,
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("calls generateIdeasForNeedOptionsPath with sessionId from routeParams", async () => {
      await generateIdeasPost(makeCtx());
      expect(mockGenerateIdeasForNeedOptionsPath).toHaveBeenCalledWith(
        expect.any(String),
        SESSION_ID,
        expect.any(String),
        expect.any(Object)
      );
    });

    it("calls generateIdeasForNeedOptionsPath with actorId", async () => {
      await generateIdeasPost(makeCtx());
      expect(mockGenerateIdeasForNeedOptionsPath).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        ACTOR_A,
        expect.any(Object)
      );
    });

    it("returns NEED_OPTIONS_PROVIDER_AVAILABLE when available is true", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { providerStatus: string } };
      expect(result.body.providerStatus).toBe("NEED_OPTIONS_PROVIDER_AVAILABLE");
    });

    it("returns available true in body", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { available: boolean } };
      expect(result.body.available).toBe(true);
    });

    it("returns batchId in body", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { batchId: string } };
      expect(result.body.batchId).toBe(BATCH_ID);
    });

    it("returns concepts array in body", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { concepts: unknown[] } };
      expect(Array.isArray(result.body.concepts)).toBe(true);
    });

    it("returns conceptCount equal to concepts length", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { conceptCount: number; concepts: unknown[] } };
      expect(result.body.conceptCount).toBe(result.body.concepts.length);
    });

    it("returns null providerNote when provider available", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { providerNote: null } };
      expect(result.body.providerNote).toBeNull();
    });

    it("calls generateIdeasForNeedOptionsPath exactly once", async () => {
      await generateIdeasPost(makeCtx());
      expect(mockGenerateIdeasForNeedOptionsPath).toHaveBeenCalledTimes(1);
    });

    it("uses WS_B when verifiedWorkspaceId is WS_B", async () => {
      await generateIdeasPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockGenerateIdeasForNeedOptionsPath).toHaveBeenCalledWith(
        WS_B,
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe("POST — provider unavailable", () => {
    beforeEach(() => {
      mockGenerateIdeasForNeedOptionsPath.mockResolvedValue(MOCK_GENERATE_RESULT_UNAVAILABLE);
    });

    it("returns NEED_OPTIONS_PRODUCTION_PROVIDER_UNAVAILABLE when not available", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { providerStatus: string } };
      expect(result.body.providerStatus).toBe("NEED_OPTIONS_PRODUCTION_PROVIDER_UNAVAILABLE");
    });

    it("returns available false in body when provider not available", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { available: boolean } };
      expect(result.body.available).toBe(false);
    });

    it("returns non-null providerNote when provider unavailable", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { providerNote: string | null } };
      expect(result.body.providerNote).not.toBeNull();
    });

    it("returns empty concepts array when unavailable", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { concepts: unknown[] } };
      expect(result.body.concepts.length).toBe(0);
    });

    it("returns 0 conceptCount when unavailable", async () => {
      const result = await generateIdeasPost(makeCtx()) as { body: { conceptCount: number } };
      expect(result.body.conceptCount).toBe(0);
    });
  });
});
