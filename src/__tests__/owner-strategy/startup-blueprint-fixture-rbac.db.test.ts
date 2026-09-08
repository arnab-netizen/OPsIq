/**
 * Runtime proof that the isFixtureRecord create flag on the execution-blueprint route is gated on
 * the REAL SYSTEM_ADMIN capability, not merely by convention in
 * startup-execution-blueprint.service.ts. Mirrors
 * src/__tests__/founder-recovery/fixture-flag-rbac.db.test.ts's structure for
 * OwnerBusiness.isFixtureBusiness, applied to the blueprint route.
 *
 * Invokes the REAL POST /api/owner/startup/sessions/[sessionId]/blueprint handler through the
 * REAL canonical wrapper. Only the auth boundary (`@/services/auth`) is mocked to supply a
 * session + policy roles; workspace membership, capability resolution, and the DB write all run
 * for real.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/startup-blueprint-fixture-rbac.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createStartupSession, recordOwnerDecision } from "@/services/owner-strategy/startup-session.service";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";

let mockActorId = randomUUID();
let mockRoles: Array<{ role: string; scope?: string | null; scopeId?: string | null }> = [];

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: {
      user: { id: mockActorId, email: "blueprint-rbac@example.com", name: "Blueprint RBAC Test", isActive: true },
      sessionId: "blueprint-rbac-session",
      expiresAt: new Date(Date.now() + 86400000),
    },
    invalidReason: undefined,
  })),
  getSession: vi.fn(async () => ({
    user: { id: mockActorId, email: "blueprint-rbac@example.com", name: "Blueprint RBAC Test", isActive: true },
    sessionId: "blueprint-rbac-session",
    expiresAt: new Date(Date.now() + 86400000),
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [] },
    invalidReason: undefined,
  })),
}));

const ownerRole = (workspaceId: string) => [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: workspaceId }];
const systemAdminRole = (workspaceId: string) => [{ role: ROLES.SYSTEM_ADMIN, scope: "workspace", scopeId: workspaceId }];

const intake: StartupIntake = {
  capitalAvailable: 10000,
  monthlySurvivalNeed: 2000,
  hoursPerWeekAvailable: 40,
  riskTolerance: "medium",
  targetMonthlyIncome: 4000,
  canSell: true,
  canOperateDaily: true,
  fastCashVsScale: "fast_cash",
};

const idea: StartupIdea = {
  name: "Blueprint RBAC Idea",
  industry: "Automotive services",
  structural: {
    grossMarginPct: 65, netMarginPct: 30, monthlyRevenue: 5000, revenueFrequency: "recurring",
    repeatCustomerPct: 0.6, customerAcquisitionDifficulty: "low", demandValidated: true,
    ownerIsPrimaryOperator: true, differentiation: "moderate", pricingPower: "moderate",
    capitalIntensity: "low", downsideRisk: "low",
  },
  estimatedStartupCost: 3000, estimatedMonthlyRevenue: 5000, estimatedMonthlyCost: 1800, timeToFirstRevenueMonths: 1,
};

interface Seeded { actorId: string; workspaceId: string; sessionId: string; ideaId: string; ownerDecisionId: string; }

async function seedApprovedIdea(): Promise<Seeded> {
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `blueprint-rbac-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Blueprint RBAC WS", slug: `blueprint-rbac-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });

  const sessionId = await createStartupSession({ workspaceId, actorId, intake, ideas: [idea] });
  const ideaRow = await db.startupIdeaRecord.findFirst({ where: { sessionId } });
  const ownerDecisionId = await recordOwnerDecision(workspaceId, sessionId, actorId, { decisionType: "GO", rationale: "rbac test" });
  return { actorId, workspaceId, sessionId, ideaId: ideaRow!.id, ownerDecisionId };
}

async function cleanup(s: Seeded) {
  await db.businessRiskEntry.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.processExecutionTask.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.kPIOwnershipRecord.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.businessObjective.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.startupExecutionBlueprint.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.startupIdeaRecord.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.ownerStartupSession.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.auditEvent.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.workspaceMembership.deleteMany({ where: { userId: s.actorId } }).catch(() => undefined);
  await db.workspace.delete({ where: { id: s.workspaceId } }).catch(() => undefined);
  await db.user.delete({ where: { id: s.actorId } }).catch(() => undefined);
}

function actAs(actorId: string, roles: ReturnType<typeof ownerRole>) {
  mockActorId = actorId;
  mockRoles = roles;
}

async function postCreateBlueprint(sessionId: string, body: unknown) {
  const { POST } = await import("@/app/api/owner/startup/sessions/[sessionId]/blueprint/route");
  const req = new NextRequest(`http://localhost/api/owner/startup/sessions/${sessionId}/blueprint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ sessionId }) });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] isFixtureRecord blueprint create-flag RBAC", () => {
  let s: Seeded;
  beforeEach(async () => { s = await seedApprovedIdea(); });
  afterEach(async () => { await cleanup(s); vi.clearAllMocks(); });

  it("[db] an ordinary owner (OWNER_MANAGE, no SYSTEM_ADMIN) requesting isFixtureRecord:true is silently ignored", async () => {
    actAs(s.actorId, ownerRole(s.workspaceId));
    const res = await postCreateBlueprint(s.sessionId, {
      ideaId: s.ideaId,
      ownerDecisionId: s.ownerDecisionId,
      objectiveTitle: "Self-serve fixture attempt",
      isFixtureRecord: true,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const objective = await db.businessObjective.findUnique({ where: { id: body.objectiveId } });
    expect(objective?.isFixtureRecord).toBe(false);
  });

  it("[db] a SYSTEM_ADMIN actor requesting isFixtureRecord:true is honored across the blueprint output", async () => {
    actAs(s.actorId, systemAdminRole(s.workspaceId));
    const res = await postCreateBlueprint(s.sessionId, {
      ideaId: s.ideaId,
      ownerDecisionId: s.ownerDecisionId,
      objectiveTitle: "OPSIQ Production Acceptance - admin-created",
      isFixtureRecord: true,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const objective = await db.businessObjective.findUnique({ where: { id: body.objectiveId } });
    expect(objective?.isFixtureRecord).toBe(true);
    const risks = await db.businessRiskEntry.findMany({ where: { id: { in: body.riskIds } } });
    expect(risks.every((r) => r.isFixtureRecord)).toBe(true);
  });
});
