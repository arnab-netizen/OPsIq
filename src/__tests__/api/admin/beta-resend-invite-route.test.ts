/**
 * POST /api/admin/beta-requests/[id]/resend-invite — RBAC, idempotency and explicit-outcome proof. Real route handler
 * through the real canonical wrapper; only the @/services/auth boundary is mocked (same technique as
 * beta-requests-rbac.test.ts, whose fixture notes apply). With no RESEND_API_KEY the provider is absent, so a permitted
 * resend must answer with an explicit NO_PROVIDER outcome — never a generic success.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/admin/beta-resend-invite-route.test.ts
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
const betaOperatorRoles = (workspaceId: string): RoleRow => [{ role: ROLES.BETA_REQUEST_OPERATOR, scope: "workspace", scopeId: workspaceId }];

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


async function resendInvite(id: string, idempotencyKey: string | null = randomUUID()) {
  const { POST } = await import("@/app/api/admin/beta-requests/[id]/resend-invite/route");
  return POST(
    new NextRequest(`http://localhost/api/admin/beta-requests/${id}/resend-invite`, {
      method: "POST",
      headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {},
    }),
    { params: Promise.resolve({ id }) }
  );
}

const createdIds: string[] = [];

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
  if (createdIds.length) {
    await db.auditEvent.deleteMany({ where: { entityId: { in: createdIds } } }).catch(() => undefined);
    await db.betaRequest.deleteMany({ where: { id: { in: createdIds } } }).catch(() => undefined);
    createdIds.length = 0;
  }
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] POST /api/admin/beta-requests/[id]/resend-invite", () => {
  it("[db] unauthenticated is denied (401)", async () => {
    await actAs(NO_ROLES, { sessionValid: false });
    expect((await resendInvite(randomUUID())).status).toBe(401);
  });

  it("[db] ordinary business owner and role-less user are denied (403)", async () => {
    await actAs(selfServeOwnerRoles, { workspaceRole: "owner", membershipRole: "owner" });
    expect((await resendInvite(randomUUID())).status).toBe(403);
    await actAs(NO_ROLES);
    expect((await resendInvite(randomUUID())).status).toBe(403);
  });

  it("[db] requires an idempotency-key header", async () => {
    await actAs(betaOperatorRoles);
    expect((await resendInvite(randomUUID(), null)).status).toBe(400);
  });

  it("[db] a beta operator gets an explicit outcome; the invite state is untouched; the same key replays the cached answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = randomUUID();
    createdIds.push(id);
    const invitedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.betaRequest.create({ data: { id, email: `resend-route-${id}@example.com`, status: "INVITED", invitedAt, invitedBy: randomUUID() } });

    await actAs(betaOperatorRoles);
    const key = randomUUID();
    const first = await resendInvite(id, key);
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.emailDelivery).toBe("NO_PROVIDER");
    expect(body.status).toBe("INVITED");
    expect(body.invitedAt).toBe(invitedAt.toISOString());
    const row = await db.betaRequest.findUnique({ where: { id } });
    expect(row?.invitedAt?.toISOString()).toBe(invitedAt.toISOString());

    const second = await resendInvite(id, key);
    expect(await second.json()).toEqual(body);
    const attempts = await db.auditEvent.findMany({ where: { entityId: id, eventName: "beta_request.invite_email_attempted" } });
    expect(attempts).toHaveLength(1);
  });

  it("[db] a fresh key inside the cooldown is NOT_ATTEMPTED with a reason (no second attempt)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = randomUUID();
    createdIds.push(id);
    await db.betaRequest.create({ data: { id, email: `resend-cool-${id}@example.com`, status: "INVITED", invitedAt: new Date(), invitedBy: randomUUID() } });
    await actAs(betaOperatorRoles);
    await resendInvite(id);
    const res = await resendInvite(id);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.emailDelivery).toBe("NOT_ATTEMPTED");
    expect(body.emailDeliveryReason).toMatch(/wait \d+ seconds/);
  });
});
