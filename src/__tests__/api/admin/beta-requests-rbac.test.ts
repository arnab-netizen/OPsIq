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

const NO_ROLES: typeof mockRoles = [];
const SELF_SERVE_OWNER_ROLES: typeof mockRoles = [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: "ws-1" }];
const CONSULTANT_ROLES: typeof mockRoles = [{ role: ROLES.EXPERIENCED_CONSULTANT, scope: "workspace", scopeId: "ws-1" }];
const BETA_OPERATOR_ROLES: typeof mockRoles = [{ role: ROLES.BETA_REQUEST_OPERATOR, scope: "workspace", scopeId: "ws-1" }];
const SYSTEM_ADMIN_ROLES: typeof mockRoles = [{ role: ROLES.SYSTEM_ADMIN, scope: "workspace", scopeId: "ws-1" }];

const NO_PARAMS = { params: Promise.resolve({}) };

function actAs(roles: typeof mockRoles, opts: { sessionValid?: boolean; workspaceRole?: string | null } = {}) {
  mockActorId = randomUUID();
  mockRoles = roles;
  mockSessionValid = opts.sessionValid ?? true;
  mockWorkspaceRole = opts.workspaceRole ?? (roles === SELF_SERVE_OWNER_ROLES ? "owner" : undefined);
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

afterEach(() => {
  vi.clearAllMocks();
  mockSessionValid = true;
  mockRoles = [];
  mockWorkspaceRole = undefined;
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] GET /api/admin/beta-requests — access denial", () => {
  it("[db] unauthenticated is denied (401)", async () => {
    actAs(NO_ROLES, { sessionValid: false });
    const res = await listBetaRequests();
    expect(res.status).toBe(401);
  });

  it("[db] ordinary user with no roles is denied (403)", async () => {
    actAs(NO_ROLES);
    const res = await listBetaRequests();
    expect(res.status).toBe(403);
  });

  it("[db] ordinary self-serve business owner is denied (403)", async () => {
    actAs(SELF_SERVE_OWNER_ROLES, { workspaceRole: "owner" });
    const res = await listBetaRequests();
    expect(res.status).toBe(403);
  });

  it("[db] an internal consultant role (no beta-operator grant) is denied (403)", async () => {
    actAs(CONSULTANT_ROLES);
    const res = await listBetaRequests();
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] POST /api/admin/beta-requests/[id]/invite — access denial", () => {
  it("[db] unauthenticated is denied (401)", async () => {
    actAs(NO_ROLES, { sessionValid: false });
    const res = await inviteBetaRequest(randomUUID());
    expect(res.status).toBe(401);
  });

  it("[db] ordinary self-serve business owner is denied (403)", async () => {
    actAs(SELF_SERVE_OWNER_ROLES, { workspaceRole: "owner" });
    const res = await inviteBetaRequest(randomUUID());
    expect(res.status).toBe(403);
  });

  it("[db] ordinary user with no roles is denied (403)", async () => {
    actAs(NO_ROLES);
    const res = await inviteBetaRequest(randomUUID());
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Privilege boundary — a beta-request operator gets NO other admin surface", () => {
  it("[db] cannot list workspaces (SYSTEM_ADMIN-only)", async () => {
    actAs(BETA_OPERATOR_ROLES);
    const res = await listWorkspaces();
    expect(res.status).toBe(403);
  });

  it("[db] cannot disable a workspace (SYSTEM_ADMIN-only)", async () => {
    actAs(BETA_OPERATOR_ROLES);
    const res = await disableWorkspace(randomUUID());
    expect(res.status).toBe(403);
  });

  it("[db] cannot view fixture-business visibility (SYSTEM_ADMIN-only)", async () => {
    actAs(BETA_OPERATOR_ROLES);
    const res = await listFixtureBusinesses();
    expect(res.status).toBe(403);
  });

  it("[db] cannot view billing diagnostics (SYSTEM_ADMIN-only)", async () => {
    actAs(BETA_OPERATOR_ROLES);
    const res = await getBillingDiagnostics();
    expect(res.status).toBe(403);
  });

  it("[db] does not gain SYSTEM_ADMIN regardless of which workspace the role is scoped to", async () => {
    // Re-scoping the same role to a different workspace id changes nothing about which
    // capabilities it carries — the grant is capability-based, not workspace-content-based.
    actAs([{ role: ROLES.BETA_REQUEST_OPERATOR, scope: "workspace", scopeId: randomUUID() }]);
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

    actAs(BETA_OPERATOR_ROLES);
    const res = await listBetaRequests();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.betaRequests.some((r: { id: string }) => r.id === id)).toBe(true);
  });

  it("[db] beta operator can invite a beta request (200, transitions to INVITED)", async () => {
    const id = randomUUID();
    createdIds.push(id);
    await db.betaRequest.create({ data: { id, email: `rbac-invite-${id}@example.com` } });

    actAs(BETA_OPERATOR_ROLES);
    const res = await inviteBetaRequest(id);
    expect(res.status).toBe(200);
    const row = await db.betaRequest.findUnique({ where: { id } });
    expect(row?.status).toBe("INVITED");
  });

  it("[db] invite remains idempotent at the route level (same idempotency-key -> cached response, no re-mutation)", async () => {
    const id = randomUUID();
    createdIds.push(id);
    await db.betaRequest.create({ data: { id, email: `rbac-idem-${id}@example.com` } });

    actAs(BETA_OPERATOR_ROLES);
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

    actAs(SYSTEM_ADMIN_ROLES);
    const listRes = await listBetaRequests();
    expect(listRes.status).toBe(200);

    const inviteRes = await inviteBetaRequest(id);
    expect(inviteRes.status).toBe(200);
  });
});
