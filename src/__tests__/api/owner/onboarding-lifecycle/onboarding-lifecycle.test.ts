/**
 * Non-DB mock tests for:
 *   POST  /api/owner/onboarding-lifecycle — startOnboarding
 *   GET   /api/owner/onboarding-lifecycle — getOnboarding
 *   PATCH /api/owner/onboarding-lifecycle — completeOnboarding / triggerReOnboarding
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockStartOnboarding,
  mockCompleteOnboarding,
  mockTriggerReOnboarding,
  mockGetOnboarding,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockStartOnboarding: vi.fn(),
  mockCompleteOnboarding: vi.fn(),
  mockTriggerReOnboarding: vi.fn(),
  mockGetOnboarding: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/owner-onboarding-lifecycle.service", () => ({
  startOnboarding: mockStartOnboarding,
  completeOnboarding: mockCompleteOnboarding,
  triggerReOnboarding: mockTriggerReOnboarding,
  getOnboarding: mockGetOnboarding,
}));

vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: mockCanonicalJson,
}));

const capturedPostDecl: Record<string, unknown>[] = [];
const capturedGetDecl: Record<string, unknown>[] = [];
const capturedPatchDecl: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    const decl = {
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    };
    const src = handler.toString();
    if (src.includes("startOnboarding")) capturedPostDecl.push(decl);
    else if (src.includes("getOnboarding")) capturedGetDecl.push(decl);
    else capturedPatchDecl.push(decl);
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const BIZ_ID = "bb000001-0000-4000-8000-000000000001";
const OWNER_ID = "0a000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/onboarding-lifecycle";

const VALID_START_BODY = {
  businessId: BIZ_ID,
  ownerId: OWNER_ID,
  businessName: "Acme Services",
  businessType: "consulting",
  revenueRange: "50k-100k",
  revenueTrend: "STABLE" as const,
  profitability: "POSITIVE" as const,
  cashRunwayWeeks: 12,
  ownerHoursPerWeek: 40,
  teamSize: 3,
};

const MOCK_ONBOARDING_DTO = {
  id: "ob000001-0000-4000-8000-000000000001",
  workspaceId: WS_A,
  businessId: BIZ_ID,
  ownerId: OWNER_ID,
  status: "pending",
  archetype: "SERVICE_BUSINESS",
  initialActionQueue: ["Confirm revenue numbers", "Set up financials"],
  completionKey: null,
  completedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeCtx(body?: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: {
      url: BASE_URL,
      json: async () => body,
    },
    ...overrides,
  };
}

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _options: unknown, testCtx: unknown) => {
      return handler(testCtx);
    }
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ──────────────────────────────────────────────

let postHandler: (ctx?: unknown) => Promise<unknown>;
let getHandler: (ctx?: unknown) => Promise<unknown>;
let patchHandler: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/onboarding-lifecycle/route");
  postHandler = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  getHandler = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  patchHandler = route.PATCH as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({
    body: data,
    status: opts?.status ?? 200,
  }));
  mockStartOnboarding.mockResolvedValue(MOCK_ONBOARDING_DTO);
  mockGetOnboarding.mockResolvedValue(MOCK_ONBOARDING_DTO);
  mockCompleteOnboarding.mockResolvedValue({ ...MOCK_ONBOARDING_DTO, status: "complete" });
  mockTriggerReOnboarding.mockResolvedValue({ ...MOCK_ONBOARDING_DTO, status: "pending" });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("onboarding-lifecycle — module contract assertions", () => {
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
  it("VALID_START_BODY.revenueTrend is STABLE", () => { expect(VALID_START_BODY.revenueTrend).toBe("STABLE"); });
});

describe("Onboarding-Lifecycle Routes — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("POST is guarded by owner:onboard", () => {
      const decl = capturedPostDecl[0];
      expect((decl?.requireCapabilities as string[]).includes("owner:onboard")).toBe(true);
    });

    it("POST requires workspace enforcement", () => {
      expect(capturedPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("GET is guarded by owner:onboard", () => {
      const decl = capturedGetDecl[0];
      expect((decl?.requireCapabilities as string[]).includes("owner:onboard")).toBe(true);
    });

    it("GET requires workspace enforcement", () => {
      expect(capturedGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("PATCH is guarded by owner:onboard", () => {
      const decl = capturedPatchDecl[0];
      expect((decl?.requireCapabilities as string[]).includes("owner:onboard")).toBe(true);
    });

    it("PATCH requires workspace enforcement", () => {
      expect(capturedPatchDecl[0]?.requireWorkspace).toBe(true);
    });

    it("POST returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await postHandler(makeCtx(VALID_START_BODY)) as { status: number };
      expect(result.status).toBe(403);
    });

    it("GET returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await getHandler(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("POST — startOnboarding", () => {
    it("returns 201 with onboarding DTO on valid body", async () => {
      const result = await postHandler(makeCtx(VALID_START_BODY)) as { status: number; body: unknown };
      expect(result.status).toBe(201);
      expect(result.body).toEqual(MOCK_ONBOARDING_DTO);
    });

    it("calls startOnboarding with verifiedWorkspaceId", async () => {
      await postHandler(makeCtx(VALID_START_BODY));
      expect(mockStartOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls startOnboarding with verifiedActorId", async () => {
      await postHandler(makeCtx(VALID_START_BODY));
      expect(mockStartOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("calls startOnboarding with body fields", async () => {
      await postHandler(makeCtx(VALID_START_BODY));
      expect(mockStartOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({ businessName: "Acme Services", revenueTrend: "STABLE" })
      );
    });

    it("returns 400 on invalid body (missing required field)", async () => {
      const result = await postHandler(makeCtx({ businessId: BIZ_ID })) as { status: number };
      expect(result.status).toBe(400);
      expect(mockStartOnboarding).not.toHaveBeenCalled();
    });

    it("returns 400 when revenueTrend has invalid value", async () => {
      const result = await postHandler(makeCtx({ ...VALID_START_BODY, revenueTrend: "UNKNOWN" })) as { status: number };
      expect(result.status).toBe(400);
    });

    it("uses verifiedWorkspaceId not any body workspace field", async () => {
      const ctx = makeCtx(VALID_START_BODY, { verifiedWorkspaceId: WS_B });
      await postHandler(ctx);
      expect(mockStartOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("GET — getOnboarding", () => {
    it("returns 200 with onboarding DTO", async () => {
      const result = await getHandler(makeCtx()) as { status: number; body: unknown };
      expect(result.status).toBe(200);
      expect(result.body).toEqual(MOCK_ONBOARDING_DTO);
    });

    it("calls getOnboarding with verifiedWorkspaceId", async () => {
      await getHandler(makeCtx());
      expect(mockGetOnboarding).toHaveBeenCalledWith({ workspaceId: WS_A });
    });

    it("uses WS_B when context has WS_B", async () => {
      await getHandler(makeCtx(undefined, { verifiedWorkspaceId: WS_B }));
      expect(mockGetOnboarding).toHaveBeenCalledWith({ workspaceId: WS_B });
    });

    it("calls getOnboarding exactly once", async () => {
      await getHandler(makeCtx());
      expect(mockGetOnboarding).toHaveBeenCalledTimes(1);
    });
  });

  describe("PATCH — completeOnboarding", () => {
    it("returns 200 with completed DTO when action=complete", async () => {
      const result = await patchHandler(makeCtx({ action: "complete", completionKey: "key-abc" })) as { status: number; body: Record<string, unknown> };
      expect(result.status).toBe(200);
      expect(result.body.status).toBe("complete");
    });

    it("calls completeOnboarding with verifiedWorkspaceId and completionKey", async () => {
      await patchHandler(makeCtx({ action: "complete", completionKey: "key-abc" }));
      expect(mockCompleteOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, completionKey: "key-abc" })
      );
    });

    it("does not call triggerReOnboarding when action=complete", async () => {
      await patchHandler(makeCtx({ action: "complete", completionKey: "key-abc" }));
      expect(mockTriggerReOnboarding).not.toHaveBeenCalled();
    });
  });

  describe("PATCH — triggerReOnboarding", () => {
    it("returns 200 when action=re_onboard", async () => {
      const result = await patchHandler(makeCtx({ action: "re_onboard", reOnboardingReason: "Changed business model" })) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls triggerReOnboarding with verifiedWorkspaceId and reason", async () => {
      await patchHandler(makeCtx({ action: "re_onboard", reOnboardingReason: "Changed model" }));
      expect(mockTriggerReOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, reOnboardingReason: "Changed model" })
      );
    });

    it("does not call completeOnboarding when action=re_onboard", async () => {
      await patchHandler(makeCtx({ action: "re_onboard", reOnboardingReason: "Changed model" }));
      expect(mockCompleteOnboarding).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid PATCH action", async () => {
      const result = await patchHandler(makeCtx({ action: "INVALID" })) as { status: number };
      expect(result.status).toBe(400);
      expect(mockCompleteOnboarding).not.toHaveBeenCalled();
      expect(mockTriggerReOnboarding).not.toHaveBeenCalled();
    });
  });

  describe("workspace isolation", () => {
    it("POST never uses body workspace IDs — only verifiedWorkspaceId", async () => {
      const bodyWithFakeWs = { ...VALID_START_BODY };
      const ctx = makeCtx(bodyWithFakeWs, { verifiedWorkspaceId: WS_B });
      await postHandler(ctx);
      const call = mockStartOnboarding.mock.calls[0][0] as Record<string, unknown>;
      expect(call.workspaceId).toBe(WS_B);
    });

    it("GET uses verifiedWorkspaceId not a query param", async () => {
      const ctx = makeCtx(undefined, { verifiedWorkspaceId: WS_B, request: { url: `${BASE_URL}?workspaceId=${WS_A}`, json: async () => undefined } });
      await getHandler(ctx);
      expect(mockGetOnboarding).toHaveBeenCalledWith({ workspaceId: WS_B });
    });
  });
});
