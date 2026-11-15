/**
 * Security matrix for the acceptance fixture authority (docs/opsiq-governance/ACCEPTANCE_FIXTURE_AUTHORITY.md).
 * Invokes the REAL routes through the REAL canonical wrapper. Only the auth boundary (`@/services/auth`)
 * is mocked to supply a session + policy roles + workspace role; workspace membership, capability
 * resolution and every DB write run for real.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/admin/acceptance-fixtures-authority.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { listBusinesses } from "@/services/founder-recovery/business.service";
import { listStartupSessions, recordOwnerDecision } from "@/services/owner-strategy/startup-session.service";
import { handOffStartupSessionToBusiness } from "@/services/owner-strategy/startup-handoff.service";

let mockActorId = randomUUID();
let mockRoles: Array<{ role: string; scope?: string | null; scopeId?: string | null }> = [];
let mockWorkspaceRole: string | null = "owner";

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: { user: { id: mockActorId, email: "fixture-authority@example.com", name: "Fixture Authority", isActive: true }, sessionId: "fixture-authority-session", expiresAt: new Date(Date.now() + 86400000) },
    invalidReason: undefined,
  })),
  getSession: vi.fn(async () => ({
    user: { id: mockActorId, email: "fixture-authority@example.com", name: "Fixture Authority", isActive: true }, sessionId: "fixture-authority-session", expiresAt: new Date(Date.now() + 86400000),
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [], workspaceRole: mockWorkspaceRole },
    invalidReason: undefined,
  })),
}));

// Identities. `owner` mirrors a real self-serve signup (narrowed owner bundle); `acceptance` is that
// same owner PLUS the narrow fixture role (the Production acceptance account shape); `operatorOnly`
// has the narrow role and nothing else; `sysadmin` is the existing SYSTEM_ADMIN.
type Who = "owner" | "acceptance" | "operatorOnly" | "sysadmin";
function actAs(who: Who, ws: string, actorId: string) {
  mockActorId = actorId;
  const W = { scope: "workspace", scopeId: ws };
  mockWorkspaceRole = who === "sysadmin" ? "admin" : "owner";
  mockRoles =
    who === "owner" ? [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ...W }]
    : who === "acceptance" ? [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ...W }, { role: ROLES.ACCEPTANCE_FIXTURE_OPERATOR, ...W }]
    : who === "operatorOnly" ? [{ role: ROLES.ACCEPTANCE_FIXTURE_OPERATOR, ...W }]
    : [{ role: ROLES.SYSTEM_ADMIN, ...W }];
}

const biz = (extra: Record<string, unknown> = {}) => ({ name: "OPSIQ Acceptance - authority", businessType: "laundry_local_service", currency: "INR", ...extra });
const sess = (extra: Record<string, unknown> = {}) => ({
  sessionLabel: "authority",
  intake: { location: "Austin", capitalAvailable: null, hoursPerWeekAvailable: null, riskTolerance: null, skills: [] },
  ideas: [{ name: "Authority idea", industry: "Automotive Services", structural: {} }],
  ...extra,
});

async function call(modulePath: string, method: "GET" | "POST", url: string, body?: unknown, params: Record<string, string> = {}) {
  const mod = await import(modulePath);
  const req = new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return mod[method](req, { params: Promise.resolve(params) });
}
const fx = {
  probe: () => call("@/app/api/admin/acceptance-fixtures/capability/route", "GET", "/api/admin/acceptance-fixtures/capability"),
  business: (b: unknown) => call("@/app/api/admin/acceptance-fixtures/businesses/route", "POST", "/api/admin/acceptance-fixtures/businesses", b),
  session: (b: unknown) => call("@/app/api/admin/acceptance-fixtures/startup-sessions/route", "POST", "/api/admin/acceptance-fixtures/startup-sessions", b),
  blueprint: (sessionId: string, b: unknown) => call("@/app/api/admin/acceptance-fixtures/startup-sessions/[sessionId]/blueprint/route", "POST", `/api/admin/acceptance-fixtures/startup-sessions/${sessionId}/blueprint`, b, { sessionId }),
};

interface Seed { actorId: string; ws: string; }
async function seed(): Promise<Seed> {
  const actorId = randomUUID(); const ws = randomUUID();
  await db.user.create({ data: { id: actorId, email: `fx-auth-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: ws, name: "FX Authority WS", slug: `fx-auth-${ws.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId: ws, role: "owner", isActive: true } });
  return { actorId, ws };
}
async function cleanup(ws: string, actorId: string) {
  for (const t of ["businessRiskEntry", "processExecutionTask", "kPIOwnershipRecord", "businessObjective", "startupExecutionPlan", "startupInitiative", "startupExecutionBlueprint", "startupOwnerDecision", "startupIdeaRecord", "ownerStartupSession", "ownerBusiness"]) {
    await (db as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[t].deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
  }
  await db.auditEvent.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
  await db.workspaceMembership.deleteMany({ where: { userId: actorId } }).catch(() => undefined);
  await db.workspace.delete({ where: { id: ws } }).catch(() => undefined);
  await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
}
const auditCount = (ws: string, eventName: string) => db.auditEvent.count({ where: { workspaceId: ws, eventName } });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] acceptance fixture authority — security matrix", () => {
  let s: Seed;
  beforeEach(async () => { s = await seed(); });
  afterEach(async () => { await cleanup(s.ws, s.actorId); vi.clearAllMocks(); });

  // ── A. ordinary owner + fixture creation ───────────────────────────────────────────────
  it("A: an ordinary owner is refused on every fixture route (403): zero rows, zero creation audit", async () => {
    actAs("owner", s.ws, s.actorId);
    expect((await fx.probe()).status).toBe(403);
    expect((await fx.business(biz())).status).toBe(403);
    expect((await fx.session(sess())).status).toBe(403);
    expect((await fx.blueprint(randomUUID(), { ideaId: randomUUID(), ownerDecisionId: randomUUID(), objectiveTitle: "x" })).status).toBe(403);
    expect(await db.ownerBusiness.count({ where: { workspaceId: s.ws } })).toBe(0);
    expect(await db.ownerStartupSession.count({ where: { workspaceId: s.ws } })).toBe(0);
    expect(await db.startupIdeaRecord.count({ where: { workspaceId: s.ws } })).toBe(0);
    expect(await auditCount(s.ws, AUDIT_EVENTS.OWNER_BUSINESS_CREATED)).toBe(0);
    expect(await auditCount(s.ws, AUDIT_EVENTS.STARTUP_SESSION_CREATED)).toBe(0);
    expect(await auditCount(s.ws, AUDIT_EVENTS.ACCEPTANCE_FIXTURE_CREATED)).toBe(0);
  });

  // ── B. ordinary owner + normal request unchanged ──────────────────────────────────────
  it("B: an ordinary owner's normal business creation is unchanged (201, non-fixture, visible in the list)", async () => {
    actAs("owner", s.ws, s.actorId);
    const res = await call("@/app/api/owner/recovery/businesses/route", "POST", "/api/owner/recovery/businesses", biz({ name: "Real owner business" }));
    expect(res.status).toBe(201);
    const row = await db.ownerBusiness.findUnique({ where: { id: (await res.json()).id } });
    expect(row?.isFixtureBusiness).toBe(false);
    expect((await listBusinesses(s.ws)).map((b: { id: string }) => b.id)).toContain(row!.id);
  });

  // ── C. acceptance identity creates true fixtures ──────────────────────────────────────
  it("C: the acceptance identity creates fixtures only: stored flag true, audited, same workspace", async () => {
    actAs("acceptance", s.ws, s.actorId);
    expect((await fx.probe()).status).toBe(200);
    const res = await fx.business(biz());
    expect(res.status).toBe(201);
    const id = (await res.json()).id;
    const row = await db.ownerBusiness.findUnique({ where: { id } });
    expect(row?.isFixtureBusiness).toBe(true);
    expect(row?.workspaceId).toBe(s.ws);
    expect(await auditCount(s.ws, AUDIT_EVENTS.ACCEPTANCE_FIXTURE_CREATED)).toBe(1);
    expect(await auditCount(s.ws, AUDIT_EVENTS.OWNER_BUSINESS_CREATED)).toBe(1);
  });

  it("C2: a downgrade attempt is impossible — a body carrying the fixture flag (true OR false) or unknown keys is a 400 and writes nothing", async () => {
    actAs("acceptance", s.ws, s.actorId);
    for (const extra of [{ isFixtureBusiness: false }, { isFixtureBusiness: true }, { workspaceId: randomUUID() }, { isFixtureRecord: true }]) {
      expect((await fx.business(biz(extra))).status).toBe(400);
    }
    expect((await fx.session(sess({ isFixtureBusiness: false }))).status).toBe(400);
    expect(await db.ownerBusiness.count({ where: { workspaceId: s.ws } })).toBe(0);
    expect(await db.ownerStartupSession.count({ where: { workspaceId: s.ws } })).toBe(0);
  });

  // ── D. no extra power beyond existing roles ───────────────────────────────────────────
  it("D: the narrow role adds nothing to normal owner creation, and does not unlock the owner-route SYSTEM_ADMIN flag", async () => {
    actAs("operatorOnly", s.ws, s.actorId);
    expect((await call("@/app/api/owner/recovery/businesses/route", "POST", "/api/owner/recovery/businesses", biz())).status).toBe(403); // no OWNER_MANAGE
    actAs("acceptance", s.ws, s.actorId);
    expect((await call("@/app/api/owner/recovery/businesses/route", "POST", "/api/owner/recovery/businesses", biz({ isFixtureBusiness: true }))).status).toBe(403);
    expect(await db.ownerBusiness.count({ where: { workspaceId: s.ws } })).toBe(0);
    const ok = await call("@/app/api/owner/recovery/businesses/route", "POST", "/api/owner/recovery/businesses", biz({ name: "Acceptance acct real biz" }));
    expect(ok.status).toBe(201); // existing owner right, unchanged
    expect((await db.ownerBusiness.findUnique({ where: { id: (await ok.json()).id } }))?.isFixtureBusiness).toBe(false);
  });

  // ── E. SYSTEM_ADMIN still valid ───────────────────────────────────────────────────────
  it("E: SYSTEM_ADMIN can still create fixtures (admin route and the owner-route flag)", async () => {
    actAs("sysadmin", s.ws, s.actorId);
    const a = await fx.business(biz({ name: "sysadmin fixture" }));
    expect(a.status).toBe(201);
    expect((await db.ownerBusiness.findUnique({ where: { id: (await a.json()).id } }))?.isFixtureBusiness).toBe(true);
    const b = await call("@/app/api/owner/recovery/businesses/route", "POST", "/api/owner/recovery/businesses", biz({ name: "sysadmin owner-route fixture", isFixtureBusiness: true }));
    expect(b.status).toBe(201);
    expect((await db.ownerBusiness.findUnique({ where: { id: (await b.json()).id } }))?.isFixtureBusiness).toBe(true);
  });

  // ── F. no unrelated admin endpoint, G. no role/user administration ────────────────────
  it("F: the narrow role cannot reach unrelated /api/admin/* endpoints (403) — including the global fixture list", async () => {
    actAs("acceptance", s.ws, s.actorId);
    const targets: Array<[string, string]> = [
      ["@/app/api/admin/fixture-businesses/route", "/api/admin/fixture-businesses?workspaceId=" + s.ws],
      ["@/app/api/admin/workspaces/route", "/api/admin/workspaces"],
      ["@/app/api/admin/audit-log/route", "/api/admin/audit-log"],
      ["@/app/api/admin/overview/route", "/api/admin/overview"],
      ["@/app/api/admin/customers/search/route", "/api/admin/customers/search?q=a"],
      ["@/app/api/admin/billing/diagnostics/route", "/api/admin/billing/diagnostics"],
      ["@/app/api/admin/platform-settings/route", "/api/admin/platform-settings"],
    ];
    for (const [mod, url] of targets) expect((await call(mod, "GET", url)).status, url).toBe(403);
  });

  it("G: the narrow role cannot administer users or roles", async () => {
    actAs("operatorOnly", s.ws, s.actorId);
    const res = await call("@/app/api/users/[userId]/roles/route", "POST", `/api/users/${randomUUID()}/roles`, { role: ROLES.ACCEPTANCE_FIXTURE_OPERATOR, scope: "workspace", scopeId: s.ws }, { userId: randomUUID() });
    expect(res.status).toBe(403);
    expect(await db.userRoleAssignment.count({ where: { role: ROLES.ACCEPTANCE_FIXTURE_OPERATOR, scopeId: s.ws } })).toBe(0);
  });

  // ── H/J/K. fixture session → fixture business; both absent from ordinary lists ────────
  it("H/J/K: fixture session → blueprint → handoff yields a fixture business; session and business are absent from ordinary lists", async () => {
    actAs("acceptance", s.ws, s.actorId);
    const sres = await fx.session(sess());
    expect(sres.status).toBe(201);
    const sessionId = (await sres.json()).sessionId;
    const row = await db.ownerStartupSession.findUnique({ where: { id: sessionId }, include: { ideas: true } });
    expect(row?.isFixtureBusiness).toBe(true);
    expect((await listStartupSessions(s.ws)).map((x: { id: string }) => x.id)).not.toContain(sessionId); // K
    const ideaId = row!.ideas[0].id;
    const decisionId = await recordOwnerDecision(s.ws, sessionId, s.actorId, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await fx.blueprint(sessionId, { ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    expect(bp.status).toBe(201);
    expect((await db.businessObjective.findMany({ where: { workspaceId: s.ws } })).every((o: { isFixtureRecord: boolean }) => o.isFixtureRecord)).toBe(true);
    const { businessId } = await handOffStartupSessionToBusiness(s.ws, sessionId, s.actorId);
    expect((await db.ownerBusiness.findUnique({ where: { id: businessId } }))?.isFixtureBusiness).toBe(true); // H
    expect((await listBusinesses(s.ws)).map((b: { id: string }) => b.id)).not.toContain(businessId); // J
  });

  // ── attack: cannot be used to hide a real owner's records or reach another tenant ─────
  it("blueprint: refused (404) for a REAL session and for another workspace's fixture session; writes nothing", async () => {
    actAs("acceptance", s.ws, s.actorId);
    const real = await call("@/app/api/owner/startup/sessions/route", "POST", "/api/owner/startup/sessions", sess());
    expect(real.status).toBe(201);
    const realId = (await real.json()).sessionId;
    const realRow = await db.ownerStartupSession.findUnique({ where: { id: realId }, include: { ideas: true } });
    expect(realRow?.isFixtureBusiness).toBe(false);
    const dec = await recordOwnerDecision(s.ws, realId, s.actorId, { decisionType: "GO", ideaId: realRow!.ideas[0].id });
    await db.ownerStartupSession.update({ where: { id: realId }, data: { status: "EXECUTION_PLANNED" } });
    const res = await fx.blueprint(realId, { ideaId: realRow!.ideas[0].id, ownerDecisionId: dec, objectiveTitle: "hide me" });
    expect(res.status).toBe(404);
    expect(await db.startupExecutionBlueprint.count({ where: { workspaceId: s.ws } })).toBe(0);
    expect(await db.businessObjective.count({ where: { workspaceId: s.ws } })).toBe(0);
    expect(await auditCount(s.ws, AUDIT_EVENTS.ACCEPTANCE_FIXTURE_CREATED)).toBe(0);

    const other = await seed();
    try {
      actAs("acceptance", other.ws, other.actorId);
      const fxs = await fx.session(sess());
      const otherSessionId = (await fxs.json()).sessionId;
      actAs("acceptance", s.ws, s.actorId);
      expect((await fx.blueprint(otherSessionId, { ideaId: randomUUID(), ownerDecisionId: randomUUID(), objectiveTitle: "x" })).status).toBe(404);
    } finally { await cleanup(other.ws, other.actorId); }
  });

  // ── L. misconfiguration fails closed ──────────────────────────────────────────────────
  it("L: a revoked/absent role makes the preflight and creation fail closed with zero writes", async () => {
    actAs("acceptance", s.ws, s.actorId);
    expect((await fx.probe()).status).toBe(200);
    actAs("owner", s.ws, s.actorId); // role revoked
    expect((await fx.probe()).status).toBe(403);
    expect((await fx.business(biz())).status).toBe(403);
    expect(await db.ownerBusiness.count({ where: { workspaceId: s.ws } })).toBe(0);
  });
});
