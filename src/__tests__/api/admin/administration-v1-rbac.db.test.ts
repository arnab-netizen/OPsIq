/**
 * Administration V1 RBAC proof — CUSTOMER_ACCESS_MANAGE / BETA_PROGRAM_MANAGE.
 *
 * Same technique and the same STEP-1.5 real-fixture requirement as
 * beta-requests-rbac.test.ts (see that file's own doc comment for the full
 * rationale) — mocking @/services/auth alone is not enough, since
 * withCanonicalEnforcement independently does a real
 * db.workspaceMembership.findFirst lookup before the mocked policy context
 * is consulted. Named *.db.test.ts (unlike beta-requests-rbac.test.ts) so
 * db-verification.yml's substring filter actually picks this file up
 * pre-merge — see Stage 0's finding that the precedent file's naming has
 * exactly this gap.
 *
 * Proves:
 *   - BETA_REQUEST_OPERATOR (the existing production role) is denied on
 *     every new route — its capability bundle was NOT touched by this
 *     mission, confirmed here at the route level, not just by inspection.
 *   - ADMINISTRATION_OPERATOR (the new, unprovisioned-in-production role)
 *     is allowed.
 *   - SYSTEM_ADMIN is unaffected (still allowed, since its capability set
 *     is the full wildcard).
 *   - An unauthenticated caller and an ordinary consultant are denied.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/admin/administration-v1-rbac.db.test.ts
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
      ? { valid: true, session: { user: { id: mockActorId, email: "admin-v1-rbac@example.com", name: "Admin V1 RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) }, invalidReason: undefined }
      : { valid: false, session: null, invalidReason: "not_found" }
  ),
  getSession: vi.fn(async () =>
    mockSessionValid ? { user: { id: mockActorId, email: "admin-v1-rbac@example.com", name: "Admin V1 RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) } : null
  ),
  getPolicyContextFact: vi.fn(async () =>
    mockSessionValid
      ? { valid: true, policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [], workspaceRole: mockWorkspaceRole }, invalidReason: undefined }
      : { valid: false, policy: null, invalidReason: "no_session" }
  ),
}));

type RoleRow = typeof mockRoles;
const betaOperatorRoles = (workspaceId: string): RoleRow => [{ role: ROLES.BETA_REQUEST_OPERATOR, scope: "workspace", scopeId: workspaceId }];
const administrationOperatorRoles = (workspaceId: string): RoleRow => [{ role: ROLES.ADMINISTRATION_OPERATOR, scope: "workspace", scopeId: workspaceId }];
const systemAdminRoles = (workspaceId: string): RoleRow => [{ role: ROLES.SYSTEM_ADMIN, scope: "workspace", scopeId: workspaceId }];
const consultantRoles = (workspaceId: string): RoleRow => [{ role: ROLES.EXPERIENCED_CONSULTANT, scope: "workspace", scopeId: workspaceId }];

let seededActorWorkspace: { actorId: string; workspaceId: string } | null = null;

async function actAs(
  rolesFn: (workspaceId: string) => RoleRow,
  opts: { sessionValid?: boolean } = {}
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
  await db.user.create({ data: { id: actorId, email: `admin-v1-rbac-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Admin V1 RBAC WS", slug: `admin-v1-rbac-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });

  mockActorId = actorId;
  mockRoles = rolesFn(workspaceId);
  mockSessionValid = true;
  mockWorkspaceRole = undefined;
  seededActorWorkspace = { actorId, workspaceId };
  return { actorId, workspaceId };
}

function searchRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/customers/search?query=x");
}

async function callSearch() {
  const { GET } = await import("@/app/api/admin/customers/search/route");
  return GET(searchRequest() as never, {});
}

async function callBootstrapPreview() {
  const { GET } = await import("@/app/api/admin/platform-settings/bootstrap/route");
  return GET(new NextRequest("http://localhost/api/admin/platform-settings/bootstrap") as never, {});
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Administration V1 — CUSTOMER_ACCESS_MANAGE / BETA_PROGRAM_MANAGE RBAC", () => {
  afterEach(async () => {
    mockSessionValid = true;
    if (seededActorWorkspace) {
      const { actorId, workspaceId } = seededActorWorkspace;
      await db.workspaceMembership.deleteMany({ where: { workspaceId } }).catch(() => undefined);
      await db.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { id: actorId } }).catch(() => undefined);
      seededActorWorkspace = null;
    }
  });

  it("[db] unauthenticated is denied on customer search", async () => {
    await actAs(() => [], { sessionValid: false });
    const res = await callSearch();
    expect(res.status).toBe(401);
  });

  it("[db] an ordinary consultant (no beta/administration role) is denied on customer search", async () => {
    await actAs(consultantRoles);
    const res = await callSearch();
    expect(res.status).toBe(403);
  });

  it("[db] BETA_REQUEST_OPERATOR — the existing production role — is denied on customer search (CUSTOMER_ACCESS_MANAGE was NOT added to its bundle)", async () => {
    await actAs(betaOperatorRoles);
    const res = await callSearch();
    expect(res.status).toBe(403);
  });

  it("[db] BETA_REQUEST_OPERATOR is denied on the platform-settings bootstrap preview (BETA_PROGRAM_MANAGE was NOT added to its bundle)", async () => {
    await actAs(betaOperatorRoles);
    const res = await callBootstrapPreview();
    expect(res.status).toBe(403);
  });

  it("[db] ADMINISTRATION_OPERATOR (new role, not provisioned in production) is allowed on customer search", async () => {
    await actAs(administrationOperatorRoles);
    const res = await callSearch();
    expect(res.status).toBe(200);
  });

  it("[db] ADMINISTRATION_OPERATOR is allowed on the platform-settings bootstrap preview", async () => {
    await actAs(administrationOperatorRoles);
    const res = await callBootstrapPreview();
    expect(res.status).toBe(200);
  });

  it("[db] SYSTEM_ADMIN is unaffected — still allowed on both new surfaces", async () => {
    await actAs(systemAdminRoles);
    const searchRes = await callSearch();
    expect(searchRes.status).toBe(200);
    const bootstrapRes = await callBootstrapPreview();
    expect(bootstrapRes.status).toBe(200);
  });
});
