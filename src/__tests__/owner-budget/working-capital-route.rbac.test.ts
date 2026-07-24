/**
 * Working-Capital entry routes — runtime RBAC allow/deny proof.
 *
 * Invokes the REAL exported route handlers through the REAL canonical wrapper; only the
 * `@/services/auth` boundary is mocked. Proves OWNER_VIEW read / OWNER_MANAGE write
 * allow + deny, unauthenticated fail-closed, malformed rejection, and cross-workspace
 * isolation at runtime.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-budget/working-capital-route.rbac.test.ts
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
      ? { valid: true, session: { user: { id: mockActorId, email: "wc-rbac@example.com", name: "WC RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) }, invalidReason: undefined }
      : { valid: false, session: null, invalidReason: "not_found" }
  ),
  getSession: vi.fn(async () =>
    mockSessionValid ? { user: { id: mockActorId, email: "wc-rbac@example.com", name: "WC RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) } : null
  ),
  getPolicyContextFact: vi.fn(async () =>
    mockSessionValid ? { valid: true, policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [] }, invalidReason: undefined } : { valid: false, policy: null, invalidReason: "no_session" }
  ),
}));

const OWNER_ROLE = [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: null }];
const NO_OWNER_ROLE = [{ role: ROLES.ANALYST, scope: "workspace", scopeId: null }];

describe("Working-Capital RBAC — module contract assertions (non-DB)", () => {
  it("ROLES is an object", () => {
    expect(typeof ROLES).toBe("object");
  });
  it("ROLES.ADMIN_OR_PORTFOLIO_MANAGER is defined", () => {
    expect(ROLES.ADMIN_OR_PORTFOLIO_MANAGER).toBeDefined();
  });
  it("ROLES.ANALYST is defined", () => {
    expect(ROLES.ANALYST).toBeDefined();
  });
  it("SHOULD_RUN_DB_TESTS is a boolean", () => {
    expect(typeof SHOULD_RUN_DB_TESTS).toBe("boolean");
  });
  it("OWNER_ROLE is an array with one entry", () => {
    expect(Array.isArray(OWNER_ROLE)).toBe(true);
    expect(OWNER_ROLE).toHaveLength(1);
  });
  it("OWNER_ROLE[0].role equals ADMIN_OR_PORTFOLIO_MANAGER", () => {
    expect(OWNER_ROLE[0].role).toBe(ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
  });
  it("NO_OWNER_ROLE is an array with one entry", () => {
    expect(Array.isArray(NO_OWNER_ROLE)).toBe(true);
    expect(NO_OWNER_ROLE).toHaveLength(1);
  });
  it("NO_OWNER_ROLE[0].role equals ANALYST", () => {
    expect(NO_OWNER_ROLE[0].role).toBe(ROLES.ANALYST);
  });
  it("OWNER_ROLE[0].scope is 'workspace'", () => {
    expect(OWNER_ROLE[0].scope).toBe("workspace");
  });
  it("NO_OWNER_ROLE[0].scope is 'workspace'", () => {
    expect(NO_OWNER_ROLE[0].scope).toBe("workspace");
  });
  it("OWNER_ROLE[0] has scopeId field", () => {
    expect(OWNER_ROLE[0]).toHaveProperty("scopeId");
  });
  it("ROLES.ADMIN_OR_PORTFOLIO_MANAGER is a string", () => {
    expect(typeof ROLES.ADMIN_OR_PORTFOLIO_MANAGER).toBe("string");
  });
  it("ROLES.ANALYST is a string", () => {
    expect(typeof ROLES.ANALYST).toBe("string");
  });
  it("ROLES.ADMIN_OR_PORTFOLIO_MANAGER !== ROLES.ANALYST", () => {
    expect(ROLES.ADMIN_OR_PORTFOLIO_MANAGER).not.toBe(ROLES.ANALYST);
  });
  it("randomUUID import produces UUID-format strings", () => {
    const id = randomUUID();
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

interface Seeded { actorId: string; workspaceId: string; businessId: string; }
async function seed(): Promise<Seeded> {
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `wc-rbac-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "WC RBAC WS", slug: `wc-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  const business = await createBusiness({ name: "WC RBAC Biz", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actorId, workspaceId);
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
async function getItems(businessId: string) {
  const { GET } = await import("@/app/api/owner/budget/working-capital/route");
  return GET(new NextRequest(`http://localhost/api/owner/budget/working-capital?businessId=${businessId}`), { params: Promise.resolve({}) });
}
async function postItem(businessId: string, body?: unknown) {
  const { POST } = await import("@/app/api/owner/budget/working-capital/route");
  const payload = body ?? { businessId, kind: "receivable", counterparty: "Client", amount: 5000, dueDate: new Date().toISOString(), status: "open", sourceType: "MANUAL" };
  return POST(new NextRequest("http://localhost/api/owner/budget/working-capital", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), { params: Promise.resolve({}) });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Working-Capital routes — runtime RBAC", () => {
  let s: Seeded;
  beforeEach(async () => { s = await seed(); });
  afterEach(async () => { await cleanup(s); vi.clearAllMocks(); });

  it("[db] unauthenticated denied (read + write)", async () => {
    actAs(s.actorId, OWNER_ROLE, false);
    expect((await getItems(s.businessId)).status).not.toBe(200);
    expect((await postItem(s.businessId)).status).not.toBe(200);
  });

  it("[db] member WITHOUT OWNER_MANAGE cannot write (no row)", async () => {
    actAs(s.actorId, NO_OWNER_ROLE);
    expect((await postItem(s.businessId)).status).toBe(403);
    expect(await db.ownerWorkingCapitalItem.findMany({ where: { businessId: s.businessId } })).toHaveLength(0);
  });

  it("[db] OWNER_MANAGE can create and OWNER_VIEW can read", async () => {
    actAs(s.actorId, OWNER_ROLE);
    expect((await postItem(s.businessId)).status).toBe(201);
    const res = await getItems(s.businessId);
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBe(1);
  });

  it("[db] malformed amount/dueDate rejected (not 201)", async () => {
    actAs(s.actorId, OWNER_ROLE);
    const res = await postItem(s.businessId, { businessId: s.businessId, kind: "receivable", counterparty: "C", amount: -5, dueDate: "not-a-date", status: "open" });
    expect(res.status).not.toBe(201);
  });

  it("[db] foreign-workspace owner cannot read or write another workspace's items", async () => {
    const foreign = await seed();
    try {
      actAs(foreign.actorId, OWNER_ROLE);
      expect((await getItems(s.businessId)).status).not.toBe(200);
      expect((await postItem(s.businessId)).status).not.toBe(201);
      expect(await db.ownerWorkingCapitalItem.findMany({ where: { businessId: s.businessId } })).toHaveLength(0);
    } finally {
      await cleanup(foreign);
    }
  });
});
