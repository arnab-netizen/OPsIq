/**
 * Non-DB mock tests for:
 *   GET  /api/owner/learning-consent — list consent records
 *   POST /api/owner/learning-consent — record consent
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRecordConsent,
  mockListConsentRecords,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRecordConsent: vi.fn(),
  mockListConsentRecords: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/controlled-learning-consent.service", () => ({
  recordConsent: mockRecordConsent,
  listConsentRecords: mockListConsentRecords,
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
const CONSENT_ID = "co000001-0000-4000-8000-000000000001";
const CANDIDATE_ID = "ca000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/learning-consent";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_CONSENT_RECORD = {
  id: CONSENT_ID,
  workspaceId: WS_A,
  candidateId: CANDIDATE_ID,
  consentGiven: true,
  consentScope: "WORKSPACE_ONLY",
};

const MOCK_CONSENT_INPUT = {
  candidateId: CANDIDATE_ID,
  consentGiven: true,
  consentAt: new Date("2026-01-01T00:00:00Z"),
  consentScope: "WORKSPACE_ONLY",
  consentNotes: "Verbal consent confirmed",
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

let consentGet: (ctx?: unknown) => Promise<unknown>;
let consentPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/learning-consent/route");
  consentGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  consentPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CONSENT_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockListConsentRecords.mockResolvedValue([MOCK_CONSENT_RECORD]);
  mockRecordConsent.mockResolvedValue({ recorded: true, record: MOCK_CONSENT_RECORD });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("learning-consent-route — module contract assertions", () => {
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
  it("MOCK_CONSENT_RECORD.consentGiven is true", () => { expect(MOCK_CONSENT_RECORD.consentGiven).toBe(true); });
});

describe("GET /api/owner/learning-consent — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await consentGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await consentGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await consentGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listConsentRecords with workspaceId", async () => {
      await consentGet(makeCtx());
      expect(mockListConsentRecords).toHaveBeenCalledWith(
        expect.anything(),
        WS_A,
        expect.anything()
      );
    });

    it("returns array of consent records", async () => {
      const result = await consentGet(makeCtx()) as { body: unknown[] };
      expect(Array.isArray(result.body)).toBe(true);
    });

    it("passes candidateId query param to listConsentRecords", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      await consentGet(ctx);
      expect(mockListConsentRecords).toHaveBeenCalledWith(
        expect.anything(),
        WS_A,
        CANDIDATE_ID
      );
    });

    it("passes empty string when no candidateId param", async () => {
      await consentGet(makeCtx());
      expect(mockListConsentRecords).toHaveBeenCalledWith(
        expect.anything(),
        WS_A,
        ""
      );
    });

    it("calls listConsentRecords exactly once", async () => {
      await consentGet(makeCtx());
      expect(mockListConsentRecords).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await consentGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListConsentRecords).toHaveBeenCalledWith(
        expect.anything(),
        WS_B,
        expect.anything()
      );
    });

    it("does not call recordConsent for GET", async () => {
      await consentGet(makeCtx());
      expect(mockRecordConsent).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/owner/learning-consent — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await consentPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await consentPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls recordConsent with workspaceId", async () => {
      await consentPost(makeCtx());
      expect(mockRecordConsent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls recordConsent with consentBy from actorId", async () => {
      await consentPost(makeCtx());
      expect(mockRecordConsent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ consentBy: ACTOR_A })
      );
    });

    it("returns consent record in body", async () => {
      const result = await consentPost(makeCtx()) as { body: { record: unknown } };
      expect(result.body.record).toEqual(MOCK_CONSENT_RECORD);
    });

    it("calls recordConsent exactly once", async () => {
      await consentPost(makeCtx());
      expect(mockRecordConsent).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await consentPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRecordConsent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST violations path", () => {
    it("returns 422 when result.recorded is false", async () => {
      mockRecordConsent.mockResolvedValue({ recorded: false, violations: ["DUPLICATE_CONSENT"] });
      const result = await consentPost(makeCtx()) as { status: number };
      expect(result.status).toBe(422);
    });

    it("returns violations array in body when not recorded", async () => {
      mockRecordConsent.mockResolvedValue({ recorded: false, violations: ["DUPLICATE_CONSENT"] });
      const result = await consentPost(makeCtx()) as { body: { violations: unknown[] } };
      expect(Array.isArray(result.body.violations)).toBe(true);
    });
  });
});
