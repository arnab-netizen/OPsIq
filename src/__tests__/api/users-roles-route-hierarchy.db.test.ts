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
import { isPlatformRole } from "@/policies/capability-check";
import { GET as getRoles, POST as postRole, DELETE as deleteRole } from "@/app/api/users/[userId]/roles/route";

const HIERARCHY_REFUSAL = (role: string) => `Cannot manage role "${role}" — requires higher hierarchy level`;
const OUT_OF_BAND_REFUSAL = (role: string) =>
  `Role "${role}" is a platform role: it is provisioned out of band and cannot be granted or revoked here`;

/** The ordinary (workspace-scoped) roles. Every other role must be classified as a platform role. */
const ORDINARY_WORKSPACE_ROLES: readonly string[] = [
  ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
  ROLES.EXPERIENCED_CONSULTANT,
  ROLES.BEGINNER_CONSULTANT,
  ROLES.ANALYST,
  ROLES.CLIENT_OWNER,
  ROLES.CLIENT_TEAM_MEMBER,
  ROLES.VIEWER,
];
const PLATFORM_ROLES = (Object.values(ROLES) as RoleName[]).filter((r) => isPlatformRole(r));
/** The platform roles known today, listed explicitly so the API refusal is tested even if the derivation regressed. */
const KNOWN_PLATFORM_ROLES: readonly RoleName[] = [
  ROLES.SYSTEM_ADMIN,
  ROLES.BETA_REQUEST_OPERATOR,
  ROLES.ADMINISTRATION_OPERATOR,
  ROLES.ACCEPTANCE_FIXTURE_OPERATOR,
];

/** A real user with NO membership of any workspace. */
async function seedUser(): Promise<string> {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `roles-route-${userId}@example.com`, name: "Roles non-member", isActive: true, updatedAt: new Date() } });
  return userId;
}

