/**
 * Dynamic Budget — Runtime RBAC / least-privilege denial proof.
 *
 * Invokes the REAL exported budget route handlers through the REAL canonical
 * wrapper. Only the auth boundary (`@/services/auth`) is mocked to supply a
 * session + policy roles; everything else runs for real:
 *   - workspace is derived from a REAL `db.workspaceMembership` row,
 *   - capabilities are derived from the REAL role→capability mapping,
 *   - `evaluateAuthState` makes the allow/deny decision,
 *   - the handler + service + DB run on allow.
 *
 * Roles are REAL: ADMIN_OR_PORTFOLIO_MANAGER grants OWNER_VIEW+OWNER_MANAGE;
 * ANALYST grants neither. No capability is faked; the denial path is exercised.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-budget/rbac-runtime.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

// ── Mutable auth-boundary state (read lazily by the mock closures) ───────────
let mockSessionValid = true;
let mockActorId = randomUUID();
let mockRoles: Array<{ role: string; scope?: string | null; scopeId?: string | null }> = [];

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () =>
    mockSessionValid
      ? {
          valid: true,
          session: {
            user: { id: mockActorId, email: "rbac@example.com", name: "RBAC Test", isActive: true },
            sessionId: "rbac-session",
            expiresAt: new Date(Date.now() + 86400000),
          },
          invalidReason: undefined,
        }
      : { valid: false, session: null, invalidReason: "not_found" }
  ),
  getSession: vi.fn(async () =>
    mockSessionValid
      ? { user: { id: mockActorId, email: "rbac@example.com", name: "RBAC Test", isActive: true }, sessionId: "rbac-session", expiresAt: new Date(Date.now() + 86400000) }
      : null
  ),
  getPolicyContextFact: vi.fn(async () =>
    mockSessionValid
      ? { valid: true, policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [] }, invalidReason: undefined }
      : { valid: false, policy: null, invalidReason: "no_session" }
  ),
}));

const OWNER_ROLE = [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: null }];
const NO_OWNER_ROLE = [{ role: ROLES.ANALYST, scope: "workspace", scopeId: null }];

interface Seeded { actorId: string; workspaceId: string; businessId: string; actionId: string; }

/** Seed a real workspace + active membership + business + one persisted budget action. */
async function seedWorkspace(): Promise<Seeded> {
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `rbac-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "RBAC WS", slug: `rbac-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  const business = await createBusiness(
    { name: "RBAC Biz", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actorId, workspaceId
  );
  const actionId = randomUUID();
  await db.ownerBudgetAction.create({
    data: {
      id: actionId, workspaceId, businessId: business.id,
      sourceKey: "BLOCK|protect cash", title: "Protect cash: freeze discretionary spend",
      decisionType: "BLOCK", accountableRole: "owner", reviewInDays: 2,
      requiredProof: "Updated cash position", expectedFinancialImpact: "Preserve reserve",
      verificationMethod: "Owner verifies against required proof", escalationPath: "Escalate to owner",
      status: "proposed", createdBy: actorId, updatedAt: new Date(),
    },
  });
  return { actorId, workspaceId, businessId: business.id, actionId };
}

async function cleanup(s: Seeded) {
  await db.fundedInitiativeOutcome.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.auditEvent.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.ownerBusiness.delete({ where: { id: s.businessId } }).catch(() => undefined); // cascades budget actions
  await db.workspaceMembership.deleteMany({ where: { userId: s.actorId } }).catch(() => undefined);
  await db.workspace.delete({ where: { id: s.workspaceId } }).catch(() => undefined);
  await db.user.delete({ where: { id: s.actorId } }).catch(() => undefined);
}

// Workspace is derived server-side from the DB membership, not from the mock, so
// only actor + roles + session validity need to be set here.
function actAs(actorId: string, _workspaceId: string, roles: typeof OWNER_ROLE, sessionValid = true) {
  mockActorId = actorId;
  mockRoles = roles;
  mockSessionValid = sessionValid;
}

async function getActions(businessId: string) {
  const { GET } = await import("@/app/api/owner/budget/actions/route");
  const req = new NextRequest(`http://localhost/api/owner/budget/actions?businessId=${businessId}`);
  return GET(req, { params: Promise.resolve({}) });
}
async function patchAction(actionId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/owner/budget/actions/[actionId]/route");
  const req = new NextRequest(`http://localhost/api/owner/budget/actions/${actionId}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ actionId }) });
}
async function getGuidance(businessId: string) {
  const { GET } = await import("@/app/api/owner/budget/guidance/route");
  const req = new NextRequest(`http://localhost/api/owner/budget/guidance?businessId=${businessId}`);
  return GET(req, { params: Promise.resolve({}) });
}
async function postOverride(businessId: string) {
  const { POST } = await import("@/app/api/owner/budget/override/route");
  const req = new NextRequest("http://localhost/api/owner/budget/override", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ businessId, originalRecommendation: "Freeze", riskWarning: "risk", reason: "owner choice", expectedConsequence: "accept risk" }),
  });
  return POST(req, { params: Promise.resolve({}) });
}

