/**
 * POST /api/owner/startup/sessions fails closed on an unauthorized fixture request: 403, no
 * session row, no startup-session audit. Mirrors fixture-flag-rbac.db.test.ts (OwnerBusiness).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/startup-session-fixture-rbac.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let mockActorId = randomUUID();
let mockRoles: Array<{ role: string; scope?: string | null; scopeId?: string | null }> = [];

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: { user: { id: mockActorId, email: "ss-rbac@example.com", name: "SS RBAC", isActive: true }, sessionId: "ss-rbac-session", expiresAt: new Date(Date.now() + 86400000) },
    invalidReason: undefined,
  })),
  getSession: vi.fn(async () => ({
    user: { id: mockActorId, email: "ss-rbac@example.com", name: "SS RBAC", isActive: true }, sessionId: "ss-rbac-session", expiresAt: new Date(Date.now() + 86400000),
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true, policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [] }, invalidReason: undefined,
  })),
}));

const ownerRole = (ws: string) => [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: ws }];
const systemAdminRole = (ws: string) => [{ role: ROLES.SYSTEM_ADMIN, scope: "workspace", scopeId: ws }];

const body = (extra: Record<string, unknown> = {}) => ({
  sessionLabel: "fixture rbac",
  intake: { location: "Austin", capitalAvailable: null, hoursPerWeekAvailable: null, riskTolerance: null, skills: [] },
  ideas: [{ name: "Fixture RBAC idea", industry: "Automotive Services", structural: {} }],
  ...extra,
});

async function post(b: unknown) {
  const { POST } = await import("@/app/api/owner/startup/sessions/route");
  const req = new NextRequest("http://localhost/api/owner/startup/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  return POST(req, { params: Promise.resolve({}) });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] startup session fixture-flag RBAC (fail closed)", () => {
  let actorId: string; let workspaceId: string;
  beforeEach(async () => {
    actorId = randomUUID(); workspaceId = randomUUID();
    await db.user.create({ data: { id: actorId, email: `ss-rbac-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "SS RBAC WS", slug: `ss-rbac-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
    mockActorId = actorId;
  });
  afterEach(async () => {
    await db.startupIdeaRecord.deleteMany({ where: { workspaceId } }).catch(() => undefined);
    await db.ownerStartupSession.deleteMany({ where: { workspaceId } }).catch(() => undefined);
    await db.auditEvent.deleteMany({ where: { workspaceId } }).catch(() => undefined);
    await db.workspaceMembership.deleteMany({ where: { userId: actorId } }).catch(() => undefined);
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    vi.clearAllMocks();
  });

  it("ordinary owner, no flag: 201 and a non-fixture session", async () => {
    mockRoles = ownerRole(workspaceId);
    const res = await post(body());
    expect(res.status).toBe(201);
    const row = await db.ownerStartupSession.findUnique({ where: { id: (await res.json()).sessionId } });
    expect(row?.isFixtureBusiness).toBe(false);
    // control: the same audit query does see the event when a session IS created
    expect(await db.auditEvent.count({ where: { workspaceId, eventName: AUDIT_EVENTS.STARTUP_SESSION_CREATED } })).toBe(1);
  });

  it("ordinary owner explicitly requesting a fixture: 403, zero sessions, never 201", async () => {
    mockRoles = ownerRole(workspaceId);
    const res = await post(body({ isFixtureBusiness: true }));
    expect(res.status).toBe(403);
    expect(await db.ownerStartupSession.count({ where: { workspaceId } })).toBe(0);
    expect(await db.startupIdeaRecord.count({ where: { workspaceId } })).toBe(0);
    expect(await db.auditEvent.count({ where: { workspaceId, eventName: AUDIT_EVENTS.STARTUP_SESSION_CREATED } })).toBe(0);
  });

  it("SYSTEM_ADMIN requesting a fixture: 201 and created as a fixture", async () => {
    mockRoles = systemAdminRole(workspaceId);
    const res = await post(body({ isFixtureBusiness: true }));
    expect(res.status).toBe(201);
    const row = await db.ownerStartupSession.findUnique({ where: { id: (await res.json()).sessionId } });
    expect(row?.isFixtureBusiness).toBe(true);
  });
});
