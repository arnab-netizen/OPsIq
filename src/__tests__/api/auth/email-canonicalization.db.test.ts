/**
 * Email canonicalization — cross-route regression (DB-backed).
 *
 * Root cause: `User.email` has only a plain, case-sensitive `@unique`
 * constraint (no `lower(email)` functional index — see prisma/schema.prisma),
 * and prior to this fix no write or lookup path normalized the value before
 * persisting or querying it. That let "Test@Example.com" and
 * "test@example.com" be created as two distinct Users via
 * POST /api/auth/signup, and made login lookups case-sensitive.
 *
 * The fix funnels every identity-email field (signup, login,
 * forgot-password, and the admin user-management create/update routes)
 * through `identityEmailSchema` (src/lib/validation.ts), which trims and
 * lowercases BEFORE the email-format check runs. This test proves the
 * invariant end-to-end through the real route handlers: a second signup
 * attempt with a case or whitespace variant of an already-registered email
 * is rejected as a duplicate (never creates a second User row), and login
 * succeeds regardless of the case/whitespace variant used to authenticate.
 *
 * Real DB writes; no Prisma mocks. `next/headers` cookies() is mocked
 * because it requires a live Next.js request scope this test harness
 * doesn't provide (same pattern as signup-account-graph.db.test.ts).
 */
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
}));

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Email canonicalization — cross-route", () => {
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

  function jsonRequest(url: string, body: Record<string, unknown>, ip?: string): Request {
    return new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(ip ? { "x-forwarded-for": ip } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async function signup(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/auth/signup/route");
    return POST(
      jsonRequest("http://localhost/api/auth/signup", {
        acceptTerms: true,
        acceptPrivacy: true,
        acceptBetaNotice: true,
        ...body,
      }) as never
    );
  }

  // login has no "skip rate-limit when IP is unknown" carve-out (unlike
  // signup), so every call here uses a fresh, per-test synthetic IP —
  // otherwise repeated test runs would eventually trip
  // `login:unknown`'s shared 15-minute window (see rate-limit.ts).
  async function login(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/auth/login/route");
    const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`;
    return POST(jsonRequest("http://localhost/api/auth/login", body, ip) as never);
  }

  function uniqueBase() {
    return `canon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  it("[db] stores the canonical (trimmed, lowercased) form regardless of input casing", async () => {
    const base = uniqueBase();
    const canonicalEmail = `${base}@example.com`;
    createdEmails.push(canonicalEmail);

    const res = await signup({
      email: `${base.toUpperCase()}@EXAMPLE.COM`,
      password: "password123",
      workspaceName: "Canon Co",
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.user.email).toBe(canonicalEmail);

    const rows = await db.user.findMany({ where: { email: canonicalEmail } });
    expect(rows).toHaveLength(1);
  });

  it("[db] a case-variant of an already-registered email is rejected, never creates a second User", async () => {
    const base = uniqueBase();
    const canonicalEmail = `${base}@example.com`;
    createdEmails.push(canonicalEmail);

    const first = await signup({
      email: canonicalEmail,
      password: "password123",
      workspaceName: "First Co",
    });
    expect(first.status).toBe(201);

    const second = await signup({
      email: canonicalEmail.toUpperCase(),
      password: "password123",
      workspaceName: "Second Co",
    });
    expect(second.status).toBe(409);

    const rows = await db.user.findMany({ where: { email: canonicalEmail } });
    expect(rows).toHaveLength(1);
    // No shadow row under the differently-cased form either — proves the
    // pre-fix failure mode (two distinct rows) cannot recur.
    const shadowRows = await db.user.findMany({ where: { email: canonicalEmail.toUpperCase() } });
    expect(shadowRows).toHaveLength(0);
  });

  it("[db] a whitespace-padded variant of an already-registered email is rejected as a duplicate", async () => {
    const base = uniqueBase();
    const canonicalEmail = `${base}@example.com`;
    createdEmails.push(canonicalEmail);

    const first = await signup({
      email: canonicalEmail,
      password: "password123",
      workspaceName: "First Co",
    });
    expect(first.status).toBe(201);

    const second = await signup({
      email: `  ${canonicalEmail}  `,
      password: "password123",
      workspaceName: "Second Co",
    });
    expect(second.status).toBe(409);

    const rows = await db.user.findMany({ where: { email: canonicalEmail } });
    expect(rows).toHaveLength(1);
  });

  it("[db] login succeeds with a different case/whitespace variant than the email was registered with", async () => {
    const base = uniqueBase();
    const canonicalEmail = `${base}@example.com`;
    createdEmails.push(canonicalEmail);

    const signupRes = await signup({
      email: canonicalEmail,
      password: "password123",
      workspaceName: "Login Co",
    });
    expect(signupRes.status).toBe(201);
    const { user } = await signupRes.json();

    // This test's subject is CASE/WHITESPACE canonicalization of the login
    // lookup, not the email-verification journey (covered by
    // verify-email.db.test.ts) — open-beta signup itself creates no session,
    // and login refuses an unverified account. Mark it verified directly,
    // exactly the state POST /api/auth/verify-email would have produced.
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });

    const loginRes = await login({
      email: `  ${canonicalEmail.toUpperCase()}  `,
      password: "password123",
    });
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson.user.id).toBe(user.id);
    expect(loginJson.user.email).toBe(canonicalEmail);
  });
});
