/**
 * Archetype Operational Metrics routes — runtime RBAC allow/deny proof.
 *
 * Invokes the REAL exported route handlers through the REAL canonical wrapper; only the
 * `@/services/auth` boundary is mocked (session + policy roles). Workspace is derived
 * from a real `db.workspaceMembership` row; capabilities from the real role→capability
 * mapping. Proves OWNER_VIEW read / OWNER_MANAGE write allow + deny, unauthenticated
 * fail-closed, and cross-workspace isolation at runtime.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-budget/archetype-metrics.rbac.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let mockSessionValid = true;
let mockActorId = randomUUID();
let mockRoles: Array<{ role: string; scope?: string | null; scopeId?: string | null }> = [];

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () =>
    mockSessionValid
      ? { valid: true, session: { user: { id: mockActorId, email: "am-rbac@example.com", name: "AM RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) }, invalidReason: undefined }
      : { valid: false, session: null, invalidReason: "not_found" }
  ),
  getSession: vi.fn(async () =>
    mockSessionValid ? { user: { id: mockActorId, email: "am-rbac@example.com", name: "AM RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) } : null
  ),
  getPolicyContextFact: vi.fn(async () =>
    mockSessionValid ? { valid: true, policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [] }, invalidReason: undefined } : { valid: false, policy: null, invalidReason: "no_session" }
  ),
}));

const OWNER_ROLE = [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: null }];
const NO_OWNER_ROLE = [{ role: ROLES.ANALYST, scope: "workspace", scopeId: null }];

interface Seeded { actorId: string; workspaceId: string; businessId: string; }
async function seed(): Promise<Seeded> {
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `am-rbac-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "AM RBAC WS", slug: `am-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  const business = await createBusiness({ name: "AM RBAC Biz", businessType: "laundry_dry_cleaning", currency: "INR", b2cSupported: true, b2bSupported: true }, actorId, workspaceId);
  return { actorId, workspaceId, businessId: business.id };
}
async function cleanup(s: Seeded) {
  await db.auditEvent.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.ownerBusiness.delete({ where: { id: s.businessId } }).catch(() => undefined);
  await db.workspaceMembership.deleteMany({ where: { userId: s.actorId } }).catch(() => undefined);
  await db.workspace.delete({ where: { id: s.workspaceId } }).catch(() => undefined);
  await db.user.delete({ where: { id: s.actorId } }).catch(() => undefined);
}
function actAs(actorId: string, roles: typeof OWNER_ROLE, sessionValid = true) {
  mockActorId = actorId; mockRoles = roles; mockSessionValid = sessionValid;
}
async function getMetrics(businessId: string) {
  const { GET } = await import("@/app/api/owner/budget/archetype-metrics/route");
  return GET(new NextRequest(`http://localhost/api/owner/budget/archetype-metrics?businessId=${businessId}`), { params: Promise.resolve({}) });
}
async function postMetric(businessId: string, body?: unknown) {
  const { POST } = await import("@/app/api/owner/budget/archetype-metrics/route");
  const payload = body ?? { businessId, archetype: "laundry", metricType: "machine_downtime_hours", metricDate: new Date().toISOString(), value: 12 };
  return POST(new NextRequest("http://localhost/api/owner/budget/archetype-metrics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), { params: Promise.resolve({}) });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Archetype Metrics routes — runtime RBAC", () => {
  let s: Seeded;
  beforeEach(async () => { s = await seed(); });
  afterEach(async () => { await cleanup(s); vi.clearAllMocks(); });

  it("[db] unauthenticated is denied (read + write)", async () => {
    actAs(s.actorId, OWNER_ROLE, false);
    expect((await getMetrics(s.businessId)).status).not.toBe(200);
    expect((await postMetric(s.businessId)).status).not.toBe(200);
  });

  it("[db] member WITHOUT OWNER_VIEW cannot read", async () => {
    actAs(s.actorId, NO_OWNER_ROLE);
    expect((await getMetrics(s.businessId)).status).toBe(403);
  });

  it("[db] member WITHOUT OWNER_MANAGE cannot write (no row created)", async () => {
    actAs(s.actorId, NO_OWNER_ROLE);
    expect((await postMetric(s.businessId)).status).toBe(403);
    expect(await db.ownerArchetypeMetric.findMany({ where: { businessId: s.businessId } })).toHaveLength(0);
  });

  it("[db] authorized OWNER_MANAGE can create and OWNER_VIEW can read", async () => {
    actAs(s.actorId, OWNER_ROLE);
    expect((await postMetric(s.businessId)).status).toBe(201);
    const res = await getMetrics(s.businessId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) && body.length).toBe(1);
  });

  it("[db] malformed metric body is rejected (not 201)", async () => {
    actAs(s.actorId, OWNER_ROLE);
    const res = await postMetric(s.businessId, { businessId: s.businessId, archetype: "laundry", metricType: "machine_downtime_hours", metricDate: "not-a-date", value: 12 });
    expect(res.status).not.toBe(201);
  });

  it("[db] foreign-workspace owner cannot read or write another workspace's metrics", async () => {
    const foreign = await seed();
    try {
      actAs(foreign.actorId, OWNER_ROLE);
      expect((await getMetrics(s.businessId)).status).not.toBe(200);
      expect((await postMetric(s.businessId)).status).not.toBe(201);
      expect(await db.ownerArchetypeMetric.findMany({ where: { businessId: s.businessId } })).toHaveLength(0);
    } finally {
      await cleanup(foreign);
    }
  });
});
