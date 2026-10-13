/**
 * POST /api/auth/signup — initial account-graph correctness (DB-backed).
 *
 * Pins the open-beta signup invariant: one successful signup durably creates
 * exactly one User, one Workspace, one active WorkspaceMembership, one
 * workspace-scoped UserRoleAssignment, one EmailVerificationToken, and three
 * PolicyAcceptance rows (terms/privacy/beta) — all correctly linked — and
 * that a slug collision or a concurrent duplicate-email signup can never
 * leave a partial (orphaned) graph behind.
 *
 * Open-beta hardening: signup no longer creates a Session or sets a cookie —
 * an account is not usable until its emailed verification link is redeemed
 * (see verify-email.db.test.ts for that half of the journey). No `next/headers`
 * mock is needed here for that reason (kept, harmlessly unused by signup
 * itself, only if a future case needs it).
 *
 * Real DB writes; no Prisma mocks.
 */
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
}));

/** Signup carries only { email, workspaceName }: no password and no consent before email ownership is proven. */
function signupBody(overrides: Record<string, unknown>) {
  return { ...overrides };
}

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
    return POST(signupRequest(signupBody(body)) as never);
  }

  it("[db] creates exactly one consistent initial account graph, pending email verification", async () => {
    const email = `graph-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const res = await signup({ email, workspaceName: "Acme Corp" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.pendingVerification).toBe(true);

    // The response discloses no identifiers; resolve the graph from the DB.
    expect(json.user).toBeUndefined();
    expect(json.workspace).toBeUndefined();

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    const userId = users[0].id;
    // No credential exists until the mailbox is proven.
    expect(users[0].hashedPassword).toBeNull();
    const ownWorkspaces = await db.workspaceMembership.findMany({ where: { userId } });
    expect(ownWorkspaces).toHaveLength(1);
    const workspaceId = ownWorkspaces[0].workspaceId;
    // Open-beta signup never grants unrestricted access before verification.
    expect(users[0].requiresEmailVerification).toBe(true);
    expect(users[0].emailVerifiedAt).toBeNull();

    const memberships = await db.workspaceMembership.findMany({ where: { userId, isActive: true } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].workspaceId).toBe(workspaceId);

    const roleAssignments = await db.userRoleAssignment.findMany({ where: { userId, isActive: true } });
    expect(roleAssignments).toHaveLength(1);
    expect(roleAssignments[0].scopeId).toBe(workspaceId);
    expect(roleAssignments[0].scope).toBe("workspace");

    // No session and no cookie: the account is not usable until verify-email
    // redeems the emailed token (see verify-email.db.test.ts).
    const sessions = await db.session.findMany({ where: { userId } });
    expect(sessions).toHaveLength(0);
    expect(mockCookieSet).not.toHaveBeenCalled();

    const verificationTokens = await db.emailVerificationToken.findMany({ where: { userId } });
    expect(verificationTokens).toHaveLength(1);
    expect(verificationTokens[0].usedAt).toBeNull();
    expect(verificationTokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Consent is recorded only after ownership is proven (reset-password setup), never at signup.
    const acceptances = await db.policyAcceptance.findMany({ where: { userId } });
    expect(acceptances).toHaveLength(0);

    const workspaces = await db.workspace.findMany({ where: { id: workspaceId } });
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].signupSource).toBe("PUBLIC_BETA");
  });

  it("[db] a repeated signup for a still-unverified email is not a conflict and creates no second account graph", async () => {
    const email = `dup-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const first = await signup({ email, workspaceName: "First Co" });
    expect(first.status).toBe(201);

    const second = await signup({ email, workspaceName: "Second Co" });
    expect(second.status).toBe(201);

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    const workspaces = await db.workspace.findMany({ where: { createdBy: users[0].id } });
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe("First Co");

    // Once the mailbox is proven the same request is today's explicit conflict.
    await db.user.update({ where: { id: users[0].id }, data: { emailVerifiedAt: new Date() } });
    const third = await signup({ email, workspaceName: "Third Co" });
    expect(third.status).toBe(409);
    expect(await db.user.count({ where: { email } })).toBe(1);
  });

  it("[db] a whitespace-only workspace name is rejected outright (nothing to slug)", async () => {
    const email = `empty-name-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const res = await signup({ email, workspaceName: "   " });
    expect(res.status).toBe(400);

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(0);
  });

  it("[db] a name with surrounding whitespace is stored trimmed", async () => {
    const email = `trim-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);
    const res = await signup({ email, workspaceName: "  Acme Corp  " });
    expect(res.status).toBe(201);
    const users = await db.user.findMany({ where: { email } });
    const membership = await db.workspaceMembership.findFirst({ where: { userId: users[0].id } });
    const workspace = await db.workspace.findUnique({ where: { id: membership!.workspaceId } });
    expect(workspace!.name).toBe("Acme Corp");
  });

  it("[db] degenerate-but-non-empty workspace names (punctuation/emoji, still valid display names) never collide", async () => {
    const names = ["!!!---...", "🚀🚀🚀"];
    const emails: string[] = [];

    for (const name of names) {
      const email = `slug-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
      emails.push(email);
      createdEmails.push(email);
      const res = await signup({ email, workspaceName: name });
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

    const responses = await Promise.all([
      signup({ email, workspaceName: "Racer A" }),
      signup({ email, workspaceName: "Racer B" }),
    ]);

    // Both requests resolve with the SAME success answer (the loser is treated as a repeated signup for a
    // still-pending account, not a conflict and not a thrown/rejected promise) -- yet exactly one account graph
    // is created and exactly one verification link stays live.
    expect(responses.map((r) => r.status)).toEqual([201, 201]);

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    const workspaces = await db.workspace.findMany({ where: { createdBy: users[0].id } });
    expect(workspaces).toHaveLength(1);
    const memberships = await db.workspaceMembership.findMany({ where: { userId: users[0].id } });
    expect(memberships).toHaveLength(1);
    expect(await db.emailVerificationToken.count({ where: { userId: users[0].id, usedAt: null } })).toBe(1);
  });
});
