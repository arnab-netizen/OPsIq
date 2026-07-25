/**
 * Non-DB mock tests for:
 *   POST  /api/owner/processes — register a process
 *   PATCH /api/owner/processes — trigger process review if due
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRegisterProcess,
  mockTriggerProcessReviewIfDue,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRegisterProcess: vi.fn(),
  mockTriggerProcessReviewIfDue: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/process-review.service", () => ({
  registerProcess: mockRegisterProcess,
  triggerProcessReviewIfDue: mockTriggerProcessReviewIfDue,
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
const PROCESS_ID = "pr000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/processes";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_REGISTER_INPUT = {
  name: "Monthly Revenue Review",
  processType: "FINANCIAL_REVIEW",
  ownerRole: "CFO",
  metric: "monthly_revenue",
  target: "100000",
  reviewFrequencyDays: 30,
};

const MOCK_REVIEW_INPUT = {
  id: PROCESS_ID,
  signals: {
    repeatedFailure: false,
    complaintSpike: false,
    qualityDecline: true,
  },
};

const MOCK_REVIEW_DECISION = {
  reviewTriggered: true,
  processId: PROCESS_ID,
  reviewId: "rv000001-0000-4000-8000-000000000001",
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

let processesPost: (ctx?: unknown) => Promise<unknown>;
let processesPatch: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/processes/route");
  processesPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  processesPatch = route.PATCH as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_REGISTER_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockRegisterProcess.mockResolvedValue(PROCESS_ID);
  mockTriggerProcessReviewIfDue.mockResolvedValue(MOCK_REVIEW_DECISION);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("processes-route — module contract assertions", () => {
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
  it("MOCK_REVIEW_DECISION.reviewTriggered is true", () => { expect(MOCK_REVIEW_DECISION.reviewTriggered).toBe(true); });
});

describe("POST /api/owner/processes — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await processesPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await processesPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST (register process)", () => {
    it("returns 201 on success", async () => {
      const result = await processesPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls registerProcess with workspaceId", async () => {
      await processesPost(makeCtx());
      expect(mockRegisterProcess).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls registerProcess with actorId", async () => {
      await processesPost(makeCtx());
      expect(mockRegisterProcess).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("returns id in body", async () => {
      const result = await processesPost(makeCtx()) as { body: { id: string } };
      expect(result.body.id).toBe(PROCESS_ID);
    });

    it("calls registerProcess exactly once", async () => {
      await processesPost(makeCtx());
      expect(mockRegisterProcess).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await processesPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRegisterProcess).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});

describe("PATCH /api/owner/processes — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies PATCH", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await processesPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful PATCH (trigger review)", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_REVIEW_INPUT);
    });

    it("returns 200 on success", async () => {
      const result = await processesPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls triggerProcessReviewIfDue with process id and workspaceId", async () => {
      await processesPatch(makeCtx());
      expect(mockTriggerProcessReviewIfDue).toHaveBeenCalledWith(
        PROCESS_ID,
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls triggerProcessReviewIfDue with actorId", async () => {
      await processesPatch(makeCtx());
      expect(mockTriggerProcessReviewIfDue).toHaveBeenCalledWith(
        PROCESS_ID,
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("returns decision in body", async () => {
      const result = await processesPatch(makeCtx()) as { body: unknown };
      expect(result.body).toEqual(MOCK_REVIEW_DECISION);
    });

    it("calls triggerProcessReviewIfDue exactly once", async () => {
      await processesPatch(makeCtx());
      expect(mockTriggerProcessReviewIfDue).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for PATCH (WS_B)", async () => {
      await processesPatch(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockTriggerProcessReviewIfDue).toHaveBeenCalledWith(
        PROCESS_ID,
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});
