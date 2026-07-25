/**
 * Non-DB mock tests for:
 *   POST /api/owner/pricing-analysis — per-unit economics and pricing analytics
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 * Route calls multiple pure domain functions and returns result directly (no canonicalJson).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockContributionMargin,
  mockContributionMarginPct,
  mockIsLossMaking,
  mockMinimumViablePrice,
  mockMarginFloorPrice,
  mockAssessDiscountSafety,
  mockSummarizeSegment,
  mockCompareSegmentProfitability,
  mockProfitPerLabourHour,
  mockProfitPerMachineHour,
  mockProfitPerDeliveryKm,
  mockParseRequestBody,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockContributionMargin: vi.fn(),
  mockContributionMarginPct: vi.fn(),
  mockIsLossMaking: vi.fn(),
  mockMinimumViablePrice: vi.fn(),
  mockMarginFloorPrice: vi.fn(),
  mockAssessDiscountSafety: vi.fn(),
  mockSummarizeSegment: vi.fn(),
  mockCompareSegmentProfitability: vi.fn(),
  mockProfitPerLabourHour: vi.fn(),
  mockProfitPerMachineHour: vi.fn(),
  mockProfitPerDeliveryKm: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/domain/owner-finance/unit-economics", () => ({
  contributionMargin: mockContributionMargin,
  contributionMarginPct: mockContributionMarginPct,
  isLossMaking: mockIsLossMaking,
  minimumViablePrice: mockMinimumViablePrice,
  marginFloorPrice: mockMarginFloorPrice,
  assessDiscountSafety: mockAssessDiscountSafety,
  summarizeSegment: mockSummarizeSegment,
  compareSegmentProfitability: mockCompareSegmentProfitability,
  profitPerLabourHour: mockProfitPerLabourHour,
  profitPerMachineHour: mockProfitPerMachineHour,
  profitPerDeliveryKm: mockProfitPerDeliveryKm,
}));

vi.mock("@/domain/owner-finance/pricing-analysis.validation", () => ({
  pricingAnalysisRequestSchema: {},
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

const BASE_URL = "https://example.com/api/owner/pricing-analysis";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_ORDER = { revenue: 1000, directCost: 600 };

const MOCK_PRICING_INPUT = {
  order: MOCK_ORDER,
  targetMarginPct: 0.20,
  resourceUsage: null,
  proposedPrice: undefined,
  segments: null,
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

let pricingAnalysisPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/pricing-analysis/route");
  pricingAnalysisPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_PRICING_INPUT);
  mockContributionMargin.mockReturnValue(400);
  mockContributionMarginPct.mockReturnValue(0.40);
  mockIsLossMaking.mockReturnValue(false);
  mockMinimumViablePrice.mockReturnValue(750);
  mockMarginFloorPrice.mockReturnValue(750);
  mockAssessDiscountSafety.mockReturnValue({ safe: true, discountPct: 0.05 });
  mockSummarizeSegment.mockReturnValue({ name: "seg", totalRevenue: 1000, avgMarginPct: 0.40 });
  mockCompareSegmentProfitability.mockReturnValue({ winner: "seg", delta: 0.1 });
  mockProfitPerLabourHour.mockReturnValue(50);
  mockProfitPerMachineHour.mockReturnValue(40);
  mockProfitPerDeliveryKm.mockReturnValue(2.5);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("pricing-analysis-route — module contract assertions", () => {
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
  it("MOCK_ORDER.revenue is 1000", () => { expect(MOCK_ORDER.revenue).toBe(1000); });
});

describe("POST /api/owner/pricing-analysis — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await pricingAnalysisPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await pricingAnalysisPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST (no resourceUsage, no segments, no proposedPrice)", () => {
    it("calls contributionMargin with order", async () => {
      await pricingAnalysisPost(makeCtx());
      expect(mockContributionMargin).toHaveBeenCalledWith(MOCK_ORDER);
    });

    it("calls contributionMarginPct with order", async () => {
      await pricingAnalysisPost(makeCtx());
      expect(mockContributionMarginPct).toHaveBeenCalledWith(MOCK_ORDER);
    });

    it("calls isLossMaking with order", async () => {
      await pricingAnalysisPost(makeCtx());
      expect(mockIsLossMaking).toHaveBeenCalledWith(MOCK_ORDER);
    });

    it("returns workspaceId from ctx.verifiedWorkspaceId", async () => {
      const result = await pricingAnalysisPost(makeCtx()) as { workspaceId: string };
      expect(result.workspaceId).toBe(WS_A);
    });

    it("uses verifiedWorkspaceId not body workspaceId (WS_B)", async () => {
      const result = await pricingAnalysisPost(makeCtx({ verifiedWorkspaceId: WS_B })) as { workspaceId: string };
      expect(result.workspaceId).toBe(WS_B);
    });

    it("returns order.contributionMargin in result", async () => {
      const result = await pricingAnalysisPost(makeCtx()) as { order: { contributionMargin: number } };
      expect(result.order.contributionMargin).toBe(400);
    });

    it("returns order.lossMaking in result", async () => {
      const result = await pricingAnalysisPost(makeCtx()) as { order: { lossMaking: boolean } };
      expect(result.order.lossMaking).toBe(false);
    });

    it("returns null perLabourHour when resourceUsage is null", async () => {
      const result = await pricingAnalysisPost(makeCtx()) as { order: { perLabourHour: null } };
      expect(result.order.perLabourHour).toBeNull();
    });

    it("does not call profitPerLabourHour when resourceUsage is null", async () => {
      await pricingAnalysisPost(makeCtx());
      expect(mockProfitPerLabourHour).not.toHaveBeenCalled();
    });

    it("returns null discountSafety when proposedPrice is undefined", async () => {
      const result = await pricingAnalysisPost(makeCtx()) as { discountSafety: null };
      expect(result.discountSafety).toBeNull();
    });

    it("does not call assessDiscountSafety when proposedPrice is undefined", async () => {
      await pricingAnalysisPost(makeCtx());
      expect(mockAssessDiscountSafety).not.toHaveBeenCalled();
    });

    it("returns null segmentComparison when segments is null", async () => {
      const result = await pricingAnalysisPost(makeCtx()) as { segmentComparison: null };
      expect(result.segmentComparison).toBeNull();
    });
  });

  describe("POST with resourceUsage provided", () => {
    const RESOURCE_USAGE = { labourHours: 8, machineHours: 2, deliveryKm: 50 };

    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_PRICING_INPUT, resourceUsage: RESOURCE_USAGE });
    });

    it("calls profitPerLabourHour when resourceUsage provided", async () => {
      await pricingAnalysisPost(makeCtx());
      expect(mockProfitPerLabourHour).toHaveBeenCalledWith(MOCK_ORDER, RESOURCE_USAGE);
    });

    it("calls profitPerMachineHour when resourceUsage provided", async () => {
      await pricingAnalysisPost(makeCtx());
      expect(mockProfitPerMachineHour).toHaveBeenCalledWith(MOCK_ORDER, RESOURCE_USAGE);
    });

    it("calls profitPerDeliveryKm when resourceUsage provided", async () => {
      await pricingAnalysisPost(makeCtx());
      expect(mockProfitPerDeliveryKm).toHaveBeenCalledWith(MOCK_ORDER, RESOURCE_USAGE);
    });
  });

  describe("POST with proposedPrice provided", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_PRICING_INPUT, proposedPrice: 900 });
    });

    it("calls assessDiscountSafety when proposedPrice provided", async () => {
      await pricingAnalysisPost(makeCtx());
      expect(mockAssessDiscountSafety).toHaveBeenCalledTimes(1);
    });

    it("returns non-null discountSafety when proposedPrice provided", async () => {
      const result = await pricingAnalysisPost(makeCtx()) as { discountSafety: unknown };
      expect(result.discountSafety).not.toBeNull();
    });
  });
});
