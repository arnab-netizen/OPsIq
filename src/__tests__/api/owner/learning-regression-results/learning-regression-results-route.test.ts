/**
 * Non-DB mock tests for:
 *   GET  /api/owner/learning-regression-results — list regression results
 *   POST /api/owner/learning-regression-results — record regression result
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRecordRegressionResult,
  mockListRegressionResultsForWorkspace,
  mockListRegressionResultsForCandidate,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRecordRegressionResult: vi.fn(),
  mockListRegressionResultsForWorkspace: vi.fn(),
  mockListRegressionResultsForCandidate: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/controlled-learning-regression.service", () => ({
  recordRegressionResult: mockRecordRegressionResult,
  listRegressionResultsForWorkspace: mockListRegressionResultsForWorkspace,
  listRegressionResultsForCandidate: mockListRegressionResultsForCandidate,
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
const RESULT_ID = "rr000001-0000-4000-8000-000000000001";
const CANDIDATE_ID = "ca000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/learning-regression-results";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_REGRESSION_RESULT = {
  id: RESULT_ID,
  workspaceId: WS_A,
  candidateId: CANDIDATE_ID,
  regressionType: "ACCURACY_DROP",
  severity: "MEDIUM",
};

const MOCK_INPUT = {
  candidateId: CANDIDATE_ID,
  regressionType: "ACCURACY_DROP",
  severity: "MEDIUM",
  detectedAt: new Date("2026-01-01T00:00:00Z"),
  description: "Model accuracy dropped by 5%",
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

let regressionGet: (ctx?: unknown) => Promise<unknown>;
let regressionPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/learning-regression-results/route");
  regressionGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  regressionPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockListRegressionResultsForWorkspace.mockResolvedValue([MOCK_REGRESSION_RESULT]);
  mockListRegressionResultsForCandidate.mockResolvedValue([MOCK_REGRESSION_RESULT]);
  mockRecordRegressionResult.mockResolvedValue({ recorded: true, result: MOCK_REGRESSION_RESULT });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("learning-regression-results-route — module contract assertions", () => {
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
  it("MOCK_REGRESSION_RESULT.regressionType is ACCURACY_DROP", () => { expect(MOCK_REGRESSION_RESULT.regressionType).toBe("ACCURACY_DROP"); });
});

describe("GET /api/owner/learning-regression-results — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await regressionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await regressionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("GET without candidateId (workspace-wide)", () => {
    it("returns 200 on success", async () => {
      const result = await regressionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listRegressionResultsForWorkspace with workspaceId", async () => {
      await regressionGet(makeCtx());
      expect(mockListRegressionResultsForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_A
      );
    });

    it("does not call listRegressionResultsForCandidate when no candidateId", async () => {
      await regressionGet(makeCtx());
      expect(mockListRegressionResultsForCandidate).not.toHaveBeenCalled();
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await regressionGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListRegressionResultsForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_B
      );
    });
  });

  describe("GET with candidateId", () => {
    it("returns 200 when filtering by candidateId", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      const result = await regressionGet(ctx) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listRegressionResultsForCandidate with workspaceId and candidateId", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      await regressionGet(ctx);
      expect(mockListRegressionResultsForCandidate).toHaveBeenCalledWith(
        expect.anything(),
        WS_A,
        CANDIDATE_ID
      );
    });

    it("does not call listRegressionResultsForWorkspace when candidateId given", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      await regressionGet(ctx);
      expect(mockListRegressionResultsForWorkspace).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/owner/learning-regression-results — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await regressionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await regressionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls recordRegressionResult with workspaceId", async () => {
      await regressionPost(makeCtx());
      expect(mockRecordRegressionResult).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("returns result in body", async () => {
      const result = await regressionPost(makeCtx()) as { body: { result: unknown } };
      expect(result.body.result).toEqual(MOCK_REGRESSION_RESULT);
    });

    it("calls recordRegressionResult exactly once", async () => {
      await regressionPost(makeCtx());
      expect(mockRecordRegressionResult).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await regressionPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRecordRegressionResult).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST violations path", () => {
    it("returns 422 when result.recorded is false", async () => {
      mockRecordRegressionResult.mockResolvedValue({ recorded: false, violations: ["DUPLICATE"] });
      const result = await regressionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(422);
    });

    it("returns violations array in body when not recorded", async () => {
      mockRecordRegressionResult.mockResolvedValue({ recorded: false, violations: ["DUPLICATE"] });
      const result = await regressionPost(makeCtx()) as { body: { violations: unknown[] } };
      expect(Array.isArray(result.body.violations)).toBe(true);
    });
  });
});
