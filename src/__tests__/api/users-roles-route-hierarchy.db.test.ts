/**
 * POST / DELETE /api/users/[userId]/roles — role management through the real route, real canonical wrapper, real Postgres.
 *
 * Defect this pins: the route built the actor's hierarchy level from the LEGACY role ("admin" / "operator") cast to a
 * RoleName. ROLE_HIERARCHY has no "admin" / "operator" key, so every actor's level was 0 and assignHierarchyAuthority
 * refused every role (403 "requires higher hierarchy level") — role management was unusable for every caller. The
 * level is now read from the wrapper's verified PolicyContext (getActorHierarchyLevel(ctx.policy)).
 *
 * Authorization contract (unchanged, from the code):
 *   - the wrapper requires user:assign_role (held by system_admin and admin_or_portfolio_manager; stripped from a
 *     self-serve owner and absent from every consultant/client role);
 *   - services/role-assignment assertHierarchyAuthority: an actor may assign or revoke only roles STRICTLY BELOW its
 *     own highest ROLE_HIERARCHY level (admin_or_portfolio_manager = 80: may manage experienced_consultant (60) and
 *     below; never admin_or_portfolio_manager (80, equal) or system_admin (100, higher));
 *   - assignments are scoped to the caller's verified workspace, which the wrapper derives from the caller's own
 *     membership, so another workspace's assignment is not found (404).
 *
 * Also pinned: a caller-supplied scopeId naming ANOTHER workspace is refused (403) on assign and revoke — it previously
 * let one workspace's admin grant or revoke roles that authorize access to another workspace — and the route's
 * responses carry their real status and body (it returned raw Response objects, which the wrapper serialized as 200 {}).
 *
 * Each caller is a seeded User + WorkspaceMembership + UserRoleAssignment + live Session; only the Next.js cookie jar is
 * stubbed to carry the session token. Rows and audit events are read back from the database.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

const cookieJar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "opsiq_session" && cookieJar.token ? { value: cookieJar.token } : undefined),
  }),
}));

import { db, getDbInstance } from "@/lib/db";
import { ROLES, type RoleName } from "@/domain/constants/roles";
import { GET as getRoles, POST as postRole, DELETE as deleteRole } from "@/app/api/users/[userId]/roles/route";

const HIERARCHY_REFUSAL = (role: string) => `Cannot manage role "${role}" — requires higher hierarchy level`;

async function seedWorkspace(): Promise<string> {
  const workspaceId = randomUUID();
  await db.workspace.create({ data: { id: workspaceId, name: "Roles route", slug: `roles-route-${workspaceId}` } });
  return workspaceId;
}

/** A real member of `workspaceId` holding `role`, with a live session. */
async function seedMember(workspaceId: string, role: RoleName): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  const token = `roles-route-${randomUUID()}`;
  await db.user.create({ data: { id: userId, email: `roles-route-${userId}@example.com`, name: `Roles ${role}`, isActive: true, updatedAt: new Date() } });
  await db.workspaceMembership.create({ data: { workspaceId, userId, role: "admin" } });
  await db.userRoleAssignment.create({ data: { id: randomUUID(), userId, role, scope: "workspace", scopeId: workspaceId, isActive: true } });
  await db.session.create({ data: { id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });
  return { userId, token };
}

async function call(method: "POST" | "DELETE", token: string, userId: string, body: Record<string, unknown>) {
  cookieJar.token = token;
  const req = new NextRequest(`http://localhost/api/users/${userId}/roles`, {
    method,
    headers: { "content-type": "application/json", ...(method === "POST" ? { "idempotency-key": `roles-route-${randomUUID()}` } : {}) },
    body: JSON.stringify(body),
  });
  const handler = method === "POST" ? postRole : deleteRole;
  const res = await handler(req, { params: Promise.resolve({ userId }) });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) as Record<string, unknown>, text };
}

const activeAssignments = (userId: string, role: string, workspaceId: string) =>
  db.userRoleAssignment.count({ where: { userId, role, scope: "workspace", scopeId: workspaceId, isActive: true } });

