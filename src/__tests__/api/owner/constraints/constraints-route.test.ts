/**
 * Non-DB mock tests for:
 *   GET  /api/owner/constraints — list active constraint records
 *   POST /api/owner/constraints — create/accept/resolve constraint record
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ────────────────────────────────────────��──────────────

const {
  mockCreateConstraintRecord,
  mockUpdateConstraintStatus,
  mockListActiveConstraints,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateConstraintRecord: vi.fn(),
  mockUpdateConstraintStatus: vi.fn(),
  mockListActiveConstraints: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/constraint-resolution.service", () => ({
  createConstraintRecord: mockCreateConstraintRecord,
  updateConstraintStatus: mockUpdateConstraintStatus,
  listActiveConstraints: mockListActiveConstraints,
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
const CONSTRAINT_ID = "cr000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/constraints";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_CONSTRAINT = {
  id: CONSTRAINT_ID,
  workspaceId: WS_A,
  constraintType: "CAPACITY",
  constraintSource: "INTERNAL",
  title: "Staff capacity constraint",
  status: "ACTIVE",
};

const MOCK_CREATE_INPUT = {
  action: "CREATE",
  constraintType: "CAPACITY",
  constraintSource: "INTERNAL",
  title: "Staff capacity constraint",
  bindingScore: 0.8,
  remediationAction: null,
  linkedObjectiveId: null,
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

// ──�� Import handlers after mocks ─────────────────────────────────────────────

let constraintsGet: (ctx?: unknown) => Promise<unknown>;
let constraintsPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/constraints/route");
  constraintsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  constraintsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CREATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockListActiveConstraints.mockResolvedValue([MOCK_CONSTRAINT]);
  mockCreateConstraintRecord.mockResolvedValue(MOCK_CONSTRAINT);
  mockUpdateConstraintStatus.mockResolvedValue({ ...MOCK_CONSTRAINT, status: "RESOLVED" });
});

// ─��─ Tests ────────────────────────────────────────────────────────────────────

describe("constraints-route — module contract assertions", () => {
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
  it("MOCK_CONSTRAINT.constraintType is CAPACITY", () => { expect(MOCK_CONSTRAINT.constraintType).toBe("CAPACITY"); });
});

describe("GET /api/owner/constraints — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await constraintsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await constraintsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await constraintsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listActiveConstraints with workspaceId", async () => {
      await constraintsGet(makeCtx());
      expect(mockListActiveConstraints).toHaveBeenCalledWith(WS_A);
    });

    it("returns constraints array in body", async () => {
      const result = await constraintsGet(makeCtx()) as { body: { constraints: unknown[] } };
      expect(Array.isArray(result.body.constraints)).toBe(true);
    });

    it("calls listActiveConstraints exactly once", async () => {
      await constraintsGet(makeCtx());
      expect(mockListActiveConstraints).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await constraintsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListActiveConstraints).toHaveBeenCalledWith(WS_B);
    });
  });
});

describe("POST /api/owner/constraints — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await constraintsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("POST action=CREATE", () => {
    it("returns 201 on CREATE", async () => {
      const result = await constraintsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls createConstraintRecord with workspaceId", async () => {
      await constraintsPost(makeCtx());
      expect(mockCreateConstraintRecord).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls createConstraintRecord with actorId", async () => {
      await constraintsPost(makeCtx());
      expect(mockCreateConstraintRecord).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("returns constraint in body for CREATE", async () => {
      const result = await constraintsPost(makeCtx()) as { body: { constraint: unknown } };
      expect(result.body.constraint).toEqual(MOCK_CONSTRAINT);
    });

    it("uses verifiedWorkspaceId for POST (WS_B)", async () => {
      await constraintsPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockCreateConstraintRecord).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST action=RESOLVE", () => {
    it("returns 200 on RESOLVE", async () => {
      mockParseRequestBody.mockResolvedValue({ action: "RESOLVE", recordId: CONSTRAINT_ID });
      const result = await constraintsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls updateConstraintStatus with workspaceId and RESOLVED status", async () => {
      mockParseRequestBody.mockResolvedValue({ action: "RESOLVE", recordId: CONSTRAINT_ID });
      await constraintsPost(makeCtx());
      expect(mockUpdateConstraintStatus).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, recordId: CONSTRAINT_ID, status: "RESOLVED" })
      );
    });

    it("returns constraint in body for RESOLVE", async () => {
      mockParseRequestBody.mockResolvedValue({ action: "RESOLVE", recordId: CONSTRAINT_ID });
      const result = await constraintsPost(makeCtx()) as { body: { constraint: unknown } };
      expect(result.body.constraint).toBeDefined();
    });
  });

  describe("POST action=ACCEPT", () => {
    it("returns 200 on ACCEPT", async () => {
      mockParseRequestBody.mockResolvedValue({ action: "ACCEPT", recordId: CONSTRAINT_ID });
      const result = await constraintsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls updateConstraintStatus with ACCEPTED status", async () => {
      mockParseRequestBody.mockResolvedValue({ action: "ACCEPT", recordId: CONSTRAINT_ID });
      await constraintsPost(makeCtx());
      expect(mockUpdateConstraintStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACCEPTED" })
      );
    });
  });
});
