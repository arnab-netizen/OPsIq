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

/** Every signup body in this file must carry all three consents — the route requires exactly `true` for each. */
function signupBody(overrides: Record<string, unknown>) {
  return { acceptTerms: true, acceptPrivacy: true, acceptBetaNotice: true, ...overrides };
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

    const res = await signup({ email, password: "password123", workspaceName: "Acme Corp" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.pendingVerification).toBe(true);

    const userId = json.user.id as string;
    const workspaceId = json.workspace.id as string;

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(userId);
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

    const acceptances = await db.policyAcceptance.findMany({ where: { userId } });
    expect(acceptances.map((a: { policyType: string }) => a.policyType).sort()).toEqual(
      ["BETA_NOTICE", "PRIVACY", "TERMS"]
    );

    const workspaces = await db.workspace.findMany({ where: { id: workspaceId } });
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].signupSource).toBe("PUBLIC_BETA");
  });

  it("[db] a duplicate email conflicts and creates no second account graph", async () => {
    const email = `dup-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const first = await signup({ email, password: "password123", workspaceName: "First Co" });
    expect(first.status).toBe(201);

    const second = await signup({ email, password: "password123", workspaceName: "Second Co" });
    expect(second.status).toBe(409);

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    const workspaces = await db.workspace.findMany({ where: { createdBy: users[0].id } });
    expect(workspaces).toHaveLength(1);
  });

  it("[db] a whitespace-only workspace name is rejected outright (nothing to slug)", async () => {
    const email = `empty-name-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const res = await signup({ email, password: "password123", workspaceName: "   " });
    expect(res.status).toBe(400);

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

    const responses = await Promise.all([
      signup({ email, password: "password123", workspaceName: "Racer A" }),
      signup({ email, password: "password123", workspaceName: "Racer B" }),
    ]);

    // Both requests resolve (the loser gets a governed 409, not a thrown/rejected
    // promise) -- exactly one must have actually created the account.
    const succeeded = responses.filter((r) => r.status === 201);
    const conflicted = responses.filter((r) => r.status === 409);
    expect(succeeded.length).toBe(1);
    expect(conflicted.length).toBe(1);

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    const workspaces = await db.workspace.findMany({ where: { createdBy: users[0].id } });
    expect(workspaces).toHaveLength(1);
    const memberships = await db.workspaceMembership.findMany({ where: { userId: users[0].id } });
    expect(memberships).toHaveLength(1);
  });
});
