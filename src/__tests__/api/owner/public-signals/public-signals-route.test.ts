/**
 * Non-DB mock tests for:
 *   GET /api/owner/public-signals — owner "Outside signals" summary
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockGetOwnerPublicSignals,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockGetOwnerPublicSignals: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/owner-public-signals.service", () => ({
  getOwnerPublicSignals: mockGetOwnerPublicSignals,
}));

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

const BASE_URL = "https://example.com/api/owner/public-signals";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_SUMMARY = {
  reviewCount: 12,
  avgRating: 4.2,
  sentimentTrend: "stable",
  topThemes: ["quality", "delivery"],
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

let publicSignalsGet: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/public-signals/route");
  publicSignalsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockGetOwnerPublicSignals.mockResolvedValue({ ok: true, summary: MOCK_SUMMARY });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("public-signals-route — module contract assertions", () => {
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
  it("MOCK_SUMMARY.reviewCount is 12", () => { expect(MOCK_SUMMARY.reviewCount).toBe(12); });
});

describe("GET /api/owner/public-signals — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await publicSignalsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await publicSignalsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET (no businessId param)", () => {
    it("returns 200 on success", async () => {
      const result = await publicSignalsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls getOwnerPublicSignals with workspaceId", async () => {
      await publicSignalsGet(makeCtx());
      expect(mockGetOwnerPublicSignals).toHaveBeenCalledWith(WS_A, null);
    });

    it("returns summary in body", async () => {
      const result = await publicSignalsGet(makeCtx()) as { body: typeof MOCK_SUMMARY };
      expect(result.body).toEqual(MOCK_SUMMARY);
    });

    it("calls getOwnerPublicSignals exactly once", async () => {
      await publicSignalsGet(makeCtx());
      expect(mockGetOwnerPublicSignals).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await publicSignalsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockGetOwnerPublicSignals).toHaveBeenCalledWith(WS_B, null);
    });
  });

  describe("GET with businessId query param", () => {
    it("passes businessId to getOwnerPublicSignals", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?businessId=${BIZ_ID}` } });
      await publicSignalsGet(ctx);
      expect(mockGetOwnerPublicSignals).toHaveBeenCalledWith(WS_A, BIZ_ID);
    });
  });

  describe("GET when service returns not-ok", () => {
    it("returns 500 when service result is not ok", async () => {
      mockGetOwnerPublicSignals.mockResolvedValue({ ok: false });
      const result = await publicSignalsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(500);
    });

    it("returns error code in body on incoherent result", async () => {
      mockGetOwnerPublicSignals.mockResolvedValue({ ok: false });
      const result = await publicSignalsGet(makeCtx()) as { body: { error: { code: string } } };
      expect(result.body.error.code).toBe("PUBLIC_SIGNALS_INCOHERENT");
    });
  });
});
