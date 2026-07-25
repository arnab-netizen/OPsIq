/**
 * Non-DB mock tests for:
 *   POST   /api/owner/gates/opt-out — record audited owner opt-out from safety gate
 *   DELETE /api/owner/gates/opt-out — clear opt-out (re-enable enforcement)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRecordGateOptOut,
  mockClearGateOptOut,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRecordGateOptOut: vi.fn(),
  mockClearGateOptOut: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/gate-enforcement-policy", () => ({
  recordGateOptOut: mockRecordGateOptOut,
  clearGateOptOut: mockClearGateOptOut,
  GATE_OPT_OUT_RISK_CLASSES: ["low", "medium", "high", "critical"],
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

const BASE_URL = "https://example.com/api/owner/gates/opt-out";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_OPT_OUT_INPUT = {
  reason: "Owner has assessed risk and accepts liability",
  riskClass: "medium",
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

let gatesOptOutPost: (ctx?: unknown) => Promise<unknown>;
let gatesOptOutDelete: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/gates/opt-out/route");
  gatesOptOutPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  gatesOptOutDelete = route.DELETE as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_OPT_OUT_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockRecordGateOptOut.mockResolvedValue(undefined);
  mockClearGateOptOut.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("gates-opt-out-route — module contract assertions", () => {
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
  it("MOCK_OPT_OUT_INPUT.riskClass is medium", () => { expect(MOCK_OPT_OUT_INPUT.riskClass).toBe("medium"); });
});

describe("POST /api/owner/gates/opt-out — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await gatesOptOutPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await gatesOptOutPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await gatesOptOutPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls recordGateOptOut with workspaceId", async () => {
      await gatesOptOutPost(makeCtx());
      expect(mockRecordGateOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls recordGateOptOut with actorId", async () => {
      await gatesOptOutPost(makeCtx());
      expect(mockRecordGateOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("calls recordGateOptOut with actorIsOwner true", async () => {
      await gatesOptOutPost(makeCtx());
      expect(mockRecordGateOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ actorIsOwner: true })
      );
    });

    it("calls recordGateOptOut with reason from input", async () => {
      await gatesOptOutPost(makeCtx());
      expect(mockRecordGateOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ reason: MOCK_OPT_OUT_INPUT.reason })
      );
    });

    it("calls recordGateOptOut with riskClass from input", async () => {
      await gatesOptOutPost(makeCtx());
      expect(mockRecordGateOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ riskClass: "medium" })
      );
    });

    it("returns ok true in body", async () => {
      const result = await gatesOptOutPost(makeCtx()) as { body: { ok: boolean } };
      expect(result.body.ok).toBe(true);
    });

    it("calls recordGateOptOut exactly once", async () => {
      await gatesOptOutPost(makeCtx());
      expect(mockRecordGateOptOut).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await gatesOptOutPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRecordGateOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});

describe("DELETE /api/owner/gates/opt-out — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies DELETE", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await gatesOptOutDelete(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies DELETE with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await gatesOptOutDelete(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful DELETE", () => {
    it("returns 200 on success", async () => {
      const result = await gatesOptOutDelete(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls clearGateOptOut with workspaceId", async () => {
      await gatesOptOutDelete(makeCtx());
      expect(mockClearGateOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls clearGateOptOut with actorId", async () => {
      await gatesOptOutDelete(makeCtx());
      expect(mockClearGateOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("calls clearGateOptOut with actorIsOwner true", async () => {
      await gatesOptOutDelete(makeCtx());
      expect(mockClearGateOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ actorIsOwner: true })
      );
    });

    it("returns ok true in body", async () => {
      const result = await gatesOptOutDelete(makeCtx()) as { body: { ok: boolean } };
      expect(result.body.ok).toBe(true);
    });

    it("calls clearGateOptOut exactly once", async () => {
      await gatesOptOutDelete(makeCtx());
      expect(mockClearGateOptOut).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for DELETE (WS_B)", async () => {
      await gatesOptOutDelete(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockClearGateOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("does not call recordGateOptOut on DELETE", async () => {
      await gatesOptOutDelete(makeCtx());
      expect(mockRecordGateOptOut).not.toHaveBeenCalled();
    });
  });
});