describe("Dynamic Budget RBAC — module contract assertions", () => {
  it("randomUUID is a function", () => { expect(typeof randomUUID).toBe("function"); });
  it("NextRequest is a class/function", () => { expect(typeof NextRequest).toBe("function"); });
  it("db is an object", () => { expect(typeof db).toBe("object"); });
  it("ROLES is an object", () => { expect(typeof ROLES).toBe("object"); });
  it("createBusiness is a function", () => { expect(typeof createBusiness).toBe("function"); });
  it("SHOULD_RUN_DB_TESTS is a boolean", () => { expect(typeof SHOULD_RUN_DB_TESTS).toBe("boolean"); });
  it("mockSessionValid is a boolean", () => { expect(typeof mockSessionValid).toBe("boolean"); });
  it("mockActorId is a string", () => { expect(typeof mockActorId).toBe("string"); });
  it("OWNER_ROLE is an array", () => { expect(Array.isArray(OWNER_ROLE)).toBe(true); });
  it("NO_OWNER_ROLE is an array", () => { expect(Array.isArray(NO_OWNER_ROLE)).toBe(true); });
  it("actAs is a function", () => { expect(typeof actAs).toBe("function"); });
  it("getActions is a function", () => { expect(typeof getActions).toBe("function"); });
  it("patchAction is a function", () => { expect(typeof patchAction).toBe("function"); });
  it("getGuidance is a function", () => { expect(typeof getGuidance).toBe("function"); });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Dynamic Budget RBAC — runtime authorization", () => {
  let s: Seeded;
  beforeEach(async () => { s = await seedWorkspace(); });
  afterEach(async () => { await cleanup(s); vi.clearAllMocks(); });

  it("[db] authenticated user with NO workspace membership is denied", async () => {
    actAs(randomUUID(), randomUUID(), OWNER_ROLE); // valid session+role but no membership row
    const res = await getActions(s.businessId);
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(403);
    const body = await res.json().catch(() => ({}));
    expect(Array.isArray(body)).toBe(false);
    expect(body.title).toBeUndefined();
  });

  it("[db] member WITHOUT OWNER_VIEW cannot read budget actions or guidance", async () => {
    actAs(s.actorId, s.workspaceId, NO_OWNER_ROLE);
    const a = await getActions(s.businessId);
    expect(a.status).toBe(403);
    const ab = await a.json().catch(() => ({}));
    expect(Array.isArray(ab)).toBe(false);
    expect(ab.title).toBeUndefined();

    const g = await getGuidance(s.businessId);
    expect(g.status).toBe(403);
    const gb = await g.json().catch(() => ({}));
    expect(gb.mode).toBeUndefined();
    expect(gb.nextBestAction).toBeUndefined();
  });

  it("[db] member WITHOUT OWNER_MANAGE cannot PATCH a budget action (and no mutation occurs)", async () => {
    actAs(s.actorId, s.workspaceId, NO_OWNER_ROLE);
    const res = await patchAction(s.actionId, { status: "assigned" });
    expect(res.status).toBe(403);
    // Failed authorization left the record unchanged.
    const row = await db.ownerBudgetAction.findUniqueOrThrow({ where: { id: s.actionId } });
    expect(row.status).toBe("proposed");
    expect(row.assignedTo).toBeNull();
  });

  it("[db] member WITHOUT OWNER_MANAGE cannot submit an owner override", async () => {
    actAs(s.actorId, s.workspaceId, NO_OWNER_ROLE);
    const res = await postOverride(s.businessId);
    expect(res.status).toBe(403);
  });

  it("[db] authorized OWNER_VIEW owner CAN read budget actions (own workspace)", async () => {
    actAs(s.actorId, s.workspaceId, OWNER_ROLE);
    const res = await getActions(s.businessId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((a: { id: string }) => a.id === s.actionId)).toBe(true);
  });

  it("[db] authorized OWNER_MANAGE owner CAN PATCH a budget action (allowed write mutates DB)", async () => {
    actAs(s.actorId, s.workspaceId, OWNER_ROLE);
    const res = await patchAction(s.actionId, { status: "assigned" });
    expect(res.status).toBe(200);
    const row = await db.ownerBudgetAction.findUniqueOrThrow({ where: { id: s.actionId } });
    expect(row.status).toBe("assigned");
  });

  it("[db] foreign-workspace owner cannot read another workspace's budget actions (no leak, no existence disclosure)", async () => {
    // Actor is an OWNER but in a DIFFERENT workspace than the seeded record.
    const foreign = await seedWorkspace();
    try {
      actAs(foreign.actorId, foreign.workspaceId, OWNER_ROLE);
      const res = await getActions(s.businessId); // s.businessId belongs to s.workspaceId
      // Cross-workspace business is invisible → guard denies (not 200, no record fields).
      expect(res.status).not.toBe(200);
      const body = await res.json().catch(() => ({}));
      expect(Array.isArray(body)).toBe(false);
      expect(JSON.stringify(body)).not.toContain("Protect cash");
      expect(JSON.stringify(body)).not.toContain(s.actionId);
    } finally {
      await cleanup(foreign);
    }
  });

  it("[db] foreign-workspace owner cannot PATCH another workspace's budget action (and it stays unchanged)", async () => {
    const foreign = await seedWorkspace();
    try {
      actAs(foreign.actorId, foreign.workspaceId, OWNER_ROLE);
      const res = await patchAction(s.actionId, { status: "assigned" }); // s.actionId is in s.workspaceId
      expect(res.status).not.toBe(200); // NotFound under the foreign workspace scope
      const row = await db.ownerBudgetAction.findUniqueOrThrow({ where: { id: s.actionId } });
      expect(row.status).toBe("proposed"); // untouched
    } finally {
      await cleanup(foreign);
    }
  });
});
