/**
 * Non-DB mock tests for four budget GET+POST routes:
 *   GET/POST /api/owner/budget/authority         — getBudgetAuthorities / changeBudgetAuthority
 *   POST     /api/owner/budget/override          — recordOwnerOverride
 *   GET/POST /api/owner/budget/archetype-metrics — listArchetypeMetrics / recordArchetypeMetric
 *   GET/POST /api/owner/budget/working-capital   — listWorkingCapitalItems / recordWorkingCapitalItem
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockGetBudgetAuthorities,
  mockChangeBudgetAuthority,
  mockRecordOwnerOverride,
  mockListArchetypeMetrics,
  mockRecordArchetypeMetric,
  mockListWorkingCapitalItems,
  mockRecordWorkingCapitalItem,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockGetBudgetAuthorities: vi.fn(),
  mockChangeBudgetAuthority: vi.fn(),
  mockRecordOwnerOverride: vi.fn(),
  mockListArchetypeMetrics: vi.fn(),
  mockRecordArchetypeMetric: vi.fn(),
  mockListWorkingCapitalItems: vi.fn(),
  mockRecordWorkingCapitalItem: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-budget/governance.service", () => ({
  getBudgetAuthorities: mockGetBudgetAuthorities,
  changeBudgetAuthority: mockChangeBudgetAuthority,
  recordOwnerOverride: mockRecordOwnerOverride,
}));

vi.mock("@/services/owner-budget/archetype-metrics.service", () => ({
  listArchetypeMetrics: mockListArchetypeMetrics,
  recordArchetypeMetric: mockRecordArchetypeMetric,
}));

vi.mock("@/services/owner-budget/working-capital.service", () => ({
  listWorkingCapitalItems: mockListWorkingCapitalItems,
  recordWorkingCapitalItem: mockRecordWorkingCapitalItem,
}));

type DeclEntry = { requireCapabilities: string[]; requireWorkspace: boolean };
const authorityGetDecl: DeclEntry[] = [];
const authorityPostDecl: DeclEntry[] = [];
const overridePostDecl: DeclEntry[] = [];
const archetypeGetDecl: DeclEntry[] = [];
const archetypePostDecl: DeclEntry[] = [];
const wCapGetDecl: DeclEntry[] = [];
const wCapPostDecl: DeclEntry[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    const decl: DeclEntry = {
      requireCapabilities: (options?.requireCapabilities as string[]) ?? [],
      requireWorkspace: (options?.requireWorkspace as boolean) ?? false,
    };
    const src = handler.toString();
    if (src.includes("getBudgetAuthorities")) authorityGetDecl.push(decl);
    else if (src.includes("changeBudgetAuthority")) authorityPostDecl.push(decl);
    else if (src.includes("recordOwnerOverride")) overridePostDecl.push(decl);
    else if (src.includes("listArchetypeMetrics")) archetypeGetDecl.push(decl);
    else if (src.includes("recordArchetypeMetric")) archetypePostDecl.push(decl);
    else if (src.includes("listWorkingCapitalItems")) wCapGetDecl.push(decl);
    else wCapPostDecl.push(decl);
    return async (testCtx: unknown) => mockWithCanonical(handler, options, testCtx);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type RawResult = Record<string, unknown>;
type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ACTOR_B = "ac000002-0000-4000-8000-000000000002";
const BUSINESS_ID = "abb00000-0000-4000-8000-000000000001";

const BASE_AUTHORITY = "https://example.com/api/owner/budget/authority";
const BASE_OVERRIDE = "https://example.com/api/owner/budget/override";
const BASE_ARCHETYPE = "https://example.com/api/owner/budget/archetype-metrics";
const BASE_WCAP = "https://example.com/api/owner/budget/working-capital";

function makeGetCtx(baseUrl: string, queryParams: Record<string, string> = {}, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v);
  return { verifiedWorkspaceId: WS_A, verifiedActorId: ACTOR_A, request: { url: url.toString() }, ...overrides };
}

function makePostCtx(baseUrl: string, body: Record<string, unknown>, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: baseUrl, json: async () => body },
    ...overrides,
  };
}

const AUTHORITY_BODY = {
  businessId: BUSINESS_ID,
  toStatus: "WATCH",
  reason: "Repeated approval violations detected in Q1 spend records.",
};

const OVERRIDE_BODY = {
  businessId: BUSINESS_ID,
  originalRecommendation: "Defer capital expenditure until Q3 cash flow stabilizes.",
  riskWarning: "Override accelerates spend during low-runway period.",
  reason: "Owner has secured bridge financing not yet captured in the system.",
  expectedConsequence: "No material cash risk given confirmed bridge financing.",
};

const ARCHETYPE_BODY = {
  businessId: BUSINESS_ID,
  archetype: "laundry",
  metricType: "linen_units_processed",
  metricDate: "2026-01-01T00:00:00.000Z",
  value: 1250,
};

const WCAP_BODY = {
  businessId: BUSINESS_ID,
  kind: "receivable",
  counterparty: "Acme Corp",
  amount: 15000,
};

const AUTHORITY_RESULT = { id: "auth-1", businessId: BUSINESS_ID, toStatus: "WATCH" };
const OVERRIDE_RESULT = { id: "ovr-1", businessId: BUSINESS_ID, reason: OVERRIDE_BODY.reason };
const ARCHETYPE_METRIC = { id: "arc-1", businessId: BUSINESS_ID, metricType: "linen_units_processed", value: 1250 };
const WCAP_ITEM = { id: "wc-1", businessId: BUSINESS_ID, kind: "receivable", amount: 15000 };

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _opts: unknown, testCtx: unknown) =>
      handler(testCtx)
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({ status, body: { error: "Insufficient capabilities" } }));
}

// ─── Import handlers after mocks ──────────────────────────────────────────────

let authorityGet: (ctx?: unknown) => Promise<RawResult>;
let authorityPost: (ctx?: unknown) => Promise<CanonicalResult>;
let overridePost: (ctx?: unknown) => Promise<CanonicalResult>;
let archetypeGet: (ctx?: unknown) => Promise<RawResult>;
let archetypePost: (ctx?: unknown) => Promise<CanonicalResult>;
let wCapGet: (ctx?: unknown) => Promise<RawResult>;
let wCapPost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const [authRoute, overrideRoute, arcRoute, wcRoute] = await Promise.all([
    import("@/app/api/owner/budget/authority/route"),
    import("@/app/api/owner/budget/override/route"),
    import("@/app/api/owner/budget/archetype-metrics/route"),
    import("@/app/api/owner/budget/working-capital/route"),
  ]);
  authorityGet = authRoute.GET as unknown as (ctx?: unknown) => Promise<RawResult>;
  authorityPost = authRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  overridePost = overrideRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  archetypeGet = arcRoute.GET as unknown as (ctx?: unknown) => Promise<RawResult>;
  archetypePost = arcRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  wCapGet = wcRoute.GET as unknown as (ctx?: unknown) => Promise<RawResult>;
  wCapPost = wcRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Budget Write Routes (authority/override/archetype-metrics/working-capital) — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("budget/authority GET: owner:view + workspace", () => {
      expect(authorityGetDecl[0]?.requireCapabilities).toContain("owner:view");
      expect(authorityGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("budget/authority POST: owner:manage + workspace", () => {
      expect(authorityPostDecl[0]?.requireCapabilities).toContain("owner:manage");
      expect(authorityPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("budget/override POST: owner:manage + workspace", () => {
      expect(overridePostDecl[0]?.requireCapabilities).toContain("owner:manage");
      expect(overridePostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("budget/archetype-metrics GET: owner:view + workspace", () => {
      expect(archetypeGetDecl[0]?.requireCapabilities).toContain("owner:view");
      expect(archetypeGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("budget/archetype-metrics POST: owner:manage + workspace", () => {
      expect(archetypePostDecl[0]?.requireCapabilities).toContain("owner:manage");
      expect(archetypePostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("budget/working-capital GET: owner:view + workspace", () => {
      expect(wCapGetDecl[0]?.requireCapabilities).toContain("owner:view");
      expect(wCapGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("budget/working-capital POST: owner:manage + workspace", () => {
      expect(wCapPostDecl[0]?.requireCapabilities).toContain("owner:manage");
      expect(wCapPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies (authority POST)", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await authorityPost(makePostCtx(BASE_AUTHORITY, AUTHORITY_BODY));
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. budget/authority GET ──────────────────────────────────────────────────

  describe("GET /api/owner/budget/authority", () => {
    it("returns error when businessId missing", async () => {
      const result = await authorityGet(makeGetCtx(BASE_AUTHORITY));
      expect(result.error).toBeDefined();
    });

    it("returns service result on success", async () => {
      mockGetBudgetAuthorities.mockResolvedValueOnce([AUTHORITY_RESULT]);
      const result = await authorityGet(makeGetCtx(BASE_AUTHORITY, { businessId: BUSINESS_ID }));
      expect(result).toEqual([AUTHORITY_RESULT]);
    });

    it("passes workspaceId (WS_A) and businessId to getBudgetAuthorities", async () => {
      mockGetBudgetAuthorities.mockResolvedValueOnce([]);
      await authorityGet(makeGetCtx(BASE_AUTHORITY, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      expect(mockGetBudgetAuthorities).toHaveBeenCalledWith(WS_A, BUSINESS_ID);
    });

    it("passes workspaceId (WS_B) to getBudgetAuthorities", async () => {
      mockGetBudgetAuthorities.mockResolvedValueOnce([]);
      await authorityGet(makeGetCtx(BASE_AUTHORITY, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockGetBudgetAuthorities).toHaveBeenCalledWith(WS_B, BUSINESS_ID);
    });
  });

  // ─── 3. budget/authority POST ─────────────────────────────────────────────────

  describe("POST /api/owner/budget/authority", () => {
    it("returns 201 with result on success", async () => {
      mockChangeBudgetAuthority.mockResolvedValueOnce(AUTHORITY_RESULT);
      const result = await authorityPost(makePostCtx(BASE_AUTHORITY, AUTHORITY_BODY));
      expect(result.status).toBe(201);
    });

    it("passes workspaceId (WS_A) to changeBudgetAuthority", async () => {
      mockChangeBudgetAuthority.mockResolvedValueOnce(AUTHORITY_RESULT);
      await authorityPost(makePostCtx(BASE_AUTHORITY, AUTHORITY_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockChangeBudgetAuthority).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), expect.anything(), WS_A
      );
    });

    it("passes workspaceId (WS_B) to changeBudgetAuthority", async () => {
      mockChangeBudgetAuthority.mockResolvedValueOnce(AUTHORITY_RESULT);
      await authorityPost(makePostCtx(BASE_AUTHORITY, AUTHORITY_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_AUTHORITY, json: async () => AUTHORITY_BODY },
      }));
      expect(mockChangeBudgetAuthority).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), expect.anything(), WS_B
      );
    });

    it("passes actorId (ACTOR_A) to changeBudgetAuthority", async () => {
      mockChangeBudgetAuthority.mockResolvedValueOnce(AUTHORITY_RESULT);
      await authorityPost(makePostCtx(BASE_AUTHORITY, AUTHORITY_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockChangeBudgetAuthority).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), ACTOR_A, expect.anything()
      );
    });

    it("passes actorId (ACTOR_B) to changeBudgetAuthority", async () => {
      mockChangeBudgetAuthority.mockResolvedValueOnce(AUTHORITY_RESULT);
      await authorityPost(makePostCtx(BASE_AUTHORITY, AUTHORITY_BODY, {
        verifiedActorId: ACTOR_B,
        request: { url: BASE_AUTHORITY, json: async () => AUTHORITY_BODY },
      }));
      expect(mockChangeBudgetAuthority).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), ACTOR_B, expect.anything()
      );
    });
  });

  // ─── 4. budget/override POST ──────────────────────────────────────────────────

  describe("POST /api/owner/budget/override", () => {
    it("returns 201 with override on success", async () => {
      mockRecordOwnerOverride.mockResolvedValueOnce(OVERRIDE_RESULT);
      const result = await overridePost(makePostCtx(BASE_OVERRIDE, OVERRIDE_BODY));
      expect(result.status).toBe(201);
    });

    it("passes workspaceId (WS_A) to recordOwnerOverride", async () => {
      mockRecordOwnerOverride.mockResolvedValueOnce(OVERRIDE_RESULT);
      await overridePost(makePostCtx(BASE_OVERRIDE, OVERRIDE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockRecordOwnerOverride).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), expect.anything(), WS_A
      );
    });

    it("passes workspaceId (WS_B) to recordOwnerOverride", async () => {
      mockRecordOwnerOverride.mockResolvedValueOnce(OVERRIDE_RESULT);
      await overridePost(makePostCtx(BASE_OVERRIDE, OVERRIDE_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_OVERRIDE, json: async () => OVERRIDE_BODY },
      }));
      expect(mockRecordOwnerOverride).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), expect.anything(), WS_B
      );
    });

    it("passes actorId to recordOwnerOverride", async () => {
      mockRecordOwnerOverride.mockResolvedValueOnce(OVERRIDE_RESULT);
      await overridePost(makePostCtx(BASE_OVERRIDE, OVERRIDE_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockRecordOwnerOverride).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), ACTOR_A, expect.anything()
      );
    });
  });

  // ─── 5. budget/archetype-metrics GET ─────────────────────────────────────────

  describe("GET /api/owner/budget/archetype-metrics", () => {
    it("returns error when businessId missing", async () => {
      const result = await archetypeGet(makeGetCtx(BASE_ARCHETYPE));
      expect(result.error).toBeDefined();
    });

    it("returns service result on success", async () => {
      mockListArchetypeMetrics.mockResolvedValueOnce([ARCHETYPE_METRIC]);
      const result = await archetypeGet(makeGetCtx(BASE_ARCHETYPE, { businessId: BUSINESS_ID }));
      expect(result).toEqual([ARCHETYPE_METRIC]);
    });

    it("passes workspaceId (WS_A) and businessId to listArchetypeMetrics", async () => {
      mockListArchetypeMetrics.mockResolvedValueOnce([]);
      await archetypeGet(makeGetCtx(BASE_ARCHETYPE, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      expect(mockListArchetypeMetrics).toHaveBeenCalledWith(WS_A, BUSINESS_ID);
    });

    it("passes workspaceId (WS_B) to listArchetypeMetrics", async () => {
      mockListArchetypeMetrics.mockResolvedValueOnce([]);
      await archetypeGet(makeGetCtx(BASE_ARCHETYPE, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockListArchetypeMetrics).toHaveBeenCalledWith(WS_B, BUSINESS_ID);
    });
  });

  // ─── 6. budget/archetype-metrics POST ────────────────────────────────────────

  describe("POST /api/owner/budget/archetype-metrics", () => {
    it("returns 201 with metric on success", async () => {
      mockRecordArchetypeMetric.mockResolvedValueOnce(ARCHETYPE_METRIC);
      const result = await archetypePost(makePostCtx(BASE_ARCHETYPE, ARCHETYPE_BODY));
      expect(result.status).toBe(201);
    });

    it("passes workspaceId (WS_A) to recordArchetypeMetric", async () => {
      mockRecordArchetypeMetric.mockResolvedValueOnce(ARCHETYPE_METRIC);
      await archetypePost(makePostCtx(BASE_ARCHETYPE, ARCHETYPE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockRecordArchetypeMetric).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), expect.anything(), WS_A
      );
    });

    it("passes workspaceId (WS_B) to recordArchetypeMetric", async () => {
      mockRecordArchetypeMetric.mockResolvedValueOnce(ARCHETYPE_METRIC);
      await archetypePost(makePostCtx(BASE_ARCHETYPE, ARCHETYPE_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_ARCHETYPE, json: async () => ARCHETYPE_BODY },
      }));
      expect(mockRecordArchetypeMetric).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), expect.anything(), WS_B
      );
    });

    it("passes actorId to recordArchetypeMetric", async () => {
      mockRecordArchetypeMetric.mockResolvedValueOnce(ARCHETYPE_METRIC);
      await archetypePost(makePostCtx(BASE_ARCHETYPE, ARCHETYPE_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockRecordArchetypeMetric).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), ACTOR_A, expect.anything()
      );
    });

    it("does not call listArchetypeMetrics on POST", async () => {
      mockRecordArchetypeMetric.mockResolvedValueOnce(ARCHETYPE_METRIC);
      await archetypePost(makePostCtx(BASE_ARCHETYPE, ARCHETYPE_BODY));
      expect(mockListArchetypeMetrics).not.toHaveBeenCalled();
    });
  });

  // ─── 7. budget/working-capital GET ───────────────────────────────────────────

  describe("GET /api/owner/budget/working-capital", () => {
    it("returns error when businessId missing", async () => {
      const result = await wCapGet(makeGetCtx(BASE_WCAP));
      expect(result.error).toBeDefined();
    });

    it("returns service result on success", async () => {
      mockListWorkingCapitalItems.mockResolvedValueOnce([WCAP_ITEM]);
      const result = await wCapGet(makeGetCtx(BASE_WCAP, { businessId: BUSINESS_ID }));
      expect(result).toEqual([WCAP_ITEM]);
    });

    it("passes workspaceId (WS_A) and businessId to listWorkingCapitalItems", async () => {
      mockListWorkingCapitalItems.mockResolvedValueOnce([]);
      await wCapGet(makeGetCtx(BASE_WCAP, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      expect(mockListWorkingCapitalItems).toHaveBeenCalledWith(WS_A, BUSINESS_ID);
    });

    it("passes workspaceId (WS_B) to listWorkingCapitalItems", async () => {
      mockListWorkingCapitalItems.mockResolvedValueOnce([]);
      await wCapGet(makeGetCtx(BASE_WCAP, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockListWorkingCapitalItems).toHaveBeenCalledWith(WS_B, BUSINESS_ID);
    });
  });

  // ─── 8. budget/working-capital POST ──────────────────────────────────────────

  describe("POST /api/owner/budget/working-capital", () => {
    it("returns 201 with item on success", async () => {
      mockRecordWorkingCapitalItem.mockResolvedValueOnce(WCAP_ITEM);
      const result = await wCapPost(makePostCtx(BASE_WCAP, WCAP_BODY));
      expect(result.status).toBe(201);
    });

    it("passes workspaceId (WS_A) to recordWorkingCapitalItem", async () => {
      mockRecordWorkingCapitalItem.mockResolvedValueOnce(WCAP_ITEM);
      await wCapPost(makePostCtx(BASE_WCAP, WCAP_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockRecordWorkingCapitalItem).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), expect.anything(), WS_A
      );
    });

    it("passes workspaceId (WS_B) to recordWorkingCapitalItem", async () => {
      mockRecordWorkingCapitalItem.mockResolvedValueOnce(WCAP_ITEM);
      await wCapPost(makePostCtx(BASE_WCAP, WCAP_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_WCAP, json: async () => WCAP_BODY },
      }));
      expect(mockRecordWorkingCapitalItem).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), expect.anything(), WS_B
      );
    });

    it("passes actorId to recordWorkingCapitalItem", async () => {
      mockRecordWorkingCapitalItem.mockResolvedValueOnce(WCAP_ITEM);
      await wCapPost(makePostCtx(BASE_WCAP, WCAP_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockRecordWorkingCapitalItem).toHaveBeenCalledWith(
        BUSINESS_ID, expect.anything(), ACTOR_A, expect.anything()
      );
    });

    it("does not call listWorkingCapitalItems on POST", async () => {
      mockRecordWorkingCapitalItem.mockResolvedValueOnce(WCAP_ITEM);
      await wCapPost(makePostCtx(BASE_WCAP, WCAP_BODY));
      expect(mockListWorkingCapitalItems).not.toHaveBeenCalled();
    });

    it("workspace isolation: two POST calls use respective workspaceIds", async () => {
      mockRecordWorkingCapitalItem.mockResolvedValue(WCAP_ITEM);
      await wCapPost(makePostCtx(BASE_WCAP, WCAP_BODY, { verifiedWorkspaceId: WS_A }));
      await wCapPost(makePostCtx(BASE_WCAP, WCAP_BODY, { verifiedWorkspaceId: WS_B, request: { url: BASE_WCAP, json: async () => WCAP_BODY } }));
      expect(mockRecordWorkingCapitalItem).toHaveBeenNthCalledWith(1, BUSINESS_ID, expect.anything(), expect.anything(), WS_A);
      expect(mockRecordWorkingCapitalItem).toHaveBeenNthCalledWith(2, BUSINESS_ID, expect.anything(), expect.anything(), WS_B);
    });
  });
});
