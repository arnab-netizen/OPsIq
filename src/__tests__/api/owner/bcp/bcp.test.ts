/**
 * Non-DB mock tests for:
 *   GET   /api/owner/bcp?id=...            — getConditionProfileById
 *   GET   /api/owner/bcp?businessId=...&history=1 — getConditionProfileHistory
 *   GET   /api/owner/bcp?businessId=...    — getCurrentConditionProfile
 *   GET   /api/owner/bcp (no params)       — 400
 *   POST  /api/owner/bcp                   — createConditionProfile
 *   PATCH /api/owner/bcp                   — evaluateConditionProfile
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockCreateConditionProfile,
  mockEvaluateConditionProfile,
  mockGetCurrentConditionProfile,
  mockGetConditionProfileById,
  mockGetConditionProfileHistory,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateConditionProfile: vi.fn(),
  mockEvaluateConditionProfile: vi.fn(),
  mockGetCurrentConditionProfile: vi.fn(),
  mockGetConditionProfileById: vi.fn(),
  mockGetConditionProfileHistory: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/owner-bcp.service", () => ({
  createConditionProfile: mockCreateConditionProfile,
  evaluateConditionProfile: mockEvaluateConditionProfile,
  getCurrentConditionProfile: mockGetCurrentConditionProfile,
  getConditionProfileById: mockGetConditionProfileById,
  getConditionProfileHistory: mockGetConditionProfileHistory,
}));

const capturedGetDeclarations: Record<string, unknown>[] = [];
const capturedPostDeclarations: Record<string, unknown>[] = [];
const capturedPatchDeclarations: Record<string, unknown>[] = [];

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
    if (src.includes("getConditionProfileById")) {
      capturedGetDeclarations.push(decl);
    } else if (src.includes("createConditionProfile")) {
      capturedPostDeclarations.push(decl);
    } else {
      capturedPatchDeclarations.push(decl);
    }
    return async (testCtx: unknown) => mockWithCanonical(handler, options, testCtx);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ACTOR_B = "ac000002-0000-4000-8000-000000000002";
const PROFILE_ID = "ab900000-0000-4000-8000-000000000001";
const BUSINESS_ID = "ab900000-0000-4000-8000-000000000002";

const BASE_URL = "https://example.com/api/owner/bcp";

const FACTS = {
  financialHealthScore: 65,
  operationalHealthScore: 70,
  salesHealthScore: 55,
  sopHealthScore: 80,
  humanExecutionRisk: "MEDIUM" as const,
};

const PROFILE = {
  id: PROFILE_ID,
  workspaceId: WS_A,
  businessId: BUSINESS_ID,
  conditionLabel: "STABLE",
  facts: FACTS,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const CREATE_BODY = {
  businessId: BUSINESS_ID,
  facts: FACTS,
};

const PATCH_BODY = {
  businessId: BUSINESS_ID,
  facts: FACTS,
  triggerType: "EVIDENCE_UPDATE",
  triggerDescription: "New financial evidence shows margin compression.",
};

function makeGetCtx(queryParams: Record<string, string> = {}, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: url.toString() },
    ...overrides,
  };
}

function makePostCtx(body: Record<string, unknown>, ctxOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL, json: async () => body },
    ...ctxOverrides,
  };
}

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _opts: unknown, testCtx: unknown) =>
      handler(testCtx)
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ──────────────────────────────────────────────

let bcpGet: (ctx?: unknown) => Promise<CanonicalResult>;
let bcpPost: (ctx?: unknown) => Promise<CanonicalResult>;
let bcpPatch: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/bcp/route");
  bcpGet = route.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  bcpPost = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  bcpPatch = route.PATCH as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Owner BCP Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET is guarded by owner:manage", () => {
      const decl = capturedGetDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("GET requires workspace enforcement", () => {
      expect(capturedGetDeclarations[0]?.requireWorkspace).toBe(true);
    });

    it("POST is guarded by owner:manage", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("POST requires workspace enforcement", () => {
      expect(capturedPostDeclarations[0]?.requireWorkspace).toBe(true);
    });

    it("PATCH is guarded by owner:manage", () => {
      const decl = capturedPatchDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("PATCH requires workspace enforcement", () => {
      expect(capturedPatchDeclarations[0]?.requireWorkspace).toBe(true);
    });

    it("GET returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await bcpGet(makeGetCtx({ businessId: BUSINESS_ID }));
      expect(result.status).toBe(403);
    });

    it("POST returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await bcpPost(makePostCtx(CREATE_BODY));
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET ?id=... (getConditionProfileById) ────────────────────────────────

  describe("GET ?id=... (getConditionProfileById)", () => {
    it("returns 200 with profile when id provided", async () => {
      mockGetConditionProfileById.mockResolvedValueOnce(PROFILE);
      const result = await bcpGet(makeGetCtx({ id: PROFILE_ID }));
      expect(result.status).toBe(200);
      expect(result.body.profile).toBeDefined();
    });

    it("passes workspaceId (WS_A) and profileId to getConditionProfileById", async () => {
      mockGetConditionProfileById.mockResolvedValueOnce(PROFILE);
      await bcpGet(makeGetCtx({ id: PROFILE_ID }, { verifiedWorkspaceId: WS_A }));
      expect(mockGetConditionProfileById).toHaveBeenCalledWith({ workspaceId: WS_A, profileId: PROFILE_ID });
    });

    it("passes workspaceId (WS_B) to getConditionProfileById", async () => {
      mockGetConditionProfileById.mockResolvedValueOnce(PROFILE);
      await bcpGet(makeGetCtx({ id: PROFILE_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockGetConditionProfileById).toHaveBeenCalledWith({ workspaceId: WS_B, profileId: PROFILE_ID });
    });

    it("calls getConditionProfileById (not other GET functions) when id provided", async () => {
      mockGetConditionProfileById.mockResolvedValueOnce(PROFILE);
      await bcpGet(makeGetCtx({ id: PROFILE_ID }));
      expect(mockGetConditionProfileById).toHaveBeenCalledTimes(1);
      expect(mockGetCurrentConditionProfile).not.toHaveBeenCalled();
      expect(mockGetConditionProfileHistory).not.toHaveBeenCalled();
    });
  });

  // ─── 3. GET ?businessId=...&history=1 (getConditionProfileHistory) ───────────

  describe("GET ?businessId=...&history=1 (getConditionProfileHistory)", () => {
    it("returns 200 with profiles array for history=1", async () => {
      mockGetConditionProfileHistory.mockResolvedValueOnce([PROFILE]);
      const result = await bcpGet(makeGetCtx({ businessId: BUSINESS_ID, history: "1" }));
      expect(result.status).toBe(200);
      expect(Array.isArray(result.body.profiles)).toBe(true);
    });

    it("returns 200 with profiles array for history=true", async () => {
      mockGetConditionProfileHistory.mockResolvedValueOnce([PROFILE]);
      const result = await bcpGet(makeGetCtx({ businessId: BUSINESS_ID, history: "true" }));
      expect(result.status).toBe(200);
      expect(Array.isArray(result.body.profiles)).toBe(true);
    });

    it("passes workspaceId (WS_A) and businessId to getConditionProfileHistory", async () => {
      mockGetConditionProfileHistory.mockResolvedValueOnce([]);
      await bcpGet(makeGetCtx({ businessId: BUSINESS_ID, history: "1" }, { verifiedWorkspaceId: WS_A }));
      expect(mockGetConditionProfileHistory).toHaveBeenCalledWith({ workspaceId: WS_A, businessId: BUSINESS_ID });
    });

    it("passes workspaceId (WS_B) to getConditionProfileHistory", async () => {
      mockGetConditionProfileHistory.mockResolvedValueOnce([]);
      await bcpGet(makeGetCtx({ businessId: BUSINESS_ID, history: "1" }, { verifiedWorkspaceId: WS_B }));
      expect(mockGetConditionProfileHistory).toHaveBeenCalledWith({ workspaceId: WS_B, businessId: BUSINESS_ID });
    });

    it("calls getConditionProfileHistory (not other GET functions) when history=1", async () => {
      mockGetConditionProfileHistory.mockResolvedValueOnce([]);
      await bcpGet(makeGetCtx({ businessId: BUSINESS_ID, history: "1" }));
      expect(mockGetConditionProfileHistory).toHaveBeenCalledTimes(1);
      expect(mockGetCurrentConditionProfile).not.toHaveBeenCalled();
      expect(mockGetConditionProfileById).not.toHaveBeenCalled();
    });
  });

  // ─── 4. GET ?businessId=... (getCurrentConditionProfile) ─────────────────────

  describe("GET ?businessId=... (getCurrentConditionProfile)", () => {
    it("returns 200 with current profile", async () => {
      mockGetCurrentConditionProfile.mockResolvedValueOnce(PROFILE);
      const result = await bcpGet(makeGetCtx({ businessId: BUSINESS_ID }));
      expect(result.status).toBe(200);
      expect(result.body.profile).toBeDefined();
    });

    it("passes workspaceId (WS_A) and businessId to getCurrentConditionProfile", async () => {
      mockGetCurrentConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpGet(makeGetCtx({ businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      expect(mockGetCurrentConditionProfile).toHaveBeenCalledWith({ workspaceId: WS_A, businessId: BUSINESS_ID });
    });

    it("passes workspaceId (WS_B) to getCurrentConditionProfile", async () => {
      mockGetCurrentConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpGet(makeGetCtx({ businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockGetCurrentConditionProfile).toHaveBeenCalledWith({ workspaceId: WS_B, businessId: BUSINESS_ID });
    });

    it("calls getCurrentConditionProfile (not others) when no history param", async () => {
      mockGetCurrentConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpGet(makeGetCtx({ businessId: BUSINESS_ID }));
      expect(mockGetCurrentConditionProfile).toHaveBeenCalledTimes(1);
      expect(mockGetConditionProfileHistory).not.toHaveBeenCalled();
      expect(mockGetConditionProfileById).not.toHaveBeenCalled();
    });

    it("returns 400 when neither id nor businessId provided", async () => {
      const result = await bcpGet(makeGetCtx());
      expect(result.status).toBe(400);
    });
  });

  // ─── 5. POST /api/owner/bcp (createConditionProfile) ─────────────────────────

  describe("POST /api/owner/bcp", () => {
    it("returns 201 with profile on success", async () => {
      mockCreateConditionProfile.mockResolvedValueOnce(PROFILE);
      const result = await bcpPost(makePostCtx(CREATE_BODY));
      expect(result.status).toBe(201);
      expect(result.body.profile).toBeDefined();
    });

    it("passes workspaceId (WS_A) to createConditionProfile", async () => {
      mockCreateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPost(makePostCtx(CREATE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockCreateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes workspaceId (WS_B) to createConditionProfile", async () => {
      mockCreateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPost(makePostCtx(CREATE_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_URL, json: async () => CREATE_BODY },
      }));
      expect(mockCreateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes actorId (ACTOR_A) to createConditionProfile", async () => {
      mockCreateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPost(makePostCtx(CREATE_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockCreateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("passes actorId (ACTOR_B) to createConditionProfile", async () => {
      mockCreateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPost(makePostCtx(CREATE_BODY, {
        verifiedActorId: ACTOR_B,
        request: { url: BASE_URL, json: async () => CREATE_BODY },
      }));
      expect(mockCreateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_B })
      );
    });

    it("passes businessId from body to createConditionProfile", async () => {
      mockCreateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPost(makePostCtx(CREATE_BODY));
      expect(mockCreateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: BUSINESS_ID })
      );
    });

    it("passes facts from body to createConditionProfile", async () => {
      mockCreateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPost(makePostCtx(CREATE_BODY));
      expect(mockCreateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ facts: FACTS })
      );
    });

    it("does not call evaluateConditionProfile on POST", async () => {
      mockCreateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPost(makePostCtx(CREATE_BODY));
      expect(mockEvaluateConditionProfile).not.toHaveBeenCalled();
    });
  });

  // ─── 6. PATCH /api/owner/bcp (evaluateConditionProfile) ──────────────────────

  describe("PATCH /api/owner/bcp", () => {
    it("returns 200 with re-evaluated profile", async () => {
      mockEvaluateConditionProfile.mockResolvedValueOnce({ ...PROFILE, conditionLabel: "CRITICAL" });
      const result = await bcpPatch(makePostCtx(PATCH_BODY));
      expect(result.status).toBe(200);
      expect(result.body.profile).toBeDefined();
    });

    it("passes workspaceId (WS_A) to evaluateConditionProfile", async () => {
      mockEvaluateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPatch(makePostCtx(PATCH_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockEvaluateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes workspaceId (WS_B) to evaluateConditionProfile", async () => {
      mockEvaluateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPatch(makePostCtx(PATCH_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_URL, json: async () => PATCH_BODY },
      }));
      expect(mockEvaluateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes actorId to evaluateConditionProfile", async () => {
      mockEvaluateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPatch(makePostCtx(PATCH_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockEvaluateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("passes triggerType from body to evaluateConditionProfile", async () => {
      mockEvaluateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPatch(makePostCtx({ ...PATCH_BODY, triggerType: "SHOCK_EVENT" }));
      expect(mockEvaluateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ triggerType: "SHOCK_EVENT" })
      );
    });

    it("passes triggerDescription from body to evaluateConditionProfile", async () => {
      mockEvaluateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPatch(makePostCtx(PATCH_BODY));
      expect(mockEvaluateConditionProfile).toHaveBeenCalledWith(
        expect.objectContaining({ triggerDescription: PATCH_BODY.triggerDescription })
      );
    });

    it("does not call createConditionProfile on PATCH", async () => {
      mockEvaluateConditionProfile.mockResolvedValueOnce(PROFILE);
      await bcpPatch(makePostCtx(PATCH_BODY));
      expect(mockCreateConditionProfile).not.toHaveBeenCalled();
    });
  });

  // ─── 7. Workspace isolation ───────────────────────────────────────────────────

  describe("workspace isolation", () => {
    it("GET current: two calls with different workspaceIds use respective IDs", async () => {
      mockGetCurrentConditionProfile.mockResolvedValue(PROFILE);
      await bcpGet(makeGetCtx({ businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      await bcpGet(makeGetCtx({ businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockGetCurrentConditionProfile).toHaveBeenNthCalledWith(1, { workspaceId: WS_A, businessId: BUSINESS_ID });
      expect(mockGetCurrentConditionProfile).toHaveBeenNthCalledWith(2, { workspaceId: WS_B, businessId: BUSINESS_ID });
    });

    it("POST: two calls with different actorIds use respective IDs", async () => {
      mockCreateConditionProfile.mockResolvedValue(PROFILE);
      await bcpPost(makePostCtx(CREATE_BODY, { verifiedActorId: ACTOR_A }));
      await bcpPost(makePostCtx(CREATE_BODY, { verifiedActorId: ACTOR_B, request: { url: BASE_URL, json: async () => CREATE_BODY } }));
      expect(mockCreateConditionProfile).toHaveBeenNthCalledWith(1, expect.objectContaining({ actorId: ACTOR_A }));
      expect(mockCreateConditionProfile).toHaveBeenNthCalledWith(2, expect.objectContaining({ actorId: ACTOR_B }));
    });
  });
});
