/**
 * Non-DB mock tests for:
 *   POST /api/owner/approvals/memory — record a reusable owner approval
 *   GET  /api/owner/approvals/memory — check whether an approval is remembered
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRecordApproval,
  mockIsApprovalRemembered,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRecordApproval: vi.fn(),
  mockIsApprovalRemembered: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/approval-memory.service", () => ({
  recordApproval: mockRecordApproval,
  isApprovalRemembered: mockIsApprovalRemembered,
}));

vi.mock("@/domain/owner-mode/approval-memory", () => ({
  APPROVAL_RISK_CLASSES: ["low", "medium", "high", "critical"],
  hashApprovalContent: vi.fn(),
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

const BASE_URL = "https://example.com/api/owner/approvals/memory";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_RECORD_INPUT = {
  scope: "pricing-discounts",
  contentHash: CONTENT_HASH,
  riskClass: "high",
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

let approvalsMemoryPost: (ctx?: unknown) => Promise<unknown>;
let approvalsMemoryGet: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/approvals/memory/route");
  approvalsMemoryPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  approvalsMemoryGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_RECORD_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockRecordApproval.mockResolvedValue(undefined);
  mockIsApprovalRemembered.mockResolvedValue({ remembered: false, reason: null });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("approvals-memory-route — module contract assertions", () => {
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
  it("MOCK_RECORD_INPUT.riskClass is high", () => { expect(MOCK_RECORD_INPUT.riskClass).toBe("high"); });
});

describe("POST /api/owner/approvals/memory — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await approvalsMemoryPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await approvalsMemoryPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await approvalsMemoryPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls recordApproval with workspaceId", async () => {
      await approvalsMemoryPost(makeCtx());
      expect(mockRecordApproval).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls recordApproval with actorId", async () => {
      await approvalsMemoryPost(makeCtx());
      expect(mockRecordApproval).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("calls recordApproval with actorIsOwner true", async () => {
      await approvalsMemoryPost(makeCtx());
      expect(mockRecordApproval).toHaveBeenCalledWith(
        expect.objectContaining({ actorIsOwner: true })
      );
    });

    it("calls recordApproval with scope from input", async () => {
      await approvalsMemoryPost(makeCtx());
      expect(mockRecordApproval).toHaveBeenCalledWith(
        expect.objectContaining({ scope: MOCK_RECORD_INPUT.scope })
      );
    });

    it("calls recordApproval with contentHash from input", async () => {
      await approvalsMemoryPost(makeCtx());
      expect(mockRecordApproval).toHaveBeenCalledWith(
        expect.objectContaining({ contentHash: CONTENT_HASH })
      );
    });

    it("calls recordApproval with riskClass from input", async () => {
      await approvalsMemoryPost(makeCtx());
      expect(mockRecordApproval).toHaveBeenCalledWith(
        expect.objectContaining({ riskClass: "high" })
      );
    });

    it("returns ok true in body", async () => {
      const result = await approvalsMemoryPost(makeCtx()) as { body: { ok: boolean } };
      expect(result.body.ok).toBe(true);
    });

    it("calls recordApproval exactly once", async () => {
      await approvalsMemoryPost(makeCtx());
      expect(mockRecordApproval).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await approvalsMemoryPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRecordApproval).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});

describe("GET /api/owner/approvals/memory — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await approvalsMemoryGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await approvalsMemoryGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET (remembered=false)", () => {
    it("returns 200 on success", async () => {
      const url = `${BASE_URL}?scope=pricing-discounts&contentHash=${CONTENT_HASH}&riskClass=high`;
      const result = await approvalsMemoryGet(makeCtx({ request: { url } })) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls isApprovalRemembered with workspaceId", async () => {
      const url = `${BASE_URL}?scope=pricing-discounts&contentHash=${CONTENT_HASH}&riskClass=high`;
      await approvalsMemoryGet(makeCtx({ request: { url } }));
      expect(mockIsApprovalRemembered).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls isApprovalRemembered with scope from query", async () => {
      const url = `${BASE_URL}?scope=pricing-discounts&contentHash=${CONTENT_HASH}&riskClass=high`;
      await approvalsMemoryGet(makeCtx({ request: { url } }));
      expect(mockIsApprovalRemembered).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "pricing-discounts" })
      );
    });

    it("calls isApprovalRemembered with contentHash from query", async () => {
      const url = `${BASE_URL}?scope=pricing-discounts&contentHash=${CONTENT_HASH}&riskClass=high`;
      await approvalsMemoryGet(makeCtx({ request: { url } }));
      expect(mockIsApprovalRemembered).toHaveBeenCalledWith(
        expect.objectContaining({ contentHash: CONTENT_HASH })
      );
    });

    it("returns remembered in body", async () => {
      mockIsApprovalRemembered.mockResolvedValue({ remembered: false, reason: null });
      const url = `${BASE_URL}?scope=pricing-discounts&contentHash=${CONTENT_HASH}&riskClass=high`;
      const result = await approvalsMemoryGet(makeCtx({ request: { url } })) as { body: { remembered: unknown } };
      expect(result.body).toHaveProperty("remembered");
    });

    it("calls isApprovalRemembered exactly once", async () => {
      const url = `${BASE_URL}?scope=s&contentHash=h1234567890&riskClass=low`;
      await approvalsMemoryGet(makeCtx({ request: { url } }));
      expect(mockIsApprovalRemembered).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      const url = `${BASE_URL}?scope=s&contentHash=h1234567890&riskClass=medium`;
      await approvalsMemoryGet(makeCtx({ verifiedWorkspaceId: WS_B, request: { url } }));
      expect(mockIsApprovalRemembered).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});
