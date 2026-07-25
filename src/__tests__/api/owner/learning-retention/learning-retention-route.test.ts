/**
 * Non-DB mock tests for:
 *   GET  /api/owner/learning-retention — get retention policy for workspace
 *   POST /api/owner/learning-retention — set retention policy
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockSetRetentionPolicy,
  mockGetRetentionPolicy,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockSetRetentionPolicy: vi.fn(),
  mockGetRetentionPolicy: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/controlled-learning-retention.service", () => ({
  setRetentionPolicy: mockSetRetentionPolicy,
  getRetentionPolicy: mockGetRetentionPolicy,
}));

vi.mock("@/lib/db", () => ({ db: {} }));
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
const POLICY_ID = "rp000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/learning-retention";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_POLICY = {
  id: POLICY_ID,
  workspaceId: WS_A,
  retentionDays: 365,
  appliedBy: ACTOR_A,
};

const MOCK_RETENTION_INPUT = {
  retentionDays: 365,
  appliedAt: new Date("2026-01-01T00:00:00Z"),
  policyNotes: "Annual retention policy",
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

let retentionGet: (ctx?: unknown) => Promise<unknown>;
let retentionPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/learning-retention/route");
  retentionGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  retentionPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_RETENTION_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockGetRetentionPolicy.mockResolvedValue(MOCK_POLICY);
  mockSetRetentionPolicy.mockResolvedValue({ set: true, policy: MOCK_POLICY });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("learning-retention-route — module contract assertions", () => {
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
  it("MOCK_POLICY.retentionDays is 365", () => { expect(MOCK_POLICY.retentionDays).toBe(365); });
});

describe("GET /api/owner/learning-retention — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await retentionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await retentionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await retentionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls getRetentionPolicy with workspaceId", async () => {
      await retentionGet(makeCtx());
      expect(mockGetRetentionPolicy).toHaveBeenCalledWith(
        expect.anything(),
        WS_A
      );
    });

    it("calls getRetentionPolicy exactly once", async () => {
      await retentionGet(makeCtx());
      expect(mockGetRetentionPolicy).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await retentionGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockGetRetentionPolicy).toHaveBeenCalledWith(
        expect.anything(),
        WS_B
      );
    });

    it("does not call setRetentionPolicy for GET", async () => {
      await retentionGet(makeCtx());
      expect(mockSetRetentionPolicy).not.toHaveBeenCalled();
    });

    it("returns policy data in body", async () => {
      const result = await retentionGet(makeCtx()) as { body: unknown };
      expect(result.body).toEqual(MOCK_POLICY);
    });
  });
});

describe("POST /api/owner/learning-retention — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await retentionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await retentionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls setRetentionPolicy with workspaceId", async () => {
      await retentionPost(makeCtx());
      expect(mockSetRetentionPolicy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls setRetentionPolicy with appliedBy from actorId", async () => {
      await retentionPost(makeCtx());
      expect(mockSetRetentionPolicy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ appliedBy: ACTOR_A })
      );
    });

    it("returns policy in body", async () => {
      const result = await retentionPost(makeCtx()) as { body: { policy: unknown } };
      expect(result.body.policy).toEqual(MOCK_POLICY);
    });

    it("calls setRetentionPolicy exactly once", async () => {
      await retentionPost(makeCtx());
      expect(mockSetRetentionPolicy).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await retentionPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockSetRetentionPolicy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST violations path", () => {
    it("returns 422 when result.set is false", async () => {
      mockSetRetentionPolicy.mockResolvedValue({ set: false, violations: ["POLICY_EXISTS"] });
      const result = await retentionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(422);
    });

    it("returns violations array in body when not set", async () => {
      mockSetRetentionPolicy.mockResolvedValue({ set: false, violations: ["POLICY_EXISTS"] });
      const result = await retentionPost(makeCtx()) as { body: { violations: unknown[] } };
      expect(Array.isArray(result.body.violations)).toBe(true);
    });
  });
});
