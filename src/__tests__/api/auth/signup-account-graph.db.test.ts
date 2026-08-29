/**
 * POST /api/auth/signup — initial account-graph correctness (DB-backed).
 *
 * Pins the public-beta signup invariant: one successful signup durably
 * creates exactly one User, one Workspace, one active WorkspaceMembership,
 * one workspace-scoped UserRoleAssignment and one Session — all correctly
 * linked — and that a slug collision or a concurrent duplicate-email
 * signup can never leave a partial (orphaned) graph behind.
 *
 * Real DB writes; no Prisma mocks. `next/headers` cookies() is mocked
 * because it requires a live Next.js request scope this test harness
 * doesn't provide — the mock only records what the route would have set.
 */
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
}));

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] POST /api/auth/signup — account graph", () => {
  const createdEmails: string[] = [];

  afterEach(async () => {
    mockCookieSet.mockClear();
    if (createdEmails.length === 0) return;
    const users = await db.user.findMany({ where: { email: { in: createdEmails } } });
    const userIds = users.map((u: { id: string }) => u.id);
    if (userIds.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
      const memberships = await db.workspaceMembership.findMany({ where: { userId: { in: userIds } } });
      const workspaceIds = memberships.map((m: { workspaceId: string }) => m.workspaceId);
      await db.workspaceMembership.deleteMany({ where: { userId: { in: userIds } } });
      // Signup emits an audit event referencing the user (actorId) and workspace
      // (workspaceId); both FKs must be cleared before the rows they reference.
      await db.auditEvent.deleteMany({
        where: { OR: [{ actorId: { in: userIds } }, { workspaceId: { in: workspaceIds.length > 0 ? workspaceIds : [""] } }] },
      });
      if (workspaceIds.length > 0) {
        await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      }
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    createdEmails.length = 0;
  });

  function signupRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function signup(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/auth/signup/route");
    return POST(signupRequest(body) as never);
  }

  it("[db] creates exactly one consistent initial account graph", async () => {
    const email = `graph-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const res = await signup({ email, password: "password123", workspaceName: "Acme Corp" });
    expect(res.status).toBe(201);
    const json = await res.json();

    const userId = json.user.id as string;
    const workspaceId = json.workspace.id as string;

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(userId);

    const memberships = await db.workspaceMembership.findMany({ where: { userId, isActive: true } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].workspaceId).toBe(workspaceId);

    const roleAssignments = await db.userRoleAssignment.findMany({ where: { userId, isActive: true } });
    expect(roleAssignments).toHaveLength(1);
    expect(roleAssignments[0].scopeId).toBe(workspaceId);
    expect(roleAssignments[0].scope).toBe("workspace");

    const sessions = await db.session.findMany({ where: { userId } });
    expect(sessions).toHaveLength(1);

    const workspaces = await db.workspace.findMany({ where: { id: workspaceId } });
    expect(workspaces).toHaveLength(1);

    // Cookie is set post-commit, outside the transaction.
    expect(mockCookieSet).toHaveBeenCalledTimes(1);
    const [cookieName, , cookieOpts] = mockCookieSet.mock.calls[0];
    expect(cookieName).toBe("opsiq_session");
    expect(cookieOpts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("[db] a duplicate email conflicts and creates no second account graph", async () => {
    const email = `dup-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const first = await signup({ email, password: "password123", workspaceName: "First Co" });
    expect(first.status).toBe(201);

    await expect(
      signup({ email, password: "password123", workspaceName: "Second Co" })
    ).rejects.toMatchObject({ name: "ConflictError", statusCode: 409 });

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    const workspaces = await db.workspace.findMany({ where: { createdBy: users[0].id } });
    expect(workspaces).toHaveLength(1);
  });

  it("[db] a whitespace-only workspace name is rejected outright (nothing to slug)", async () => {
    const email = `empty-name-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await expect(
      signup({ email, password: "password123", workspaceName: "   " })
    ).rejects.toMatchObject({ name: "BadRequestError", statusCode: 400 });

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(0);
  });

  it("[db] a name with surrounding whitespace is stored trimmed", async () => {
    const email = `trim-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);
    const res = await signup({ email, password: "password123", workspaceName: "  Acme Corp  " });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.workspace.name).toBe("Acme Corp");
  });

  it("[db] degenerate-but-non-empty workspace names (punctuation/emoji, still valid display names) never collide", async () => {
    const names = ["!!!---...", "🚀🚀🚀"];
    const emails: string[] = [];

    for (const name of names) {
      const email = `slug-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
      emails.push(email);
      createdEmails.push(email);
      const res = await signup({ email, password: "password123", workspaceName: name });
      expect(res.status).toBe(201);
    }

    const users = await db.user.findMany({ where: { email: { in: emails } } });
    const workspaceIds = new Set(
      (await db.workspaceMembership.findMany({ where: { userId: { in: users.map((u: { id: string }) => u.id) } } }))
        .map((m: { workspaceId: string }) => m.workspaceId)
    );
    // Two distinct signups with degenerate names must produce two distinct workspaces.
    expect(workspaceIds.size).toBe(2);
  });

  it("[db] a concurrent duplicate-email double-submit yields exactly one durable account graph", async () => {
    const email = `race-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const results = await Promise.allSettled([
      signup({ email, password: "password123", workspaceName: "Racer A" }),
      signup({ email, password: "password123", workspaceName: "Racer B" }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded.length).toBe(1);

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    const workspaces = await db.workspace.findMany({ where: { createdBy: users[0].id } });
    expect(workspaces).toHaveLength(1);
    const memberships = await db.workspaceMembership.findMany({ where: { userId: users[0].id } });
    expect(memberships).toHaveLength(1);
  });
});
