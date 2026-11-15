/**
 * Controlled Beta Cohort routes — access control.
 *
 * Same technique as administration-v1-rbac.db.test.ts (real fixtures + mocked session facts, because
 * withCanonicalEnforcement does its own workspace-membership lookup). Proves that a self-serve OWNER — the persona that
 * must never see cohort data — cannot reach any of the three routes, nor can the existing production beta operator,
 * a consultant, or an unauthenticated caller; while SYSTEM_ADMIN and ADMINISTRATION_OPERATOR can.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/admin/beta-cohort-rbac.db.test.ts
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let mockSessionValid = true;
let mockActorId = randomUUID();
let mockRoles: Array<{ role: string; scope?: string | null; scopeId?: string | null }> = [];
let mockWorkspaceRole: string | null | undefined = undefined;

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () =>
    mockSessionValid
      ? { valid: true, session: { user: { id: mockActorId, email: "cohort-rbac@example.com", name: "Cohort RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) }, invalidReason: undefined }
      : { valid: false, session: null, invalidReason: "not_found" }
  ),
  getSession: vi.fn(async () =>
    mockSessionValid ? { user: { id: mockActorId, email: "cohort-rbac@example.com", name: "Cohort RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) } : null
  ),
  getPolicyContextFact: vi.fn(async () =>
    mockSessionValid
      ? { valid: true, policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [], workspaceRole: mockWorkspaceRole }, invalidReason: undefined }
      : { valid: false, policy: null, invalidReason: "no_session" }
  ),
}));

type RoleRow = typeof mockRoles;
const role = (r: string) => (workspaceId: string): RoleRow => [{ role: r, scope: "workspace", scopeId: workspaceId }];

let seeded: { actorId: string; workspaceId: string } | null = null;

async function actAs(rolesFn: (workspaceId: string) => RoleRow, opts: { sessionValid?: boolean; workspaceRole?: string } = {}) {
  if (opts.sessionValid === false) {
    mockActorId = randomUUID(); mockRoles = []; mockSessionValid = false; mockWorkspaceRole = undefined; seeded = null;
    return;
  }
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `cohort-rbac-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Cohort RBAC WS", slug: `cohort-rbac-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: opts.workspaceRole ?? "admin", isActive: true } });
  mockActorId = actorId; mockRoles = rolesFn(workspaceId); mockSessionValid = true; mockWorkspaceRole = opts.workspaceRole; seeded = { actorId, workspaceId };
}

const json = (url: string, body: unknown) =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function callView() {
  const { GET } = await import("@/app/api/admin/beta-cohort/route");
  return GET(new NextRequest("http://localhost/api/admin/beta-cohort?cohortId=CB1") as never, {});
}
async function callAssign() {
  const { POST } = await import("@/app/api/admin/beta-cohort/assign/route");
  return POST(json("http://localhost/api/admin/beta-cohort/assign", {
    betaRequestId: randomUUID(), cohortId: "CB1", ownerCode: "CB1-001", kind: "REAL_OWNER", idempotencyKey: `key-${randomUUID()}`,
  }) as never, {});
}
async function callEvidence() {
  const { POST } = await import("@/app/api/admin/beta-cohort/evidence/route");
  return POST(json("http://localhost/api/admin/beta-cohort/evidence", {
    betaRequestId: randomUUID(), idempotencyKey: `key-${randomUUID()}`,
    entry: { entryType: "OBSERVATION", source: "OPERATOR_OBSERVED", trust: "YES" },
  }) as never, {});
}

const surfaces: Array<[string, () => Promise<Response>]> = [["view", callView], ["assign", callAssign], ["evidence", callEvidence]];

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Beta cohort routes — access control", () => {
  afterEach(async () => {
    mockSessionValid = true;
    if (seeded) {
      const { actorId, workspaceId } = seeded;
      await db.workspaceMembership.deleteMany({ where: { workspaceId } }).catch(() => undefined);
      await db.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { id: actorId } }).catch(() => undefined);
      seeded = null;
    }
  });

  for (const [name, call] of surfaces) {
    it(`[db] ${name}: unauthenticated is 401`, async () => {
      await actAs(() => [], { sessionValid: false });
      expect((await call()).status).toBe(401);
    });

    it(`[db] ${name}: a self-serve OWNER (the persona that must never see cohort data) is 403`, async () => {
      await actAs(role(ROLES.ADMIN_OR_PORTFOLIO_MANAGER), { workspaceRole: "owner" });
      expect((await call()).status).toBe(403);
    });

    it(`[db] ${name}: an ordinary consultant is 403`, async () => {
      await actAs(role(ROLES.EXPERIENCED_CONSULTANT));
      expect((await call()).status).toBe(403);
    });

    it(`[db] ${name}: BETA_REQUEST_OPERATOR (the existing production role) is 403 — its bundle was not widened`, async () => {
      await actAs(role(ROLES.BETA_REQUEST_OPERATOR));
      expect((await call()).status).toBe(403);
    });
  }

  it("[db] ADMINISTRATION_OPERATOR and SYSTEM_ADMIN can read the view", async () => {
    await actAs(role(ROLES.ADMINISTRATION_OPERATOR));
    expect((await callView()).status).toBe(200);
    await actAs(role(ROLES.SYSTEM_ADMIN));
    const res = await callView();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gate.gate).toBe("CLOSED");
  });

  it("[db] an authorised operator reaches the service (unknown request → 404 / unassigned → 400, never 401/403)", async () => {
    await actAs(role(ROLES.SYSTEM_ADMIN));
    expect((await callAssign()).status).toBe(404);
    expect((await callEvidence()).status).toBe(400);
  });

  it("[db] input is strictly validated: an unknown field is rejected before any work happens", async () => {
    await actAs(role(ROLES.SYSTEM_ADMIN));
    const { POST } = await import("@/app/api/admin/beta-cohort/assign/route");
    const res = await POST(json("http://localhost/api/admin/beta-cohort/assign", {
      betaRequestId: randomUUID(), cohortId: "CB1", ownerCode: "CB1-001", kind: "REAL_OWNER", idempotencyKey: `key-${randomUUID()}`, email: "x@y.com",
    }) as never, {});
    expect(res.status).toBe(400);
  });
});
