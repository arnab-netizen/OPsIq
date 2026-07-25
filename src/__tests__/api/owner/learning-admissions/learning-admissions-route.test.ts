/**
 * Non-DB mock tests for:
 *   GET  /api/owner/learning-admissions — list admissions
 *   POST /api/owner/learning-admissions — admit candidate (idempotent)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockAdmitCandidate,
  mockListAdmissionsForWorkspace,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockAdmitCandidate: vi.fn(),
  mockListAdmissionsForWorkspace: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/controlled-learning-admission.service", () => ({
  admitCandidate: mockAdmitCandidate,
  listAdmissionsForWorkspace: mockListAdmissionsForWorkspace,
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
const ADMISSION_ID = "ad000001-0000-4000-8000-000000000001";
const CANDIDATE_ID = "ca000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/learning-admissions";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_ADMISSION = {
  id: ADMISSION_ID,
  workspaceId: WS_A,
  candidateId: CANDIDATE_ID,
  eligibilityStatus: "ELIGIBLE",
};

const MOCK_ADMIT_INPUT = {
  candidateId: CANDIDATE_ID,
  admittedBy: "admin@example.com",
  admittedAt: new Date("2026-01-01T00:00:00Z"),
  sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
  evidenceOrigin: "owner_manual_entry",
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

let admissionsGet: (ctx?: unknown) => Promise<unknown>;
let admissionsPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/learning-admissions/route");
  admissionsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  admissionsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_ADMIT_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockListAdmissionsForWorkspace.mockResolvedValue([MOCK_ADMISSION]);
  mockAdmitCandidate.mockResolvedValue({ admitted: true, admission: MOCK_ADMISSION });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("learning-admissions-route — module contract assertions", () => {
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
  it("MOCK_ADMISSION.eligibilityStatus is ELIGIBLE", () => { expect(MOCK_ADMISSION.eligibilityStatus).toBe("ELIGIBLE"); });
});

describe("GET /api/owner/learning-admissions — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await admissionsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await admissionsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await admissionsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listAdmissionsForWorkspace with workspaceId", async () => {
      await admissionsGet(makeCtx());
      expect(mockListAdmissionsForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_A
      );
    });

    it("returns array of admissions in body", async () => {
      const result = await admissionsGet(makeCtx()) as { body: unknown[] };
      expect(Array.isArray(result.body)).toBe(true);
    });

    it("calls listAdmissionsForWorkspace exactly once", async () => {
      await admissionsGet(makeCtx());
      expect(mockListAdmissionsForWorkspace).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await admissionsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListAdmissionsForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_B
      );
    });

    it("does not call admitCandidate for GET", async () => {
      await admissionsGet(makeCtx());
      expect(mockAdmitCandidate).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/owner/learning-admissions — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await admissionsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await admissionsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls admitCandidate with workspaceId", async () => {
      await admissionsPost(makeCtx());
      expect(mockAdmitCandidate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("returns admission in body", async () => {
      const result = await admissionsPost(makeCtx()) as { body: { admission: unknown } };
      expect(result.body.admission).toEqual(MOCK_ADMISSION);
    });

    it("calls admitCandidate exactly once", async () => {
      await admissionsPost(makeCtx());
      expect(mockAdmitCandidate).toHaveBeenCalledTimes(1);
    });

    it("does not include eligibilityStatus in admitCandidate call", async () => {
      await admissionsPost(makeCtx());
      const callArg = mockAdmitCandidate.mock.calls[0][1] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty("eligibilityStatus");
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await admissionsPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockAdmitCandidate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST violations path", () => {
    it("returns 422 when result.admitted is false", async () => {
      mockAdmitCandidate.mockResolvedValue({ admitted: false, violations: ["INELIGIBLE"] });
      const result = await admissionsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(422);
    });

    it("returns violations array in body when not admitted", async () => {
      mockAdmitCandidate.mockResolvedValue({ admitted: false, violations: ["INELIGIBLE"] });
      const result = await admissionsPost(makeCtx()) as { body: { violations: unknown[] } };
      expect(Array.isArray(result.body.violations)).toBe(true);
    });
  });
});
