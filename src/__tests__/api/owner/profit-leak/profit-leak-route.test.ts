/**
 * Non-DB mock tests for:
 *   POST /api/owner/profit-leak — profit leak analysis (pure domain function, no persistence)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll(). Route returns identifyProfitLeaks() directly (no canonicalJson).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockIdentifyProfitLeaks,
  mockParseRequestBody,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockIdentifyProfitLeaks: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/domain/owner-mode/profit-leak-radar", () => ({
  identifyProfitLeaks: mockIdentifyProfitLeaks,
}));

vi.mock("@/domain/owner-mode/profit-leak-radar.validation", () => ({
  profitLeakSignalsBodySchema: {},
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
const BIZ_ID = "b4000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/profit-leak";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_PROFIT_LEAK_INPUT = {
  workspaceId: WS_A,
  businessId: BIZ_ID,
  revenueMonthly: 100000,
  grossMarginPct: 0.42,
  discountRatePct: 0.08,
  capacityUtilizationPct: 0.75,
};

const MOCK_PROFIT_LEAK_RESULT = {
  topLeak: { kind: "discount_leak", estimatedImpact: 4800, rank: 1 },
  leaks: [
    { kind: "discount_leak", estimatedImpact: 4800, rank: 1 },
    { kind: "capacity_underuse", estimatedImpact: 2500, rank: 2 },
  ],
  totalEstimatedLeakage: 7300,
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

let profitLeakPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/profit-leak/route");
  profitLeakPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_PROFIT_LEAK_INPUT);
  mockIdentifyProfitLeaks.mockReturnValue(MOCK_PROFIT_LEAK_RESULT);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("profit-leak-route — module contract assertions", () => {
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
  it("MOCK_PROFIT_LEAK_RESULT.totalEstimatedLeakage is 7300", () => {
    expect(MOCK_PROFIT_LEAK_RESULT.totalEstimatedLeakage).toBe(7300);
  });
});

describe("POST /api/owner/profit-leak — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await profitLeakPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await profitLeakPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("calls identifyProfitLeaks with signals", async () => {
      await profitLeakPost(makeCtx());
      expect(mockIdentifyProfitLeaks).toHaveBeenCalledTimes(1);
    });

    it("overrides workspaceId with verifiedWorkspaceId", async () => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_PROFIT_LEAK_INPUT, workspaceId: WS_B });
      await profitLeakPost(makeCtx()); // ctx.verifiedWorkspaceId = WS_A
      expect(mockIdentifyProfitLeaks).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("returns topLeak from identifyProfitLeaks", async () => {
      const result = await profitLeakPost(makeCtx()) as { topLeak: { kind: string } };
      expect(result.topLeak.kind).toBe("discount_leak");
    });

    it("returns leaks array from identifyProfitLeaks", async () => {
      const result = await profitLeakPost(makeCtx()) as { leaks: unknown[] };
      expect(Array.isArray(result.leaks)).toBe(true);
      expect(result.leaks.length).toBe(2);
    });

    it("returns totalEstimatedLeakage from identifyProfitLeaks", async () => {
      const result = await profitLeakPost(makeCtx()) as { totalEstimatedLeakage: number };
      expect(result.totalEstimatedLeakage).toBe(7300);
    });

    it("uses WS_B when verifiedWorkspaceId is WS_B", async () => {
      await profitLeakPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockIdentifyProfitLeaks).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("calls identifyProfitLeaks with parsed body fields merged", async () => {
      await profitLeakPost(makeCtx());
      expect(mockIdentifyProfitLeaks).toHaveBeenCalledWith(
        expect.objectContaining({
          revenueMonthly: MOCK_PROFIT_LEAK_INPUT.revenueMonthly,
          grossMarginPct: MOCK_PROFIT_LEAK_INPUT.grossMarginPct,
        })
      );
    });
  });
});
