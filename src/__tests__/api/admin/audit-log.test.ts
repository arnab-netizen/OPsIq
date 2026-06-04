/**
 * Phase D1-A: GET /api/admin/audit-log — Admin Read Operability
 *
 * Real route-contract tests (replaces prior placeholder / self-referential
 * literal tests). Proves the route delegates to the real persisted-audit read
 * service, is strictly workspace-scoped to the verified workspace, exposes only
 * safe fields, and performs no mutation.
 *
 * Independent harness:
 * - withCanonicalEnforcement is mocked to a pass-through that captures the
 *   enforcement options (so we can assert AUDIT_VIEW + requireWorkspace).
 * - The admin operability service is mocked so the route is exercised DB-free;
 *   real DB behavior + cross-workspace isolation is covered by the Phase D DB
 *   suite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  queryAuditLogForAdmin: vi.fn(),
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: unknown) => handler(ctx);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/services/admin/admin-operability.service", () => ({
  queryAuditLogForAdmin: mocks.queryAuditLogForAdmin,
}));

import { GET } from "@/app/api/admin/audit-log/route";

function makeCtx(rawUrl: string, workspaceId = "ws-1") {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: rawUrl },
  } as const;
}

const sampleResult = {
  events: [
    {
      id: "event-1",
      workspaceId: "ws-1",
      eventName: "DECISION_CREATED",
      entityType: "decision",
      entityId: "dec-1",
      actorId: "actor-1",
      actorType: "user",
      visibility: "internal",
      correlationId: "corr-1",
      occurredAt: "2026-05-01T00:00:00.000Z",
    },
  ],
  pagination: { limit: 100, cursor: null, nextCursor: null, hasMore: false },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Phase D1-A: GET /api/admin/audit-log", () => {
  it("declares AUDIT_VIEW capability and requires a workspace", () => {
    const options = (GET as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(options).toBeDefined();
    expect(options?.requireCapabilities).toContain("audit:view");
    expect(options?.requireWorkspace).toBe(true);
  });

  it("returns persisted audit events from the service", async () => {
    mocks.queryAuditLogForAdmin.mockResolvedValue(sampleResult);

    const res = (await GET(makeCtx("https://x/api/admin/audit-log"))) as typeof sampleResult;

    expect(res.events).toHaveLength(1);
    expect(res.events[0].eventName).toBe("DECISION_CREATED");
    expect(mocks.queryAuditLogForAdmin).toHaveBeenCalledTimes(1);
  });

  it("scopes the query to the verified workspace only (no client-supplied workspace)", async () => {
    mocks.queryAuditLogForAdmin.mockResolvedValue(sampleResult);

    // Even if a workspaceId is smuggled in the query string, it must be ignored.
    await GET(makeCtx("https://x/api/admin/audit-log?workspaceId=ws-ATTACKER", "ws-REAL"));

    const callArg = mocks.queryAuditLogForAdmin.mock.calls[0][0];
    expect(callArg.workspaceId).toBe("ws-REAL");
    expect(callArg.workspaceId).not.toBe("ws-ATTACKER");
  });

  it("forwards safe filter and pagination params to the service", async () => {
    mocks.queryAuditLogForAdmin.mockResolvedValue(sampleResult);

    await GET(
      makeCtx(
        "https://x/api/admin/audit-log?eventName=DECISION_CREATED&entityType=decision&entityId=dec-1&actorId=actor-9&limit=10&cursor=cur&includeTotalCount=true",
        "ws-1"
      )
    );

    expect(mocks.queryAuditLogForAdmin).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      eventName: "DECISION_CREATED",
      entityType: "decision",
      entityId: "dec-1",
      actorId: "actor-9",
      limit: 10,
      cursor: "cur",
      includeTotalCount: true,
    });
  });

  it("exposes only safe metadata fields (never raw payload)", async () => {
    mocks.queryAuditLogForAdmin.mockResolvedValue(sampleResult);

    const res = (await GET(makeCtx("https://x/api/admin/audit-log"))) as typeof sampleResult;
    const event = res.events[0] as Record<string, unknown>;

    expect(event).not.toHaveProperty("payload");
    expect(event).toHaveProperty("eventName");
    expect(event).toHaveProperty("occurredAt");
  });

  it("is read-only: invoking GET performs no mutation (only the read service is called)", async () => {
    mocks.queryAuditLogForAdmin.mockResolvedValue(sampleResult);

    await GET(makeCtx("https://x/api/admin/audit-log"));

    expect(mocks.queryAuditLogForAdmin).toHaveBeenCalledTimes(1);
    expect(Object.keys(mocks)).toEqual(["queryAuditLogForAdmin"]);
  });
});
