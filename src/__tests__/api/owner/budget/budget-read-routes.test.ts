/**
 * Non-DB mock tests for the four simple read-only budget GET routes:
 *   GET /api/owner/budget/actions?businessId=...   — listBudgetActions
 *   GET /api/owner/budget/forecast?businessId=...  — getBudgetForecast
 *   GET /api/owner/budget/guidance?businessId=...  — getBudgetGuidance
 *   GET /api/owner/budget/snapshots?businessId=... — listBudgetSnapshots
 *
 * These routes return the service result directly (no canonicalJson wrapper),
 * so tests assert on the raw result object.
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockListBudgetActions,
  mockGetBudgetForecast,
  mockGetBudgetGuidance,
  mockListBudgetSnapshots,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockListBudgetActions: vi.fn(),
  mockGetBudgetForecast: vi.fn(),
  mockGetBudgetGuidance: vi.fn(),
  mockListBudgetSnapshots: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-budget/action-link.service", () => ({
  listBudgetActions: mockListBudgetActions,
}));

vi.mock("@/services/owner-budget/budget.service", () => ({
  getBudgetForecast: mockGetBudgetForecast,
  getBudgetGuidance: mockGetBudgetGuidance,
  listBudgetSnapshots: mockListBudgetSnapshots,
}));

const capturedActionsDecl: Record<string, unknown>[] = [];
const capturedForecastDecl: Record<string, unknown>[] = [];
const capturedGuidanceDecl: Record<string, unknown>[] = [];
const capturedSnapshotsDecl: Record<string, unknown>[] = [];

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
    if (src.includes("listBudgetActions")) {
      capturedActionsDecl.push(decl);
    } else if (src.includes("getBudgetForecast")) {
      capturedForecastDecl.push(decl);
    } else if (src.includes("getBudgetGuidance")) {
      capturedGuidanceDecl.push(decl);
    } else {
      capturedSnapshotsDecl.push(decl);
    }
    return async (testCtx: unknown) => mockWithCanonical(handler, options, testCtx);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type RawResult = Record<string, unknown>;

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const BUSINESS_ID = "aba00000-0000-4000-8000-000000000001";

const BASE_ACTIONS = "https://example.com/api/owner/budget/actions";
const BASE_FORECAST = "https://example.com/api/owner/budget/forecast";
const BASE_GUIDANCE = "https://example.com/api/owner/budget/guidance";
const BASE_SNAPSHOTS = "https://example.com/api/owner/budget/snapshots";

function makeCtx(baseUrl: string, queryParams: Record<string, string> = {}, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: "ac000001-0000-4000-8000-000000000001",
    request: { url: url.toString() },
    ...overrides,
  };
}

const FORECAST_RESULT = { weeks: [{ week: 1, base: 50000, downside: 40000, cashStress: 30000 }] };
const GUIDANCE_RESULT = { mode: "TIGHT_CASH", nextBestAction: "Cut discretionary spend", confidence: 0.82 };
const SNAPSHOTS_RESULT = [{ id: "snap-1", version: 1, createdAt: "2026-01-01T00:00:00.000Z" }];
const ACTIONS_RESULT = [{ id: "act-1", type: "reduce_spend", status: "PENDING" }];

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

let actionsGet: (ctx?: unknown) => Promise<RawResult>;
let forecastGet: (ctx?: unknown) => Promise<RawResult>;
let guidanceGet: (ctx?: unknown) => Promise<RawResult>;
let snapshotsGet: (ctx?: unknown) => Promise<RawResult>;

beforeAll(async () => {
  allowAll();
  const [actionsRoute, forecastRoute, guidanceRoute, snapshotsRoute] = await Promise.all([
    import("@/app/api/owner/budget/actions/route"),
    import("@/app/api/owner/budget/forecast/route"),
    import("@/app/api/owner/budget/guidance/route"),
    import("@/app/api/owner/budget/snapshots/route"),
  ]);
  actionsGet = actionsRoute.GET as unknown as (ctx?: unknown) => Promise<RawResult>;
  forecastGet = forecastRoute.GET as unknown as (ctx?: unknown) => Promise<RawResult>;
  guidanceGet = guidanceRoute.GET as unknown as (ctx?: unknown) => Promise<RawResult>;
  snapshotsGet = snapshotsRoute.GET as unknown as (ctx?: unknown) => Promise<RawResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Budget Read Routes (actions/forecast/guidance/snapshots) — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("budget/actions is guarded by owner:view with workspace", () => {
      expect(capturedActionsDecl[0]?.requireCapabilities).toContain("owner:view");
      expect(capturedActionsDecl[0]?.requireWorkspace).toBe(true);
    });

    it("budget/forecast is guarded by owner:view with workspace", () => {
      expect(capturedForecastDecl[0]?.requireCapabilities).toContain("owner:view");
      expect(capturedForecastDecl[0]?.requireWorkspace).toBe(true);
    });

    it("budget/guidance is guarded by owner:view with workspace", () => {
      expect(capturedGuidanceDecl[0]?.requireCapabilities).toContain("owner:view");
      expect(capturedGuidanceDecl[0]?.requireWorkspace).toBe(true);
    });

    it("budget/snapshots is guarded by owner:view with workspace", () => {
      expect(capturedSnapshotsDecl[0]?.requireCapabilities).toContain("owner:view");
      expect(capturedSnapshotsDecl[0]?.requireWorkspace).toBe(true);
    });

    it("returns enforcement error when enforcement denies (forecast)", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await forecastGet(makeCtx(BASE_FORECAST, { businessId: BUSINESS_ID }));
      expect((result as { status: number }).status).toBe(403);
    });
  });

  // ─── 2. Missing businessId → inline error ────────────────────────────────────

  describe("missing businessId guard", () => {
    it("budget/actions returns error when businessId missing", async () => {
      const result = await actionsGet(makeCtx(BASE_ACTIONS));
      expect(result.error).toBeDefined();
    });

    it("budget/forecast returns error when businessId missing", async () => {
      const result = await forecastGet(makeCtx(BASE_FORECAST));
      expect(result.error).toBeDefined();
    });

    it("budget/guidance returns error when businessId missing", async () => {
      const result = await guidanceGet(makeCtx(BASE_GUIDANCE));
      expect(result.error).toBeDefined();
    });

    it("budget/snapshots returns error when businessId missing", async () => {
      const result = await snapshotsGet(makeCtx(BASE_SNAPSHOTS));
      expect(result.error).toBeDefined();
    });
  });

  // ─── 3. budget/actions ───────────────────────────────────────────────────────

  describe("GET /api/owner/budget/actions", () => {
    it("returns service result on success", async () => {
      mockListBudgetActions.mockResolvedValueOnce(ACTIONS_RESULT);
      const result = await actionsGet(makeCtx(BASE_ACTIONS, { businessId: BUSINESS_ID }));
      expect(result).toEqual(ACTIONS_RESULT);
    });

    it("passes workspaceId (WS_A) and businessId to listBudgetActions", async () => {
      mockListBudgetActions.mockResolvedValueOnce(ACTIONS_RESULT);
      await actionsGet(makeCtx(BASE_ACTIONS, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      expect(mockListBudgetActions).toHaveBeenCalledWith(WS_A, BUSINESS_ID);
    });

    it("passes workspaceId (WS_B) to listBudgetActions", async () => {
      mockListBudgetActions.mockResolvedValueOnce(ACTIONS_RESULT);
      await actionsGet(makeCtx(BASE_ACTIONS, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockListBudgetActions).toHaveBeenCalledWith(WS_B, BUSINESS_ID);
    });

    it("calls listBudgetActions exactly once", async () => {
      mockListBudgetActions.mockResolvedValueOnce(ACTIONS_RESULT);
      await actionsGet(makeCtx(BASE_ACTIONS, { businessId: BUSINESS_ID }));
      expect(mockListBudgetActions).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 4. budget/forecast ──────────────────────────────────────────────────────

  describe("GET /api/owner/budget/forecast", () => {
    it("returns service result on success", async () => {
      mockGetBudgetForecast.mockResolvedValueOnce(FORECAST_RESULT);
      const result = await forecastGet(makeCtx(BASE_FORECAST, { businessId: BUSINESS_ID }));
      expect(result).toEqual(FORECAST_RESULT);
    });

    it("passes workspaceId (WS_A) and businessId to getBudgetForecast", async () => {
      mockGetBudgetForecast.mockResolvedValueOnce(FORECAST_RESULT);
      await forecastGet(makeCtx(BASE_FORECAST, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      expect(mockGetBudgetForecast).toHaveBeenCalledWith(WS_A, BUSINESS_ID);
    });

    it("passes workspaceId (WS_B) to getBudgetForecast", async () => {
      mockGetBudgetForecast.mockResolvedValueOnce(FORECAST_RESULT);
      await forecastGet(makeCtx(BASE_FORECAST, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockGetBudgetForecast).toHaveBeenCalledWith(WS_B, BUSINESS_ID);
    });

    it("workspace isolation: two calls use respective workspaceIds", async () => {
      mockGetBudgetForecast.mockResolvedValue(FORECAST_RESULT);
      await forecastGet(makeCtx(BASE_FORECAST, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      await forecastGet(makeCtx(BASE_FORECAST, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockGetBudgetForecast).toHaveBeenNthCalledWith(1, WS_A, BUSINESS_ID);
      expect(mockGetBudgetForecast).toHaveBeenNthCalledWith(2, WS_B, BUSINESS_ID);
    });
  });

  // ─── 5. budget/guidance ──────────────────────────────────────────────────────

  describe("GET /api/owner/budget/guidance", () => {
    it("returns service result on success", async () => {
      mockGetBudgetGuidance.mockResolvedValueOnce(GUIDANCE_RESULT);
      const result = await guidanceGet(makeCtx(BASE_GUIDANCE, { businessId: BUSINESS_ID }));
      expect(result).toEqual(GUIDANCE_RESULT);
    });

    it("passes workspaceId (WS_A) and businessId to getBudgetGuidance", async () => {
      mockGetBudgetGuidance.mockResolvedValueOnce(GUIDANCE_RESULT);
      await guidanceGet(makeCtx(BASE_GUIDANCE, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      expect(mockGetBudgetGuidance).toHaveBeenCalledWith(WS_A, BUSINESS_ID);
    });

    it("passes workspaceId (WS_B) to getBudgetGuidance", async () => {
      mockGetBudgetGuidance.mockResolvedValueOnce(GUIDANCE_RESULT);
      await guidanceGet(makeCtx(BASE_GUIDANCE, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockGetBudgetGuidance).toHaveBeenCalledWith(WS_B, BUSINESS_ID);
    });

    it("does not call forecast or snapshots services for guidance", async () => {
      mockGetBudgetGuidance.mockResolvedValueOnce(GUIDANCE_RESULT);
      await guidanceGet(makeCtx(BASE_GUIDANCE, { businessId: BUSINESS_ID }));
      expect(mockGetBudgetForecast).not.toHaveBeenCalled();
      expect(mockListBudgetSnapshots).not.toHaveBeenCalled();
    });
  });

  // ─── 6. budget/snapshots ─────────────────────────────────────────────────────

  describe("GET /api/owner/budget/snapshots", () => {
    it("returns service result on success", async () => {
      mockListBudgetSnapshots.mockResolvedValueOnce(SNAPSHOTS_RESULT);
      const result = await snapshotsGet(makeCtx(BASE_SNAPSHOTS, { businessId: BUSINESS_ID }));
      expect(result).toEqual(SNAPSHOTS_RESULT);
    });

    it("passes workspaceId (WS_A) and businessId to listBudgetSnapshots", async () => {
      mockListBudgetSnapshots.mockResolvedValueOnce(SNAPSHOTS_RESULT);
      await snapshotsGet(makeCtx(BASE_SNAPSHOTS, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      expect(mockListBudgetSnapshots).toHaveBeenCalledWith(WS_A, BUSINESS_ID);
    });

    it("passes workspaceId (WS_B) to listBudgetSnapshots", async () => {
      mockListBudgetSnapshots.mockResolvedValueOnce(SNAPSHOTS_RESULT);
      await snapshotsGet(makeCtx(BASE_SNAPSHOTS, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockListBudgetSnapshots).toHaveBeenCalledWith(WS_B, BUSINESS_ID);
    });

    it("does not call forecast or guidance services for snapshots", async () => {
      mockListBudgetSnapshots.mockResolvedValueOnce(SNAPSHOTS_RESULT);
      await snapshotsGet(makeCtx(BASE_SNAPSHOTS, { businessId: BUSINESS_ID }));
      expect(mockGetBudgetForecast).not.toHaveBeenCalled();
      expect(mockGetBudgetGuidance).not.toHaveBeenCalled();
    });

    it("workspace isolation: two calls use respective workspaceIds", async () => {
      mockListBudgetSnapshots.mockResolvedValue(SNAPSHOTS_RESULT);
      await snapshotsGet(makeCtx(BASE_SNAPSHOTS, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_A }));
      await snapshotsGet(makeCtx(BASE_SNAPSHOTS, { businessId: BUSINESS_ID }, { verifiedWorkspaceId: WS_B }));
      expect(mockListBudgetSnapshots).toHaveBeenNthCalledWith(1, WS_A, BUSINESS_ID);
      expect(mockListBudgetSnapshots).toHaveBeenNthCalledWith(2, WS_B, BUSINESS_ID);
    });
  });
});
