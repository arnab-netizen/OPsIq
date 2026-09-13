/**
 * GET /api/admin/beta-requests + POST /api/admin/beta-requests/[id]/invite — RBAC proof.
 *
 * Invokes the REAL exported route handlers through the REAL canonical wrapper;
 * only the `@/services/auth` boundary is mocked (same technique as
 * src/__tests__/engagements/intervention-route.rbac.test.ts). Proves the
 * migration from CAPABILITIES.SYSTEM_ADMIN to the narrow
 * BETA_REQUEST_REVIEW/BETA_REQUEST_INVITE capabilities:
 *   - unauthenticated, ordinary owner, and ordinary user are all still denied
 *   - a beta-request operator (and, unaffected, SYSTEM_ADMIN) can use these
 *     two routes
 *   - a beta-request operator gets NO other admin surface (workspace list,
 *     workspace disable, fixture-business visibility, billing diagnostics
 *     all remain SYSTEM_ADMIN-only and stay denied)
 *
 * DB-gated like intervention-route.rbac.test.ts: withCanonicalEnforcement
 * runs a DB-backed readiness check (ensureCriticalReadiness) ahead of the
 * mocked auth boundary, so even the pure-denial assertions need a real DB
 * connection to reach evaluateAuthState at all — not just the assertions
 * that list/mutate a BetaRequest row.
 *
 * IMPORTANT — mocking `@/services/auth` is NOT enough on its own.
 * withCanonicalEnforcement (src/lib/canonical-route-enforcement.ts, STEP 1.5)
 * independently performs a REAL `db.workspaceMembership.findFirst(...)`
 * lookup for the session's actorId, BEFORE the mocked policy context's
 * capability grant is ever consulted. Every actor exercised through the real
 * wrapper (allow-path AND denial-path) must therefore have a genuine
 * `User` + `Workspace` + active `WorkspaceMembership` row, exactly like
 * intervention-route.rbac.test.ts's seedBase()/cleanup(). Without it, EVERY
 * actor -- including SYSTEM_ADMIN -- is rejected at STEP 1.5 with a 403
 * classified "workspace_context_invalid", before the intended
 * capability check ever runs. That fixture gap is exactly what caused PR
 * #471's post-merge Main Integration failure: all four allow-path
 * assertions below returned 403 instead of 200, while every denial-path
 * assertion "passed" for the wrong reason (masking the gap, since a missing
 * membership and a missing capability both produce a 403). See the
 * dedicated regression test at the bottom of this file, which documents
 * and locks in this exact behavior.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/admin/beta-requests-rbac.test.ts
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
      ? { valid: true, session: { user: { id: mockActorId, email: "beta-rbac@example.com", name: "Beta RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) }, invalidReason: undefined }
      : { valid: false, session: null, invalidReason: "not_found" }
  ),
  getSession: vi.fn(async () =>
    mockSessionValid ? { user: { id: mockActorId, email: "beta-rbac@example.com", name: "Beta RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) } : null
  ),
  getPolicyContextFact: vi.fn(async () =>
    mockSessionValid
      ? { valid: true, policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [], workspaceRole: mockWorkspaceRole }, invalidReason: undefined }
      : { valid: false, policy: null, invalidReason: "no_session" }
  ),
}));

type RoleRow = typeof mockRoles;
const NO_ROLES: (workspaceId: string) => RoleRow = () => [];
const selfServeOwnerRoles = (workspaceId: string): RoleRow => [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: workspaceId }];
const consultantRoles = (workspaceId: string): RoleRow => [{ role: ROLES.EXPERIENCED_CONSULTANT, scope: "workspace", scopeId: workspaceId }];
const betaOperatorRoles = (workspaceId: string): RoleRow => [{ role: ROLES.BETA_REQUEST_OPERATOR, scope: "workspace", scopeId: workspaceId }];
const systemAdminRoles = (workspaceId: string): RoleRow => [{ role: ROLES.SYSTEM_ADMIN, scope: "workspace", scopeId: workspaceId }];

const NO_PARAMS = { params: Promise.resolve({}) };

// Tracks the real fixture rows the most recent actAs() created, so the
// global afterEach can tear them down without every test repeating cleanup.
let seededActorWorkspace: { actorId: string; workspaceId: string } | null = null;

/**
 * Seed the minimum real account graph withCanonicalEnforcement's STEP 1.5
 * requires (User + Workspace + active WorkspaceMembership), then point the
 * mocked auth boundary at it. Mirrors intervention-route.rbac.test.ts's
 * seedBase(). `sessionValid: false` skips seeding entirely -- an invalid
 * session never reaches the workspace-membership lookup.
 */
