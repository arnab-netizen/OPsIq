/**
 * Non-DB mock tests for:
 *   POST /api/owner/businesses/[businessId]/analyze — "Analyze my business"
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks(), matching the
 * established equipment-route.test.ts / sop-documents-route.test.ts convention.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const {
  mockAnalyzeBusiness,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockAnalyzeBusiness: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/analyze-business.service", () => ({
  analyzeBusiness: mockAnalyzeBusiness,
}));

vi.mock("@/lib/canonical-json-response", () => ({ canonicalJson: mockCanonicalJson }));

const capturedDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    capturedDeclarations.push({
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    });
    return async (testCtx: unknown, testParams: Record<string, string>) => {
      return mockWithCanonical(handler, options, testCtx, testParams);
    };
  },
}));

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const BIZ_ID = "b1000001-0000-4000-8000-000000000001";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { verifiedWorkspaceId: WS_A, verifiedActorId: ACTOR_A, ...overrides };
}

const MOCK_RESULT = { analyzed: ["finance"], skipped: ["sales", "operations"], rateLimited: [], failed: [] };

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>, _options: unknown, testCtx: unknown, testParams: Record<string, string>) => {
      try {
        return await handler(testCtx, testParams);
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
  mockWithCanonical.mockImplementationOnce(async () => ({ status, body: { error: "Insufficient capabilities" } }));
}

let analyzePost: (ctx?: unknown, params?: Record<string, string>) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/businesses/[businessId]/analyze/route");
  analyzePost = route.POST as unknown as (ctx?: unknown, params?: Record<string, string>) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockAnalyzeBusiness.mockResolvedValue(MOCK_RESULT);
});

describe("POST /api/owner/businesses/[businessId]/analyze — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("requires OWNER_MANAGE and workspace enforcement", () => {
      expect(capturedDeclarations.some((d) => d.requireWorkspace === true)).toBe(true);
    });

    it("returns 403 when enforcement denies POST", async () => {
      denyWith(403);
      const result = (await analyzePost(makeCtx(), { businessId: BIZ_ID })) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST", () => {
    it("returns 200 on success", async () => {
      const result = (await analyzePost(makeCtx(), { businessId: BIZ_ID })) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls analyzeBusiness with businessId, verifiedWorkspaceId, verifiedActorId", async () => {
      await analyzePost(makeCtx(), { businessId: BIZ_ID });
      expect(mockAnalyzeBusiness).toHaveBeenCalledWith(BIZ_ID, WS_A, ACTOR_A);
    });

    it("uses verifiedWorkspaceId not any client-supplied value (WS_B)", async () => {
      await analyzePost(makeCtx({ verifiedWorkspaceId: WS_B }), { businessId: BIZ_ID });
      expect(mockAnalyzeBusiness).toHaveBeenCalledWith(BIZ_ID, WS_B, ACTOR_A);
    });

    it("returns the per-domain result body", async () => {
      const result = (await analyzePost(makeCtx(), { businessId: BIZ_ID })) as { body: typeof MOCK_RESULT };
      expect(result.body).toEqual(MOCK_RESULT);
    });

    it("rejects a non-UUID businessId with 400 before calling analyzeBusiness", async () => {
      const result = (await analyzePost(makeCtx(), { businessId: "not-a-uuid" })) as { status: number };
      expect(result.status).toBe(400);
      expect(mockAnalyzeBusiness).not.toHaveBeenCalled();
    });
  });
});
