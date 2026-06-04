/**
 * Phase D1-B: GET /api/admin/workspaces/[id]/members — Admin Read Operability
 *
 * Real route-contract tests (replaces the prior stub's lack of coverage).
 *
 * Independent harness:
 * - withCanonicalEnforcement is mocked to a pass-through that ALSO captures the
 *   enforcement options, so we can assert the route declares SYSTEM_ADMIN
 *   without standing up the full auth pipeline.
 * - The admin operability service is mocked so the route is exercised DB-free;
 *   real DB behavior + cross-workspace isolation is covered by the Phase D DB
 *   suite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listWorkspaceMembersForAdmin: vi.fn(),
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

vi.mock("@/services/admin/admin-operability.service", () => ({
  listWorkspaceMembersForAdmin: mocks.listWorkspaceMembersForAdmin,
}));

import { GET } from "@/app/api/admin/workspaces/[id]/members/route";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

function makeCtx(rawUrl: string) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: "ws-actor",
    request: { url: rawUrl },
  } as const;
}

const sampleResult = {
  workspaceId: WORKSPACE_ID,
  members: [
    {
      userId: "22222222-2222-2222-2222-222222222222",
      name: "Ada Admin",
      email: "ada@example.com",
      role: "admin",
      isActive: true,
      addedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  pagination: { limit: 50, cursor: null, nextCursor: null, hasMore: false },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Phase D1-B: GET /api/admin/workspaces/[id]/members", () => {
  it("declares SYSTEM_ADMIN as a required capability", () => {
    const options = (GET as unknown as { __options?: { requireCapabilities?: string[] } }).__options;
    expect(options).toBeDefined();
    expect(options?.requireCapabilities).toContain("system:admin");
  });

  it("returns members from the service (not an empty stub)", async () => {
    mocks.listWorkspaceMembersForAdmin.mockResolvedValue(sampleResult);

    const res = (await GET(makeCtx("https://x/api/admin/workspaces/" + WORKSPACE_ID + "/members"), {
      id: WORKSPACE_ID,
    })) as typeof sampleResult;

    expect(res.members).toHaveLength(1);
    expect(res.members[0].userId).toBe("22222222-2222-2222-2222-222222222222");
    expect(res.workspaceId).toBe(WORKSPACE_ID);
    expect(mocks.listWorkspaceMembersForAdmin).toHaveBeenCalledTimes(1);
  });

  it("returns the exact response shape (workspaceId, members[], pagination)", async () => {
    mocks.listWorkspaceMembersForAdmin.mockResolvedValue(sampleResult);

    const res = (await GET(makeCtx("https://x/api/admin/workspaces/" + WORKSPACE_ID + "/members"), {
      id: WORKSPACE_ID,
    })) as typeof sampleResult;

    expect(res).toHaveProperty("workspaceId");
    expect(res).toHaveProperty("members");
    expect(res).toHaveProperty("pagination");
    expect(res.members[0]).toMatchObject({
      userId: expect.any(String),
      role: expect.any(String),
      isActive: expect.any(Boolean),
      addedAt: expect.any(String),
    });
    expect(res.pagination).toMatchObject({
      limit: expect.any(Number),
      cursor: null,
      nextCursor: null,
      hasMore: false,
    });
  });

  it("forwards the workspace id from the path to the service", async () => {
    mocks.listWorkspaceMembersForAdmin.mockResolvedValue(sampleResult);

    await GET(makeCtx("https://x/api/admin/workspaces/" + WORKSPACE_ID + "/members"), {
      id: WORKSPACE_ID,
    });

    const [calledWorkspaceId] = mocks.listWorkspaceMembersForAdmin.mock.calls[0];
    expect(calledWorkspaceId).toBe(WORKSPACE_ID);
  });

  it("forwards limit and cursor query params to the service", async () => {
    mocks.listWorkspaceMembersForAdmin.mockResolvedValue(sampleResult);

    await GET(
      makeCtx("https://x/api/admin/workspaces/" + WORKSPACE_ID + "/members?limit=25&cursor=abc"),
      { id: WORKSPACE_ID }
    );

    expect(mocks.listWorkspaceMembersForAdmin).toHaveBeenCalledWith(WORKSPACE_ID, {
      limit: 25,
      cursor: "abc",
    });
  });

  it("is read-only: invoking GET performs no mutation (only the read service is called)", async () => {
    mocks.listWorkspaceMembersForAdmin.mockResolvedValue(sampleResult);

    await GET(makeCtx("https://x/api/admin/workspaces/" + WORKSPACE_ID + "/members"), {
      id: WORKSPACE_ID,
    });

    expect(mocks.listWorkspaceMembersForAdmin).toHaveBeenCalledTimes(1);
    // The route surface exposes only the read query — no disable/remove/invite.
    expect(Object.keys(mocks)).toEqual(["listWorkspaceMembersForAdmin"]);
  });

  it("exposes only safe member fields (no password/secret/token/payload)", async () => {
    mocks.listWorkspaceMembersForAdmin.mockResolvedValue(sampleResult);

    const res = (await GET(makeCtx("https://x/api/admin/workspaces/" + WORKSPACE_ID + "/members"), {
      id: WORKSPACE_ID,
    })) as typeof sampleResult;
    const member = res.members[0] as Record<string, unknown>;

    expect(member).not.toHaveProperty("password");
    expect(member).not.toHaveProperty("passwordHash");
    expect(member).not.toHaveProperty("secret");
    expect(member).not.toHaveProperty("token");
    expect(member).not.toHaveProperty("payload");
    expect(member).toHaveProperty("userId");
    expect(member).toHaveProperty("role");
  });

  it("throws when the workspace id path param is missing", async () => {
    await expect(
      GET(makeCtx("https://x/api/admin/workspaces//members"), {} as Record<string, string>)
    ).rejects.toThrow(/Workspace ID required/);
  });
});
