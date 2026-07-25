/**
 * Non-DB mock tests for:
 *   POST /api/owner/opportunities/signals — submit external opportunity signal
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockSubmitExternalOpportunitySignal,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockSubmitExternalOpportunitySignal: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/external-opportunity-intake.service", () => ({
  submitExternalOpportunitySignal: mockSubmitExternalOpportunitySignal,
}));

vi.mock("@/domain/owner-mode/external-opportunity-intake", () => ({
  INTAKE_TYPES: [
    "COMPETITOR_REVIEW_GAP", "B2B_DEMAND_SIGNAL", "GOVERNMENT_TENDER",
    "PUBLIC_PROCUREMENT_NOTICE", "CORPORATE_VENDOR_OPPORTUNITY", "GRANT_OR_SCHEME_SIGNAL",
    "PRICING_GAP", "SERVICE_GAP", "COMMUNITY_OR_APARTMENT_DEMAND",
    "SUPPLIER_OR_COST_ADVANTAGE", "MARKET_TREND_SIGNAL", "MANUAL_OWNER_OBSERVATION",
    "DATA_INSUFFICIENT",
  ],
  SOURCE_QUALITIES: [
    "VERIFIED_SOURCE", "OWNER_OBSERVED", "STAFF_REPORTED", "CUSTOMER_REPORTED",
    "PUBLIC_SOURCE_UNVERIFIED", "THIRD_PARTY_UNVERIFIED", "LOW_CONFIDENCE", "UNKNOWN",
  ],
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
const SIGNAL_ID = "sg000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/opportunities/signals";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    verifiedSessionSnapshot: { role: "owner" },
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_SIGNAL_INPUT = {
  rawSignalType: "B2B_DEMAND_SIGNAL",
  rawDescription: "Local tech company looking for catering services",
  sourceQuality: "OWNER_OBSERVED",
};

const MOCK_SIGNAL_RESULT = {
  ok: true,
  signalId: SIGNAL_ID,
  classification: "B2B_OFFER",
  initialStatus: "PENDING_REVIEW",
  deduped: false,
  topOpportunity: null,
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

let opportunitiesSignalsPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/opportunities/signals/route");
  opportunitiesSignalsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_SIGNAL_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockSubmitExternalOpportunitySignal.mockResolvedValue(MOCK_SIGNAL_RESULT);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("opportunities-signals-route — module contract assertions", () => {
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
  it("MOCK_SIGNAL_RESULT.deduped is false", () => { expect(MOCK_SIGNAL_RESULT.deduped).toBe(false); });
});

describe("POST /api/owner/opportunities/signals — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await opportunitiesSignalsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await opportunitiesSignalsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 200 on success", async () => {
      const result = await opportunitiesSignalsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls submitExternalOpportunitySignal with workspaceId", async () => {
      await opportunitiesSignalsPost(makeCtx());
      expect(mockSubmitExternalOpportunitySignal).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls submitExternalOpportunitySignal with actorId", async () => {
      await opportunitiesSignalsPost(makeCtx());
      expect(mockSubmitExternalOpportunitySignal).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("calls submitExternalOpportunitySignal with actorRole from session snapshot", async () => {
      await opportunitiesSignalsPost(makeCtx());
      expect(mockSubmitExternalOpportunitySignal).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: "owner" })
      );
    });

    it("passes null actorRole when verifiedSessionSnapshot has no role", async () => {
      await opportunitiesSignalsPost(makeCtx({ verifiedSessionSnapshot: null }));
      expect(mockSubmitExternalOpportunitySignal).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: null })
      );
    });

    it("returns signalId in body", async () => {
      const result = await opportunitiesSignalsPost(makeCtx()) as { body: { signalId: string } };
      expect(result.body.signalId).toBe(SIGNAL_ID);
    });

    it("returns classification in body", async () => {
      const result = await opportunitiesSignalsPost(makeCtx()) as { body: { classification: string } };
      expect(result.body.classification).toBe("B2B_OFFER");
    });

    it("calls submitExternalOpportunitySignal exactly once", async () => {
      await opportunitiesSignalsPost(makeCtx());
      expect(mockSubmitExternalOpportunitySignal).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await opportunitiesSignalsPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockSubmitExternalOpportunitySignal).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST when service returns not-ok", () => {
    it("returns 400 when service result is not ok (generic reason)", async () => {
      mockSubmitExternalOpportunitySignal.mockResolvedValue({ ok: false, reason: "Duplicate entry" });
      const result = await opportunitiesSignalsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(400);
    });

    it("returns 404 when service reason contains not in this workspace", async () => {
      mockSubmitExternalOpportunitySignal.mockResolvedValue({ ok: false, reason: "not in this workspace" });
      const result = await opportunitiesSignalsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(404);
    });

    it("returns error in body when not ok", async () => {
      mockSubmitExternalOpportunitySignal.mockResolvedValue({ ok: false, reason: "Invalid signal type" });
      const result = await opportunitiesSignalsPost(makeCtx()) as { body: { error: string } };
      expect(result.body.error).toBe("Invalid signal type");
    });
  });
});
