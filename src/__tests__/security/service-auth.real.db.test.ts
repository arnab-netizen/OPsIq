/**
 * lib/service-auth — real route, real canonical wrapper, real Postgres.
 *
 * lib/service-auth (requireServiceAuth / requireWorkspaceContext / requireServiceContext) is the gate every
 * context-bearing service (client-account, engagement, kpi, action, evidence, recommendation, lead, user, diagnosis, ...)
 * runs first. Its only prior tests were a unit file under src/__ignored_tests__ that vitest never runs. This file
 * verifies the contract live, through the REAL exported route handlers of /api/clients and /api/clients/[clientId]
 * (which call the real client-account service -> requireServiceContext), wrapped by the REAL withCanonicalEnforcement.
 * Callers are a seeded User + active WorkspaceMembership + workspace-scoped UserRoleAssignment + live Session row; only
 * the Next.js cookie jar is stubbed to carry the seeded session token. Every assertion reads rows back from the database.
 *
 * Contract pinned:
 *   - no session / an unknown session token: the wrapper answers 401 and neither the handler nor the service runs
 *     (nothing is written);
 *   - the acting user id is taken from the verified auth context (createdBy / audit actor), never from the request body;
 *   - the workspace is the caller's own verified workspace: a caller of workspace B addressing a workspace-A client
 *     gets 404 and the row, its version and its audit trail are untouched;
 *   - the service itself fails closed when it is handed a missing context, a context with no verified actor, or a
 *     blank workspace — before reading or writing anything.
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
import { UnauthorizedError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { requireServiceAuth, requireWorkspaceContext, requireServiceContext } from "@/lib/service-auth";
import { updateClient, archiveClient, createClient } from "@/services/client-account";
import { POST as createClientPost } from "@/app/api/clients/route";
import { PATCH as clientPatch, POST as clientArchivePost } from "@/app/api/clients/[clientId]/route";

type Caller = { workspaceId: string; userId: string; token: string };

async function seedCaller(role: RoleName = ROLES.ADMIN_OR_PORTFOLIO_MANAGER): Promise<Caller> {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const token = `svc-auth-${randomUUID()}`;
  await db.workspace.create({ data: { id: workspaceId, name: "svc-auth", slug: `svc-auth-${workspaceId}` } });
  await db.user.create({ data: { id: userId, email: `svc-auth-${userId}@example.com`, name: "svc-auth", isActive: true, updatedAt: new Date() } });
  await db.workspaceMembership.create({ data: { workspaceId, userId, role: "admin" } });
  await db.userRoleAssignment.create({ data: { id: randomUUID(), userId, role, scope: "workspace", scopeId: workspaceId, isActive: true } });
  await db.session.create({ data: { id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });
  return { workspaceId, userId, token };
}

/**
 * visibility "client_visible" so the PATCH route's trailing getClientById read-back (which does not pass an internal-access
 * flag) can return the row; this file is about service-auth, not client visibility classification.
 */
async function seedClient(workspaceId: string, name = "svc-auth client"): Promise<string> {
  const id = randomUUID();
  await db.clientAccount.create({ data: { id, workspaceId, name, visibility: "client_visible", updatedAt: new Date() } });
  return id;
}

