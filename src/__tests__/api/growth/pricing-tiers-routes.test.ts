/**
 * Non-DB mock tests for:
 *   GET  /api/growth/pricing-tiers — list pricing tiers
 *   POST /api/growth/pricing-tiers — create a pricing tier
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { mockListTiers, mockCreatePriceTier, mockWithCanonical } = vi.hoisted(() => ({
  mockListTiers: vi.fn(),
  mockCreatePriceTier: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/growth/pricing-engine", () => ({
  PricingEngine: {
    listTiers: mockListTiers,
    createPriceTier: mockCreatePriceTier,
  },
}));

// ─── Capture capability declarations ─────────────────────────────────────────

const capturedGetDecl: Record<string, unknown>[] = [];
const capturedPostDecl: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    const decl = {
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    };
    const src = handler.toString();
    if (src.includes("createPriceTier")) {
      capturedPostDecl.push(decl);
    } else {
      capturedGetDecl.push(decl);
    }
    return async (testCtx: unknown) => mockWithCanonical(handler, options, testCtx);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: unknown; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ACTOR_B = "ac000002-0000-4000-8000-000000000002";

const BASE_URL = "https://example.com/api/growth/pricing-tiers";

const TIER_1 = {
  id: "pt000001-0000-4000-8000-000000000001",
  workspaceId: WS_A,
  name: "Starter",
  entryPrice: 29,
  maxPrice: 49,
  currency: "USD",
  status: "ACTIVE",
  approvalStatus: "approved",
};

const TIER_2 = {
  id: "pt000002-0000-4000-8000-000000000002",
  workspaceId: WS_A,
  name: "Pro",
  entryPrice: 99,
  maxPrice: 199,
  currency: "USD",
  status: "DRAFT",
  approvalStatus: "pending_approval",
};

const CREATE_BODY = {
  name: "Enterprise",
  entryPrice: 499,
  maxPrice: 999,
  currency: "USD",
  features: ["SSO", "Priority Support"],
  status: "DRAFT",
};

function makeCtx(
  body?: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: {
      url: BASE_URL,
      json: async () => body ?? {},
    },
    ...overrides,
  };
}

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _opts: unknown, testCtx: unknown) =>
      handler(testCtx)
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ──────────────────────────────────────────────

let pricingGet: (ctx?: unknown) => Promise<CanonicalResult>;
let pricingPost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/growth/pricing-tiers/route");
  pricingGet = route.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  pricingPost = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Growth Pricing Tiers Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET is guarded by engagement:view with workspace", () => {
      expect(capturedGetDecl[0]?.requireCapabilities).toContain("engagement:view");
      expect(capturedGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("POST is guarded by engagement:update with workspace", () => {
      expect(capturedPostDecl[0]?.requireCapabilities).toContain("engagement:update");
      expect(capturedPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await pricingGet(makeCtx());
      expect(result.status).toBe(403);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await pricingPost(makeCtx(CREATE_BODY));
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/growth/pricing-tiers ────────────────────────────────────────

  describe("GET /api/growth/pricing-tiers", () => {
    it("returns 200 with tiers list in body", async () => {
      mockListTiers.mockResolvedValueOnce([TIER_1, TIER_2]);
      const result = await pricingGet(makeCtx());
      expect(result.status).toBe(200);
      expect(result.body).toEqual([TIER_1, TIER_2]);
    });

    it("passes workspaceId WS_A to listTiers", async () => {
      mockListTiers.mockResolvedValueOnce([TIER_1]);
      await pricingGet(makeCtx(undefined, { verifiedWorkspaceId: WS_A }));
      expect(mockListTiers).toHaveBeenCalledWith(WS_A);
    });

    it("passes workspaceId WS_B to listTiers", async () => {
      mockListTiers.mockResolvedValueOnce([]);
      await pricingGet(makeCtx(undefined, { verifiedWorkspaceId: WS_B }));
      expect(mockListTiers).toHaveBeenCalledWith(WS_B);
    });

    it("returns empty array when no tiers exist", async () => {
      mockListTiers.mockResolvedValueOnce([]);
      const result = await pricingGet(makeCtx());
      expect(result.body).toEqual([]);
    });

    it("calls listTiers exactly once per request", async () => {
      mockListTiers.mockResolvedValueOnce([]);
      await pricingGet(makeCtx());
      expect(mockListTiers).toHaveBeenCalledTimes(1);
    });

    it("does not call createPriceTier for GET", async () => {
      mockListTiers.mockResolvedValueOnce([]);
      await pricingGet(makeCtx());
      expect(mockCreatePriceTier).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive GETs use respective workspaceIds", async () => {
      mockListTiers.mockResolvedValue([TIER_1]);
      await pricingGet(makeCtx(undefined, { verifiedWorkspaceId: WS_A }));
      await pricingGet(makeCtx(undefined, { verifiedWorkspaceId: WS_B }));
      expect(mockListTiers).toHaveBeenNthCalledWith(1, WS_A);
      expect(mockListTiers).toHaveBeenNthCalledWith(2, WS_B);
    });
  });

  // ─── 3. POST /api/growth/pricing-tiers ───────────────────────────────────────

  describe("POST /api/growth/pricing-tiers", () => {
    it("returns 201 on success", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      const result = await pricingPost(makeCtx(CREATE_BODY));
      expect(result.status).toBe(201);
    });

    it("returns created tier in body", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      const result = await pricingPost(makeCtx(CREATE_BODY));
      expect(result.body).toEqual(TIER_1);
    });

    it("passes workspaceId WS_A to createPriceTier", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      await pricingPost(makeCtx(CREATE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockCreatePriceTier).toHaveBeenCalledWith(WS_A, expect.anything(), expect.anything());
    });

    it("passes workspaceId WS_B to createPriceTier", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      await pricingPost(makeCtx(CREATE_BODY, { verifiedWorkspaceId: WS_B }));
      expect(mockCreatePriceTier).toHaveBeenCalledWith(WS_B, expect.anything(), expect.anything());
    });

    it("passes actorId ACTOR_A to createPriceTier", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      await pricingPost(makeCtx(CREATE_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockCreatePriceTier).toHaveBeenCalledWith(expect.anything(), ACTOR_A, expect.anything());
    });

    it("passes actorId ACTOR_B to createPriceTier", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      await pricingPost(makeCtx(CREATE_BODY, { verifiedActorId: ACTOR_B }));
      expect(mockCreatePriceTier).toHaveBeenCalledWith(expect.anything(), ACTOR_B, expect.anything());
    });

    it("passes name from body to createPriceTier", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      await pricingPost(makeCtx(CREATE_BODY));
      expect(mockCreatePriceTier).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ name: "Enterprise" })
      );
    });

    it("passes entryPrice from body to createPriceTier", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      await pricingPost(makeCtx(CREATE_BODY));
      expect(mockCreatePriceTier).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ entryPrice: 499 })
      );
    });

    it("passes maxPrice from body to createPriceTier", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      await pricingPost(makeCtx(CREATE_BODY));
      expect(mockCreatePriceTier).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ maxPrice: 999 })
      );
    });

    it("calls createPriceTier exactly once per request", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      await pricingPost(makeCtx(CREATE_BODY));
      expect(mockCreatePriceTier).toHaveBeenCalledTimes(1);
    });

    it("does not call listTiers for POST", async () => {
      mockCreatePriceTier.mockResolvedValueOnce(TIER_1);
      await pricingPost(makeCtx(CREATE_BODY));
      expect(mockListTiers).not.toHaveBeenCalled();
    });

    it("workspace isolation: consecutive POSTs use respective workspaceIds", async () => {
      mockCreatePriceTier.mockResolvedValue(TIER_1);
      await pricingPost(makeCtx(CREATE_BODY, { verifiedWorkspaceId: WS_A }));
      await pricingPost(makeCtx(CREATE_BODY, { verifiedWorkspaceId: WS_B }));
      expect(mockCreatePriceTier).toHaveBeenNthCalledWith(1, WS_A, expect.anything(), expect.anything());
      expect(mockCreatePriceTier).toHaveBeenNthCalledWith(2, WS_B, expect.anything(), expect.anything());
    });
  });
});
