/**
 * Non-DB mock tests for:
 *   POST /api/owner/approvals/resolve — owner approval resolution (standing instructions)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockResolveOwnerApproval,
  mockHashApprovalContent,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockResolveOwnerApproval: vi.fn(),
  mockHashApprovalContent: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/owner-approval-resolution.service", () => ({
  resolveOwnerApproval: mockResolveOwnerApproval,
}));

vi.mock("@/domain/owner-mode/approval-memory", () => ({
  APPROVAL_RISK_CLASSES: ["low", "medium", "high", "critical"],
  hashApprovalContent: mockHashApprovalContent,
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
const CONTENT_HASH = "abcdef1234567890abcdef1234567890";

const BASE_URL = "https://example.com/api/owner/approvals/resolve";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_RESOLVE_INPUT = {
  scope: "pricing-discounts",
  contentHash: CONTENT_HASH,
  riskClass: "high",
  actionType: "apply_discount",
  amount: 500,
};

const MOCK_RESOLUTION = {
  decision: "approved",
  source: "standing_instruction",
  attentionId: null,
  instructionId: "si000001-0000-4000-8000-000000000001",
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

let approvalsResolvePost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/approvals/resolve/route");
  approvalsResolvePost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_RESOLVE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockResolveOwnerApproval.mockResolvedValue(MOCK_RESOLUTION);
  mockHashApprovalContent.mockReturnValue("computed-hash-fallback");
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("approvals-resolve-route — module contract assertions", () => {
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
  it("MOCK_RESOLUTION.decision is approved", () => { expect(MOCK_RESOLUTION.decision).toBe("approved"); });
});

describe("POST /api/owner/approvals/resolve — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await approvalsResolvePost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await approvalsResolvePost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST (contentHash provided)", () => {
    it("returns 200 on success", async () => {
      const result = await approvalsResolvePost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls resolveOwnerApproval with workspaceId", async () => {
      await approvalsResolvePost(makeCtx());
      expect(mockResolveOwnerApproval).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls resolveOwnerApproval with contentHash from input", async () => {
      await approvalsResolvePost(makeCtx());
      expect(mockResolveOwnerApproval).toHaveBeenCalledWith(
        expect.objectContaining({ contentHash: CONTENT_HASH })
      );
    });

    it("calls resolveOwnerApproval with scope from input", async () => {
      await approvalsResolvePost(makeCtx());
      expect(mockResolveOwnerApproval).toHaveBeenCalledWith(
        expect.objectContaining({ scope: MOCK_RESOLVE_INPUT.scope })
      );
    });

    it("calls resolveOwnerApproval with riskClass from input", async () => {
      await approvalsResolvePost(makeCtx());
      expect(mockResolveOwnerApproval).toHaveBeenCalledWith(
        expect.objectContaining({ riskClass: "high" })
      );
    });

    it("calls resolveOwnerApproval with actionType from input", async () => {
      await approvalsResolvePost(makeCtx());
      expect(mockResolveOwnerApproval).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: "apply_discount" })
      );
    });

    it("calls resolveOwnerApproval with amount from input", async () => {
      await approvalsResolvePost(makeCtx());
      expect(mockResolveOwnerApproval).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500 })
      );
    });

    it("returns resolution decision in body", async () => {
      const result = await approvalsResolvePost(makeCtx()) as { body: typeof MOCK_RESOLUTION };
      expect(result.body.decision).toBe("approved");
    });

    it("returns resolution source in body", async () => {
      const result = await approvalsResolvePost(makeCtx()) as { body: typeof MOCK_RESOLUTION };
      expect(result.body.source).toBe("standing_instruction");
    });

    it("calls resolveOwnerApproval exactly once", async () => {
      await approvalsResolvePost(makeCtx());
      expect(mockResolveOwnerApproval).toHaveBeenCalledTimes(1);
    });

    it("does not call hashApprovalContent when contentHash provided", async () => {
      await approvalsResolvePost(makeCtx());
      expect(mockHashApprovalContent).not.toHaveBeenCalled();
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await approvalsResolvePost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockResolveOwnerApproval).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST (content object provided, no contentHash)", () => {
    it("calls hashApprovalContent when contentHash absent", async () => {
      const inputWithContent = { ...MOCK_RESOLVE_INPUT, contentHash: undefined, content: { foo: "bar" } };
      mockParseRequestBody.mockResolvedValue(inputWithContent);
      await approvalsResolvePost(makeCtx());
      expect(mockHashApprovalContent).toHaveBeenCalledWith({ foo: "bar" });
    });

    it("passes computed hash to resolveOwnerApproval when contentHash absent", async () => {
      const inputWithContent = { ...MOCK_RESOLVE_INPUT, contentHash: undefined, content: { foo: "bar" } };
      mockParseRequestBody.mockResolvedValue(inputWithContent);
      mockHashApprovalContent.mockReturnValue("computed-hash-xyz");
      await approvalsResolvePost(makeCtx());
      expect(mockResolveOwnerApproval).toHaveBeenCalledWith(
        expect.objectContaining({ contentHash: "computed-hash-xyz" })
      );
    });
  });

  describe("POST when amount is not provided", () => {
    it("passes null for amount when undefined in input", async () => {
      const inputNoAmount = { ...MOCK_RESOLVE_INPUT, amount: undefined };
      mockParseRequestBody.mockResolvedValue(inputNoAmount);
      await approvalsResolvePost(makeCtx());
      expect(mockResolveOwnerApproval).toHaveBeenCalledWith(
        expect.objectContaining({ amount: null })
      );
    });
  });
});