/** A real engagement of `workspaceId`. */
async function seedEngagement(workspaceId: string): Promise<string> {
  const clientId = randomUUID();
  const engagementId = randomUUID();
  await db.clientAccount.create({ data: { id: clientId, workspaceId, name: "Roles client", updatedAt: new Date() } });
  await db.engagement.create({
    data: { id: engagementId, code: `RR-${engagementId.substring(0, 8)}`, title: "Roles engagement", clientId, workspaceId, serviceTier: "standard", engagementMode: "advisory", updatedAt: new Date() },
  });
  return engagementId;
}

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
  db.auditEvent.findMany({ where: { eventName, actorId, payload: { path: ["userId"], equals: targetUserId } }, orderBy: { occurredAt: "asc" } });

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
      expect(audits[0].workspaceId).toBe(ws);
      expect(audits[0].payload).toMatchObject({ userId: target.userId, role: ROLES.EXPERIENCED_CONSULTANT });
    });

    it("[db] an admin_or_portfolio_manager cannot assign an EQUAL role (admin_or_portfolio_manager): 403 hierarchy refusal, nothing written", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const res = await call("POST", admin.token, target.userId, { role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER });

      expect(res.status, res.text).toBe(403);
      expect(res.body.error).toBe(HIERARCHY_REFUSAL(ROLES.ADMIN_OR_PORTFOLIO_MANAGER));
      expect(await activeAssignments(target.userId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ws)).toBe(0);
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
      expect(audits[0].workspaceId).toBe(ws);
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

  describe("platform roles are provisioned out of band (never through this API)", () => {
    it("the derived platform-role set is exactly the platform operators plus system_admin, and every non-workspace role is in it", () => {
      expect([...PLATFORM_ROLES].sort()).toEqual([...KNOWN_PLATFORM_ROLES].sort());
      // A newly added role that is not an ordinary workspace role must be classified as a platform role
      // (i.e. carry a PLATFORM_CAPABILITIES entry); otherwise it would become grantable here.
      const unclassified = (Object.values(ROLES) as string[]).filter((r) => !ORDINARY_WORKSPACE_ROLES.includes(r) && !PLATFORM_ROLES.includes(r as RoleName));
      expect(unclassified).toEqual([]);
      for (const r of ORDINARY_WORKSPACE_ROLES) expect(isPlatformRole(r as RoleName)).toBe(false);
    });

    it("[db] neither an admin_or_portfolio_manager nor a system_admin can GRANT any platform role: 403 'provisioned out of band', nothing written", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const sysadmin = await seedMember(ws, ROLES.SYSTEM_ADMIN);

      for (const actor of [admin, sysadmin]) {
        for (const role of new Set<RoleName>([...KNOWN_PLATFORM_ROLES, ...PLATFORM_ROLES])) {
          const res = await call("POST", actor.token, target.userId, { role });
          expect(res.status, `${role}: ${res.text}`).toBe(403);
          expect(res.body.error).toBe(OUT_OF_BAND_REFUSAL(role));
          expect(await activeAssignments(target.userId, role, ws)).toBe(0);
        }
        expect(await roleAudits("role.assigned", actor.userId, target.userId)).toHaveLength(0);
      }
    });

    it("[db] a platform role assignment cannot be REVOKED through this API either: 403, assignment stays active", async () => {
      const sysadmin = await seedMember(ws, ROLES.SYSTEM_ADMIN);
      const operator = await seedMember(ws, ROLES.ADMINISTRATION_OPERATOR);

      const res = await call("DELETE", sysadmin.token, operator.userId, { role: ROLES.ADMINISTRATION_OPERATOR });

      expect(res.status, res.text).toBe(403);
      expect(res.body.error).toBe(OUT_OF_BAND_REFUSAL(ROLES.ADMINISTRATION_OPERATOR));
      expect(await activeAssignments(operator.userId, ROLES.ADMINISTRATION_OPERATOR, ws)).toBe(1);
    });

    it("[db] a system_admin can still grant an ordinary workspace role: 201", async () => {
      const sysadmin = await seedMember(ws, ROLES.SYSTEM_ADMIN);

      const res = await call("POST", sysadmin.token, target.userId, { role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER });

      expect(res.status, res.text).toBe(201);
      expect(await activeAssignments(target.userId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ws)).toBe(1);
    });
  });

  describe("re-assignment and per-workspace assignments (no global replay)", () => {
    it("[db] revoke then re-assign re-activates the assignment: 201, row active, a second role.assigned audit event", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const first = await call("POST", admin.token, target.userId, { role: ROLES.ANALYST });
      expect(first.status, first.text).toBe(201);
      const revoked = await call("DELETE", admin.token, target.userId, { role: ROLES.ANALYST });
      expect(revoked.status, revoked.text).toBe(200);
      expect(await activeAssignments(target.userId, ROLES.ANALYST, ws)).toBe(0);

      const again = await call("POST", admin.token, target.userId, { role: ROLES.ANALYST });

      expect(again.status, again.text).toBe(201);
      expect(again.body).toEqual({ id: first.body.id, isNew: true });
      const row = await db.userRoleAssignment.findUniqueOrThrow({ where: { id: again.body.id as string } });
      expect(row.isActive).toBe(true);
      expect(row.revokedAt).toBeNull();
      const assigned = await roleAudits("role.assigned", admin.userId, target.userId);
      expect(assigned).toHaveLength(2);
      expect(assigned.every((a) => a.workspaceId === ws && a.entityId === row.id)).toBe(true);
    });

    it("[db] the same user and role in a second workspace gets that workspace's OWN assignment row and id", async () => {
      const adminA = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const wsB = await seedWorkspace();
      const adminB = await seedMember(wsB, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      await db.workspaceMembership.create({ data: { workspaceId: wsB, userId: target.userId, role: "member" } });

      const inA = await call("POST", adminA.token, target.userId, { role: ROLES.ANALYST });
      const inB = await call("POST", adminB.token, target.userId, { role: ROLES.ANALYST });

      expect(inA.status, inA.text).toBe(201);
      expect(inB.status, inB.text).toBe(201);
      expect(inB.body.id).not.toBe(inA.body.id);
      const rowB = await db.userRoleAssignment.findUniqueOrThrow({ where: { id: inB.body.id as string } });
      expect(rowB).toMatchObject({ userId: target.userId, role: ROLES.ANALYST, scope: "workspace", scopeId: wsB, isActive: true });
      expect(await activeAssignments(target.userId, ROLES.ANALYST, ws)).toBe(1);
      expect(await activeAssignments(target.userId, ROLES.ANALYST, wsB)).toBe(1);
      const auditB = await roleAudits("role.assigned", adminB.userId, target.userId);
      expect(auditB).toHaveLength(1);
      expect(auditB[0]).toMatchObject({ workspaceId: wsB, entityId: rowB.id });
    });
  });

  describe("the target must be an active member of the caller's workspace", () => {
    it("[db] a user with no membership and a nonexistent user id get the SAME 404 (existence not disclosed); nothing written", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const nonMember = await seedUser();
      const missing = randomUUID();

      const resNonMember = await call("POST", admin.token, nonMember, { role: ROLES.ANALYST });
      const resMissing = await call("POST", admin.token, missing, { role: ROLES.ANALYST });

      expect(resNonMember.status, resNonMember.text).toBe(404);
      expect(resMissing.status, resMissing.text).toBe(404);
      expect(resNonMember.body.error).toBe(`User not found: ${nonMember}`);
      expect(resMissing.body.error).toBe(`User not found: ${missing}`);
      expect(await db.userRoleAssignment.count({ where: { userId: nonMember } })).toBe(0);
    });

    it("[db] a member of ANOTHER workspace only gets the same 404; nothing written", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const otherWs = await seedWorkspace();
      const outsider = await seedMember(otherWs, ROLES.VIEWER);

      const res = await call("POST", admin.token, outsider.userId, { role: ROLES.ANALYST });

      expect(res.status, res.text).toBe(404);
      expect(res.body.error).toBe(`User not found: ${outsider.userId}`);
      expect(await activeAssignments(outsider.userId, ROLES.ANALYST, ws)).toBe(0);
    });

    it("[db] a removed (inactive) membership also gets the 404", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      await db.workspaceMembership.updateMany({ where: { workspaceId: ws, userId: target.userId }, data: { isActive: false, removedAt: new Date() } });

      const res = await call("POST", admin.token, target.userId, { role: ROLES.ANALYST });

      expect(res.status, res.text).toBe(404);
      expect(await activeAssignments(target.userId, ROLES.ANALYST, ws)).toBe(0);
    });
  });

  describe("engagement scope", () => {
    const engagementActive = (userId: string, role: string, engagementId: string) =>
      db.userRoleAssignment.count({ where: { userId, role, scope: "engagement", scopeId: engagementId, isActive: true } });

    it("[db] the caller's own engagement: 201, engagement-scoped row persisted, audited in the workspace", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const engagementId = await seedEngagement(ws);

      const res = await call("POST", admin.token, target.userId, { role: ROLES.ANALYST, scope: "engagement", scopeId: engagementId });

      expect(res.status, res.text).toBe(201);
      expect(await engagementActive(target.userId, ROLES.ANALYST, engagementId)).toBe(1);
      const audits = await roleAudits("role.assigned", admin.userId, target.userId);
      expect(audits).toHaveLength(1);
      expect(audits[0].workspaceId).toBe(ws);
    });

    it("[db] another workspace's engagement: 404 on POST and DELETE; nothing written or revoked", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const otherWs = await seedWorkspace();
      const foreignEngagement = await seedEngagement(otherWs);
      // The target already holds a role on the foreign engagement (granted inside that workspace).
      await db.userRoleAssignment.create({
        data: { id: randomUUID(), userId: target.userId, role: ROLES.VIEWER, scope: "engagement", scopeId: foreignEngagement, isActive: true },
      });

      const post = await call("POST", admin.token, target.userId, { role: ROLES.ANALYST, scope: "engagement", scopeId: foreignEngagement });
      const del = await call("DELETE", admin.token, target.userId, { role: ROLES.VIEWER, scope: "engagement", scopeId: foreignEngagement });

      expect(post.status, post.text).toBe(404);
      expect(post.body.error).toBe(`Engagement not found: ${foreignEngagement}`);
      expect(del.status, del.text).toBe(404);
      expect(del.body.error).toBe(`Engagement not found: ${foreignEngagement}`);
      expect(await engagementActive(target.userId, ROLES.ANALYST, foreignEngagement)).toBe(0);
      expect(await engagementActive(target.userId, ROLES.VIEWER, foreignEngagement)).toBe(1);
    });

    it("[db] an engagement scope without scopeId is 400; a workspace id passed as the engagement is 404", async () => {
      const admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const missing = await call("POST", admin.token, target.userId, { role: ROLES.ANALYST, scope: "engagement" });
      const wsAsEngagement = await call("POST", admin.token, target.userId, { role: ROLES.ANALYST, scope: "engagement", scopeId: ws });

      expect(missing.status, missing.text).toBe(400);
      expect(missing.body.error).toBe("scopeId is required for an engagement-scoped role");
      expect(wsAsEngagement.status, wsAsEngagement.text).toBe(404);
      expect(wsAsEngagement.body.error).toBe(`Engagement not found: ${ws}`);
      expect(await db.userRoleAssignment.count({ where: { userId: target.userId, scope: "engagement" } })).toBe(0);
    });
  });
});
