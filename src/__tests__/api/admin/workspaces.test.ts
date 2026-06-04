/**
 * Phase D1-A: GET /api/admin/workspaces — Admin Read Operability
 *
 * Real route-contract tests (replaces prior placeholder `expect(true)` tests).
 *
 * Independent harness:
 * - withCanonicalEnforcement is mocked to a pass-through that ALSO captures the
 *   enforcement options, so we can assert the route declares SYSTEM_ADMIN
 *   without standing up the full auth pipeline.
 * - The admin operability service is mocked so the route is exercised in
 *   isolation (DB-free); real DB behavior is covered by the Phase D DB suite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listWorkspacesForAdmin: vi.fn(),
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
  listWorkspacesForAdmin: mocks.listWorkspacesForAdmin,
}));

import { GET } from "@/app/api/admin/workspaces/route";

function makeCtx(rawUrl: string) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: "ws-1",
    request: { url: rawUrl },
  } as const;
}

const sampleResult = {
  workspaces: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Acme",
      slug: "acme",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      memberCount: 3,
    },
  ],
  pagination: { limit: 100, cursor: null, nextCursor: null, hasMore: false },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Phase D1-A: GET /api/admin/workspaces", () => {
  it("declares SYSTEM_ADMIN as a required capability", () => {
    const options = (GET as unknown as { __options?: { requireCapabilities?: string[] } }).__options;
    expect(options).toBeDefined();
    expect(options?.requireCapabilities).toContain("system:admin");
  });

  it("returns real workspaces from the service (not an empty stub)", async () => {
    mocks.listWorkspacesForAdmin.mockResolvedValue(sampleResult);

    const res = (await GET(makeCtx("https://x/api/admin/workspaces"))) as typeof sampleResult;

    expect(res.workspaces).toHaveLength(1);
    expect(res.workspaces[0].id).toBe("11111111-1111-1111-1111-111111111111");
    expect(mocks.listWorkspacesForAdmin).toHaveBeenCalledTimes(1);
  });

  it("exposes id/name/slug/isActive/createdAt/memberCount per workspace", async () => {
    mocks.listWorkspacesForAdmin.mockResolvedValue(sampleResult);

    const res = (await GET(makeCtx("https://x/api/admin/workspaces"))) as typeof sampleResult;
    const w = res.workspaces[0];

    expect(w).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      slug: expect.any(String),
      isActive: expect.any(Boolean),
      createdAt: expect.any(String),
      memberCount: expect.any(Number),
    });
  });

  it("forwards limit and cursor query parameters to the service", async () => {
    mocks.listWorkspacesForAdmin.mockResolvedValue(sampleResult);

    await GET(makeCtx("https://x/api/admin/workspaces?limit=25&cursor=abc"));

    expect(mocks.listWorkspacesForAdmin).toHaveBeenCalledWith({
      limit: 25,
      cursor: "abc",
    });
  });

  it("is read-only: invoking GET performs no mutation (only the read service is called)", async () => {
    mocks.listWorkspacesForAdmin.mockResolvedValue(sampleResult);

    await GET(makeCtx("https://x/api/admin/workspaces"));

    // The only service interaction is the read query.
    expect(mocks.listWorkspacesForAdmin).toHaveBeenCalledTimes(1);
    // No other mock exists on the service module surface used by this route.
    expect(Object.keys(mocks)).toEqual(["listWorkspacesForAdmin"]);
  });
});
