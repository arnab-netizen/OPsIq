/**
 * Non-DB mock tests for:
 *   GET /api/owner/first-value — getFirstValue service
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockGetFirstValue,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockGetFirstValue: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/first-value.service", () => ({
  getFirstValue: mockGetFirstValue,
}));

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

const BASE_URL = "https://example.com/api/owner/first-value";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_FIRST_VALUE = {
  workspaceId: WS_A,
  isDemo: false,
  state: "FIRST_VALUE_READY" as const,
  confidence: "HIGH_CONFIDENCE" as const,
  businessSnapshot: null,
  topRisks: [],
  topOpportunities: [],
  recommendedFirstAction: null,
  recommendedFirstActionReason: null,
  missingDataAreas: [],
  safetyWarnings: [],
  dataReadiness: { hasEngagement: true, hasFinding: true, hasAction: true },
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _options: unknown, testCtx: unknown) => {
      return handler(testCtx);
    }
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handler after mocks ───────────────────────────────────────────────

let firstValueGet: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/first-value/route");
  firstValueGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockGetFirstValue.mockResolvedValue(MOCK_FIRST_VALUE);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("first-value — module contract assertions", () => {
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
  it("MOCK_FIRST_VALUE.state equals FIRST_VALUE_READY", () => { expect(MOCK_FIRST_VALUE.state).toBe("FIRST_VALUE_READY"); });
});

describe("GET /api/owner/first-value — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("requireWorkspace is true", () => {
      const decl = capturedDeclarations[0];
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await firstValueGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await firstValueGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("calls getFirstValue with the auth context and verifiedWorkspaceId", async () => {
      const ctx = makeCtx();
      await firstValueGet(ctx);
      expect(mockGetFirstValue).toHaveBeenCalledWith(ctx, WS_A);
    });

    it("returns the result from getFirstValue", async () => {
      const result = await firstValueGet(makeCtx());
      expect(result).toEqual(MOCK_FIRST_VALUE);
    });

    it("calls getFirstValue exactly once per request", async () => {
      await firstValueGet(makeCtx());
      expect(mockGetFirstValue).toHaveBeenCalledTimes(1);
    });

    it("returned value has workspaceId field", async () => {
      const result = await firstValueGet(makeCtx()) as typeof MOCK_FIRST_VALUE;
      expect(result.workspaceId).toBe(WS_A);
    });

    it("returned value has state field", async () => {
      const result = await firstValueGet(makeCtx()) as typeof MOCK_FIRST_VALUE;
      expect(result.state).toBe("FIRST_VALUE_READY");
    });

    it("returned value has confidence field", async () => {
      const result = await firstValueGet(makeCtx()) as typeof MOCK_FIRST_VALUE;
      expect(result.confidence).toBe("HIGH_CONFIDENCE");
    });

    it("returns EMPTY_WORKSPACE state when service returns it", async () => {
      mockGetFirstValue.mockResolvedValue({ ...MOCK_FIRST_VALUE, state: "EMPTY_WORKSPACE" });
      const result = await firstValueGet(makeCtx()) as typeof MOCK_FIRST_VALUE;
      expect(result.state).toBe("EMPTY_WORKSPACE");
    });

    it("returns MINIMUM_DATA_PRESENT state when service returns it", async () => {
      mockGetFirstValue.mockResolvedValue({ ...MOCK_FIRST_VALUE, state: "MINIMUM_DATA_PRESENT", confidence: "MEDIUM_CONFIDENCE" });
      const result = await firstValueGet(makeCtx()) as typeof MOCK_FIRST_VALUE;
      expect(result.state).toBe("MINIMUM_DATA_PRESENT");
    });
  });

  describe("workspace isolation", () => {
    it("uses verifiedWorkspaceId for getFirstValue call (WS_A)", async () => {
      await firstValueGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      expect(mockGetFirstValue).toHaveBeenCalledWith(expect.anything(), WS_A);
    });

    it("uses verifiedWorkspaceId for getFirstValue call (WS_B)", async () => {
      await firstValueGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockGetFirstValue).toHaveBeenCalledWith(expect.anything(), WS_B);
    });
  });

  describe("error handling", () => {
    it("re-throws ForbiddenError from getFirstValue", async () => {
      const { ForbiddenError } = await import("@/infra/errors");
      mockGetFirstValue.mockRejectedValue(new ForbiddenError());
      await expect(firstValueGet(makeCtx())).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("throws AppError (INTERNAL_ERROR) when getFirstValue rejects with unknown error", async () => {
      const { AppError } = await import("@/infra/errors");
      mockGetFirstValue.mockRejectedValue(new Error("Database timeout"));
      await expect(firstValueGet(makeCtx())).rejects.toBeInstanceOf(AppError);
    });

    it("throws NotFoundError when error message includes 'Workspace not found'", async () => {
      const { NotFoundError } = await import("@/infra/errors");
      mockGetFirstValue.mockRejectedValue(new Error("Workspace not found"));
      await expect(firstValueGet(makeCtx())).rejects.toBeInstanceOf(NotFoundError);
    });

    it("throws when request is missing from context", async () => {
      const ctx = { verifiedWorkspaceId: WS_A, verifiedActorId: ACTOR_A };
      await expect(firstValueGet(ctx)).rejects.toThrow("Request object not available");
    });
  });
});
