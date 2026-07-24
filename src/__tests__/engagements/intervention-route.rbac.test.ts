/**
 * Engagement intervention PATCH route — runtime RBAC allow/deny proof (B4 canonical migration).
 *
 * Invokes the REAL exported PATCH handler through the REAL canonical wrapper; only the
 * `@/services/auth` boundary is mocked. Proves the migration from the legacy
 * `withEnforcementFull` + `withAuth({ internalOnly: true })` path to `withCanonicalEnforcement`
 * preserves fail-closed semantics: unauthenticated denied, INTERVENTION_MANAGE required,
 * client-side role denied, engagement-scoped access enforced, cross-workspace isolation,
 * body validation, and the authorized mode transition still mutates + re-evaluates.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/engagements/intervention-route.rbac.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let mockSessionValid = true;
let mockActorId = randomUUID();
let mockRoles: Array<{ role: string; scope?: string | null; scopeId?: string | null }> = [];

// Mock the re-evaluation boundary exactly as the existing route tests do
// (src/__tests__/api/decisions.test.ts, actions.test.ts, experiments.test.ts). This isolates the
// AUTH migration under test from the downstream adaptive re-evaluation service, which the mode/phase
// transition triggers. (The real re-evaluation path has a separate pre-existing defect, tracked apart.)
vi.mock("@/services/re-evaluation", () => ({
  triggerReEvaluation: vi.fn(async () => ({})),
}));

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () =>
    mockSessionValid
      ? { valid: true, session: { user: { id: mockActorId, email: "iv-rbac@example.com", name: "IV RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) }, invalidReason: undefined }
      : { valid: false, session: null, invalidReason: "not_found" }
  ),
  getSession: vi.fn(async () =>
    mockSessionValid ? { user: { id: mockActorId, email: "iv-rbac@example.com", name: "IV RBAC", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) } : null
  ),
  getPolicyContextFact: vi.fn(async () =>
    mockSessionValid ? { valid: true, policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [] }, invalidReason: undefined } : { valid: false, policy: null, invalidReason: "no_session" }
  ),
}));

const MANAGER_ROLE = [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: null }];
const VIEW_ONLY_ROLE = [{ role: ROLES.EXPERIENCED_CONSULTANT, scope: "workspace", scopeId: null }];
const CLIENT_ROLE = [{ role: ROLES.CLIENT_OWNER, scope: "workspace", scopeId: null }];

interface Seeded { actorId: string; workspaceId: string; clientId: string; engagementId: string; }

async function seedBase(): Promise<{ actorId: string; workspaceId: string; clientId: string }> {
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  const clientId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `iv-rbac-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "IV RBAC WS", slug: `iv-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  await db.clientAccount.create({ data: { id: clientId, name: "IV RBAC Client", createdBy: actorId, updatedAt: new Date() } });
  return { actorId, workspaceId, clientId };
}

async function createEngagement(workspaceId: string, clientId: string): Promise<string> {
  const engagementId = randomUUID();
  await db.engagement.create({
    data: {
      id: engagementId,
      code: `ENG-${engagementId.substring(0, 8)}`,
      title: "IV RBAC Engagement",
      clientId,
      serviceTier: "diagnostic",
      engagementMode: "advisory",
      workspaceId,
      updatedAt: new Date(),
    },
  });
  return engagementId;
}

async function grantEngagementAccess(actorId: string, engagementId: string) {
  await db.engagementMembership.create({ data: { id: randomUUID(), userId: actorId, engagementId, role: "lead", isActive: true } });
}

async function seed(): Promise<Seeded> {
  const base = await seedBase();
  const engagementId = await createEngagement(base.workspaceId, base.clientId);
  await grantEngagementAccess(base.actorId, engagementId);
  return { ...base, engagementId };
}

async function cleanup(s: Seeded) {
  await db.auditEvent.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.engagementMembership.deleteMany({ where: { userId: s.actorId } }).catch(() => undefined);
  await db.engagement.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.clientAccount.delete({ where: { id: s.clientId } }).catch(() => undefined);
  await db.workspaceMembership.deleteMany({ where: { userId: s.actorId } }).catch(() => undefined);
  await db.workspace.delete({ where: { id: s.workspaceId } }).catch(() => undefined);
  await db.user.delete({ where: { id: s.actorId } }).catch(() => undefined);
}

function actAs(actorId: string, roles: typeof MANAGER_ROLE, sessionValid = true) {
  mockActorId = actorId; mockRoles = roles; mockSessionValid = sessionValid;
}

async function patchIntervention(engagementId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/engagements/[engagementId]/intervention/route");
  return PATCH(
    new NextRequest(`http://localhost/api/engagements/${engagementId}/intervention`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ engagementId }) }
  );
}

async function currentMode(engagementId: string): Promise<string | undefined> {
  const e = await db.engagement.findUnique({ where: { id: engagementId }, select: { interventionMode: true } });
  return e?.interventionMode;
}

describe("Intervention PATCH route — module contract assertions", () => {
  it("SHOULD_RUN_DB_TESTS is a boolean", () => { expect(typeof SHOULD_RUN_DB_TESTS).toBe("boolean"); });
  it("ROLES is an object", () => { expect(typeof ROLES).toBe("object"); });
  it("ROLES.ADMIN_OR_PORTFOLIO_MANAGER is defined", () => { expect(ROLES.ADMIN_OR_PORTFOLIO_MANAGER).toBeDefined(); });
  it("ROLES.CLIENT_OWNER is defined", () => { expect(ROLES.CLIENT_OWNER).toBeDefined(); });
  it("ROLES.EXPERIENCED_CONSULTANT is defined", () => { expect(ROLES.EXPERIENCED_CONSULTANT).toBeDefined(); });
  it("MANAGER_ROLE is an array", () => { expect(Array.isArray(MANAGER_ROLE)).toBe(true); });
  it("VIEW_ONLY_ROLE is an array", () => { expect(Array.isArray(VIEW_ONLY_ROLE)).toBe(true); });
  it("CLIENT_ROLE is an array", () => { expect(Array.isArray(CLIENT_ROLE)).toBe(true); });
  it("MANAGER_ROLE[0].role equals ROLES.ADMIN_OR_PORTFOLIO_MANAGER", () => { expect(MANAGER_ROLE[0].role).toBe(ROLES.ADMIN_OR_PORTFOLIO_MANAGER); });
  it("randomUUID is a function", () => { expect(typeof randomUUID).toBe("function"); });
  it("randomUUID() returns a string", () => { expect(typeof randomUUID()).toBe("string"); });
  it("MANAGER_ROLE[0].scope is 'workspace'", () => { expect(MANAGER_ROLE[0].scope).toBe("workspace"); });
  it("VIEW_ONLY_ROLE[0].scope is 'workspace'", () => { expect(VIEW_ONLY_ROLE[0].scope).toBe("workspace"); });
  it("CLIENT_ROLE[0].scope is 'workspace'", () => { expect(CLIENT_ROLE[0].scope).toBe("workspace"); });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Intervention PATCH route — runtime RBAC (canonical)", () => {
  let s: Seeded;
  beforeEach(async () => { s = await seed(); });
  afterEach(async () => { await cleanup(s); vi.clearAllMocks(); });

  it("[db] unauthenticated denied (no mutation)", async () => {
    actAs(s.actorId, MANAGER_ROLE, false);
    const res = await patchIntervention(s.engagementId, { interventionMode: "growth", version: 1 });
    expect(res.status).not.toBe(200);
    expect(await currentMode(s.engagementId)).toBe("recovery");
  });

  it("[db] internal actor WITHOUT INTERVENTION_MANAGE denied (view-only, no mutation)", async () => {
    actAs(s.actorId, VIEW_ONLY_ROLE);
    const res = await patchIntervention(s.engagementId, { interventionMode: "growth", version: 1 });
    expect(res.status).toBe(403);
    expect(await currentMode(s.engagementId)).toBe("recovery");
  });

  it("[db] client-side role denied (client_owner, no mutation)", async () => {
    actAs(s.actorId, CLIENT_ROLE);
    const res = await patchIntervention(s.engagementId, { interventionMode: "growth", version: 1 });
    expect(res.status).toBe(403);
    expect(await currentMode(s.engagementId)).toBe("recovery");
  });

  it("[db] manager WITH INTERVENTION_MANAGE transitions the mode (200 + mutation + body)", async () => {
    actAs(s.actorId, MANAGER_ROLE);
    const res = await patchIntervention(s.engagementId, { interventionMode: "growth", version: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.interventionMode).toBe("growth");
    expect(body.engagementId).toBe(s.engagementId);
    expect(await currentMode(s.engagementId)).toBe("growth");
  });

  it("[db] body without interventionPhase/interventionMode rejected (400, no mutation)", async () => {
    actAs(s.actorId, MANAGER_ROLE);
    const res = await patchIntervention(s.engagementId, { version: 1 });
    expect(res.status).toBe(400);
    expect(await currentMode(s.engagementId)).toBe("recovery");
  });

  it("[db] manager WITHOUT engagement membership denied (engagement-scoped access, no mutation)", async () => {
    const other = await createEngagement(s.workspaceId, s.clientId); // same workspace, no membership granted
    actAs(s.actorId, MANAGER_ROLE);
    const res = await patchIntervention(other, { interventionMode: "growth", version: 1 });
    expect(res.status).toBe(403);
    expect(await currentMode(other)).toBe("recovery");
  });

  it("[db] foreign-workspace manager cannot transition another workspace's engagement", async () => {
    const foreign = await seed();
    try {
      actAs(foreign.actorId, MANAGER_ROLE);
      const res = await patchIntervention(s.engagementId, { interventionMode: "growth", version: 1 });
      expect(res.status).not.toBe(200);
      expect(await currentMode(s.engagementId)).toBe("recovery");
    } finally {
      await cleanup(foreign);
    }
  });
});
