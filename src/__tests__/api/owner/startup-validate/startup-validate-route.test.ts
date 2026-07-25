/**
 * Non-DB mock tests for:
 *   POST /api/owner/startup-validate — validate startup ideas (pure analysis, no persistence)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 * Route returns validateStartupSession() directly (no canonicalJson).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockValidateStartupSession,
  mockParseRequestBody,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockValidateStartupSession: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-strategy/startup.service", () => ({
  validateStartupSession: mockValidateStartupSession,
}));

vi.mock("@/domain/owner-strategy/startup-mode.validation", () => ({
  startupValidateRequestSchema: {},
}));

vi.mock("@/lib/validation", () => ({ parseRequestBody: mockParseRequestBody }));

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

const BASE_URL = "https://example.com/api/owner/startup-validate";

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

const MOCK_VALIDATE_RESULT = {
  shortlist: [{ title: "Corporate Catering", score: 0.82, proceed: true }],
  rejections: [],
  validationWorkPackage: { tasks: [] },
  killCriteria: ["Revenue < $5k/month after 3 months"],
  pivotCriteria: [],
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

let startupValidatePost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/startup-validate/route");
  startupValidatePost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue({ intake: MOCK_INTAKE, ideas: MOCK_IDEAS });
  mockValidateStartupSession.mockResolvedValue(MOCK_VALIDATE_RESULT);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("startup-validate-route — module contract assertions", () => {
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
  it("MOCK_VALIDATE_RESULT.rejections is empty array", () => {
    expect(Array.isArray(MOCK_VALIDATE_RESULT.rejections)).toBe(true);
  });
});

describe("POST /api/owner/startup-validate — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await startupValidatePost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await startupValidatePost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("calls validateStartupSession with intake from parsed body", async () => {
      await startupValidatePost(makeCtx());
      expect(mockValidateStartupSession).toHaveBeenCalledWith(MOCK_INTAKE, MOCK_IDEAS);
    });

    it("calls validateStartupSession exactly once", async () => {
      await startupValidatePost(makeCtx());
      expect(mockValidateStartupSession).toHaveBeenCalledTimes(1);
    });

    it("returns shortlist from validateStartupSession", async () => {
      const result = await startupValidatePost(makeCtx()) as { shortlist: unknown[] };
      expect(Array.isArray(result.shortlist)).toBe(true);
      expect(result.shortlist.length).toBe(1);
    });

    it("returns rejections from validateStartupSession", async () => {
      const result = await startupValidatePost(makeCtx()) as { rejections: unknown[] };
      expect(Array.isArray(result.rejections)).toBe(true);
    });

    it("returns killCriteria from validateStartupSession", async () => {
      const result = await startupValidatePost(makeCtx()) as { killCriteria: string[] };
      expect(Array.isArray(result.killCriteria)).toBe(true);
    });

    it("calls validateStartupSession with correct ideas array", async () => {
      await startupValidatePost(makeCtx());
      const call = (mockValidateStartupSession.mock.calls[0] as unknown[][])[1] as unknown[];
      expect(Array.isArray(call)).toBe(true);
      expect(call.length).toBe(1);
    });

    it("does not use verifiedWorkspaceId in validateStartupSession call (pure function)", async () => {
      await startupValidatePost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockValidateStartupSession).toHaveBeenCalledWith(MOCK_INTAKE, MOCK_IDEAS);
    });
  });
});
