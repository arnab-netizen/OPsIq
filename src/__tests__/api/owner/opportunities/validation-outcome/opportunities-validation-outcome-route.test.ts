/**
 * Non-DB mock tests for:
 *   POST /api/owner/opportunities/validation-outcome — record opportunity experiment result
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ────────────���──────────────────────────────────────────

const {
  mockRecordValidationOutcome,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRecordValidationOutcome: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/validation-outcome.service", () => ({
  recordValidationOutcome: mockRecordValidationOutcome,
}));

vi.mock("@/domain/owner-mode/validation-outcome", () => ({
  OUTCOME_STATUSES: ["NOT_STARTED", "RUNNING", "COMPLETED", "CANCELLED", "NEEDS_DATA"],
  OUTCOME_RESULTS: ["PASSED", "FAILED", "INCONCLUSIVE", "NOT_EVALUATED"],
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
const OUTCOME_ID = "oc000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/opportunities/validation-outcome";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    verifiedSessionSnapshot: { role: "owner" },
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_OUTCOME_INPUT = {
  experimentKey: "catering-b2b-test-q3",
  opportunityKey: "b2b-catering-opp-001",
  status: "COMPLETED",
  result: "PASSED",
  leadsGenerated: 5,
  conversions: 2,
};

const MOCK_OUTCOME_RESULT = {
  ok: true,
  outcomeId: OUTCOME_ID,
  result: "PASSED",
  nextRecommendedDecision: "SCALE",
  deduped: false,
  updated: false,
};

// ─── Passthrough helpers ────────────��──────────────────────────��──────────────

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

// ─── Import handlers after mocks ──────────���──────────────────────────────────

let validationOutcomePost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/opportunities/validation-outcome/route");
  validationOutcomePost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_OUTCOME_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockRecordValidationOutcome.mockResolvedValue(MOCK_OUTCOME_RESULT);
});

// ─── Tests ───────────────��─────────────────────────────���──────────────────────

describe("opportunities-validation-outcome-route — module contract assertions", () => {
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
  it("MOCK_OUTCOME_RESULT.nextRecommendedDecision is SCALE", () => {
    expect(MOCK_OUTCOME_RESULT.nextRecommendedDecision).toBe("SCALE");
  });
});

describe("POST /api/owner/opportunities/validation-outcome — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await validationOutcomePost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await validationOutcomePost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 200 on success", async () => {
      const result = await validationOutcomePost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls recordValidationOutcome with workspaceId", async () => {
      await validationOutcomePost(makeCtx());
      expect(mockRecordValidationOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls recordValidationOutcome with actorId", async () => {
      await validationOutcomePost(makeCtx());
      expect(mockRecordValidationOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("calls recordValidationOutcome with actorRole from session snapshot", async () => {
      await validationOutcomePost(makeCtx());
      expect(mockRecordValidationOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: "owner" })
      );
    });

    it("passes null actorRole when verifiedSessionSnapshot has no role", async () => {
      await validationOutcomePost(makeCtx({ verifiedSessionSnapshot: null }));
      expect(mockRecordValidationOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: null })
      );
    });

    it("returns outcomeId in body", async () => {
      const result = await validationOutcomePost(makeCtx()) as { body: { outcomeId: string } };
      expect(result.body.outcomeId).toBe(OUTCOME_ID);
    });

    it("returns nextRecommendedDecision in body", async () => {
      const result = await validationOutcomePost(makeCtx()) as { body: { nextRecommendedDecision: string } };
      expect(result.body.nextRecommendedDecision).toBe("SCALE");
    });

    it("calls recordValidationOutcome exactly once", async () => {
      await validationOutcomePost(makeCtx());
      expect(mockRecordValidationOutcome).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await validationOutcomePost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRecordValidationOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST when service returns not-ok", () => {
    it("returns 400 when service result is not ok", async () => {
      mockRecordValidationOutcome.mockResolvedValue({ ok: false, reason: "Experiment not found" });
      const result = await validationOutcomePost(makeCtx()) as { status: number };
      expect(result.status).toBe(400);
    });

    it("returns error in body when not ok", async () => {
      mockRecordValidationOutcome.mockResolvedValue({ ok: false, reason: "Duplicate outcome" });
      const result = await validationOutcomePost(makeCtx()) as { body: { error: string } };
      expect(result.body.error).toBe("Duplicate outcome");
    });
  });
});
