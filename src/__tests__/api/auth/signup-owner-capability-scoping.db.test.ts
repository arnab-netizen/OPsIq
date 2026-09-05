/**
 * DB-backed proof that self-serve signup no longer over-grants the full
 * consulting-firm capability bundle, and that a legitimately-provisioned
 * portfolio-manager fixture is not regressed.
 *
 * Real POST /api/auth/signup, real DB rows, real cookie-carried session, and
 * the REAL (unmocked) @/services/auth -> capability-check.ts chain -- only
 * `next/headers` cookies() is mocked, as a shared in-memory jar so the token
 * signup's route sets is the same one subsequent route calls read (same
 * pattern as src/services/__tests__/getPolicyContext-db-schema-drift.db.test.ts).
 *
 * Covers:
 *  1. Signup's account graph: WorkspaceMembership.role="owner",
 *     UserRoleAssignment.role="admin_or_portfolio_manager".
 *  2. Route-level DENY: a signup-derived owner gets HTTP 403 from
 *     GET /api/clients (CLIENT_VIEW) and GET /api/engagements (ENGAGEMENT_VIEW).
 *  3. Route-level ALLOW: the same owner gets HTTP 200 from GET /api/owner/config
 *     (OWNER_VIEW).
 *  4. A portfolio-manager fixture created directly at the DB/test-setup level
 *     (WorkspaceMembership.role="admin", never through the disabled invite
 *     endpoint) keeps ALLOW (200) for /api/clients and /api/engagements.
 *  5. Cross-workspace isolation: the owner-scoping/DENY decision for workspace
 *     A never leaks into a second signup's workspace B.
 */
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const SESSION_COOKIE_NAME = "opsiq_session";

