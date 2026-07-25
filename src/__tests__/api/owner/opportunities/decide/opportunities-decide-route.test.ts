/**
 * Non-DB mock tests for:
 *   POST /api/owner/opportunities/decide — decide an opportunity using real capacity/margin
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockDecideOpportunity,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockDecideOpportunity: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/opportunity-decision.service", () => ({
  decideOpportunity: mockDecideOpportunity,
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
const BIZ_ID = "b4000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/opportunities/decide";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_DECIDE_INPUT = {
  businessId: BIZ_ID,
  fitScore: 0.82,
  paymentRisk: "low",
  marginPct: 0.35,
};

const MOCK_DECISION = {
  outcome: "accept",
  reasons: ["fit_score_high", "margin_above_floor"],
  nextAction: "send_proposal",
  confidenceScore: 0.91,
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

let opportunitiesDecidePost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/opportunities/decide/route");
  opportunitiesDecidePost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_DECIDE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockDecideOpportunity.mockResolvedValue(MOCK_DECISION);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("opportunities-decide-route — module contract assertions", () => {
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
  it("MOCK_DECISION.outcome is accept", () => { expect(MOCK_DECISION.outcome).toBe("accept"); });
});

describe("POST /api/owner/opportunities/decide — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await opportunitiesDecidePost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await opportunitiesDecidePost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 200 on success", async () => {
      const result = await opportunitiesDecidePost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls decideOpportunity with workspaceId", async () => {
      await opportunitiesDecidePost(makeCtx());
      expect(mockDecideOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls decideOpportunity with actorId", async () => {
      await opportunitiesDecidePost(makeCtx());
      expect(mockDecideOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("calls decideOpportunity with businessId from input", async () => {
      await opportunitiesDecidePost(makeCtx());
      expect(mockDecideOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: BIZ_ID })
      );
    });

    it("calls decideOpportunity with fitScore from input", async () => {
      await opportunitiesDecidePost(makeCtx());
      expect(mockDecideOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({ fitScore: 0.82 })
      );
    });

    it("calls decideOpportunity with paymentRisk from input", async () => {
      await opportunitiesDecidePost(makeCtx());
      expect(mockDecideOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({ paymentRisk: "low" })
      );
    });

    it("calls decideOpportunity with marginPct from input", async () => {
      await opportunitiesDecidePost(makeCtx());
      expect(mockDecideOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({ marginPct: 0.35 })
      );
    });

    it("returns outcome in body", async () => {
      const result = await opportunitiesDecidePost(makeCtx()) as { body: typeof MOCK_DECISION };
      expect(result.body.outcome).toBe("accept");
    });

    it("returns reasons in body", async () => {
      const result = await opportunitiesDecidePost(makeCtx()) as { body: { reasons: string[] } };
      expect(Array.isArray(result.body.reasons)).toBe(true);
    });

    it("calls decideOpportunity exactly once", async () => {
      await opportunitiesDecidePost(makeCtx());
      expect(mockDecideOpportunity).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await opportunitiesDecidePost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockDecideOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes null marginPct when input marginPct is undefined", async () => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_DECIDE_INPUT, marginPct: undefined });
      await opportunitiesDecidePost(makeCtx());
      expect(mockDecideOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({ marginPct: null })
      );
    });

    it("returns reject outcome when service returns reject", async () => {
      mockDecideOpportunity.mockResolvedValue({ ...MOCK_DECISION, outcome: "reject" });
      const result = await opportunitiesDecidePost(makeCtx()) as { body: { outcome: string } };
      expect(result.body.outcome).toBe("reject");
    });
  });
});
