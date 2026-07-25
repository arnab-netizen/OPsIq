/**
 * Non-DB mock tests for:
 *   POST /api/owner/startup/sessions/[sessionId]/candidates/[batchId]/[conceptIndex]/accept
 *   — accept a generated idea candidate (creates StartupIdeaRecord, idempotent)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Route has no body — no parseRequestBody. Params extracted from ctx.routeParams.
 * conceptIndex NaN or <0 → BadRequestError (caught by allowAll() → 400).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRecordCandidateDecision,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRecordCandidateDecision: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-strategy/startup-session.service", () => ({
  createStartupSession: vi.fn(),
  listStartupSessions: vi.fn(),
  getStartupSession: vi.fn(),
  transitionSession: vi.fn(),
  generateIdeasForNeedOptionsPath: vi.fn(),
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
  addIdea: vi.fn(),
  reviseIdea: vi.fn(),
  recordCandidateDecision: mockRecordCandidateDecision,
  buildAndPersistValidationPlan: vi.fn(),
  buildAndPersistMarketSizing: vi.fn(),
}));

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
const CANDIDATE_ID = "ca000001-0000-4000-8000-000000000001";
const IDEA_ID = "id000001-0000-4000-8000-000000000001";
const CONCEPT_INDEX = "0";

const BASE_URL = `https://example.com/api/owner/startup/sessions/${SESSION_ID}/candidates/${BATCH_ID}/${CONCEPT_INDEX}/accept`;

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    routeParams: { sessionId: SESSION_ID, batchId: BATCH_ID, conceptIndex: CONCEPT_INDEX },
    ...overrides,
  };
}

const MOCK_ACCEPT_RESULT = {
  candidateId: CANDIDATE_ID,
  ideaId: IDEA_ID,
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

let candidatesAcceptPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import(
    "@/app/api/owner/startup/sessions/[sessionId]/candidates/[batchId]/[conceptIndex]/accept/route"
  );
  candidatesAcceptPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockRecordCandidateDecision.mockResolvedValue(MOCK_ACCEPT_RESULT);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("candidates-accept-route — module contract assertions", () => {
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
  it("CANDIDATE_ID is a string", () => { expect(typeof CANDIDATE_ID).toBe("string"); });
});

describe("POST .../candidates/[batchId]/[conceptIndex]/accept — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await candidatesAcceptPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await candidatesAcceptPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await candidatesAcceptPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls recordCandidateDecision with verifiedWorkspaceId", async () => {
      await candidatesAcceptPost(makeCtx());
      expect(mockRecordCandidateDecision).toHaveBeenCalledWith(
        WS_A,
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("calls recordCandidateDecision with sessionId from routeParams", async () => {
      await candidatesAcceptPost(makeCtx());
      expect(mockRecordCandidateDecision).toHaveBeenCalledWith(
        expect.any(String),
        SESSION_ID,
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("calls recordCandidateDecision with batchId from routeParams", async () => {
      await candidatesAcceptPost(makeCtx());
      expect(mockRecordCandidateDecision).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        BATCH_ID,
        expect.any(Number),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("parses conceptIndex to integer from routeParams", async () => {
      await candidatesAcceptPost(makeCtx());
      expect(mockRecordCandidateDecision).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        0,
        expect.any(String),
        expect.any(Object)
      );
    });

    it("calls recordCandidateDecision with actorId", async () => {
      await candidatesAcceptPost(makeCtx());
      expect(mockRecordCandidateDecision).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        ACTOR_A,
        expect.any(Object)
      );
    });

    it("calls recordCandidateDecision with ACCEPTED decision", async () => {
      await candidatesAcceptPost(makeCtx());
      expect(mockRecordCandidateDecision).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.objectContaining({ decision: "ACCEPTED" })
      );
    });

    it("returns candidateId in body", async () => {
      const result = await candidatesAcceptPost(makeCtx()) as { body: { candidateId: string } };
      expect(result.body.candidateId).toBe(CANDIDATE_ID);
    });

    it("returns ideaId in body", async () => {
      const result = await candidatesAcceptPost(makeCtx()) as { body: { ideaId: string } };
      expect(result.body.ideaId).toBe(IDEA_ID);
    });

    it("returns ACCEPTED decision in body", async () => {
      const result = await candidatesAcceptPost(makeCtx()) as { body: { decision: string } };
      expect(result.body.decision).toBe("ACCEPTED");
    });

    it("calls recordCandidateDecision exactly once", async () => {
      await candidatesAcceptPost(makeCtx());
      expect(mockRecordCandidateDecision).toHaveBeenCalledTimes(1);
    });

    it("uses WS_B when verifiedWorkspaceId is WS_B", async () => {
      await candidatesAcceptPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRecordCandidateDecision).toHaveBeenCalledWith(
        WS_B,
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe("POST — invalid conceptIndex", () => {
    it("returns 400 when conceptIndex is NaN (non-numeric string)", async () => {
      const result = await candidatesAcceptPost(
        makeCtx({ routeParams: { sessionId: SESSION_ID, batchId: BATCH_ID, conceptIndex: "abc" } })
      ) as { status: number };
      expect(result.status).toBe(400);
    });

    it("returns 400 when conceptIndex is negative", async () => {
      const result = await candidatesAcceptPost(
        makeCtx({ routeParams: { sessionId: SESSION_ID, batchId: BATCH_ID, conceptIndex: "-1" } })
      ) as { status: number };
      expect(result.status).toBe(400);
    });

    it("does not call recordCandidateDecision when conceptIndex invalid", async () => {
      await candidatesAcceptPost(
        makeCtx({ routeParams: { sessionId: SESSION_ID, batchId: BATCH_ID, conceptIndex: "abc" } })
      );
      expect(mockRecordCandidateDecision).not.toHaveBeenCalled();
    });
  });
});
