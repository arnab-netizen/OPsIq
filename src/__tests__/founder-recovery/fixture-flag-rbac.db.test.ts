/**
 * Runtime proof that the isFixtureBusiness create flag is gated on the REAL SYSTEM_ADMIN
 * capability at the route layer, not merely by convention in business.service.ts.
 *
 * Invokes the REAL POST /api/owner/recovery/businesses handler through the REAL canonical
 * wrapper. Only the auth boundary (`@/services/auth`) is mocked to supply a session + policy
 * roles; workspace membership, capability resolution, and the DB write all run for real.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/founder-recovery/fixture-flag-rbac.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let mockActorId = randomUUID();
let mockRoles: Array<{ role: string; scope?: string | null; scopeId?: string | null }> = [];

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: {
      user: { id: mockActorId, email: "fixture-rbac@example.com", name: "Fixture RBAC Test", isActive: true },
      sessionId: "fixture-rbac-session",
      expiresAt: new Date(Date.now() + 86400000),
    },
    invalidReason: undefined,
  })),
  getSession: vi.fn(async () => ({
    user: { id: mockActorId, email: "fixture-rbac@example.com", name: "Fixture RBAC Test", isActive: true },
    sessionId: "fixture-rbac-session",
    expiresAt: new Date(Date.now() + 86400000),
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [] },
    invalidReason: undefined,
  })),
}));

// scopeId must match the real WorkspaceMembership-derived workspace id (see
// services/auth.ts::getPolicyContext, which sets scopeId: resolvedWorkspaceId) — the canonical
// capability resolver used to populate ctx.verifiedCapabilities matches on scope+scopeId, so a
// null scopeId here (unlike the scope-less requireCapabilities gate) would never resolve.
const ownerRole = (workspaceId: string) => [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: workspaceId }];
const systemAdminRole = (workspaceId: string) => [{ role: ROLES.SYSTEM_ADMIN, scope: "workspace", scopeId: workspaceId }];

interface Seeded { actorId: string; workspaceId: string; }

async function seedWorkspace(): Promise<Seeded> {
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `fixture-rbac-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Fixture RBAC WS", slug: `fixture-rbac-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  return { actorId, workspaceId };
}

async function cleanup(s: Seeded) {
  await db.auditEvent.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.ownerBusiness.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.workspaceMembership.deleteMany({ where: { userId: s.actorId } }).catch(() => undefined);
  await db.workspace.delete({ where: { id: s.workspaceId } }).catch(() => undefined);
  await db.user.delete({ where: { id: s.actorId } }).catch(() => undefined);
}

function actAs(actorId: string, roles: ReturnType<typeof ownerRole>) {
  mockActorId = actorId;
  mockRoles = roles;
}

async function postCreateBusiness(body: unknown) {
  const { POST } = await import("@/app/api/owner/recovery/businesses/route");
  const req = new NextRequest("http://localhost/api/owner/recovery/businesses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({}) });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] isFixtureBusiness create-flag RBAC", () => {
  let s: Seeded;
  beforeEach(async () => { s = await seedWorkspace(); });
  afterEach(async () => { await cleanup(s); vi.clearAllMocks(); });

  it("[db] an ordinary owner (OWNER_MANAGE, no SYSTEM_ADMIN) requesting isFixtureBusiness:true is silently ignored", async () => {
    actAs(s.actorId, ownerRole(s.workspaceId));
    const res = await postCreateBusiness({
      name: "Self-serve fixture attempt",
      businessType: "laundry_local_service",
      currency: "INR",
      isFixtureBusiness: true,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const row = await db.ownerBusiness.findUnique({ where: { id: body.id } });
    expect(row?.isFixtureBusiness).toBe(false);
  });

  it("[db] a SYSTEM_ADMIN actor requesting isFixtureBusiness:true is honored", async () => {
    actAs(s.actorId, systemAdminRole(s.workspaceId));
    const res = await postCreateBusiness({
      name: "OPSIQ Acceptance - admin-created",
      businessType: "laundry_local_service",
      currency: "INR",
      isFixtureBusiness: true,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const row = await db.ownerBusiness.findUnique({ where: { id: body.id } });
    expect(row?.isFixtureBusiness).toBe(true);
  });

  it("[db] a SYSTEM_ADMIN actor NOT requesting isFixtureBusiness still creates a real (non-fixture) business", async () => {
    actAs(s.actorId, systemAdminRole(s.workspaceId));
    const res = await postCreateBusiness({
      name: "Admin-created real business",
      businessType: "laundry_local_service",
      currency: "INR",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const row = await db.ownerBusiness.findUnique({ where: { id: body.id } });
    expect(row?.isFixtureBusiness).toBe(false);
  });
});
