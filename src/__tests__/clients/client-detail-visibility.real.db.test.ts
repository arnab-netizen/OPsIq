/**
 * GET /api/clients, GET / PATCH /api/clients/[clientId] — internal-visibility classification, real routes, real canonical
 * wrapper, real Postgres.
 *
 * Defect this pins: ClientAccount.visibility defaults to "internal", and getClientById / listClients hide every client that
 * is not "client_visible" unless the caller passes an internal-access flag. The routes never passed it, so for every caller
 * that reaches them (client:view is held only by internal roles) GET /api/clients/[id] answered 404 for every ordinary
 * client, GET /api/clients omitted them, and PATCH applied the update and then answered 404 from its read-back — the write
 * committed while the caller was told it failed. The routes now derive the flag from the verified policy exactly as
 * GET /api/engagements/[id] does: ctx.policy ? hasInternalAccess(ctx.policy) : false.
 *
 * Also pinned: the capability map keeps client roles (client_owner, client_team_member, viewer) out of these routes (no
 * client:view), so a client role can read neither an internal nor a client-visible account here; and another workspace's
 * caller gets 404 / an empty list with nothing leaked.
 *
 * Tagged [db]; vitest.config.ts filters [db] tests out of runs without TEST_WITH_DB=true.
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
import { GET as listGet } from "@/app/api/clients/route";
import { GET as detailGet, PATCH as detailPatch } from "@/app/api/clients/[clientId]/route";

type Handler = (req: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Member = { userId: string; token: string };

async function seedWorkspace(): Promise<string> {
  const workspaceId = randomUUID();
  await db.workspace.create({ data: { id: workspaceId, name: "client-vis", slug: `client-vis-${workspaceId}` } });
  return workspaceId;
}

async function seedMember(workspaceId: string, role: RoleName): Promise<Member> {
  const userId = randomUUID();
  const token = `client-vis-${randomUUID()}`;
  await db.user.create({ data: { id: userId, email: `client-vis-${userId}@example.com`, name: `client-vis ${role}`, isActive: true, updatedAt: new Date() } });
  await db.workspaceMembership.create({ data: { workspaceId, userId, role: "admin" } });
  await db.userRoleAssignment.create({ data: { id: randomUUID(), userId, role, scope: "workspace", scopeId: workspaceId, isActive: true } });
  await db.session.create({ data: { id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });
  return { userId, token };
}

async function seedClient(workspaceId: string, visibility: "internal" | "client_visible", name: string): Promise<string> {
  const id = randomUUID();
  await db.clientAccount.create({ data: { id, workspaceId, name, visibility, updatedAt: new Date() } });
  return id;
}

async function call(handler: Handler, method: string, token: string | undefined, url: string, params: Record<string, string>, body?: unknown) {
  cookieJar.token = token;
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const res = await handler(req, { params: Promise.resolve(params) });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return { status: res.status, body: parsed, text };
}

const getDetail = (token: string | undefined, id: string) => call(detailGet as never, "GET", token, `/api/clients/${id}`, { clientId: id });
const patchDetail = (token: string | undefined, id: string, body: unknown) => call(detailPatch as never, "PATCH", token, `/api/clients/${id}`, { clientId: id }, body);
const getList = (token: string | undefined) => call(listGet as never, "GET", token, "/api/clients", {});

describe("[db] client account visibility on GET /api/clients and GET / PATCH /api/clients/[clientId]", () => {
  let ws: string;
  let admin: Member;
  let internalId: string;
  let visibleId: string;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    cookieJar.token = undefined;
    ws = await seedWorkspace();
    admin = await seedMember(ws, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
    internalId = await seedClient(ws, "internal", "Internal Account");
    visibleId = await seedClient(ws, "client_visible", "Visible Account");
  });

  describe("internal users", () => {
    for (const role of [ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ROLES.EXPERIENCED_CONSULTANT, ROLES.BEGINNER_CONSULTANT, ROLES.ANALYST] as const) {
      it(`[db] ${role}: GET /api/clients/[id] returns an internal account and a client-visible one (200)`, async () => {
        const member = await seedMember(ws, role);

        const internal = await getDetail(member.token, internalId);
        const visible = await getDetail(member.token, visibleId);

        expect(internal.status, internal.text).toBe(200);
        expect(internal.body).toMatchObject({ id: internalId, name: "Internal Account", visibility: "internal" });
        expect(visible.status, visible.text).toBe(200);
        expect(visible.body).toMatchObject({ id: visibleId, name: "Visible Account" });
      });
    }

    it("[db] GET /api/clients lists internal and client-visible accounts for an internal user", async () => {
      const res = await getList(admin.token);

      expect(res.status, res.text).toBe(200);
      const ids = (res.body.clients as Array<{ id: string }>).map((c) => c.id).sort();
      expect(ids).toEqual([internalId, visibleId].sort());
      expect(res.body.total).toBe(2);
    });

    it("[db] PATCH on an internal account: 200 with the UPDATED client, row persisted, one audit event (no 404 after a committed write)", async () => {
      const before = await db.clientAccount.findUniqueOrThrow({ where: { id: internalId } });

      const res = await patchDetail(admin.token, internalId, { name: "Renamed Internal", version: before.version });

      expect(res.status, res.text).toBe(200);
      expect(res.body).toMatchObject({ id: internalId, name: "Renamed Internal", version: before.version + 1 });
      const after = await db.clientAccount.findUniqueOrThrow({ where: { id: internalId } });
      expect(after.name).toBe("Renamed Internal");
      expect(after.version).toBe(before.version + 1);
      const audits = await db.auditEvent.findMany({ where: { workspaceId: ws, entityId: internalId, eventName: "client_account.updated" } });
      expect(audits).toHaveLength(1);
      expect(audits[0].actorId).toBe(admin.userId);
    });

    it("[db] PATCH on a client-visible account returns the updated client too", async () => {
      const before = await db.clientAccount.findUniqueOrThrow({ where: { id: visibleId } });

      const res = await patchDetail(admin.token, visibleId, { notes: "n", version: before.version });

      expect(res.status, res.text).toBe(200);
      expect(res.body).toMatchObject({ id: visibleId, notes: "n" });
    });

    it("[db] an internal user holding an additional client role is still an internal reader", async () => {
      const mixed = await seedMember(ws, ROLES.ANALYST);
      await db.userRoleAssignment.create({ data: { id: randomUUID(), userId: mixed.userId, role: ROLES.CLIENT_OWNER, scope: "workspace", scopeId: ws, isActive: true } });

      const res = await getDetail(mixed.token, internalId);

      expect(res.status, res.text).toBe(200);
    });
  });

  describe("client roles stay out", () => {
    for (const role of [ROLES.CLIENT_OWNER, ROLES.CLIENT_TEAM_MEMBER, ROLES.VIEWER] as const) {
      it(`[db] ${role} (no client:view): GET detail, GET list and PATCH are 403 for internal and client-visible accounts; nothing changes or leaks`, async () => {
        const member = await seedMember(ws, role);
        const before = await db.clientAccount.findUniqueOrThrow({ where: { id: internalId } });

        const results = [
          await getDetail(member.token, internalId),
          await getDetail(member.token, visibleId),
          await getList(member.token),
          await patchDetail(member.token, internalId, { name: "Hijack", version: before.version }),
        ];

        expect(results.map((r) => r.status), results.map((r) => r.text).join(" ")).toEqual([403, 403, 403, 403]);
        for (const r of results) {
          expect(r.text).not.toContain("Internal Account");
          expect(r.text).not.toContain("Visible Account");
        }
        expect((await db.clientAccount.findUniqueOrThrow({ where: { id: internalId } })).name).toBe("Internal Account");
      });
    }
  });

  describe("tenancy", () => {
    it("[db] another workspace's admin gets 404 for detail and PATCH, an empty list, and nothing of the account leaks", async () => {
      const otherWs = await seedWorkspace();
      const outsider = await seedMember(otherWs, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const before = await db.clientAccount.findUniqueOrThrow({ where: { id: internalId } });

      const d = await getDetail(outsider.token, internalId);
      const p = await patchDetail(outsider.token, internalId, { name: "Hijack", version: before.version });
      const l = await getList(outsider.token);

      expect([d.status, p.status]).toEqual([404, 404]);
      expect(l.status, l.text).toBe(200);
      expect(l.body.clients).toEqual([]);
      for (const r of [d, p, l]) expect(r.text).not.toContain("Internal Account");
      const after = await db.clientAccount.findUniqueOrThrow({ where: { id: internalId } });
      expect(after.name).toBe("Internal Account");
      expect(after.version).toBe(before.version);
    });

    it("[db] an unknown client id is 404 and a malformed id is 400", async () => {
      expect((await getDetail(admin.token, randomUUID())).status).toBe(404);
      expect((await getDetail(admin.token, "not-a-uuid")).status).toBe(400);
    });

    it("[db] no session: 401", async () => {
      expect((await getDetail(undefined, internalId)).status).toBe(401);
      expect((await getList(undefined)).status).toBe(401);
    });
  });
});
