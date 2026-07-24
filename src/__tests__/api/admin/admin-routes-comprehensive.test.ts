/**
 * Non-DB mock tests for all admin routes:
 *   GET  /api/admin/audit-log                  — queryAuditLogForAdmin (AUDIT_VIEW + workspace)
 *   GET  /api/admin/workspaces                 — listWorkspacesForAdmin (SYSTEM_ADMIN)
 *   GET  /api/admin/workspaces/[id]/members    — listWorkspaceMembersForAdmin (SYSTEM_ADMIN)
 *   POST /api/admin/workspaces/[id]/disable    — disableWorkspaceForAdmin (SYSTEM_ADMIN + idempotency)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Supplements (rather than replaces) the original per-route tests.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockQueryAuditLog,
  mockListWorkspaces,
  mockListWorkspaceMembers,
  mockDisableWorkspace,
  mockCheckIdempotencyKey,
  mockRecordIdempotencyResponse,
  mockRecordIdempotencyError,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockQueryAuditLog: vi.fn(),
  mockListWorkspaces: vi.fn(),
  mockListWorkspaceMembers: vi.fn(),
  mockDisableWorkspace: vi.fn(),
  mockCheckIdempotencyKey: vi.fn(),
  mockRecordIdempotencyResponse: vi.fn(),
  mockRecordIdempotencyError: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/admin/admin-operability.service", () => ({
  queryAuditLogForAdmin: mockQueryAuditLog,
  listWorkspacesForAdmin: mockListWorkspaces,
  listWorkspaceMembersForAdmin: mockListWorkspaceMembers,
  disableWorkspaceForAdmin: mockDisableWorkspace,
}));

vi.mock("@/services/idempotency", () => ({
  checkIdempotencyKey: mockCheckIdempotencyKey,
  recordIdempotencyResponse: mockRecordIdempotencyResponse,
  recordIdempotencyError: mockRecordIdempotencyError,
}));

// ─── Capture capability declarations ─────────────────────────────────────────

const capturedAuditDecl: Record<string, unknown>[] = [];
const capturedWorkspacesDecl: Record<string, unknown>[] = [];
const capturedMembersDecl: Record<string, unknown>[] = [];
const capturedDisableDecl: Record<string, unknown>[] = [];

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
    if (src.includes("queryAuditLogForAdmin")) {
      capturedAuditDecl.push(decl);
    } else if (src.includes("disableWorkspaceForAdmin")) {
      capturedDisableDecl.push(decl);
    } else if (src.includes("listWorkspaceMembersForAdmin")) {
      capturedMembersDecl.push(decl);
    } else {
      capturedWorkspacesDecl.push(decl);
    }
    return async (testCtx: unknown, testParams?: unknown) =>
      mockWithCanonical(handler, options, testCtx, testParams);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ACTOR_B = "ac000002-0000-4000-8000-000000000002";
const WORKSPACE_ID = "de000001-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "ik-test-001";

const BASE_AUDIT = "https://example.com/api/admin/audit-log";
const BASE_WORKSPACES = "https://example.com/api/admin/workspaces";
const BASE_MEMBERS = `https://example.com/api/admin/workspaces/${WORKSPACE_ID}/members`;
const BASE_DISABLE = `https://example.com/api/admin/workspaces/${WORKSPACE_ID}/disable`;

const AUDIT_RESULT = {
  events: [{ id: "ev-001", eventName: "ACTION_CREATED", workspaceId: WS_A, actorId: ACTOR_A }],
  pagination: { cursor: null, nextCursor: null, hasMore: false },
};
const WORKSPACES_RESULT = {
  workspaces: [{ id: WORKSPACE_ID, name: "Acme", slug: "acme", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", memberCount: 3 }],
  pagination: { limit: 100, cursor: null, nextCursor: null, hasMore: false },
};
const MEMBERS_RESULT = {
  members: [{ id: ACTOR_A, email: "alice@example.com", name: "Alice" }],
  pagination: { cursor: null, nextCursor: null, hasMore: false },
};
const DISABLE_RESULT = { workspaceId: WORKSPACE_ID, disabled: true, disabledAt: "2026-01-01T00:00:00.000Z" };

function makeCtx(
  baseUrl: string,
  queryParams: Record<string, string> = {},
  body?: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: {
      url: url.toString(),
      json: async () => body ?? {},
      headers: { get: (k: string) => k === "idempotency-key" ? null : null },
    },
    ...overrides,
  };
}

function makeCtxWithIdempotency(
  baseUrl: string,
  body: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return makeCtx(baseUrl, {}, body, {
    ...overrides,
    request: {
      url: baseUrl,
      json: async () => body,
      headers: { get: (k: string) => k === "idempotency-key" ? IDEMPOTENCY_KEY : null },
    },
  });
}

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown, params?: unknown) => Promise<unknown>, _opts: unknown, testCtx: unknown, testParams?: unknown) =>
      handler(testCtx, testParams ?? {})
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ──────────────────────────────────────────────

let auditGet: (ctx?: unknown) => Promise<unknown>;
let workspacesGet: (ctx?: unknown) => Promise<unknown>;
let membersGet: (ctx?: unknown, params?: unknown) => Promise<unknown>;
let disablePost: (ctx?: unknown, params?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  mockCheckIdempotencyKey.mockResolvedValue({ isNew: true, cachedResponse: null });
  mockRecordIdempotencyResponse.mockResolvedValue(undefined);
  mockRecordIdempotencyError.mockResolvedValue(undefined);

  const [auditRoute, workspacesRoute, membersRoute, disableRoute] = await Promise.all([
    import("@/app/api/admin/audit-log/route"),
    import("@/app/api/admin/workspaces/route"),
    import("@/app/api/admin/workspaces/[id]/members/route"),
    import("@/app/api/admin/workspaces/[id]/disable/route"),
  ]);
  auditGet = auditRoute.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  workspacesGet = workspacesRoute.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  membersGet = membersRoute.GET as unknown as (ctx?: unknown, params?: unknown) => Promise<unknown>;
  disablePost = disableRoute.POST as unknown as (ctx?: unknown, params?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockCheckIdempotencyKey.mockResolvedValue({ isNew: true, cachedResponse: null });
  mockRecordIdempotencyResponse.mockResolvedValue(undefined);
  mockRecordIdempotencyError.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Admin Routes — comprehensive non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("audit-log GET requires audit:view + workspace", () => {
      expect(capturedAuditDecl[0]?.requireCapabilities).toContain("audit:view");
      expect(capturedAuditDecl[0]?.requireWorkspace).toBe(true);
    });

    it("workspaces GET requires system:admin", () => {
      expect(capturedWorkspacesDecl[0]?.requireCapabilities).toContain("system:admin");
    });

    it("workspaces/[id]/members GET requires system:admin", () => {
      expect(capturedMembersDecl[0]?.requireCapabilities).toContain("system:admin");
    });

    it("workspaces/[id]/disable POST requires system:admin", () => {
      expect(capturedDisableDecl[0]?.requireCapabilities).toContain("system:admin");
    });

    it("returns 403 when enforcement denies audit-log", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await auditGet(makeCtx(BASE_AUDIT));
      expect((result as { status: number }).status).toBe(403);
    });
  });

  // ─── 2. GET /api/admin/audit-log ─────────────────────────────────────────────

  describe("GET /api/admin/audit-log", () => {
    it("returns audit events from service", async () => {
      mockQueryAuditLog.mockResolvedValueOnce(AUDIT_RESULT);
      const result = await auditGet(makeCtx(BASE_AUDIT));
      expect(result).toEqual(AUDIT_RESULT);
    });

    it("passes verifiedWorkspaceId (WS_A) to queryAuditLogForAdmin", async () => {
      mockQueryAuditLog.mockResolvedValueOnce(AUDIT_RESULT);
      await auditGet(makeCtx(BASE_AUDIT, {}, undefined, { verifiedWorkspaceId: WS_A }));
      expect(mockQueryAuditLog).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS_A }));
    });

    it("passes verifiedWorkspaceId (WS_B) to queryAuditLogForAdmin", async () => {
      mockQueryAuditLog.mockResolvedValueOnce(AUDIT_RESULT);
      await auditGet(makeCtx(BASE_AUDIT, {}, undefined, { verifiedWorkspaceId: WS_B }));
      expect(mockQueryAuditLog).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS_B }));
    });

    it("passes eventName query param to service", async () => {
      mockQueryAuditLog.mockResolvedValueOnce(AUDIT_RESULT);
      await auditGet(makeCtx(BASE_AUDIT, { eventName: "ACTION_CREATED" }));
      expect(mockQueryAuditLog).toHaveBeenCalledWith(expect.objectContaining({ eventName: "ACTION_CREATED" }));
    });

    it("passes entityType query param to service", async () => {
      mockQueryAuditLog.mockResolvedValueOnce(AUDIT_RESULT);
      await auditGet(makeCtx(BASE_AUDIT, { entityType: "action" }));
      expect(mockQueryAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "action" }));
    });

    it("passes entityId query param to service", async () => {
      mockQueryAuditLog.mockResolvedValueOnce(AUDIT_RESULT);
      const entityId = "en000001-0000-4000-8000-000000000001";
      await auditGet(makeCtx(BASE_AUDIT, { entityId }));
      expect(mockQueryAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityId }));
    });

    it("passes actorId query param to service", async () => {
      mockQueryAuditLog.mockResolvedValueOnce(AUDIT_RESULT);
      await auditGet(makeCtx(BASE_AUDIT, { actorId: ACTOR_B }));
      expect(mockQueryAuditLog).toHaveBeenCalledWith(expect.objectContaining({ actorId: ACTOR_B }));
    });

    it("passes limit query param as integer to service", async () => {
      mockQueryAuditLog.mockResolvedValueOnce(AUDIT_RESULT);
      await auditGet(makeCtx(BASE_AUDIT, { limit: "25" }));
      expect(mockQueryAuditLog).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
    });

    it("passes includeTotalCount=true when set", async () => {
      mockQueryAuditLog.mockResolvedValueOnce(AUDIT_RESULT);
      await auditGet(makeCtx(BASE_AUDIT, { includeTotalCount: "true" }));
      expect(mockQueryAuditLog).toHaveBeenCalledWith(expect.objectContaining({ includeTotalCount: true }));
    });

    it("calls queryAuditLogForAdmin exactly once", async () => {
      mockQueryAuditLog.mockResolvedValueOnce(AUDIT_RESULT);
      await auditGet(makeCtx(BASE_AUDIT));
      expect(mockQueryAuditLog).toHaveBeenCalledTimes(1);
    });

    it("workspace isolation: consecutive calls use respective workspaceIds", async () => {
      mockQueryAuditLog.mockResolvedValue(AUDIT_RESULT);
      await auditGet(makeCtx(BASE_AUDIT, {}, undefined, { verifiedWorkspaceId: WS_A }));
      await auditGet(makeCtx(BASE_AUDIT, {}, undefined, { verifiedWorkspaceId: WS_B }));
      expect(mockQueryAuditLog).toHaveBeenNthCalledWith(1, expect.objectContaining({ workspaceId: WS_A }));
      expect(mockQueryAuditLog).toHaveBeenNthCalledWith(2, expect.objectContaining({ workspaceId: WS_B }));
    });
  });

  // ─── 3. GET /api/admin/workspaces ────────────────────────────────────────────

  describe("GET /api/admin/workspaces", () => {
    it("returns workspaces list from service", async () => {
      mockListWorkspaces.mockResolvedValueOnce(WORKSPACES_RESULT);
      const result = await workspacesGet(makeCtx(BASE_WORKSPACES));
      expect(result).toEqual(WORKSPACES_RESULT);
    });

    it("passes limit as integer when provided", async () => {
      mockListWorkspaces.mockResolvedValueOnce(WORKSPACES_RESULT);
      await workspacesGet(makeCtx(BASE_WORKSPACES, { limit: "50" }));
      expect(mockListWorkspaces).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
    });

    it("passes cursor when provided", async () => {
      mockListWorkspaces.mockResolvedValueOnce(WORKSPACES_RESULT);
      await workspacesGet(makeCtx(BASE_WORKSPACES, { cursor: "next-cursor-token" }));
      expect(mockListWorkspaces).toHaveBeenCalledWith(expect.objectContaining({ cursor: "next-cursor-token" }));
    });

    it("passes undefined limit when not in query", async () => {
      mockListWorkspaces.mockResolvedValueOnce(WORKSPACES_RESULT);
      await workspacesGet(makeCtx(BASE_WORKSPACES));
      expect(mockListWorkspaces).toHaveBeenCalledWith(expect.objectContaining({ limit: undefined }));
    });

    it("passes null cursor when not in query", async () => {
      mockListWorkspaces.mockResolvedValueOnce(WORKSPACES_RESULT);
      await workspacesGet(makeCtx(BASE_WORKSPACES));
      expect(mockListWorkspaces).toHaveBeenCalledWith(expect.objectContaining({ cursor: null }));
    });

    it("calls listWorkspacesForAdmin exactly once", async () => {
      mockListWorkspaces.mockResolvedValueOnce(WORKSPACES_RESULT);
      await workspacesGet(makeCtx(BASE_WORKSPACES));
      expect(mockListWorkspaces).toHaveBeenCalledTimes(1);
    });

    it("returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await workspacesGet(makeCtx(BASE_WORKSPACES));
      expect((result as { status: number }).status).toBe(403);
    });
  });

  // ─── 4. GET /api/admin/workspaces/[id]/members ───────────────────────────────

  describe("GET /api/admin/workspaces/[id]/members", () => {
    const PARAMS = { id: WORKSPACE_ID };

    it("returns members from service", async () => {
      mockListWorkspaceMembers.mockResolvedValueOnce(MEMBERS_RESULT);
      const result = await membersGet(makeCtx(BASE_MEMBERS), PARAMS);
      expect(result).toEqual(MEMBERS_RESULT);
    });

    it("passes workspaceId from route params to service", async () => {
      mockListWorkspaceMembers.mockResolvedValueOnce(MEMBERS_RESULT);
      await membersGet(makeCtx(BASE_MEMBERS), PARAMS);
      expect(mockListWorkspaceMembers).toHaveBeenCalledWith(WORKSPACE_ID, expect.anything());
    });

    it("passes limit as integer when provided", async () => {
      mockListWorkspaceMembers.mockResolvedValueOnce(MEMBERS_RESULT);
      await membersGet(makeCtx(BASE_MEMBERS, { limit: "20" }), PARAMS);
      expect(mockListWorkspaceMembers).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 20 }));
    });

    it("passes cursor when provided", async () => {
      mockListWorkspaceMembers.mockResolvedValueOnce(MEMBERS_RESULT);
      await membersGet(makeCtx(BASE_MEMBERS, { cursor: "member-cursor" }), PARAMS);
      expect(mockListWorkspaceMembers).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cursor: "member-cursor" }));
    });

    it("calls listWorkspaceMembersForAdmin exactly once", async () => {
      mockListWorkspaceMembers.mockResolvedValueOnce(MEMBERS_RESULT);
      await membersGet(makeCtx(BASE_MEMBERS), PARAMS);
      expect(mockListWorkspaceMembers).toHaveBeenCalledTimes(1);
    });

    it("does not call listWorkspacesForAdmin or queryAuditLogForAdmin for members", async () => {
      mockListWorkspaceMembers.mockResolvedValueOnce(MEMBERS_RESULT);
      await membersGet(makeCtx(BASE_MEMBERS), PARAMS);
      expect(mockListWorkspaces).not.toHaveBeenCalled();
      expect(mockQueryAuditLog).not.toHaveBeenCalled();
    });
  });

  // ─── 5. POST /api/admin/workspaces/[id]/disable ──────────────────────────────

  describe("POST /api/admin/workspaces/[id]/disable", () => {
    const PARAMS = { id: WORKSPACE_ID };
    const DISABLE_BODY = { reason: "Account suspended", notifyMembers: true };

    it("returns 400 when idempotency-key header missing", async () => {
      const ctx = makeCtx(BASE_DISABLE, {}, DISABLE_BODY);
      const result = await disablePost(ctx, PARAMS);
      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
    });

    it("returns 201 on successful disable", async () => {
      mockDisableWorkspace.mockResolvedValueOnce(DISABLE_RESULT);
      const result = await disablePost(makeCtxWithIdempotency(BASE_DISABLE, DISABLE_BODY), PARAMS);
      expect(result.status).toBe(201);
    });

    it("returns disabled workspace in body", async () => {
      mockDisableWorkspace.mockResolvedValueOnce(DISABLE_RESULT);
      const result = await disablePost(makeCtxWithIdempotency(BASE_DISABLE, DISABLE_BODY), PARAMS);
      expect(result.body).toEqual(DISABLE_RESULT);
    });

    it("passes workspaceId from route params to disableWorkspaceForAdmin", async () => {
      mockDisableWorkspace.mockResolvedValueOnce(DISABLE_RESULT);
      await disablePost(makeCtxWithIdempotency(BASE_DISABLE, DISABLE_BODY), PARAMS);
      expect(mockDisableWorkspace).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WORKSPACE_ID }));
    });

    it("passes actorId from ctx to disableWorkspaceForAdmin", async () => {
      mockDisableWorkspace.mockResolvedValueOnce(DISABLE_RESULT);
      const ctx = makeCtxWithIdempotency(BASE_DISABLE, DISABLE_BODY, { verifiedActorId: ACTOR_B });
      await disablePost(ctx, PARAMS);
      expect(mockDisableWorkspace).toHaveBeenCalledWith(expect.objectContaining({ actorId: ACTOR_B }));
    });

    it("passes reason from body to disableWorkspaceForAdmin", async () => {
      mockDisableWorkspace.mockResolvedValueOnce(DISABLE_RESULT);
      await disablePost(makeCtxWithIdempotency(BASE_DISABLE, { reason: "Policy violation" }), PARAMS);
      expect(mockDisableWorkspace).toHaveBeenCalledWith(expect.objectContaining({ reason: "Policy violation" }));
    });

    it("passes notifyMembers from body to disableWorkspaceForAdmin", async () => {
      mockDisableWorkspace.mockResolvedValueOnce(DISABLE_RESULT);
      await disablePost(makeCtxWithIdempotency(BASE_DISABLE, { notifyMembers: false }), PARAMS);
      expect(mockDisableWorkspace).toHaveBeenCalledWith(expect.objectContaining({ notifyMembers: false }));
    });

    it("records idempotency response on success", async () => {
      mockDisableWorkspace.mockResolvedValueOnce(DISABLE_RESULT);
      await disablePost(makeCtxWithIdempotency(BASE_DISABLE, DISABLE_BODY), PARAMS);
      expect(mockRecordIdempotencyResponse).toHaveBeenCalledWith(IDEMPOTENCY_KEY, 201, expect.anything());
    });

    it("returns cached response when idempotencyCheck.isNew=false", async () => {
      mockCheckIdempotencyKey.mockResolvedValueOnce({
        isNew: false,
        cachedResponse: { body: DISABLE_RESULT, status: 201 },
      });
      const result = await disablePost(makeCtxWithIdempotency(BASE_DISABLE, DISABLE_BODY), PARAMS);
      expect(result.status).toBe(201);
      expect(mockDisableWorkspace).not.toHaveBeenCalled();
    });

    it("does not call listWorkspacesForAdmin for disable", async () => {
      mockDisableWorkspace.mockResolvedValueOnce(DISABLE_RESULT);
      await disablePost(makeCtxWithIdempotency(BASE_DISABLE, DISABLE_BODY), PARAMS);
      expect(mockListWorkspaces).not.toHaveBeenCalled();
    });
  });
});
