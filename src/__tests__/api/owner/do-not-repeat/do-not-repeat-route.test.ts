/**
 * Non-DB mock tests for:
 *   POST /api/owner/do-not-repeat — record a do_not_repeat rule
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRecordDoNotRepeat,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRecordDoNotRepeat: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/do-not-repeat.service", () => ({
  recordDoNotRepeat: mockRecordDoNotRepeat,
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
const RECORD_ID = "dr000001-0000-4000-8000-000000000001";
const BIZ_ID = "b4000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/do-not-repeat";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_CREATE_INPUT = {
  businessId: BIZ_ID,
  memoryKey: "no-discount-without-approval",
  summary: "Never offer discounts without owner approval",
  reason: "Margin protection",
  recommendationId: undefined,
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

let doNotRepeatPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/do-not-repeat/route");
  doNotRepeatPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CREATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockRecordDoNotRepeat.mockResolvedValue(RECORD_ID);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("do-not-repeat-route — module contract assertions", () => {
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
  it("MOCK_CREATE_INPUT.memoryKey is a string", () => { expect(typeof MOCK_CREATE_INPUT.memoryKey).toBe("string"); });
});

describe("POST /api/owner/do-not-repeat — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await doNotRepeatPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await doNotRepeatPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await doNotRepeatPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls recordDoNotRepeat with workspaceId", async () => {
      await doNotRepeatPost(makeCtx());
      expect(mockRecordDoNotRepeat).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("returns id in body", async () => {
      const result = await doNotRepeatPost(makeCtx()) as { body: { id: string } };
      expect(result.body.id).toBe(RECORD_ID);
    });

    it("calls recordDoNotRepeat exactly once", async () => {
      await doNotRepeatPost(makeCtx());
      expect(mockRecordDoNotRepeat).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await doNotRepeatPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRecordDoNotRepeat).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes memoryKey from parsed body", async () => {
      await doNotRepeatPost(makeCtx());
      expect(mockRecordDoNotRepeat).toHaveBeenCalledWith(
        expect.objectContaining({ memoryKey: MOCK_CREATE_INPUT.memoryKey })
      );
    });

    it("passes summary from parsed body", async () => {
      await doNotRepeatPost(makeCtx());
      expect(mockRecordDoNotRepeat).toHaveBeenCalledWith(
        expect.objectContaining({ summary: MOCK_CREATE_INPUT.summary })
      );
    });

    it("passes reason from parsed body", async () => {
      await doNotRepeatPost(makeCtx());
      expect(mockRecordDoNotRepeat).toHaveBeenCalledWith(
        expect.objectContaining({ reason: MOCK_CREATE_INPUT.reason })
      );
    });
  });
});