async function send(handler: (req: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>, url: string, method: string, token: string | undefined, body: unknown, params: Record<string, string> = {}, headers: Record<string, string> = {}) {
  cookieJar.token = token;
  const req = new NextRequest(url, { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
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

const createViaRoute = (token: string | undefined, body: unknown) =>
  send(createClientPost as never, "http://localhost/api/clients", "POST", token, body, {}, { "idempotency-key": `svc-auth-${randomUUID()}` });

const clientAudits = (workspaceId: string, entityId: string) => db.auditEvent.findMany({ where: { workspaceId, entityId } });

describe("[db] lib/service-auth — pure contract", () => {
  const ctxWith = (verifiedActorId: string): CanonicalAuthContext => ({ verifiedActorId } as unknown as CanonicalAuthContext);

  it("[db] requireServiceAuth returns the verified actor id, and nothing else", () => {
    const actor = randomUUID();
    // A session-user id that differs from verifiedActorId must NOT win: identity is the verified actor.
    const ctx = { verifiedActorId: actor, session: { user: { id: randomUUID() } } } as unknown as CanonicalAuthContext;
    expect(requireServiceAuth(ctx)).toBe(actor);
  });

  it("[db] requireServiceAuth rejects a missing (null / undefined) context with UnauthorizedError", () => {
    expect(() => requireServiceAuth(null)).toThrow(UnauthorizedError);
    expect(() => requireServiceAuth(undefined)).toThrow(UnauthorizedError);
    expect(() => requireServiceAuth(null)).toThrow("Service requires authentication context");
  });

  it("[db] requireServiceAuth rejects a context with an empty / absent verified actor with UnauthorizedError", () => {
    expect(() => requireServiceAuth(ctxWith(""))).toThrow(UnauthorizedError);
    expect(() => requireServiceAuth(ctxWith(""))).toThrow("Invalid auth context: missing user ID");
    expect(() => requireServiceAuth({} as unknown as CanonicalAuthContext)).toThrow(UnauthorizedError);
  });

  it("[db] requireWorkspaceContext accepts a workspace id and rejects null / undefined / empty / whitespace", () => {
    const ws = randomUUID();
    expect(requireWorkspaceContext(ws)).toBe(ws);
    for (const bad of [null, undefined, "", "   ", "\t\n"]) {
      expect(() => requireWorkspaceContext(bad as never), String(JSON.stringify(bad))).toThrow("Service requires workspace context");
    }
  });

  it("[db] requireServiceContext returns [actor, workspace] and fails on either side being absent", () => {
    const actor = randomUUID();
    const ws = randomUUID();
    expect(requireServiceContext(ctxWith(actor), ws)).toEqual([actor, ws]);
    expect(() => requireServiceContext(null, ws)).toThrow(UnauthorizedError);
    expect(() => requireServiceContext(ctxWith(actor), "")).toThrow("Service requires workspace context");
    expect(() => requireServiceContext(ctxWith(""), ws)).toThrow(UnauthorizedError);
  });
});

describe("[db] lib/service-auth — through the real /api/clients routes and the real client-account service", () => {
  let a: Caller;
  let b: Caller;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    cookieJar.token = undefined;
    a = await seedCaller();
    b = await seedCaller();
  });

  it("[db] no session cookie: 401, the service never runs, no client is created", async () => {
    const name = `svc-auth-anon-${randomUUID()}`;
    const res = await createViaRoute(undefined, { name });
    expect(res.status, res.text).toBe(401);
    expect(await db.clientAccount.count({ where: { name } })).toBe(0);
  });

  it("[db] an unknown / forged session token: 401, no client is created", async () => {
    const name = `svc-auth-forged-${randomUUID()}`;
    const res = await createViaRoute(`forged-${randomUUID()}`, { name });
    expect(res.status, res.text).toBe(401);
    expect(await db.clientAccount.count({ where: { name } })).toBe(0);
  });

  it("[db] an expired session token: 401, no client is created", async () => {
    const expired = await seedCaller();
    await db.session.updateMany({ where: { token: expired.token }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const name = `svc-auth-expired-${randomUUID()}`;
    const res = await createViaRoute(expired.token, { name });
    expect(res.status, res.text).toBe(401);
    expect(await db.clientAccount.count({ where: { name } })).toBe(0);
  });

  it("[db] a body that tries to name another workspace or creator is refused 400 (strict schema); nothing is written", async () => {
    const name = `svc-auth-smuggle-${randomUUID()}`;
    const res = await createViaRoute(a.token, { name, workspaceId: b.workspaceId, createdBy: b.userId });
    expect(res.status, res.text).toBe(400);
    expect(await db.clientAccount.count({ where: { name } })).toBe(0);
  });

  it("[db] a valid caller: the actor and workspace written come from the verified context", async () => {
    const name = `svc-auth-ok-${randomUUID()}`;
    const res = await createViaRoute(a.token, { name });
    expect(res.status, res.text).toBe(200);
    const row = await db.clientAccount.findFirstOrThrow({ where: { name } });
    expect(row.workspaceId).toBe(a.workspaceId);
    expect(row.createdBy).toBe(a.userId);
    const audits = await db.auditEvent.findMany({ where: { entityId: row.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(a.userId);
    expect(audits[0].workspaceId).toBe(a.workspaceId);
  });

  it("[db] a wrong-workspace caller (workspace B) updating a workspace-A client: 404, row, version and audit trail untouched", async () => {
    const clientId = await seedClient(a.workspaceId, "A-original");
    const before = await db.clientAccount.findUniqueOrThrow({ where: { id: clientId } });

    const res = await send(clientPatch as never, `http://localhost/api/clients/${clientId}`, "PATCH", b.token, { name: "B-hijack", version: before.version }, { clientId });

    expect(res.status, res.text).toBe(404);
    const after = await db.clientAccount.findUniqueOrThrow({ where: { id: clientId } });
    expect(after.name).toBe("A-original");
    expect(after.version).toBe(before.version);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(await clientAudits(a.workspaceId, clientId)).toHaveLength(0);
    expect(await clientAudits(b.workspaceId, clientId)).toHaveLength(0);
    expect(res.text).not.toContain("A-original");
  });

  it("[db] a wrong-workspace caller (workspace B) archiving a workspace-A client: 404, client stays active", async () => {
    const clientId = await seedClient(a.workspaceId);
    const before = await db.clientAccount.findUniqueOrThrow({ where: { id: clientId } });

    const res = await send(clientArchivePost as never, `http://localhost/api/clients/${clientId}`, "POST", b.token, { action: "archive", version: before.version }, { clientId }, { "idempotency-key": `svc-auth-${randomUUID()}` });

    expect(res.status, res.text).toBe(404);
    const after = await db.clientAccount.findUniqueOrThrow({ where: { id: clientId } });
    expect(after.status).toBe(before.status);
    expect(after.archivedAt).toBeNull();
    expect(after.version).toBe(before.version);
    expect(await clientAudits(a.workspaceId, clientId)).toHaveLength(0);
  });

  it("[db] the owning workspace's caller can update the same client (the 404 above is workspace scoping, not a broken route)", async () => {
    const clientId = await seedClient(a.workspaceId, "A-original");
    const before = await db.clientAccount.findUniqueOrThrow({ where: { id: clientId } });

    const res = await send(clientPatch as never, `http://localhost/api/clients/${clientId}`, "PATCH", a.token, { name: "A-renamed", version: before.version }, { clientId });

    expect(res.status, res.text).toBe(200);
    const after = await db.clientAccount.findUniqueOrThrow({ where: { id: clientId } });
    expect(after.name).toBe("A-renamed");
    expect(after.version).toBe(before.version + 1);
    const audits = await clientAudits(a.workspaceId, clientId);
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(a.userId);
  });

  it("[db] the service fails closed on a missing context: UnauthorizedError, nothing read or written", async () => {
    const clientId = await seedClient(a.workspaceId, "A-original");
    const before = await db.clientAccount.findUniqueOrThrow({ where: { id: clientId } });

    await expect(updateClient(clientId, { name: "x", version: before.version }, null as never, a.workspaceId)).rejects.toThrow(UnauthorizedError);
    await expect(archiveClient(clientId, undefined as never, before.version, a.workspaceId)).rejects.toThrow(UnauthorizedError);
    await expect(createClient({ name: "x" }, null as never, a.workspaceId)).rejects.toThrow(UnauthorizedError);

    const after = await db.clientAccount.findUniqueOrThrow({ where: { id: clientId } });
    expect(after.name).toBe("A-original");
    expect(after.version).toBe(before.version);
    expect(after.status).toBe(before.status);
    expect(await clientAudits(a.workspaceId, clientId)).toHaveLength(0);
  });

  it("[db] the service fails closed on a context with no verified actor, and on a blank workspace", async () => {
    const clientId = await seedClient(a.workspaceId, "A-original");
    const before = await db.clientAccount.findUniqueOrThrow({ where: { id: clientId } });
    const noActor = { verifiedActorId: "" } as unknown as CanonicalAuthContext;
    const actor = { verifiedActorId: a.userId } as unknown as CanonicalAuthContext;

    await expect(updateClient(clientId, { name: "x", version: before.version }, noActor, a.workspaceId)).rejects.toThrow(UnauthorizedError);
    await expect(updateClient(clientId, { name: "x", version: before.version }, actor, "")).rejects.toThrow("Service requires workspace context");
    await expect(updateClient(clientId, { name: "x", version: before.version }, actor, "   ")).rejects.toThrow("Service requires workspace context");

    const after = await db.clientAccount.findUniqueOrThrow({ where: { id: clientId } });
    expect(after.name).toBe("A-original");
    expect(after.version).toBe(before.version);
    expect(await clientAudits(a.workspaceId, clientId)).toHaveLength(0);
  });
});
