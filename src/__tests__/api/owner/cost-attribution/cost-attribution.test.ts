/**
 * Non-DB mock tests for:
 *   GET  /api/owner/cost-intelligence               — buildWorkspaceCostIntelligence
 *   POST /api/owner/cost-attribution (ATTRIBUTE_BUDGET_LINE)
 *   POST /api/owner/cost-attribution (ATTRIBUTE_SPEND_ENTRY)
 *   POST /api/owner/cost-attribution (REMOVE_ATTRIBUTION)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockAttributeBudgetLine,
  mockAttributeSpendEntry,
  mockRemoveAttribution,
  mockBuildIntelligence,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockAttributeBudgetLine: vi.fn(),
  mockAttributeSpendEntry: vi.fn(),
  mockRemoveAttribution: vi.fn(),
  mockBuildIntelligence: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/cost-attribution.service", () => ({
  attributeBudgetLineToObjective: mockAttributeBudgetLine,
  attributeSpendEntryToObjective: mockAttributeSpendEntry,
  removeObjectiveAttribution: mockRemoveAttribution,
  buildWorkspaceCostIntelligence: mockBuildIntelligence,
}));

const capturedGetDeclarations: Record<string, unknown>[] = [];
const capturedPostDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    const decl = {
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    };
    // GET (cost-intelligence) handler references buildWorkspaceCostIntelligence
    if (handler.toString().includes("buildWorkspaceCostIntelligence")) {
      capturedGetDeclarations.push(decl);
    } else {
      capturedPostDeclarations.push(decl);
    }
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ACTOR_B = "ac000002-0000-4000-8000-000000000002";
const ENTITY_ID = "ab700000-0000-4000-8000-000000000001";
const OBJ_ID = "ab700000-0000-4000-8000-000000000002";

const BASE_URL = "https://example.com/api/owner/cost-attribution";

function makeGetCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
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

const INTELLIGENCE = {
  burnRate: 12500,
  categoryBreakdown: { ops: 8000, sales: 4500 },
  attributedAmount: 10000,
  unattributedAmount: 2500,
};

const UPDATED_BUDGET_LINE = { id: ENTITY_ID, linkedObjectiveId: OBJ_ID };
const UPDATED_SPEND_ENTRY = { id: ENTITY_ID, linkedObjectiveId: OBJ_ID };

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (
      handler: (ctx: unknown) => Promise<unknown>,
      _options: unknown,
      testCtx: unknown
    ) => {
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

let costIntelligenceGet: (ctx?: unknown) => Promise<CanonicalResult>;
let costAttributionPost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const intelligenceRoute = await import("@/app/api/owner/cost-intelligence/route");
  const attributionRoute = await import("@/app/api/owner/cost-attribution/route");
  costIntelligenceGet = intelligenceRoute.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  costAttributionPost = attributionRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Cost Intelligence + Cost Attribution Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET (cost-intelligence) is guarded by owner:manage", () => {
      const decl = capturedGetDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("GET (cost-intelligence) requires workspace enforcement", () => {
      const decl = capturedGetDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("POST (cost-attribution) is guarded by owner:manage", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("POST (cost-attribution) requires workspace enforcement", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("GET returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await costIntelligenceGet(makeGetCtx());
      expect(result.status).toBe(403);
    });

    it("POST returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await costAttributionPost(
        makePostCtx({ action: "ATTRIBUTE_BUDGET_LINE", entityId: ENTITY_ID, objectiveId: OBJ_ID })
      );
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/owner/cost-intelligence ─────────────────────────────────────

  describe("GET /api/owner/cost-intelligence", () => {
    it("returns 200 with intelligence on success", async () => {
      mockBuildIntelligence.mockResolvedValueOnce(INTELLIGENCE);
      const result = await costIntelligenceGet(makeGetCtx());
      expect(result.status).toBe(200);
      expect(result.body.intelligence).toBeDefined();
    });

    it("passes workspaceId (WS_A) to buildWorkspaceCostIntelligence", async () => {
      mockBuildIntelligence.mockResolvedValueOnce(INTELLIGENCE);
      await costIntelligenceGet(makeGetCtx({ verifiedWorkspaceId: WS_A }));
      expect(mockBuildIntelligence).toHaveBeenCalledWith(WS_A);
    });

    it("passes workspaceId (WS_B) to buildWorkspaceCostIntelligence", async () => {
      mockBuildIntelligence.mockResolvedValueOnce(INTELLIGENCE);
      await costIntelligenceGet(makeGetCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockBuildIntelligence).toHaveBeenCalledWith(WS_B);
    });

    it("calls buildWorkspaceCostIntelligence exactly once", async () => {
      mockBuildIntelligence.mockResolvedValueOnce(INTELLIGENCE);
      await costIntelligenceGet(makeGetCtx());
      expect(mockBuildIntelligence).toHaveBeenCalledTimes(1);
    });

    it("does not call attribution services on GET", async () => {
      mockBuildIntelligence.mockResolvedValueOnce(INTELLIGENCE);
      await costIntelligenceGet(makeGetCtx());
      expect(mockAttributeBudgetLine).not.toHaveBeenCalled();
      expect(mockAttributeSpendEntry).not.toHaveBeenCalled();
      expect(mockRemoveAttribution).not.toHaveBeenCalled();
    });

    it("workspace isolation: two calls use respective workspaceIds", async () => {
      mockBuildIntelligence.mockResolvedValueOnce(INTELLIGENCE).mockResolvedValueOnce({ ...INTELLIGENCE, burnRate: 5000 });
      await costIntelligenceGet(makeGetCtx({ verifiedWorkspaceId: WS_A }));
      await costIntelligenceGet(makeGetCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockBuildIntelligence).toHaveBeenNthCalledWith(1, WS_A);
      expect(mockBuildIntelligence).toHaveBeenNthCalledWith(2, WS_B);
    });
  });

  // ─── 3. POST /api/owner/cost-attribution — ATTRIBUTE_BUDGET_LINE ──────────────

  describe("POST /api/owner/cost-attribution (ATTRIBUTE_BUDGET_LINE)", () => {
    const BUDGET_BODY = {
      action: "ATTRIBUTE_BUDGET_LINE",
      entityId: ENTITY_ID,
      objectiveId: OBJ_ID,
    };

    it("returns 200 with updated on success", async () => {
      mockAttributeBudgetLine.mockResolvedValueOnce(UPDATED_BUDGET_LINE);
      const result = await costAttributionPost(makePostCtx(BUDGET_BODY));
      expect(result.status).toBe(200);
      expect(result.body.updated).toBeDefined();
    });

    it("passes workspaceId (WS_A) to attributeBudgetLineToObjective", async () => {
      mockAttributeBudgetLine.mockResolvedValueOnce(UPDATED_BUDGET_LINE);
      await costAttributionPost(makePostCtx(BUDGET_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockAttributeBudgetLine).toHaveBeenCalledWith(WS_A, expect.anything(), ENTITY_ID, OBJ_ID);
    });

    it("passes workspaceId (WS_B) to attributeBudgetLineToObjective", async () => {
      mockAttributeBudgetLine.mockResolvedValueOnce(UPDATED_BUDGET_LINE);
      await costAttributionPost(makePostCtx(BUDGET_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_URL, json: async () => BUDGET_BODY },
      }));
      expect(mockAttributeBudgetLine).toHaveBeenCalledWith(WS_B, expect.anything(), ENTITY_ID, OBJ_ID);
    });

    it("passes actorId (ACTOR_A) to attributeBudgetLineToObjective", async () => {
      mockAttributeBudgetLine.mockResolvedValueOnce(UPDATED_BUDGET_LINE);
      await costAttributionPost(makePostCtx(BUDGET_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockAttributeBudgetLine).toHaveBeenCalledWith(expect.anything(), ACTOR_A, ENTITY_ID, OBJ_ID);
    });

    it("passes actorId (ACTOR_B) to attributeBudgetLineToObjective", async () => {
      mockAttributeBudgetLine.mockResolvedValueOnce(UPDATED_BUDGET_LINE);
      await costAttributionPost(makePostCtx(BUDGET_BODY, {
        verifiedActorId: ACTOR_B,
        request: { url: BASE_URL, json: async () => BUDGET_BODY },
      }));
      expect(mockAttributeBudgetLine).toHaveBeenCalledWith(expect.anything(), ACTOR_B, ENTITY_ID, OBJ_ID);
    });

    it("returns 400 when objectiveId is missing for ATTRIBUTE_BUDGET_LINE", async () => {
      const result = await costAttributionPost(
        makePostCtx({ action: "ATTRIBUTE_BUDGET_LINE", entityId: ENTITY_ID })
      );
      expect(result.status).toBe(400);
    });

    it("does not call spend-entry or remove services for ATTRIBUTE_BUDGET_LINE", async () => {
      mockAttributeBudgetLine.mockResolvedValueOnce(UPDATED_BUDGET_LINE);
      await costAttributionPost(makePostCtx(BUDGET_BODY));
      expect(mockAttributeSpendEntry).not.toHaveBeenCalled();
      expect(mockRemoveAttribution).not.toHaveBeenCalled();
    });
  });

  // ─── 4. POST /api/owner/cost-attribution — ATTRIBUTE_SPEND_ENTRY ─────────────

  describe("POST /api/owner/cost-attribution (ATTRIBUTE_SPEND_ENTRY)", () => {
    const SPEND_BODY = {
      action: "ATTRIBUTE_SPEND_ENTRY",
      entityId: ENTITY_ID,
      objectiveId: OBJ_ID,
    };

    it("returns 200 with updated on success", async () => {
      mockAttributeSpendEntry.mockResolvedValueOnce(UPDATED_SPEND_ENTRY);
      const result = await costAttributionPost(makePostCtx(SPEND_BODY));
      expect(result.status).toBe(200);
      expect(result.body.updated).toBeDefined();
    });

    it("passes workspaceId (WS_A) to attributeSpendEntryToObjective", async () => {
      mockAttributeSpendEntry.mockResolvedValueOnce(UPDATED_SPEND_ENTRY);
      await costAttributionPost(makePostCtx(SPEND_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockAttributeSpendEntry).toHaveBeenCalledWith(WS_A, expect.anything(), ENTITY_ID, OBJ_ID);
    });

    it("passes actorId to attributeSpendEntryToObjective", async () => {
      mockAttributeSpendEntry.mockResolvedValueOnce(UPDATED_SPEND_ENTRY);
      await costAttributionPost(makePostCtx(SPEND_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockAttributeSpendEntry).toHaveBeenCalledWith(expect.anything(), ACTOR_A, ENTITY_ID, OBJ_ID);
    });

    it("returns 400 when objectiveId is missing for ATTRIBUTE_SPEND_ENTRY", async () => {
      const result = await costAttributionPost(
        makePostCtx({ action: "ATTRIBUTE_SPEND_ENTRY", entityId: ENTITY_ID })
      );
      expect(result.status).toBe(400);
    });

    it("does not call budget-line or remove services for ATTRIBUTE_SPEND_ENTRY", async () => {
      mockAttributeSpendEntry.mockResolvedValueOnce(UPDATED_SPEND_ENTRY);
      await costAttributionPost(makePostCtx(SPEND_BODY));
      expect(mockAttributeBudgetLine).not.toHaveBeenCalled();
      expect(mockRemoveAttribution).not.toHaveBeenCalled();
    });
  });

  // ─── 5. POST /api/owner/cost-attribution — REMOVE_ATTRIBUTION ────────────────

  describe("POST /api/owner/cost-attribution (REMOVE_ATTRIBUTION)", () => {
    const REMOVE_BODY = {
      action: "REMOVE_ATTRIBUTION",
      entityType: "BudgetLine",
      entityId: ENTITY_ID,
    };

    it("returns 200 with ok:true on success", async () => {
      mockRemoveAttribution.mockResolvedValueOnce(undefined);
      const result = await costAttributionPost(makePostCtx(REMOVE_BODY));
      expect(result.status).toBe(200);
      expect(result.body.ok).toBe(true);
    });

    it("passes workspaceId (WS_A) to removeObjectiveAttribution", async () => {
      mockRemoveAttribution.mockResolvedValueOnce(undefined);
      await costAttributionPost(makePostCtx(REMOVE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockRemoveAttribution).toHaveBeenCalledWith(WS_A, expect.anything(), "BudgetLine", ENTITY_ID);
    });

    it("passes workspaceId (WS_B) to removeObjectiveAttribution", async () => {
      mockRemoveAttribution.mockResolvedValueOnce(undefined);
      await costAttributionPost(makePostCtx(REMOVE_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_URL, json: async () => REMOVE_BODY },
      }));
      expect(mockRemoveAttribution).toHaveBeenCalledWith(WS_B, expect.anything(), "BudgetLine", ENTITY_ID);
    });

    it("passes actorId to removeObjectiveAttribution", async () => {
      mockRemoveAttribution.mockResolvedValueOnce(undefined);
      await costAttributionPost(makePostCtx(REMOVE_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockRemoveAttribution).toHaveBeenCalledWith(expect.anything(), ACTOR_A, "BudgetLine", ENTITY_ID);
    });

    it("accepts SpendEntry as entityType", async () => {
      const body = { ...REMOVE_BODY, entityType: "SpendEntry" };
      mockRemoveAttribution.mockResolvedValueOnce(undefined);
      const result = await costAttributionPost(makePostCtx(body));
      expect(result.status).toBe(200);
      expect(mockRemoveAttribution).toHaveBeenCalledWith(expect.anything(), expect.anything(), "SpendEntry", ENTITY_ID);
    });

    it("returns 400 when entityType is missing for REMOVE_ATTRIBUTION", async () => {
      const body = { action: "REMOVE_ATTRIBUTION", entityId: ENTITY_ID };
      const result = await costAttributionPost(makePostCtx(body));
      expect(result.status).toBe(400);
    });

    it("does not call attribution services for REMOVE_ATTRIBUTION", async () => {
      mockRemoveAttribution.mockResolvedValueOnce(undefined);
      await costAttributionPost(makePostCtx(REMOVE_BODY));
      expect(mockAttributeBudgetLine).not.toHaveBeenCalled();
      expect(mockAttributeSpendEntry).not.toHaveBeenCalled();
    });
  });

  // ─── 6. Workspace + actor isolation ──────────────────────────────────────────

  describe("workspace and actor isolation", () => {
    it("POST: two ATTRIBUTE_BUDGET_LINE calls use respective workspaceIds", async () => {
      const body = { action: "ATTRIBUTE_BUDGET_LINE", entityId: ENTITY_ID, objectiveId: OBJ_ID };
      mockAttributeBudgetLine.mockResolvedValueOnce(UPDATED_BUDGET_LINE).mockResolvedValueOnce(UPDATED_BUDGET_LINE);
      await costAttributionPost(makePostCtx(body, { verifiedWorkspaceId: WS_A }));
      await costAttributionPost(makePostCtx(body, { verifiedWorkspaceId: WS_B, request: { url: BASE_URL, json: async () => body } }));
      expect(mockAttributeBudgetLine).toHaveBeenNthCalledWith(1, WS_A, expect.anything(), ENTITY_ID, OBJ_ID);
      expect(mockAttributeBudgetLine).toHaveBeenNthCalledWith(2, WS_B, expect.anything(), ENTITY_ID, OBJ_ID);
    });

    it("POST: two ATTRIBUTE_BUDGET_LINE calls use respective actorIds", async () => {
      const body = { action: "ATTRIBUTE_BUDGET_LINE", entityId: ENTITY_ID, objectiveId: OBJ_ID };
      mockAttributeBudgetLine.mockResolvedValueOnce(UPDATED_BUDGET_LINE).mockResolvedValueOnce(UPDATED_BUDGET_LINE);
      await costAttributionPost(makePostCtx(body, { verifiedActorId: ACTOR_A }));
      await costAttributionPost(makePostCtx(body, { verifiedActorId: ACTOR_B, request: { url: BASE_URL, json: async () => body } }));
      expect(mockAttributeBudgetLine).toHaveBeenNthCalledWith(1, expect.anything(), ACTOR_A, ENTITY_ID, OBJ_ID);
      expect(mockAttributeBudgetLine).toHaveBeenNthCalledWith(2, expect.anything(), ACTOR_B, ENTITY_ID, OBJ_ID);
    });
  });
});
