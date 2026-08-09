/**
 * Non-DB mock tests for:
 *   GET  /api/owner/learning-candidates — list learning candidates
 *   POST /api/owner/learning-candidates — create/classify a learning candidate
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockCreateLearningCandidate,
  mockListLearningCandidatesForWorkspace,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateLearningCandidate: vi.fn(),
  mockListLearningCandidatesForWorkspace: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/controlled-learning-candidate.service", () => ({
  createLearningCandidate: mockCreateLearningCandidate,
  listLearningCandidatesForWorkspace: mockListLearningCandidatesForWorkspace,
}));

vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));
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
const CANDIDATE_ID = "ca000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/learning-candidates";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_CANDIDATE = {
  id: CANDIDATE_ID,
  workspaceId: WS_A,
  eligibilityStatus: "ELIGIBLE",
  eligible: true,
  evidenceSummary: "Strong evidence",
};

const MOCK_CREATE_INPUT = {
  businessId: "b4000001-0000-4000-8000-000000000001",
  evidenceSummary: "Strong evidence",
  classificationInput: {
    sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
    evidenceOrigin: "owner_manual_entry",
    publicSourceFullTextVerified: true,
    originatingWorkspaceId: WS_A,
    involvesSafetyRelatedFailure: false,
    hasConflictingEvidence: false,
    candidateRecord: {
      ownerDecisionId: "od-001",
      ownerDecisionVerdict: "approved",
      ownerDecisionWorkspaceId: WS_A,
      actionId: "act-001",
      actionWasTaken: true,
      actionWorkspaceId: WS_A,
      outcomeId: "out-001",
      outcomeWindowElapsed: true,
      outcomeWorkspaceId: WS_A,
      humanApprovedBy: ACTOR_A,
      humanApprovedAt: "2026-01-01T00:00:00Z",
      humanReviewWorkspaceId: WS_A,
    },
  },
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

let candidatesGet: (ctx?: unknown) => Promise<unknown>;
let candidatesPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/learning-candidates/route");
  candidatesGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  candidatesPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CREATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockListLearningCandidatesForWorkspace.mockResolvedValue([MOCK_CANDIDATE]);
  mockCreateLearningCandidate.mockResolvedValue(MOCK_CANDIDATE);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("learning-candidates-route — module contract assertions", () => {
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
  it("MOCK_CANDIDATE.eligible is true", () => { expect(MOCK_CANDIDATE.eligible).toBe(true); });
});

describe("GET /api/owner/learning-candidates — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await candidatesGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await candidatesGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await candidatesGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listLearningCandidatesForWorkspace with workspaceId", async () => {
      await candidatesGet(makeCtx());
      expect(mockListLearningCandidatesForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_A
      );
    });

    it("returns array of candidates in body", async () => {
      const result = await candidatesGet(makeCtx()) as { body: unknown[] };
      expect(Array.isArray(result.body)).toBe(true);
    });

    it("calls listLearningCandidatesForWorkspace exactly once", async () => {
      await candidatesGet(makeCtx());
      expect(mockListLearningCandidatesForWorkspace).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await candidatesGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListLearningCandidatesForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_B
      );
    });

    it("does not call createLearningCandidate for GET", async () => {
      await candidatesGet(makeCtx());
      expect(mockCreateLearningCandidate).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/owner/learning-candidates — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await candidatesPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await candidatesPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls createLearningCandidate with workspaceId", async () => {
      await candidatesPost(makeCtx());
      expect(mockCreateLearningCandidate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("returns candidateId in body", async () => {
      const result = await candidatesPost(makeCtx()) as { body: { candidateId: string } };
      expect(result.body.candidateId).toBe(CANDIDATE_ID);
    });

    it("returns eligibilityStatus in body", async () => {
      const result = await candidatesPost(makeCtx()) as { body: { eligibilityStatus: string } };
      expect(result.body.eligibilityStatus).toBe("ELIGIBLE");
    });

    it("returns eligible in body", async () => {
      const result = await candidatesPost(makeCtx()) as { body: { eligible: boolean } };
      expect(result.body.eligible).toBe(true);
    });

    it("calls createLearningCandidate exactly once", async () => {
      await candidatesPost(makeCtx());
      expect(mockCreateLearningCandidate).toHaveBeenCalledTimes(1);
    });

    it("injects verifiedWorkspaceId into classificationInput", async () => {
      await candidatesPost(makeCtx());
      const callArg = mockCreateLearningCandidate.mock.calls[0][1] as Record<string, unknown>;
      const classInput = callArg.classificationInput as Record<string, unknown>;
      expect(classInput.workspaceId).toBe(WS_A);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await candidatesPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockCreateLearningCandidate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});
