/**
 * /api/clients/[clientId]/contacts (GET, POST) and /api/clients/[clientId]/contacts/[contactId] (PATCH, DELETE) — real routes,
 * real canonical wrapper, real Postgres. Its only prior tests lived under src/__ignored_tests__ and never ran.
 *
 * Contract pinned (each case reads the persisted rows and audit events back from the database):
 *   - RBAC per role, from the central capability map: client:view (GET) is held by admin, experienced and beginner consultant
 *     and analyst; client:update (POST / PATCH / DELETE) by admin and experienced consultant only. client_owner,
 *     client_team_member and viewer hold neither; a beta_request_operator (platform role) holds neither. Every refusal is 403
 *     and writes nothing. No session is 401;
 *   - WORKSPACE SCOPING: another workspace's caller cannot list another workspace's contacts (an empty list, nothing leaked),
 *     create a contact under its client (404), or update / deactivate its contact (404); the rows stay as seeded;
 *   - VALIDATION: the id segments must be uuids; bodies are strict (unknown fields — workspaceId, clientId, isActive — are
 *     refused 400, so a contact cannot be deactivated or re-parented through PATCH); name is required, email must be an email;
 *     the POST idempotency-key header is required; DELETE takes exactly {action:"deactivate"}; an inactive contact cannot be
 *     updated;
 *   - AUDIT: create, update and deactivate each emit exactly one internal-visibility audit event carrying the verified actor
 *     and workspace; a duplicate deactivation emits none; a refused call emits none;
 *   - GOVERNED RECORD: "delete" is a soft deactivation (isActive=false, the row stays), is idempotent, and a replayed POST
 *     (same idempotency-key and body) creates one contact; the same key with a different body is refused.
 *
 * Callers are a seeded User + WorkspaceMembership + workspace-scoped UserRoleAssignment + live Session; only the Next.js cookie
 * jar is stubbed to carry the session token. Tagged [db]; vitest.config.ts filters [db] tests out without TEST_WITH_DB=true.
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
import { GET as contactsGet, POST as contactsPost } from "@/app/api/clients/[clientId]/contacts/route";
import { PATCH as contactPatch, DELETE as contactDelete } from "@/app/api/clients/[clientId]/contacts/[contactId]/route";

type Member = { userId: string; token: string };
type Fx = { workspaceId: string; clientId: string; admin: Member };

type Handler = (req: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function seedMember(workspaceId: string, role: RoleName): Promise<Member> {
  const userId = randomUUID();
  const token = `contacts-${randomUUID()}`;
  await db.user.create({ data: { id: userId, email: `contacts-${userId}@example.com`, name: `contacts ${role}`, isActive: true, updatedAt: new Date() } });
  await db.workspaceMembership.create({ data: { workspaceId, userId, role: "admin" } });
  await db.userRoleAssignment.create({ data: { id: randomUUID(), userId, role, scope: "workspace", scopeId: workspaceId, isActive: true } });
  await db.session.create({ data: { id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });
  return { userId, token };
}

async function seedWorkspaceWithClient(): Promise<Fx> {
  const workspaceId = randomUUID();
  const clientId = randomUUID();
  await db.workspace.create({ data: { id: workspaceId, name: "contacts", slug: `contacts-${workspaceId}` } });
  await db.clientAccount.create({ data: { id: clientId, workspaceId, name: "Contacts client", updatedAt: new Date() } });
  const admin = await seedMember(workspaceId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
  return { workspaceId, clientId, admin };
}

async function seedContact(clientId: string, over: { name?: string; isActive?: boolean; isPrimary?: boolean } = {}): Promise<string> {
  const id = randomUUID();
  await db.clientContact.create({
    data: { id, clientId, name: over.name ?? "Seed Contact", email: "seed@example.com", role: "CFO", isActive: over.isActive ?? true, isPrimary: over.isPrimary ?? false, updatedAt: new Date() },
  });
  return id;
}

async function call(handler: Handler, method: string, token: string | undefined, clientId: string, contactId: string | undefined, body?: unknown, headers: Record<string, string> = {}) {
  cookieJar.token = token;
  const path = `/api/clients/${clientId}/contacts${contactId ? `/${contactId}` : ""}`;
  const req = new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const params: Record<string, string> = { clientId, ...(contactId ? { contactId } : {}) };
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

const list = (token: string | undefined, clientId: string) => call(contactsGet as never, "GET", token, clientId, undefined);
const create = (token: string | undefined, clientId: string, body: unknown, key: string | null = `contacts-${randomUUID()}`) =>
  call(contactsPost as never, "POST", token, clientId, undefined, body, key ? { "idempotency-key": key } : {});
const patch = (token: string | undefined, clientId: string, contactId: string, body: unknown) => call(contactPatch as never, "PATCH", token, clientId, contactId, body);
const deactivate = (token: string | undefined, clientId: string, contactId: string, body: unknown = { action: "deactivate" }) =>
  call(contactDelete as never, "DELETE", token, clientId, contactId, body);

const contactAudits = (workspaceId: string, eventName: string, entityId?: string) =>
  db.auditEvent.findMany({ where: { workspaceId, eventName, ...(entityId ? { entityId } : {}) }, orderBy: { occurredAt: "asc" } });
const contactCount = (clientId: string) => db.clientContact.count({ where: { clientId } });

const NEW_CONTACT = { name: "Ada Lovelace", email: "ada@example.com", phone: "+1-555-0100", role: "Owner", isPrimary: true, notes: "prefers email" };

describe("[db] /api/clients/[clientId]/contacts — real routes, real wrapper, real client-contact service", () => {
  let fx: Fx;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    cookieJar.token = undefined;
    fx = await seedWorkspaceWithClient();
  });

  describe("CRUD as an authorized caller (admin_or_portfolio_manager)", () => {
    it("[db] POST creates the contact: 201 {id}, row persisted with the body's fields, one client_contact.created audit event", async () => {
      const res = await create(fx.admin.token, fx.clientId, NEW_CONTACT);

      expect(res.status, res.text).toBe(201);
      const id = res.body.id as string;
      const row = await db.clientContact.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ clientId: fx.clientId, name: "Ada Lovelace", email: "ada@example.com", phone: "+1-555-0100", role: "Owner", isPrimary: true, isActive: true, notes: "prefers email" });
      const audits = await contactAudits(fx.workspaceId, "client_contact.created");
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actorId: fx.admin.userId, entityType: "client_contact", entityId: id, workspaceId: fx.workspaceId, visibility: "internal" });
      expect(audits[0].payload).toMatchObject({ clientId: fx.clientId, name: "Ada Lovelace", role: "Owner" });
    });

    it("[db] POST with only the required name: optional fields default (email/phone/role/notes null, isPrimary false)", async () => {
      const res = await create(fx.admin.token, fx.clientId, { name: "Min Contact" });

      expect(res.status, res.text).toBe(201);
      const row = await db.clientContact.findUniqueOrThrow({ where: { id: res.body.id as string } });
      expect(row).toMatchObject({ name: "Min Contact", email: null, phone: null, role: null, notes: null, isPrimary: false, isActive: true });
    });

    it("[db] GET lists the client's ACTIVE contacts, primary first, as 200 {contacts}", async () => {
      const a = await seedContact(fx.clientId, { name: "Secondary" });
      const b = await seedContact(fx.clientId, { name: "Primary", isPrimary: true });
      await seedContact(fx.clientId, { name: "Gone", isActive: false });

      const res = await list(fx.admin.token, fx.clientId);

      expect(res.status, res.text).toBe(200);
      const contacts = res.body.contacts as Array<{ id: string; name: string }>;
      expect(contacts.map((c) => c.id)).toEqual([b, a]);
      expect(res.text).not.toContain("Gone");
    });

    it("[db] PATCH updates only the supplied fields: 200 {status:'updated'}, one client_contact.updated audit event with the changed fields", async () => {
      const id = await seedContact(fx.clientId);

      const res = await patch(fx.admin.token, fx.clientId, id, { name: "Renamed", notes: "n" });

      expect(res.status, res.text).toBe(200);
      expect(res.body).toEqual({ status: "updated" });
      const row = await db.clientContact.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ name: "Renamed", notes: "n", email: "seed@example.com", role: "CFO", isActive: true });
      const audits = await contactAudits(fx.workspaceId, "client_contact.updated", id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actorId: fx.admin.userId, workspaceId: fx.workspaceId, visibility: "internal" });
      expect(audits[0].payload).toEqual({ name: "Renamed", notes: "n" });
    });

    it("[db] DELETE deactivates (soft): 200 {status:'deactivated'}, the row stays with isActive=false, one client_contact.deactivated audit event, GET no longer lists it", async () => {
      const id = await seedContact(fx.clientId);

      const res = await deactivate(fx.admin.token, fx.clientId, id);

      expect(res.status, res.text).toBe(200);
      expect(res.body).toEqual({ status: "deactivated" });
      expect(await contactCount(fx.clientId)).toBe(1);
      expect((await db.clientContact.findUniqueOrThrow({ where: { id } })).isActive).toBe(false);
      const audits = await contactAudits(fx.workspaceId, "client_contact.deactivated", id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actorId: fx.admin.userId, workspaceId: fx.workspaceId, visibility: "internal" });
      expect(audits[0].payload).toMatchObject({ clientId: fx.clientId });
      expect((await list(fx.admin.token, fx.clientId)).body.contacts).toEqual([]);
    });

    it("[db] a second DELETE of the same contact is idempotent: 200, still inactive, NO second audit event", async () => {
      const id = await seedContact(fx.clientId);
      await deactivate(fx.admin.token, fx.clientId, id);

      const again = await deactivate(fx.admin.token, fx.clientId, id);

      expect(again.status, again.text).toBe(200);
      expect(await contactAudits(fx.workspaceId, "client_contact.deactivated", id)).toHaveLength(1);
      expect(await contactCount(fx.clientId)).toBe(1);
    });

    it("[db] PATCH of a deactivated contact is refused 400 and changes nothing", async () => {
      const id = await seedContact(fx.clientId, { isActive: false });

      const res = await patch(fx.admin.token, fx.clientId, id, { name: "Revived" });

      expect(res.status, res.text).toBe(400);
      expect((await db.clientContact.findUniqueOrThrow({ where: { id } })).name).toBe("Seed Contact");
      expect(await contactAudits(fx.workspaceId, "client_contact.updated", id)).toHaveLength(0);
    });

    it("[db] an experienced_consultant (client:view + client:update) may do all four operations", async () => {
      const consultant = await seedMember(fx.workspaceId, ROLES.EXPERIENCED_CONSULTANT);
      const created = await create(consultant.token, fx.clientId, { name: "By Consultant" });
      expect(created.status, created.text).toBe(201);
      const id = created.body.id as string;
      expect((await list(consultant.token, fx.clientId)).status).toBe(200);
      expect((await patch(consultant.token, fx.clientId, id, { role: "COO" })).status).toBe(200);
      expect((await deactivate(consultant.token, fx.clientId, id)).status).toBe(200);
      const audits = await db.auditEvent.findMany({ where: { workspaceId: fx.workspaceId, actorId: consultant.userId, entityId: id } });
      expect(audits.map((a) => a.eventName).sort()).toEqual(["client_contact.created", "client_contact.deactivated", "client_contact.updated"]);
    });
  });

  describe("RBAC per role", () => {
    // read-only internal roles: client:view without client:update
    for (const role of [ROLES.BEGINNER_CONSULTANT, ROLES.ANALYST] as const) {
      it(`[db] ${role} (client:view, no client:update): GET 200; POST / PATCH / DELETE 403 and nothing is written`, async () => {
        const member = await seedMember(fx.workspaceId, role);
        const id = await seedContact(fx.clientId);
        const auditsBefore = await db.auditEvent.count({ where: { workspaceId: fx.workspaceId } });

        expect((await list(member.token, fx.clientId)).status).toBe(200);
        const c = await create(member.token, fx.clientId, NEW_CONTACT);
        const p = await patch(member.token, fx.clientId, id, { name: "Hijack" });
        const d = await deactivate(member.token, fx.clientId, id);

        expect([c.status, p.status, d.status], `${c.text} ${p.text} ${d.text}`).toEqual([403, 403, 403]);
        expect(await contactCount(fx.clientId)).toBe(1);
        const row = await db.clientContact.findUniqueOrThrow({ where: { id } });
        expect(row).toMatchObject({ name: "Seed Contact", isActive: true });
        expect(await db.auditEvent.count({ where: { workspaceId: fx.workspaceId } })).toBe(auditsBefore);
      });
    }

    // roles with neither capability
    for (const role of [ROLES.CLIENT_OWNER, ROLES.CLIENT_TEAM_MEMBER, ROLES.VIEWER, ROLES.BETA_REQUEST_OPERATOR] as const) {
      it(`[db] ${role} (no client:view, no client:update): GET / POST / PATCH / DELETE all 403 and nothing is written or leaked`, async () => {
        const member = await seedMember(fx.workspaceId, role);
        const id = await seedContact(fx.clientId, { name: "Confidential Contact" });
        const auditsBefore = await db.auditEvent.count({ where: { workspaceId: fx.workspaceId } });

        const g = await list(member.token, fx.clientId);
        const c = await create(member.token, fx.clientId, NEW_CONTACT);
        const p = await patch(member.token, fx.clientId, id, { name: "Hijack" });
        const d = await deactivate(member.token, fx.clientId, id);

        expect([g.status, c.status, p.status, d.status]).toEqual([403, 403, 403, 403]);
        expect(g.text).not.toContain("Confidential Contact");
        expect(await contactCount(fx.clientId)).toBe(1);
        expect(await db.clientContact.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: "Confidential Contact", isActive: true });
        expect(await db.auditEvent.count({ where: { workspaceId: fx.workspaceId } })).toBe(auditsBefore);
      });
    }

    it("[db] no session: every operation is 401 and nothing is written", async () => {
      const id = await seedContact(fx.clientId);

      const g = await list(undefined, fx.clientId);
      const c = await create(undefined, fx.clientId, NEW_CONTACT);
      const p = await patch(undefined, fx.clientId, id, { name: "Hijack" });
      const d = await deactivate(undefined, fx.clientId, id);

      expect([g.status, c.status, p.status, d.status]).toEqual([401, 401, 401, 401]);
      expect(await contactCount(fx.clientId)).toBe(1);
      expect((await db.clientContact.findUniqueOrThrow({ where: { id } })).isActive).toBe(true);
    });
  });

  describe("WORKSPACE SCOPING", () => {
    let other: Fx;
    let contactId: string;

    beforeEach(async () => {
      other = await seedWorkspaceWithClient();
      contactId = await seedContact(fx.clientId, { name: "Workspace A Contact" });
    });

    it("[db] another workspace's admin listing workspace A's client contacts gets an empty list; nothing leaks", async () => {
      const res = await list(other.admin.token, fx.clientId);

      expect(res.status, res.text).toBe(200);
      expect(res.body.contacts).toEqual([]);
      expect(res.text).not.toContain("Workspace A Contact");
    });

    it("[db] another workspace's admin creating a contact under workspace A's client: 404, nothing created, no audit event in either workspace", async () => {
      const res = await create(other.admin.token, fx.clientId, NEW_CONTACT);

      expect(res.status, res.text).toBe(404);
      expect(await contactCount(fx.clientId)).toBe(1);
      expect(await contactAudits(fx.workspaceId, "client_contact.created")).toHaveLength(0);
      expect(await contactAudits(other.workspaceId, "client_contact.created")).toHaveLength(0);
    });

    it("[db] another workspace's admin updating workspace A's contact: 404, row unchanged, no audit event", async () => {
      const res = await patch(other.admin.token, fx.clientId, contactId, { name: "Hijacked" });

      expect(res.status, res.text).toBe(404);
      expect(res.text).not.toContain("Workspace A Contact");
      expect((await db.clientContact.findUniqueOrThrow({ where: { id: contactId } })).name).toBe("Workspace A Contact");
      expect(await contactAudits(fx.workspaceId, "client_contact.updated")).toHaveLength(0);
      expect(await contactAudits(other.workspaceId, "client_contact.updated")).toHaveLength(0);
    });

    it("[db] another workspace's admin deactivating workspace A's contact: 404, contact stays active, no audit event", async () => {
      const res = await deactivate(other.admin.token, fx.clientId, contactId);

      expect(res.status, res.text).toBe(404);
      expect((await db.clientContact.findUniqueOrThrow({ where: { id: contactId } })).isActive).toBe(true);
      expect(await contactAudits(fx.workspaceId, "client_contact.deactivated")).toHaveLength(0);
      expect(await contactAudits(other.workspaceId, "client_contact.deactivated")).toHaveLength(0);
    });

    it("[db] the owning workspace's audit events carry its own workspace id, never the other's", async () => {
      await create(fx.admin.token, fx.clientId, { name: "Scoped" });
      await create(other.admin.token, other.clientId, { name: "Scoped Other" });

      const mine = await contactAudits(fx.workspaceId, "client_contact.created");
      const theirs = await contactAudits(other.workspaceId, "client_contact.created");
      expect(mine).toHaveLength(1);
      expect(theirs).toHaveLength(1);
      expect(mine[0].actorId).toBe(fx.admin.userId);
      expect(theirs[0].actorId).toBe(other.admin.userId);
    });
  });

  describe("VALIDATION", () => {
    it("[db] malformed clientId / contactId segments are refused 400", async () => {
      const id = await seedContact(fx.clientId);

      expect((await list(fx.admin.token, "not-a-uuid")).status).toBe(400);
      expect((await create(fx.admin.token, "not-a-uuid", NEW_CONTACT)).status).toBe(400);
      expect((await patch(fx.admin.token, fx.clientId, "not-a-uuid", { name: "x" })).status).toBe(400);
      expect((await deactivate(fx.admin.token, fx.clientId, "not-a-uuid")).status).toBe(400);
      expect((await deactivate(fx.admin.token, "not-a-uuid", id)).status).toBe(400);
      expect(await contactCount(fx.clientId)).toBe(1);
    });

    it("[db] POST: missing name, empty name and a malformed email are refused 400; nothing is written", async () => {
      expect((await create(fx.admin.token, fx.clientId, { email: "a@example.com" })).status).toBe(400);
      expect((await create(fx.admin.token, fx.clientId, { name: "" })).status).toBe(400);
      expect((await create(fx.admin.token, fx.clientId, { name: "Bad Email", email: "not-an-email" })).status).toBe(400);
      expect(await contactCount(fx.clientId)).toBe(0);
      expect(await contactAudits(fx.workspaceId, "client_contact.created")).toHaveLength(0);
    });

    it("[db] POST: unknown fields (workspaceId, clientId, isActive) are refused 400 — a body cannot re-parent or pre-deactivate", async () => {
      const otherClient = await seedWorkspaceWithClient();
      for (const extra of [{ workspaceId: otherClient.workspaceId }, { clientId: otherClient.clientId }, { isActive: false }]) {
        const res = await create(fx.admin.token, fx.clientId, { name: "Smuggler", ...extra });
        expect(res.status, JSON.stringify(extra) + res.text).toBe(400);
      }
      expect(await contactCount(fx.clientId)).toBe(0);
      expect(await contactCount(otherClient.clientId)).toBe(0);
    });

    it("[db] POST without an idempotency-key header is refused 400; nothing is written", async () => {
      const res = await create(fx.admin.token, fx.clientId, NEW_CONTACT, null);

      expect(res.status, res.text).toBe(400);
      expect(res.body.error).toBe("idempotency-key header required");
      expect(await contactCount(fx.clientId)).toBe(0);
    });

    it("[db] PATCH: a malformed email and unknown fields (isActive, clientId) are refused 400; the contact is unchanged", async () => {
      const id = await seedContact(fx.clientId);
      const otherClient = await seedWorkspaceWithClient();

      expect((await patch(fx.admin.token, fx.clientId, id, { email: "nope" })).status).toBe(400);
      expect((await patch(fx.admin.token, fx.clientId, id, { isActive: false })).status).toBe(400);
      expect((await patch(fx.admin.token, fx.clientId, id, { clientId: otherClient.clientId })).status).toBe(400);
      expect((await patch(fx.admin.token, fx.clientId, id, { name: "" })).status).toBe(400);
      expect(await db.clientContact.findUniqueOrThrow({ where: { id } })).toMatchObject({ clientId: fx.clientId, isActive: true, name: "Seed Contact", email: "seed@example.com" });
      expect(await contactAudits(fx.workspaceId, "client_contact.updated")).toHaveLength(0);
    });

    it("[db] DELETE takes exactly {action:'deactivate'}: any other body is refused 400 and the contact stays active", async () => {
      const id = await seedContact(fx.clientId);

      for (const body of [{}, { action: "delete" }, { action: "deactivate", hard: true }]) {
        const res = await deactivate(fx.admin.token, fx.clientId, id, body);
        expect(res.status, JSON.stringify(body) + res.text).toBe(400);
      }
      expect((await db.clientContact.findUniqueOrThrow({ where: { id } })).isActive).toBe(true);
      expect(await contactAudits(fx.workspaceId, "client_contact.deactivated")).toHaveLength(0);
    });

    it("[db] an unknown (well-formed) contact id is 404 for PATCH and DELETE", async () => {
      expect((await patch(fx.admin.token, fx.clientId, randomUUID(), { name: "x" })).status).toBe(404);
      expect((await deactivate(fx.admin.token, fx.clientId, randomUUID())).status).toBe(404);
    });
  });

  describe("DUPLICATE SUBMISSION", () => {
    it("[db] the same idempotency-key and body replays the first response and creates ONE contact with ONE audit event", async () => {
      const key = `contacts-${randomUUID()}`;

      const first = await create(fx.admin.token, fx.clientId, NEW_CONTACT, key);
      const second = await create(fx.admin.token, fx.clientId, NEW_CONTACT, key);

      expect(first.status, first.text).toBe(201);
      expect(second.status, second.text).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(await contactCount(fx.clientId)).toBe(1);
      expect(await contactAudits(fx.workspaceId, "client_contact.created")).toHaveLength(1);
    });

    it("[db] the same idempotency-key with a different body is refused 400 and creates nothing more", async () => {
      const key = `contacts-${randomUUID()}`;
      const first = await create(fx.admin.token, fx.clientId, NEW_CONTACT, key);
      expect(first.status, first.text).toBe(201);

      const second = await create(fx.admin.token, fx.clientId, { ...NEW_CONTACT, name: "Someone Else" }, key);

      expect(second.status, second.text).toBe(400);
      expect(await contactCount(fx.clientId)).toBe(1);
      expect(await contactAudits(fx.workspaceId, "client_contact.created")).toHaveLength(1);
    });
  });
});