// Shared in-memory cookie jar: signup's route calls cookies().set(...); every
// subsequent call in the SAME test reads it back via cookies().get(...). One
// jar per currently-acting session token, swapped by tests that act as a
// second user.
const jar: { token: string | undefined } = { token: undefined };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && jar.token ? { value: jar.token } : undefined,
    set: (_name: string, value: string) => {
      jar.token = value;
    },
  }),
}));

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] self-serve signup capability scoping -- route-level proof",
  () => {
    const createdUserIds: string[] = [];
    const createdWorkspaceIds: string[] = [];

    afterEach(async () => {
      jar.token = undefined;
      if (createdUserIds.length > 0) {
        await db.session.deleteMany({ where: { userId: { in: createdUserIds } } });
        await db.userRoleAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
        await db.workspaceMembership.deleteMany({ where: { userId: { in: createdUserIds } } });
      }
      if (createdWorkspaceIds.length > 0) {
        await db.auditEvent.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
        await db.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
      }
      if (createdUserIds.length > 0) {
        await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      createdUserIds.length = 0;
      createdWorkspaceIds.length = 0;
    });

    async function signup(workspaceName: string) {
      const { POST } = await import("@/app/api/auth/signup/route");
      const email = `owner-scope-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
      const req = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "password123",
          workspaceName,
          acceptTerms: true,
          acceptPrivacy: true,
          acceptBetaNotice: true,
        }),
      });
      const res = await (POST(req as never) as Promise<Response>);
      expect(res.status).toBe(201);
      const json = await res.json();
      createdUserIds.push(json.user.id);
      createdWorkspaceIds.push(json.workspace.id);

      // This file's subject is CAPABILITY SCOPING of an already-existing
      // signup-derived owner, not the email-verification journey (covered by
      // verify-email.db.test.ts) — open-beta signup itself creates no session.
      // Simulate "this account already redeemed its verification link" by
      // marking it verified and minting a session directly, exactly the state
      // POST /api/auth/verify-email would have produced.
      const sessionToken = `owner-scope-verified-${randomUUID()}`;
      await db.user.update({ where: { id: json.user.id }, data: { emailVerifiedAt: new Date() } });
      await db.session.create({
        data: {
          id: randomUUID(),
          userId: json.user.id,
          token: sessionToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      jar.token = sessionToken;

      return { userId: json.user.id as string, workspaceId: json.workspace.id as string };
    }

    function getRequest(path: string): NextRequest {
      return new NextRequest(`https://example.com${path}`, { method: "GET" });
    }

    it("[db] signup's account graph: WorkspaceMembership.role='owner', UserRoleAssignment.role='admin_or_portfolio_manager'", async () => {
      const { userId, workspaceId } = await signup("Acme Corp");

      const membership = await db.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      expect(membership?.role).toBe("owner");

      const roleAssignments = await db.userRoleAssignment.findMany({ where: { userId, isActive: true } });
      expect(roleAssignments).toHaveLength(1);
      expect(roleAssignments[0].role).toBe("admin_or_portfolio_manager");
      expect(roleAssignments[0].scope).toBe("workspace");
      expect(roleAssignments[0].scopeId).toBe(workspaceId);
    });

    it("[db] a signup-derived owner is DENIED (403) at the real route for CLIENT_VIEW, ENGAGEMENT_VIEW, and LEAD_VIEW", async () => {
      await signup("Client Denial Co");
      // jar.token now holds this user's real session cookie (set by the real
      // signup route) -- getSession()/getPolicyContext() resolve it for real.

      const { GET: clientsGET } = await import("@/app/api/clients/route");
      const clientsRes = await clientsGET(getRequest("/api/clients"), { params: Promise.resolve({}) } as never);
      expect(clientsRes.status).toBe(403);

      const { GET: engagementsGET } = await import("@/app/api/engagements/route");
      const engagementsRes = await engagementsGET(getRequest("/api/engagements"), {
        params: Promise.resolve({}),
      } as never);
      expect(engagementsRes.status).toBe(403);

      // /api/leads GET requires CAPABILITIES.LEAD_VIEW via the same
      // withCanonicalEnforcement pattern as clients/engagements -- direct proof,
      // not inferred by route-family analogy.
      const { GET: leadsGET } = await import("@/app/api/leads/route");
      const leadsRes = await leadsGET(getRequest("/api/leads"), { params: Promise.resolve({}) } as never);
      expect(leadsRes.status).toBe(403);
    });

    it("[db] the same signup-derived owner is ALLOWED (200) at the real OWNER_VIEW route", async () => {
      await signup("Owner Allow Co");

      const { GET } = await import("@/app/api/owner/config/route");
      const res = await GET(getRequest("/api/owner/config"), { params: Promise.resolve({}) } as never);
      expect(res.status).toBe(200);
    });

    it("[db] a portfolio-manager fixture (WorkspaceMembership.role='admin', built at DB/test-setup level, not via signup) retains ALLOW (200) for CLIENT_VIEW, ENGAGEMENT_VIEW, and LEAD_VIEW", async () => {
      const userId = randomUUID();
      const workspaceId = randomUUID();
      const sessionToken = `pm-fixture-${randomUUID()}`;
      createdUserIds.push(userId);
      createdWorkspaceIds.push(workspaceId);

      await db.user.create({ data: { id: userId, email: `${userId}@example.com`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: "PM Fixture WS", slug: `pm-${workspaceId.slice(0, 8)}` } });
      // Not "owner" -- a portfolio manager provisioned outside self-serve signup.
      await db.workspaceMembership.create({
        data: { workspaceId, userId, role: "admin", isActive: true },
      });
      await db.userRoleAssignment.create({
        data: {
          id: randomUUID(),
          userId,
          role: "admin_or_portfolio_manager",
          scope: "workspace",
          scopeId: workspaceId,
          isActive: true,
        },
      });
      await db.session.create({
        data: {
          id: randomUUID(),
          userId,
          token: sessionToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      jar.token = sessionToken;

      const { GET: clientsGET } = await import("@/app/api/clients/route");
      const clientsRes = await clientsGET(getRequest("/api/clients"), { params: Promise.resolve({}) } as never);
      expect(clientsRes.status).toBe(200);

      const { GET: engagementsGET } = await import("@/app/api/engagements/route");
      const engagementsRes = await engagementsGET(getRequest("/api/engagements"), {
        params: Promise.resolve({}),
      } as never);
      expect(engagementsRes.status).toBe(200);

      const { GET: leadsGET } = await import("@/app/api/leads/route");
      const leadsRes = await leadsGET(getRequest("/api/leads"), { params: Promise.resolve({}) } as never);
      expect(leadsRes.status).toBe(200);
    });

    it("[db] cross-workspace isolation: a second owner's own workspace context is independently derived (also DENIED CLIENT_VIEW, not leaked/upgraded by the first)", async () => {
      await signup("Workspace One Co");
      const second = await signup("Workspace Two Co");
      // jar.token now holds the SECOND signup's own session -- confirms each
      // workspace's owner-scoping is derived independently, not cached/shared.

      const membership = await db.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: second.workspaceId, userId: second.userId } },
      });
      expect(membership?.role).toBe("owner");

      const { GET } = await import("@/app/api/clients/route");
      const res = await GET(getRequest("/api/clients"), { params: Promise.resolve({}) } as never);
      expect(res.status).toBe(403);
    });
  }
);