const roleAudits = (eventName: string, actorId: string, targetUserId: string) =>
  db.auditEvent.findMany({ where: { eventName, actorId, payload: { path: ["userId"], equals: targetUserId } } });

describe("[db] /api/users/[userId]/roles — hierarchy from the verified policy (real route, real wrapper)", () => {
  let ws: string;
  let target: { userId: string };

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    cookieJar.token = undefined;
    ws = await seedWorkspace();
    target = await seedMember(ws, ROLES.VIEWER);
  });

  describe("POST (assign)", () => {
    it("[db] an admin_or_portfolio_manager assigns a lower role: 201, assignment persisted, role.assigned audit event", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const res = await call("POST", admin.token, target.userId, { role: ROLES.EXPERIENCED_CONSULTANT });

      expect(res.status, res.text).toBe(201);
      expect(res.body.isNew).toBe(true);
      expect(typeof res.body.id).toBe("string");
      const row = await db.userRoleAssignment.findUniqueOrThrow({ where: { id: res.body.id as string } });
      expect(row).toMatchObject({ userId: target.userId, role: ROLES.EXPERIENCED_CONSULTANT, scope: "workspace", scopeId: ws, isActive: true, grantedBy: admin.userId });
      const audits = await roleAudits("role.assigned", admin.userId, target.userId);
      expect(audits).toHaveLength(1);
      expect(audits[0].entityId).toBe(row.id);
      expect(audits[0].payload).toMatchObject({ userId: target.userId, role: ROLES.EXPERIENCED_CONSULTANT });
    });

    it("[db] an admin_or_portfolio_manager cannot assign an EQUAL role (admin_or_portfolio_manager) or a HIGHER one (system_admin): 403, nothing written", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      for (const role of [ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ROLES.SYSTEM_ADMIN]) {
        const res = await call("POST", admin.token, target.userId, { role });
        expect(res.status, res.text).toBe(403);
        expect(res.body.error).toBe(HIERARCHY_REFUSAL(role));
        expect(await activeAssignments(target.userId, role, ws)).toBe(0);
      }
      expect(await roleAudits("role.assigned", admin.userId, target.userId)).toHaveLength(0);
    });

    it("[db] a non-admin (experienced_consultant, no user:assign_role) is refused 403 by the wrapper; nothing written", async () => {
      const consultant = await seedMember(ws, ROLES.EXPERIENCED_CONSULTANT);

      const res = await call("POST", consultant.token, target.userId, { role: ROLES.ANALYST });

      expect(res.status, res.text).toBe(403);
      expect(await activeAssignments(target.userId, ROLES.ANALYST, ws)).toBe(0);
      expect(await roleAudits("role.assigned", consultant.userId, target.userId)).toHaveLength(0);
    });
  });

  describe("DELETE (revoke)", () => {
    it("[db] an admin_or_portfolio_manager revokes a lower role: 200 {status:'revoked'}, assignment deactivated, role.revoked audit event", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const res = await call("DELETE", admin.token, target.userId, { role: ROLES.VIEWER });

      expect(res.status, res.text).toBe(200);
      expect(res.body).toEqual({ status: "revoked" });
      expect(await activeAssignments(target.userId, ROLES.VIEWER, ws)).toBe(0);
      const row = await db.userRoleAssignment.findFirstOrThrow({ where: { userId: target.userId, role: ROLES.VIEWER, scopeId: ws } });
      expect(row.isActive).toBe(false);
      expect(row.revokedAt).toBeInstanceOf(Date);
      const audits = await roleAudits("role.revoked", admin.userId, target.userId);
      expect(audits).toHaveLength(1);
      expect(audits[0].entityId).toBe(row.id);
    });

    it("[db] an admin_or_portfolio_manager cannot revoke an EQUAL role: 403, assignment stays active", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const peer = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const res = await call("DELETE", admin.token, peer.userId, { role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER });

      expect(res.status, res.text).toBe(403);
      expect(res.body.error).toBe(HIERARCHY_REFUSAL(ROLES.ADMIN_OR_PORTFOLIO_MANAGER));
      expect(await activeAssignments(peer.userId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ws)).toBe(1);
      expect(await roleAudits("role.revoked", admin.userId, peer.userId)).toHaveLength(0);
    });

    it("[db] a non-admin is refused 403 by the wrapper; assignment stays active", async () => {
      const consultant = await seedMember(ws, ROLES.EXPERIENCED_CONSULTANT);

      const res = await call("DELETE", consultant.token, target.userId, { role: ROLES.VIEWER });

      expect(res.status, res.text).toBe(403);
      expect(await activeAssignments(target.userId, ROLES.VIEWER, ws)).toBe(1);
    });

    it("[db] another workspace's admin cannot revoke this workspace's assignment: 404, assignment stays active", async () => {
      const otherWs = await seedWorkspace();
      const foreignAdmin = await seedMember(otherWs, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const res = await call("DELETE", foreignAdmin.token, target.userId, { role: ROLES.VIEWER });

      expect(res.status, res.text).toBe(404);
      expect(await activeAssignments(target.userId, ROLES.VIEWER, ws)).toBe(1);
      expect(await roleAudits("role.revoked", foreignAdmin.userId, target.userId)).toHaveLength(0);
    });
  });

  describe("tenant isolation of the scope", () => {
    it("[db] an admin cannot ASSIGN a role scoped to another workspace via scopeId: 403, nothing written there", async () => {
      const otherWs = await seedWorkspace();
      const foreignAdmin = await seedMember(otherWs, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const res = await call("POST", foreignAdmin.token, target.userId, { role: ROLES.EXPERIENCED_CONSULTANT, scope: "workspace", scopeId: ws });

      expect(res.status, res.text).toBe(403);
      expect(res.body.error).toBe("Role assignments can only be managed within your own workspace");
      expect(await activeAssignments(target.userId, ROLES.EXPERIENCED_CONSULTANT, ws)).toBe(0);
      expect(await roleAudits("role.assigned", foreignAdmin.userId, target.userId)).toHaveLength(0);
    });

    it("[db] an admin cannot REVOKE another workspace's assignment via scopeId: 403, assignment stays active", async () => {
      const otherWs = await seedWorkspace();
      const foreignAdmin = await seedMember(otherWs, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const res = await call("DELETE", foreignAdmin.token, target.userId, { role: ROLES.VIEWER, scope: "workspace", scopeId: ws });

      expect(res.status, res.text).toBe(403);
      expect(res.body.error).toBe("Role assignments can only be managed within your own workspace");
      expect(await activeAssignments(target.userId, ROLES.VIEWER, ws)).toBe(1);
      expect(await roleAudits("role.revoked", foreignAdmin.userId, target.userId)).toHaveLength(0);
    });
  });

  describe("response contract", () => {
    it("[db] GET returns 200 with the target's workspace roles", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      cookieJar.token = admin.token;
      const req = new NextRequest(`http://localhost/api/users/${target.userId}/roles`, { method: "GET" });

      const res = await getRoles(req, { params: Promise.resolve({ userId: target.userId }) });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { roles: Array<{ role: string; scope: string; scopeId: string }> };
      expect(body.roles).toHaveLength(1);
      expect(body.roles[0]).toMatchObject({ role: ROLES.VIEWER, scope: "workspace", scopeId: ws });
    });

    it("[db] POST without an idempotency-key is a 400 with its message; nothing written", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      cookieJar.token = admin.token;
      const req = new NextRequest(`http://localhost/api/users/${target.userId}/roles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: ROLES.ANALYST }),
      });

      const res = await postRole(req, { params: Promise.resolve({ userId: target.userId }) });

      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("idempotency-key header required");
      expect(await activeAssignments(target.userId, ROLES.ANALYST, ws)).toBe(0);
    });
  });
});
