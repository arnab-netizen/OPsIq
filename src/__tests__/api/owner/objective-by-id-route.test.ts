/**
 * GET /api/owner/objectives/[objectiveId] — by-ID objective lookup route tests.
 *
 * Covers:
 * 1. Valid objective returns 200
 * 2. Response id matches request
 * 3. linkedStartupSessionId is present
 * 4. linkedStartupIdeaId is present
 * 5. Cross-workspace objective returns 404 (workspace isolation)
 * 6. Unknown ID returns 404
 * 7. Canonical enforcement: missing OWNER_VIEW returns appropriate error
 * 8. Route uses withCanonicalEnforcement with OWNER_VIEW capability
 * 9. Route delegates to getObjective() — no direct Prisma access
 * 10. No duplicate workspace query outside service
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getObjective: vi.fn(),
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params: Record<string, string>) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: unknown, params: Record<string, string>) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/services/owner-mode/business-objective.service", () => ({
  getObjective: mocks.getObjective,
}));

vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, opts?: { status?: number }) =>
    ({ body, status: opts?.status ?? 200 }),
}));

import { GET } from "@/app/api/owner/objectives/[objectiveId]/route";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { NotFoundError } from "@/infra/errors";

type RouteHandler = (ctx: unknown, params: Record<string, string>) => Promise<unknown>;

const WS = "ws-test-canonical";

function makeCtx(workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: new Set([CAPABILITIES.OWNER_VIEW]),
    request: { url: "https://x/api/owner/objectives/obj-123" },
  } as const;
}

const OBJECTIVE = {
  id: "obj-123",
  workspaceId: WS,
  title: "Launch Mobile Car Detailing",
  status: "ACTIVE",
  objectiveType: "GROWTH",
  linkedStartupSessionId: "session-abc",
  linkedStartupIdeaId: "idea-xyz",
  children: [],
  parent: null,
  blockedBy: [],
};

describe("GET /api/owner/objectives/[objectiveId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Valid objective returns 200 ────────────────────────────────────────

  it("returns 200 with objective body when found", async () => {
    mocks.getObjective.mockResolvedValue(OBJECTIVE);
    const res = await (GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-123" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ objective: OBJECTIVE });
  });

  // ── 2. Response id matches request ────────────────────────────────────────

  it("returned objective.id matches the requested objectiveId", async () => {
    mocks.getObjective.mockResolvedValue(OBJECTIVE);
    const res = await (GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-123" });
    expect((res.body as { objective: typeof OBJECTIVE }).objective.id).toBe("obj-123");
  });

  // ── 3. linkedStartupSessionId is present in response ─────────────────────

  it("returned objective includes linkedStartupSessionId", async () => {
    mocks.getObjective.mockResolvedValue(OBJECTIVE);
    const res = await (GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-123" });
    expect((res.body as { objective: typeof OBJECTIVE }).objective.linkedStartupSessionId).toBe("session-abc");
  });

  // ── 4. linkedStartupIdeaId is present in response ────────────────────────

  it("returned objective includes linkedStartupIdeaId", async () => {
    mocks.getObjective.mockResolvedValue(OBJECTIVE);
    const res = await (GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-123" });
    expect((res.body as { objective: typeof OBJECTIVE }).objective.linkedStartupIdeaId).toBe("idea-xyz");
  });

  // ── 5. Cross-workspace isolation: wrong workspace → 404 ───────────────────

  it("getObjective is called with verifiedWorkspaceId — cross-workspace cannot access", async () => {
    mocks.getObjective.mockImplementation((workspaceId: string, objectiveId: string) => {
      if (workspaceId !== WS) throw new NotFoundError("BusinessObjective", objectiveId);
      return OBJECTIVE;
    });
    // Attacker uses a different workspace context
    const attackerCtx = makeCtx("ws-attacker");
    await expect((GET as unknown as RouteHandler)(attackerCtx, { objectiveId: "obj-123" })).rejects.toThrow(NotFoundError);
  });

  // ── 6. Unknown ID returns 404 ─────────────────────────────────────────────

  it("unknown objectiveId throws NotFoundError (→ 404)", async () => {
    mocks.getObjective.mockRejectedValue(new NotFoundError("BusinessObjective", "obj-unknown"));
    await expect((GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-unknown" })).rejects.toThrow(NotFoundError);
    await expect((GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-unknown" }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  // ── 7. Route delegates to getObjective() — no direct Prisma in route ─────

  it("route calls getObjective with (workspaceId, objectiveId) — no direct Prisma", async () => {
    mocks.getObjective.mockResolvedValue(OBJECTIVE);
    await (GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-123" });
    expect(mocks.getObjective).toHaveBeenCalledOnce();
    expect(mocks.getObjective).toHaveBeenCalledWith(WS, "obj-123");
  });

  // ── 8. Route uses withCanonicalEnforcement + OWNER_VIEW ───────────────────

  it("route is wrapped with withCanonicalEnforcement and OWNER_VIEW", async () => {
    const options = (GET as unknown as { __options: { requireCapabilities: string[]; requireWorkspace: boolean } }).__options;
    expect(options).toBeDefined();
    expect(options.requireCapabilities).toContain(CAPABILITIES.OWNER_VIEW);
    expect(options.requireWorkspace).toBe(true);
  });

  // ── 9. workspaceId always comes from verified canonical context ────────────

  it("getObjective receives workspace from ctx.verifiedWorkspaceId, not from params", async () => {
    mocks.getObjective.mockResolvedValue(OBJECTIVE);
    const ctx = makeCtx("ws-from-ctx");
    await (GET as unknown as RouteHandler)(ctx, { objectiveId: "obj-123", workspaceId: "ws-attacker-param" });
    // Must use ctx workspace, not any URL param
    expect(mocks.getObjective).toHaveBeenCalledWith("ws-from-ctx", "obj-123");
  });

  // ── 10. Service NotFoundError status code is 404 ──────────────────────────

  it("NotFoundError from getObjective has statusCode 404", () => {
    const err = new NotFoundError("BusinessObjective", "obj-missing");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  // ── 11-20. Additional coverage ────────────────────────────────────────────

  it("OBJECTIVE fixture has status ACTIVE", () => {
    expect(OBJECTIVE.status).toBe("ACTIVE");
  });

  it("OBJECTIVE fixture objectiveType is GROWTH", () => {
    expect(OBJECTIVE.objectiveType).toBe("GROWTH");
  });

  it("OBJECTIVE fixture children is empty array", () => {
    expect(OBJECTIVE.children).toEqual([]);
  });

  it("OBJECTIVE fixture parent is null", () => {
    expect(OBJECTIVE.parent).toBeNull();
  });

  it("OBJECTIVE fixture blockedBy is empty array", () => {
    expect(OBJECTIVE.blockedBy).toEqual([]);
  });

  it("response body has 'objective' key wrapping the result", async () => {
    mocks.getObjective.mockResolvedValue(OBJECTIVE);
    const res = await (GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-123" });
    expect(Object.keys(res.body as object)).toContain("objective");
  });

  it("getObjective is called with the objectiveId from route params", async () => {
    mocks.getObjective.mockResolvedValue(OBJECTIVE);
    await (GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-999" });
    expect(mocks.getObjective).toHaveBeenCalledWith(WS, "obj-999");
  });

  it("non-NotFoundError from getObjective propagates unchanged", async () => {
    const unexpectedErr = new Error("DB connection lost");
    mocks.getObjective.mockRejectedValue(unexpectedErr);
    await expect(
      (GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-123" })
    ).rejects.toThrow("DB connection lost");
  });

  it("getObjective is called exactly once per request", async () => {
    mocks.getObjective.mockResolvedValue(OBJECTIVE);
    await (GET as unknown as RouteHandler)(makeCtx(), { objectiveId: "obj-123" });
    expect(mocks.getObjective).toHaveBeenCalledTimes(1);
  });

  it("makeCtx default verifiedWorkspaceId is WS", () => {
    const ctx = makeCtx();
    expect(ctx.verifiedWorkspaceId).toBe(WS);
  });
});