async function actAs(
  rolesFn: (workspaceId: string) => RoleRow,
  opts: { sessionValid?: boolean; workspaceRole?: string | null; membershipRole?: string } = {}
): Promise<{ actorId: string; workspaceId: string } | null> {
  if (opts.sessionValid === false) {
    mockActorId = randomUUID();
    mockRoles = [];
    mockSessionValid = false;
    mockWorkspaceRole = undefined;
    seededActorWorkspace = null;
    return null;
  }

  const actorId = randomUUID();
  const workspaceId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `beta-rbac-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Beta RBAC WS", slug: `beta-rbac-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({
    data: { userId: actorId, workspaceId, role: opts.membershipRole ?? "admin", isActive: true },
  });

  mockActorId = actorId;
  mockRoles = rolesFn(workspaceId);
  mockSessionValid = true;
  mockWorkspaceRole = opts.workspaceRole;
  seededActorWorkspace = { actorId, workspaceId };
  return { actorId, workspaceId };
}

async function listBetaRequests() {
  const { GET } = await import("@/app/api/admin/beta-requests/route");
  return GET(new NextRequest("http://localhost/api/admin/beta-requests"), NO_PARAMS);
}

async function inviteBetaRequest(id: string, idempotencyKey = randomUUID()) {
  const { POST } = await import("@/app/api/admin/beta-requests/[id]/invite/route");
  return POST(
    new NextRequest(`http://localhost/api/admin/beta-requests/${id}/invite`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
    }),
    { params: Promise.resolve({ id }) }
  );
}

async function listWorkspaces() {
  const { GET } = await import("@/app/api/admin/workspaces/route");
  return GET(new NextRequest("http://localhost/api/admin/workspaces"), NO_PARAMS);
}

async function disableWorkspace(id: string) {
  const { POST } = await import("@/app/api/admin/workspaces/[id]/disable/route");
  return POST(
    new NextRequest(`http://localhost/api/admin/workspaces/${id}/disable`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ id }) }
  );
}

async function listFixtureBusinesses() {
  const { GET } = await import("@/app/api/admin/fixture-businesses/route");
  return GET(new NextRequest("http://localhost/api/admin/fixture-businesses"), NO_PARAMS);
}

async function getBillingDiagnostics() {
  const { GET } = await import("@/app/api/admin/billing/diagnostics/route");
  return GET(new NextRequest("http://localhost/api/admin/billing/diagnostics"), NO_PARAMS);
}

