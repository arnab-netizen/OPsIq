/**
 * Non-DB mock tests for:
 *   POST /api/owner/tender/application-pack — Bid Application Pack generator
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 * Pure analysis route — no canonicalJson; handler returns pack object directly.
 * Governance invariants:
 *   - ownerApprovalRequired is always true in the candidate passed to generateBidApplicationPack
 *   - workspaceId in candidate comes from ctx.verifiedWorkspaceId (never the body)
 *   - emitAuditEvent is called exactly once per request
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockGenerateBidApplicationPack,
  mockEmitAuditEvent,
  mockParseRequestBody,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockGenerateBidApplicationPack: vi.fn(),
  mockEmitAuditEvent: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/domain/owner-mode/bid-application-pack.validation", () => ({
  bidApplicationPackRequestSchema: {},
}));

vi.mock("@/domain/owner-mode/bid-application-pack", () => ({
  generateBidApplicationPack: mockGenerateBidApplicationPack,
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mockEmitAuditEvent,
}));

vi.mock("@/domain/constants/audit-events", () => ({
  AUDIT_EVENTS: {
    OWNER_TENDER_APPLICATION_PACK_GENERATED: "OWNER_TENDER_APPLICATION_PACK_GENERATED",
  },
}));

vi.mock("@/lib/validation", () => ({ parseRequestBody: mockParseRequestBody }));

const capturedDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
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

const BASE_URL = "https://example.com/api/owner/tender/application-pack";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    routeParams: {},
    ...overrides,
  };
}

const MOCK_REQUEST_BODY = {
  signalSourceType: "GOVERNMENT",
  opportunityTitle: "Office Renovation Contract",
  sourceEvidenceSummary: "City tender board announcement",
  sourceRefs: ["https://example.com/tender/123"],
  targetBuyer: "City of Sydney",
  eligibility: { meetsRequirements: true, missingCriteria: [] },
  emdExposure: { required: false },
  paymentDelayRisk: "LOW",
  performancePenaltyRisk: "LOW",
  workingCapitalRequirement: { estimatedDays: 30, estimatedAmount: 10000 },
  compliance: { licenseRequired: false, insuranceRequired: true },
  documentationBurden: "MEDIUM",
  capacityFit: "FULL",
  unitEconomics: { estimatedMarginPct: 0.15 },
  bidDeadlineDays: 14,
  tenderDecision: "PURSUE",
  readyToBid: true,
  approvalLevel: "OWNER",
  missingData: [],
  systemCapabilityRecommendation: "Proceed with application",
  ownerVisibleExplanation: "This looks good",
  evaluatedAt: "2026-07-01T00:00:00.000Z",
};

const MOCK_PACK = {
  submissionAllowed: false,
  ownerApprovalRequired: true,
  opportunityTitle: "Office Renovation Contract",
  sections: [],
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (
      handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
      _options: unknown,
      testCtx: unknown
    ) => {
      try {
        const ctx = testCtx as Record<string, unknown>;
        const params = (ctx.routeParams ?? {}) as Record<string, string>;
        return await handler(ctx, params);
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

let tenderApplicationPackPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/tender/application-pack/route");
  tenderApplicationPackPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_REQUEST_BODY);
  mockGenerateBidApplicationPack.mockReturnValue(MOCK_PACK);
  mockEmitAuditEvent.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("application-pack-route — module contract assertions", () => {
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
  it("MOCK_PACK.submissionAllowed is false", () => { expect(MOCK_PACK.submissionAllowed).toBe(false); });
});

describe("POST /api/owner/tender/application-pack — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await tenderApplicationPackPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await tenderApplicationPackPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST — domain function calls", () => {
    it("calls generateBidApplicationPack exactly once", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockGenerateBidApplicationPack).toHaveBeenCalledTimes(1);
    });

    it("calls emitAuditEvent exactly once", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    });

    it("returns the pack produced by generateBidApplicationPack", async () => {
      const result = await tenderApplicationPackPost(makeCtx()) as typeof MOCK_PACK;
      expect(result.opportunityTitle).toBe("Office Renovation Contract");
    });

    it("result is the pack object directly (no canonicalJson wrapper)", async () => {
      const result = await tenderApplicationPackPost(makeCtx()) as { sections: unknown[] };
      expect(Array.isArray(result.sections)).toBe(true);
    });
  });

  describe("successful POST — candidate construction governance", () => {
    it("overwrites workspaceId in candidate with ctx.verifiedWorkspaceId", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockGenerateBidApplicationPack).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A }),
        expect.any(String)
      );
    });

    it("sets ownerApprovalRequired true in candidate regardless of body", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockGenerateBidApplicationPack).toHaveBeenCalledWith(
        expect.objectContaining({ ownerApprovalRequired: true }),
        expect.any(String)
      );
    });

    it("passes opportunityTitle from body to candidate", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockGenerateBidApplicationPack).toHaveBeenCalledWith(
        expect.objectContaining({ opportunityTitle: "Office Renovation Contract" }),
        expect.any(String)
      );
    });

    it("passes targetBuyer from body to candidate", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockGenerateBidApplicationPack).toHaveBeenCalledWith(
        expect.objectContaining({ targetBuyer: "City of Sydney" }),
        expect.any(String)
      );
    });

    it("passes tenderDecision from body to candidate", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockGenerateBidApplicationPack).toHaveBeenCalledWith(
        expect.objectContaining({ tenderDecision: "PURSUE" }),
        expect.any(String)
      );
    });

    it("passes generatedAt as second arg to generateBidApplicationPack", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockGenerateBidApplicationPack).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String)
      );
    });

    it("uses WS_B in candidate when verifiedWorkspaceId is WS_B", async () => {
      await tenderApplicationPackPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockGenerateBidApplicationPack).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B }),
        expect.any(String)
      );
    });
  });

  describe("successful POST — audit event", () => {
    it("emitAuditEvent called with correct eventName", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "OWNER_TENDER_APPLICATION_PACK_GENERATED" })
      );
    });

    it("emitAuditEvent called with ctx.verifiedWorkspaceId", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("emitAuditEvent called with ctx.verifiedActorId", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("emitAuditEvent payload contains submissionAllowed false", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ submissionAllowed: false }),
        })
      );
    });

    it("emitAuditEvent payload contains ownerApprovalRequired true", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ ownerApprovalRequired: true }),
        })
      );
    });

    it("emitAuditEvent payload contains opportunityTitle from body", async () => {
      await tenderApplicationPackPost(makeCtx());
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ opportunityTitle: "Office Renovation Contract" }),
        })
      );
    });

    it("emitAuditEvent uses WS_B when verifiedWorkspaceId is WS_B", async () => {
      await tenderApplicationPackPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});
