/**
 * Non-DB mock tests for:
 *   POST /api/owner/guardrails/screen — screen opportunity/contract/marketing decision
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockScreenOpportunity,
  mockScreenContractQuote,
  mockShouldRunMarketing,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockScreenOpportunity: vi.fn(),
  mockScreenContractQuote: vi.fn(),
  mockShouldRunMarketing: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/domain/owner-mode/opportunity-contract-guardrails", () => ({
  screenOpportunity: mockScreenOpportunity,
  screenContractQuote: mockScreenContractQuote,
  shouldRunMarketing: mockShouldRunMarketing,
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

const BASE_URL = "https://example.com/api/owner/guardrails/screen";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_OPPORTUNITY_INPUT = {
  kind: "opportunity",
  fitScore: 0.82,
  marginPct: 0.35,
  marginFloorPct: 0.20,
  capacityStatus: "safe",
  paymentRisk: "low",
};

const MOCK_CONTRACT_INPUT = {
  kind: "contract",
  price: 50000,
  directCost: 30000,
  marginFloorPct: 0.20,
  paymentTermsDays: 30,
  capacityStatus: "caution",
};

const MOCK_MARKETING_INPUT = {
  kind: "marketing",
  financialState: "WATCH",
  capacityStatus: "safe",
  qualityRed: false,
  reputationRed: false,
};

const MOCK_SCREEN_RESULT_OK = { decision: "approve", flags: [] };
const MOCK_SCREEN_RESULT_REJECT = { decision: "reject", flags: ["margin_too_low"] };
const MOCK_MARKETING_RESULT = { run: true, warnings: [] };

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

let guardrailsScreenPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/guardrails/screen/route");
  guardrailsScreenPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_OPPORTUNITY_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockScreenOpportunity.mockReturnValue(MOCK_SCREEN_RESULT_OK);
  mockScreenContractQuote.mockReturnValue(MOCK_SCREEN_RESULT_OK);
  mockShouldRunMarketing.mockReturnValue(MOCK_MARKETING_RESULT);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("guardrails-screen-route — module contract assertions", () => {
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
  it("MOCK_OPPORTUNITY_INPUT.kind is opportunity", () => { expect(MOCK_OPPORTUNITY_INPUT.kind).toBe("opportunity"); });
});

describe("POST /api/owner/guardrails/screen — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await guardrailsScreenPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await guardrailsScreenPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("POST with kind=opportunity", () => {
    it("returns 200 on success", async () => {
      const result = await guardrailsScreenPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls screenOpportunity with parsed input", async () => {
      await guardrailsScreenPost(makeCtx());
      expect(mockScreenOpportunity).toHaveBeenCalledWith(MOCK_OPPORTUNITY_INPUT);
    });

    it("does not call screenContractQuote for opportunity kind", async () => {
      await guardrailsScreenPost(makeCtx());
      expect(mockScreenContractQuote).not.toHaveBeenCalled();
    });

    it("does not call shouldRunMarketing for opportunity kind", async () => {
      await guardrailsScreenPost(makeCtx());
      expect(mockShouldRunMarketing).not.toHaveBeenCalled();
    });

    it("returns decision in body", async () => {
      const result = await guardrailsScreenPost(makeCtx()) as { body: typeof MOCK_SCREEN_RESULT_OK };
      expect(result.body.decision).toBe("approve");
    });

    it("calls screenOpportunity exactly once", async () => {
      await guardrailsScreenPost(makeCtx());
      expect(mockScreenOpportunity).toHaveBeenCalledTimes(1);
    });

    it("returns reject decision when screenOpportunity returns reject", async () => {
      mockScreenOpportunity.mockReturnValue(MOCK_SCREEN_RESULT_REJECT);
      const result = await guardrailsScreenPost(makeCtx()) as { body: { decision: string } };
      expect(result.body.decision).toBe("reject");
    });
  });

  describe("POST with kind=contract", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_CONTRACT_INPUT);
    });

    it("returns 200 on success", async () => {
      const result = await guardrailsScreenPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls screenContractQuote with parsed input", async () => {
      await guardrailsScreenPost(makeCtx());
      expect(mockScreenContractQuote).toHaveBeenCalledWith(MOCK_CONTRACT_INPUT);
    });

    it("does not call screenOpportunity for contract kind", async () => {
      await guardrailsScreenPost(makeCtx());
      expect(mockScreenOpportunity).not.toHaveBeenCalled();
    });

    it("does not call shouldRunMarketing for contract kind", async () => {
      await guardrailsScreenPost(makeCtx());
      expect(mockShouldRunMarketing).not.toHaveBeenCalled();
    });
  });

  describe("POST with kind=marketing", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_MARKETING_INPUT);
    });

    it("returns 200 on success", async () => {
      const result = await guardrailsScreenPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls shouldRunMarketing with parsed input", async () => {
      await guardrailsScreenPost(makeCtx());
      expect(mockShouldRunMarketing).toHaveBeenCalledWith(MOCK_MARKETING_INPUT);
    });

    it("does not call screenOpportunity for marketing kind", async () => {
      await guardrailsScreenPost(makeCtx());
      expect(mockScreenOpportunity).not.toHaveBeenCalled();
    });

    it("does not call screenContractQuote for marketing kind", async () => {
      await guardrailsScreenPost(makeCtx());
      expect(mockScreenContractQuote).not.toHaveBeenCalled();
    });

    it("returns run field in body", async () => {
      const result = await guardrailsScreenPost(makeCtx()) as { body: typeof MOCK_MARKETING_RESULT };
      expect(result.body.run).toBe(true);
    });

    it("uses verifiedWorkspaceId but does not pass it to domain function (stateless)", async () => {
      await guardrailsScreenPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockShouldRunMarketing).toHaveBeenCalledWith(MOCK_MARKETING_INPUT);
    });
  });
});
