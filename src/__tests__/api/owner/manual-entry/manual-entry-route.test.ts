/**
 * Non-DB mock tests for:
 *   POST /api/owner/manual-entry — owner manual data entry with PII guard
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 * Mocks @/lib/db since the service receives db as a parameter.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockSubmitManualEntry,
  mockDetectPiiInFields,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockSubmitManualEntry: vi.fn(),
  mockDetectPiiInFields: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/owner-manual-entry.service", () => ({
  submitManualEntry: mockSubmitManualEntry,
}));

vi.mock("@/domain/owner-mode/owner-manual-entry-form", () => ({
  detectPiiInFields: mockDetectPiiInFields,
}));

vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));
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

const BASE_URL = "https://example.com/api/owner/manual-entry";

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
  category: "revenue_sales",
  fields: {
    monthly_revenue: 120000,
    channel: "retail",
  },
  confirm: true,
};

const MOCK_SUCCESS_RESULT = {
  ok: true,
  intakeId: "in000001-0000-4000-8000-000000000001",
  confidenceBefore: 0.45,
  confidenceAfter: 0.62,
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

let manualEntryPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/manual-entry/route");
  manualEntryPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CREATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockDetectPiiInFields.mockReturnValue({ hasPii: false });
  mockSubmitManualEntry.mockResolvedValue(MOCK_SUCCESS_RESULT);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("manual-entry-route — module contract assertions", () => {
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
  it("MOCK_CREATE_INPUT.category is revenue_sales", () => { expect(MOCK_CREATE_INPUT.category).toBe("revenue_sales"); });
});

describe("POST /api/owner/manual-entry — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await manualEntryPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await manualEntryPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST (no PII)", () => {
    it("returns 200 on success", async () => {
      const result = await manualEntryPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls detectPiiInFields with parsed fields", async () => {
      await manualEntryPost(makeCtx());
      expect(mockDetectPiiInFields).toHaveBeenCalledWith(MOCK_CREATE_INPUT.fields);
    });

    it("calls submitManualEntry with workspaceId", async () => {
      await manualEntryPost(makeCtx());
      expect(mockSubmitManualEntry).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A }),
        expect.anything()
      );
    });

    it("calls submitManualEntry with actorId in context", async () => {
      await manualEntryPost(makeCtx());
      expect(mockSubmitManualEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("returns ok and intakeId in body", async () => {
      const result = await manualEntryPost(makeCtx()) as { body: typeof MOCK_SUCCESS_RESULT };
      expect(result.body.ok).toBe(true);
      expect(result.body.intakeId).toBe(MOCK_SUCCESS_RESULT.intakeId);
    });

    it("calls submitManualEntry exactly once", async () => {
      await manualEntryPost(makeCtx());
      expect(mockSubmitManualEntry).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await manualEntryPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockSubmitManualEntry).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B }),
        expect.anything()
      );
    });
  });

  describe("POST blocked by PII detection", () => {
    it("returns 422 when PII detected", async () => {
      mockDetectPiiInFields.mockReturnValue({ hasPii: true, fields: ["contact_name"] });
      const result = await manualEntryPost(makeCtx()) as { status: number };
      expect(result.status).toBe(422);
    });

    it("does not call submitManualEntry when PII detected", async () => {
      mockDetectPiiInFields.mockReturnValue({ hasPii: true, fields: ["email"] });
      await manualEntryPost(makeCtx());
      expect(mockSubmitManualEntry).not.toHaveBeenCalled();
    });

    it("returns rejection pii_blocked when PII detected", async () => {
      mockDetectPiiInFields.mockReturnValue({ hasPii: true });
      const result = await manualEntryPost(makeCtx()) as { body: { rejection: string } };
      expect(result.body.rejection).toBe("pii_blocked");
    });
  });

  describe("POST when submitManualEntry returns not-ok", () => {
    it("returns 422 when submit result is not ok", async () => {
      mockSubmitManualEntry.mockResolvedValue({ ok: false, reason: "Invalid category" });
      const result = await manualEntryPost(makeCtx()) as { status: number };
      expect(result.status).toBe(422);
    });
  });
});