afterEach(async () => {
  vi.clearAllMocks();
  mockSessionValid = true;
  mockRoles = [];
  mockWorkspaceRole = undefined;
  if (seededActorWorkspace) {
    const { actorId, workspaceId } = seededActorWorkspace;
    await db.workspaceMembership.deleteMany({ where: { userId: actorId } }).catch(() => undefined);
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    seededActorWorkspace = null;
  }
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] GET /api/admin/beta-requests — access denial", () => {
  it("[db] unauthenticated is denied (401)", async () => {
    await actAs(NO_ROLES, { sessionValid: false });
    const res = await listBetaRequests();
    expect(res.status).toBe(401);
  });

  it("[db] ordinary user with no roles is denied (403)", async () => {
    await actAs(NO_ROLES);
    const res = await listBetaRequests();
    expect(res.status).toBe(403);
  });

  it("[db] ordinary self-serve business owner is denied (403)", async () => {
    await actAs(selfServeOwnerRoles, { workspaceRole: "owner", membershipRole: "owner" });
    const res = await listBetaRequests();
    expect(res.status).toBe(403);
  });

  it("[db] an internal consultant role (no beta-operator grant) is denied (403)", async () => {
    await actAs(consultantRoles);
    const res = await listBetaRequests();
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] POST /api/admin/beta-requests/[id]/invite — access denial", () => {
  it("[db] unauthenticated is denied (401)", async () => {
    await actAs(NO_ROLES, { sessionValid: false });
    const res = await inviteBetaRequest(randomUUID());
    expect(res.status).toBe(401);
  });

  it("[db] ordinary self-serve business owner is denied (403)", async () => {
    await actAs(selfServeOwnerRoles, { workspaceRole: "owner", membershipRole: "owner" });
    const res = await inviteBetaRequest(randomUUID());
    expect(res.status).toBe(403);
  });

  it("[db] ordinary user with no roles is denied (403)", async () => {
    await actAs(NO_ROLES);
    const res = await inviteBetaRequest(randomUUID());
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Privilege boundary — a beta-request operator gets NO other admin surface", () => {
  it("[db] cannot list workspaces (SYSTEM_ADMIN-only)", async () => {
    await actAs(betaOperatorRoles);
    const res = await listWorkspaces();
    expect(res.status).toBe(403);
  });

  it("[db] cannot disable a workspace (SYSTEM_ADMIN-only)", async () => {
    await actAs(betaOperatorRoles);
    const res = await disableWorkspace(randomUUID());
    expect(res.status).toBe(403);
  });

  it("[db] cannot view fixture-business visibility (SYSTEM_ADMIN-only)", async () => {
    await actAs(betaOperatorRoles);
    const res = await listFixtureBusinesses();
    expect(res.status).toBe(403);
  });

  it("[db] cannot view billing diagnostics (SYSTEM_ADMIN-only)", async () => {
    await actAs(betaOperatorRoles);
    const res = await getBillingDiagnostics();
    expect(res.status).toBe(403);
  });

  it("[db] does not gain SYSTEM_ADMIN regardless of which workspace the role is scoped to", async () => {
    // Real membership is seeded against the actor's OWN workspace (required for STEP 1.5
    // to pass at all); the mocked role grant is then re-scoped to a wholly unrelated
    // workspace id. Re-scoping changes nothing about which capabilities the role
    // carries -- the grant is capability-based, not workspace-content-based.
    await actAs(NO_ROLES);
    mockRoles = [{ role: ROLES.BETA_REQUEST_OPERATOR, scope: "workspace", scopeId: randomUUID() }];
    const res = await listWorkspaces();
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Authorized beta-request operator — allowed access", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length === 0) return;
    await db.betaRequest.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  });

  it("[db] beta operator can list beta requests (200)", async () => {
    const id = randomUUID();
    createdIds.push(id);
    await db.betaRequest.create({ data: { id, email: `rbac-${id}@example.com` } });

    await actAs(betaOperatorRoles);
    const res = await listBetaRequests();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.betaRequests.some((r: { id: string }) => r.id === id)).toBe(true);
  });

  it("[db] beta operator can invite a beta request (200, transitions to INVITED)", async () => {
    const id = randomUUID();
    createdIds.push(id);
    await db.betaRequest.create({ data: { id, email: `rbac-invite-${id}@example.com` } });

    await actAs(betaOperatorRoles);
    const res = await inviteBetaRequest(id);
    expect(res.status).toBe(200);
    const row = await db.betaRequest.findUnique({ where: { id } });
    expect(row?.status).toBe("INVITED");
  });

  it("[db] invite remains idempotent at the route level (same idempotency-key -> cached response, no re-mutation)", async () => {
    const id = randomUUID();
    createdIds.push(id);
    await db.betaRequest.create({ data: { id, email: `rbac-idem-${id}@example.com` } });

    await actAs(betaOperatorRoles);
    const key = randomUUID();
    const first = await inviteBetaRequest(id, key);
    const second = await inviteBetaRequest(id, key);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
  });

  it("[db] SYSTEM_ADMIN is unaffected and can still list and invite (unrelated functionality unchanged)", async () => {
    const id = randomUUID();
    createdIds.push(id);
    await db.betaRequest.create({ data: { id, email: `rbac-admin-${id}@example.com` } });

    await actAs(systemAdminRoles);
    const listRes = await listBetaRequests();
    expect(listRes.status).toBe(200);

    const inviteRes = await inviteBetaRequest(id);
    expect(inviteRes.status).toBe(200);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Canonical enforcement requires a REAL active WorkspaceMembership, independent of the mocked policy context", () => {
  it("[db] a mocked BETA_REQUEST_OPERATOR grant is rejected before capability evaluation when the actor has no real WorkspaceMembership row", async () => {
    // Deliberately do NOT seed any User/Workspace/WorkspaceMembership row here. This
    // documents and locks in existing production behavior: withCanonicalEnforcement
    // (src/lib/canonical-route-enforcement.ts, STEP 1.5) performs its own real
    // `db.workspaceMembership.findFirst(...)` lookup for the session's actorId BEFORE
    // the mocked policy context's capability grant is ever consulted. An actor that
    // exists only in the auth mock -- not in the database -- is rejected here with a
    // 403 classified "workspace_context_invalid", regardless of which role/capability
    // the mock grants them.
    //
    // This is exactly the fixture gap that caused PR #471's post-merge Main
    // Integration failure: every allow-path test in this file returned 403 instead of
    // 200 because no test created real fixture rows, and every denial-path test
    // "passed" for the wrong reason (this same 403, not an actual capability denial),
    // which is why the gap went undetected until the DB-backed suite ran for real.
    // Do not remove actAs()/seedActor()'s real fixture rows to "simplify" this file --
    // that would silently reopen the exact gap this test exists to catch.
    mockActorId = randomUUID();
    mockRoles = [{ role: ROLES.BETA_REQUEST_OPERATOR, scope: "workspace", scopeId: randomUUID() }];
    mockSessionValid = true;
    mockWorkspaceRole = undefined;

    const res = await listBetaRequests();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.classification).toBe("workspace_context_invalid");
  });
});
