/**
 * Non-DB mock tests for:
 *   GET   /api/owner/alerts               — getAlerts + getUnreadAlertCount
 *   POST  /api/owner/alerts               — createAlert
 *   PATCH /api/owner/alerts/[id]/read     — markAlertAsRead
 *   PATCH /api/owner/alerts/[id]/resolve  — resolveAlert
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Dynamic routes ([id]) receive params as the second argument to the handler.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockGetAlerts,
  mockGetUnreadAlertCount,
  mockCreateAlert,
  mockMarkAlertAsRead,
  mockResolveAlert,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockGetAlerts: vi.fn(),
  mockGetUnreadAlertCount: vi.fn(),
  mockCreateAlert: vi.fn(),
  mockMarkAlertAsRead: vi.fn(),
  mockResolveAlert: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/alerts/alert-service", () => ({
  getAlerts: mockGetAlerts,
  getUnreadAlertCount: mockGetUnreadAlertCount,
  createAlert: mockCreateAlert,
  markAlertAsRead: mockMarkAlertAsRead,
  resolveAlert: mockResolveAlert,
}));

const capturedListDeclarations: Record<string, unknown>[] = [];
const capturedCreateDeclarations: Record<string, unknown>[] = [];
const capturedReadDeclarations: Record<string, unknown>[] = [];
const capturedResolveDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params?: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    const decl = {
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    };
    const src = handler.toString();
    if (src.includes("getAlerts")) {
      capturedListDeclarations.push(decl);
    } else if (src.includes("createAlert")) {
      capturedCreateDeclarations.push(decl);
    } else if (src.includes("markAlertAsRead")) {
      capturedReadDeclarations.push(decl);
    } else {
      capturedResolveDeclarations.push(decl);
    }
    return async (testCtx: unknown, testParams?: unknown) => {
      return mockWithCanonical(handler, options, testCtx, testParams);
    };
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ACTOR_B = "ac000002-0000-4000-8000-000000000002";
const ALERT_ID = "ab800000-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/alerts";

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

function makePatchCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    ...overrides,
  };
}

const ALERT = {
  id: ALERT_ID,
  workspaceId: WS_A,
  userId: ACTOR_A,
  type: "blocked",
  channel: "in_app",
  message: "Critical block detected",
  severity: "high",
  isRead: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const CREATE_BODY = {
  type: "blocked",
  message: "Owner bottleneck blocking three dependent actions.",
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll(params: Record<string, string> = {}) {
  mockWithCanonical.mockImplementation(
    async (
      handler: (ctx: unknown, params?: unknown) => Promise<unknown>,
      _options: unknown,
      testCtx: unknown,
      testParams: unknown
    ) => {
      return handler(testCtx, testParams ?? params);
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

let alertsGet: (ctx?: unknown) => Promise<CanonicalResult>;
let alertsPost: (ctx?: unknown) => Promise<CanonicalResult>;
let alertReadPatch: (ctx?: unknown, params?: Record<string, string>) => Promise<CanonicalResult>;
let alertResolvePatch: (ctx?: unknown, params?: Record<string, string>) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll({ id: ALERT_ID });
  const alertsRoute = await import("@/app/api/owner/alerts/route");
  const readRoute = await import("@/app/api/owner/alerts/[id]/read/route");
  const resolveRoute = await import("@/app/api/owner/alerts/[id]/resolve/route");
  alertsGet = alertsRoute.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  alertsPost = alertsRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  alertReadPatch = readRoute.PATCH as unknown as (ctx?: unknown, params?: Record<string, string>) => Promise<CanonicalResult>;
  alertResolvePatch = resolveRoute.PATCH as unknown as (ctx?: unknown, params?: Record<string, string>) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll({ id: ALERT_ID });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Owner Alerts Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET (list alerts) is guarded by owner:view", () => {
      const decl = capturedListDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl).toBeDefined();
    });

    it("GET requires workspace enforcement", () => {
      const decl = capturedListDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("POST (create alert) is guarded by owner:manage", () => {
      const decl = capturedCreateDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("POST requires workspace enforcement", () => {
      const decl = capturedCreateDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("PATCH read is guarded by owner:view", () => {
      const decl = capturedReadDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl).toBeDefined();
    });

    it("PATCH resolve is guarded by owner:view", () => {
      const decl = capturedResolveDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl).toBeDefined();
    });

    it("GET returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await alertsGet(makeGetCtx());
      expect(result.status).toBe(403);
    });

    it("POST returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await alertsPost(makePostCtx(CREATE_BODY));
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/owner/alerts ─────────────────────────────────────────────────

  describe("GET /api/owner/alerts", () => {
    it("returns 200 with alerts and unreadCount", async () => {
      mockGetAlerts.mockResolvedValueOnce([ALERT]);
      mockGetUnreadAlertCount.mockResolvedValueOnce(1);
      const result = await alertsGet(makeGetCtx());
      expect(result.status).toBe(200);
      expect(Array.isArray(result.body.alerts)).toBe(true);
      expect(typeof result.body.unreadCount).toBe("number");
    });

    it("passes workspaceId (WS_A) to getAlerts and getUnreadAlertCount", async () => {
      mockGetAlerts.mockResolvedValueOnce([]);
      mockGetUnreadAlertCount.mockResolvedValueOnce(0);
      await alertsGet(makeGetCtx({}, { verifiedWorkspaceId: WS_A }));
      expect(mockGetAlerts).toHaveBeenCalledWith(WS_A, expect.anything(), expect.anything());
      expect(mockGetUnreadAlertCount).toHaveBeenCalledWith(WS_A, expect.anything());
    });

    it("passes workspaceId (WS_B) to both services", async () => {
      mockGetAlerts.mockResolvedValueOnce([]);
      mockGetUnreadAlertCount.mockResolvedValueOnce(0);
      await alertsGet(makeGetCtx({}, { verifiedWorkspaceId: WS_B }));
      expect(mockGetAlerts).toHaveBeenCalledWith(WS_B, expect.anything(), expect.anything());
      expect(mockGetUnreadAlertCount).toHaveBeenCalledWith(WS_B, expect.anything());
    });

    it("passes userId (ACTOR_A) to both services", async () => {
      mockGetAlerts.mockResolvedValueOnce([]);
      mockGetUnreadAlertCount.mockResolvedValueOnce(0);
      await alertsGet(makeGetCtx({}, { verifiedActorId: ACTOR_A }));
      expect(mockGetAlerts).toHaveBeenCalledWith(expect.anything(), ACTOR_A, expect.anything());
      expect(mockGetUnreadAlertCount).toHaveBeenCalledWith(expect.anything(), ACTOR_A);
    });

    it("passes unreadOnly:true when query param set", async () => {
      mockGetAlerts.mockResolvedValueOnce([]);
      mockGetUnreadAlertCount.mockResolvedValueOnce(0);
      await alertsGet(makeGetCtx({ unreadOnly: "true" }));
      expect(mockGetAlerts).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ unreadOnly: true })
      );
    });

    it("passes severity filter when query param set", async () => {
      mockGetAlerts.mockResolvedValueOnce([]);
      mockGetUnreadAlertCount.mockResolvedValueOnce(0);
      await alertsGet(makeGetCtx({ severity: "critical" }));
      expect(mockGetAlerts).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ severity: "critical" })
      );
    });

    it("uses default limit 50 when no limit param", async () => {
      mockGetAlerts.mockResolvedValueOnce([]);
      mockGetUnreadAlertCount.mockResolvedValueOnce(0);
      await alertsGet(makeGetCtx());
      expect(mockGetAlerts).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ limit: 50 })
      );
    });

    it("workspace isolation: two calls use respective workspaceIds", async () => {
      mockGetAlerts.mockResolvedValue([]);
      mockGetUnreadAlertCount.mockResolvedValue(0);
      await alertsGet(makeGetCtx({}, { verifiedWorkspaceId: WS_A }));
      await alertsGet(makeGetCtx({}, { verifiedWorkspaceId: WS_B }));
      expect(mockGetAlerts).toHaveBeenNthCalledWith(1, WS_A, expect.anything(), expect.anything());
      expect(mockGetAlerts).toHaveBeenNthCalledWith(2, WS_B, expect.anything(), expect.anything());
    });
  });

  // ─── 3. POST /api/owner/alerts ───────────────────────────────────────────────

  describe("POST /api/owner/alerts", () => {
    it("returns 201 with alert on success", async () => {
      mockCreateAlert.mockResolvedValueOnce(ALERT);
      const result = await alertsPost(makePostCtx(CREATE_BODY));
      expect(result.status).toBe(201);
      expect(result.body.alert).toBeDefined();
    });

    it("passes workspaceId (WS_A) to createAlert", async () => {
      mockCreateAlert.mockResolvedValueOnce(ALERT);
      await alertsPost(makePostCtx(CREATE_BODY, { verifiedWorkspaceId: WS_A }));
      expect(mockCreateAlert).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes workspaceId (WS_B) to createAlert", async () => {
      mockCreateAlert.mockResolvedValueOnce(ALERT);
      await alertsPost(makePostCtx(CREATE_BODY, {
        verifiedWorkspaceId: WS_B,
        request: { url: BASE_URL, json: async () => CREATE_BODY },
      }));
      expect(mockCreateAlert).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes userId (ACTOR_A) to createAlert", async () => {
      mockCreateAlert.mockResolvedValueOnce(ALERT);
      await alertsPost(makePostCtx(CREATE_BODY, { verifiedActorId: ACTOR_A }));
      expect(mockCreateAlert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: ACTOR_A })
      );
    });

    it("passes userId (ACTOR_B) to createAlert", async () => {
      mockCreateAlert.mockResolvedValueOnce(ALERT);
      await alertsPost(makePostCtx(CREATE_BODY, {
        verifiedActorId: ACTOR_B,
        request: { url: BASE_URL, json: async () => CREATE_BODY },
      }));
      expect(mockCreateAlert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: ACTOR_B })
      );
    });

    it("passes message from body to createAlert", async () => {
      mockCreateAlert.mockResolvedValueOnce(ALERT);
      await alertsPost(makePostCtx(CREATE_BODY));
      expect(mockCreateAlert).toHaveBeenCalledWith(
        expect.objectContaining({ message: CREATE_BODY.message })
      );
    });

    it("passes type from body to createAlert", async () => {
      mockCreateAlert.mockResolvedValueOnce(ALERT);
      await alertsPost(makePostCtx({ ...CREATE_BODY, type: "threshold_breach" }));
      expect(mockCreateAlert).toHaveBeenCalledWith(
        expect.objectContaining({ type: "threshold_breach" })
      );
    });

    it("does not call getAlerts or getUnreadAlertCount on POST", async () => {
      mockCreateAlert.mockResolvedValueOnce(ALERT);
      await alertsPost(makePostCtx(CREATE_BODY));
      expect(mockGetAlerts).not.toHaveBeenCalled();
      expect(mockGetUnreadAlertCount).not.toHaveBeenCalled();
    });
  });

  // ─── 4. PATCH /api/owner/alerts/[id]/read ────────────────────────────────────

  describe("PATCH /api/owner/alerts/[id]/read", () => {
    it("returns 200 with alert on success", async () => {
      mockMarkAlertAsRead.mockResolvedValueOnce({ ...ALERT, isRead: true });
      const result = await alertReadPatch(makePatchCtx(), { id: ALERT_ID });
      expect(result.status).toBe(200);
      expect(result.body.alert).toBeDefined();
    });

    it("passes alertId to markAlertAsRead", async () => {
      mockMarkAlertAsRead.mockResolvedValueOnce({ ...ALERT, isRead: true });
      await alertReadPatch(makePatchCtx(), { id: ALERT_ID });
      expect(mockMarkAlertAsRead).toHaveBeenCalledWith(ALERT_ID, expect.anything(), expect.anything());
    });

    it("passes workspaceId (WS_A) to markAlertAsRead", async () => {
      mockMarkAlertAsRead.mockResolvedValueOnce({ ...ALERT, isRead: true });
      await alertReadPatch(makePatchCtx({ verifiedWorkspaceId: WS_A }), { id: ALERT_ID });
      expect(mockMarkAlertAsRead).toHaveBeenCalledWith(ALERT_ID, WS_A, expect.anything());
    });

    it("passes actorId (ACTOR_A) to markAlertAsRead", async () => {
      mockMarkAlertAsRead.mockResolvedValueOnce({ ...ALERT, isRead: true });
      await alertReadPatch(makePatchCtx({ verifiedActorId: ACTOR_A }), { id: ALERT_ID });
      expect(mockMarkAlertAsRead).toHaveBeenCalledWith(ALERT_ID, expect.anything(), ACTOR_A);
    });

    it("returns 400 when alertId is missing from params", async () => {
      const result = await alertReadPatch(makePatchCtx(), {} as Record<string, string>);
      expect(result.status).toBe(400);
    });

    it("does not call resolveAlert for read operation", async () => {
      mockMarkAlertAsRead.mockResolvedValueOnce({ ...ALERT, isRead: true });
      await alertReadPatch(makePatchCtx(), { id: ALERT_ID });
      expect(mockResolveAlert).not.toHaveBeenCalled();
    });
  });

  // ─── 5. PATCH /api/owner/alerts/[id]/resolve ─────────────────────────────────

  describe("PATCH /api/owner/alerts/[id]/resolve", () => {
    it("returns 200 with alert on success", async () => {
      mockResolveAlert.mockResolvedValueOnce({ ...ALERT, isRead: true, resolvedAt: "2026-01-01T01:00:00.000Z" });
      const result = await alertResolvePatch(makePatchCtx(), { id: ALERT_ID });
      expect(result.status).toBe(200);
      expect(result.body.alert).toBeDefined();
    });

    it("passes alertId to resolveAlert", async () => {
      mockResolveAlert.mockResolvedValueOnce({ ...ALERT, isRead: true });
      await alertResolvePatch(makePatchCtx(), { id: ALERT_ID });
      expect(mockResolveAlert).toHaveBeenCalledWith(ALERT_ID, expect.anything(), expect.anything());
    });

    it("passes workspaceId (WS_A) to resolveAlert", async () => {
      mockResolveAlert.mockResolvedValueOnce({ ...ALERT, isRead: true });
      await alertResolvePatch(makePatchCtx({ verifiedWorkspaceId: WS_A }), { id: ALERT_ID });
      expect(mockResolveAlert).toHaveBeenCalledWith(ALERT_ID, WS_A, expect.anything());
    });

    it("passes actorId to resolveAlert", async () => {
      mockResolveAlert.mockResolvedValueOnce({ ...ALERT, isRead: true });
      await alertResolvePatch(makePatchCtx({ verifiedActorId: ACTOR_A }), { id: ALERT_ID });
      expect(mockResolveAlert).toHaveBeenCalledWith(ALERT_ID, expect.anything(), ACTOR_A);
    });

    it("returns 400 when alertId is missing from params", async () => {
      const result = await alertResolvePatch(makePatchCtx(), {} as Record<string, string>);
      expect(result.status).toBe(400);
    });

    it("does not call markAlertAsRead for resolve operation", async () => {
      mockResolveAlert.mockResolvedValueOnce({ ...ALERT, isRead: true });
      await alertResolvePatch(makePatchCtx(), { id: ALERT_ID });
      expect(mockMarkAlertAsRead).not.toHaveBeenCalled();
    });
  });

  // ─── 6. Workspace isolation cross-route ──────────────────────────────────────

  describe("workspace isolation", () => {
    it("PATCH read: two calls with different workspaceIds use respective IDs", async () => {
      mockMarkAlertAsRead.mockResolvedValue({ ...ALERT, isRead: true });
      await alertReadPatch(makePatchCtx({ verifiedWorkspaceId: WS_A }), { id: ALERT_ID });
      await alertReadPatch(makePatchCtx({ verifiedWorkspaceId: WS_B }), { id: ALERT_ID });
      expect(mockMarkAlertAsRead).toHaveBeenNthCalledWith(1, ALERT_ID, WS_A, expect.anything());
      expect(mockMarkAlertAsRead).toHaveBeenNthCalledWith(2, ALERT_ID, WS_B, expect.anything());
    });

    it("PATCH resolve: two calls with different workspaceIds use respective IDs", async () => {
      mockResolveAlert.mockResolvedValue({ ...ALERT, isRead: true });
      await alertResolvePatch(makePatchCtx({ verifiedWorkspaceId: WS_A }), { id: ALERT_ID });
      await alertResolvePatch(makePatchCtx({ verifiedWorkspaceId: WS_B }), { id: ALERT_ID });
      expect(mockResolveAlert).toHaveBeenNthCalledWith(1, ALERT_ID, WS_A, expect.anything());
      expect(mockResolveAlert).toHaveBeenNthCalledWith(2, ALERT_ID, WS_B, expect.anything());
    });
  });
});
