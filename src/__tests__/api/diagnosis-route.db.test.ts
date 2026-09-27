/**
 * POST /api/diagnosis through the REAL route + REAL canonical-route-enforcement, real database.
 *
 * Auth is mocked at @/services/auth exactly as src/__tests__/api/growth/pricing-tiers-real-route.db.test.ts
 * does, so the real capability derivation (including the self-serve-owner narrowing), workspace
 * gate, handler, service and error mapping all run. Proves:
 *  - a consultant/admin (ENGAGEMENT_CREATE) gets 201 with the evidence-grounded answer, and the
 *    persisted records hold only what was submitted (no template findings, no condition profile);
 *  - a self-serve owner (admin role on an "owner" workspace membership → narrowed) gets 403, as
 *    does a viewer; the /diagnosis page applies the same check (see src/__tests__/generic-diagnosis/diagnosis-ui.test.tsx);
 *  - a second workspace cannot see or reuse the first workspace's client/engagement;
 *  - invalid input / missing idempotency key → 400 with no raw internals; a replayed failed key → 409.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/diagnosis-route.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";

const who = vi.hoisted(() => ({ actorId: "", workspaceId: "", role: "admin_or_portfolio_manager", workspaceRole: "admin" as string }));

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: who.actorId, email: `${who.actorId}@example.com`, name: "Diag", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  });
  const policy = () => ({
    userId: who.actorId,
    roles: [{ role: who.role, scope: "workspace", scopeId: who.workspaceId }],
    engagementMemberships: [],
    workspaceRole: who.workspaceRole,
  });
  return {
    getSessionFact: vi.fn(async () => ({ valid: true, session: session(), invalidReason: undefined })),
    getSession: vi.fn(async () => session()),
    getPolicyContextFact: vi.fn(async () => ({ valid: true, policy: policy(), invalidReason: undefined })),
    getPolicyContext: vi.fn(async () => policy()),
  };
});

function post(body: unknown, key: string | null = randomUUID()): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers["idempotency-key"] = `diagnosis-${key}`;
  return new NextRequest("https://example.com/api/diagnosis", { method: "POST", headers, body: JSON.stringify(body) });
}
const params = { params: Promise.resolve({}) };

const stamp = randomUUID().slice(0, 8);
const LOSS = {
  businessName: `ZZ-TEST-SANDBOX ${stamp}`,
  businessType: "bakery",
  problemStatement: "Costs keep rising and we are not making money.",
  mainIssue: "high_costs",
  monthlyRevenue: 200000,
  monthlyCosts: 260000,
  customerCount: 800,
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] POST /api/diagnosis — permissions, answer, persistence, isolation", () => {
  const wsA = randomUUID();
  const wsB = randomUUID();
  const consultantA = randomUUID();
  const consultantB = randomUUID();
  const experienced = randomUUID(); // ENGAGEMENT_CREATE without CLIENT_CREATE
  const owner = randomUUID();
  const viewer = randomUUID();
  const wsNoPlan = randomUUID(); // no subscription → the governed plan check must refuse (402)
  const consultantNoPlan = randomUUID();
  let plan: PlanEntitlementFixture | undefined;
  const engagementIds: string[] = [];

  async function user(id: string, workspaceId: string, role: string, membershipRole: string) {
    await db.user.create({ data: { id, email: `${id}@example.com`, updatedAt: new Date() } });
    await db.workspaceMembership.create({ data: { userId: id, workspaceId, role: membershipRole, isActive: true } });
    await db.userRoleAssignment.create({ data: { id: randomUUID(), userId: id, role, scope: "workspace", scopeId: workspaceId, isActive: true } });
  }
  const as = (actorId: string, workspaceId: string, role: string, workspaceRole: string) => {
    who.actorId = actorId;
    who.workspaceId = workspaceId;
    who.role = role;
    who.workspaceRole = workspaceRole;
  };

  beforeAll(async () => {
    await db.workspace.create({ data: { id: wsA, name: "Diag A", slug: `diag-a-${stamp}` } });
    await db.workspace.create({ data: { id: wsB, name: "Diag B", slug: `diag-b-${stamp}` } });
    await user(consultantA, wsA, "admin_or_portfolio_manager", "admin");
    await user(consultantB, wsB, "admin_or_portfolio_manager", "admin");
    await user(experienced, wsA, "experienced_consultant", "member");
    await user(owner, wsA, "admin_or_portfolio_manager", "owner"); // self-serve owner → narrowed
    await user(viewer, wsA, "viewer", "member");
    await db.workspace.create({ data: { id: wsNoPlan, name: "Diag no plan", slug: `diag-np-${stamp}` } });
    await user(consultantNoPlan, wsNoPlan, "admin_or_portfolio_manager", "admin");
    // Real plan entitlement (not a bypass): createEngagement's assertCapability("create_engagement").
    plan = await seedPlanEntitlement([wsA, wsB], ["create_engagement"]);
  });

  afterAll(async () => {
    const users = [consultantA, consultantB, experienced, owner, viewer, consultantNoPlan];
    const workspaces = [wsA, wsB, wsNoPlan];
    try {
      await db.engagementMembership.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.action.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.recommendation.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.finding.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.evidence.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.businessConditionProfile.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.interventionState.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await db.usageEvent.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await db.engagement.deleteMany({ where: { id: { in: engagementIds } } });
      await db.clientAccount.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await cleanupPlanEntitlement(plan);
      await db.userRoleAssignment.deleteMany({ where: { userId: { in: users } } });
      await db.workspaceMembership.deleteMany({ where: { userId: { in: users } } });
      await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    } catch {
      // best-effort cleanup (ephemeral test database)
    }
  });

  it("[db] consultant: 201 with one grounded answer; persists only submitted evidence, no condition profile", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    as(consultantA, wsA, "admin_or_portfolio_manager", "admin");
    const res = await POST(post(LOSS), params);
    expect(res.status).toBe(201);
    const body = await res.json();
    engagementIds.push(body.engagementId);
    expect(body.answer.status).toBe("concluded");
    expect(body.answer.mainProblem.headline).toBe("Costs are higher than revenue — the business is short about 60,000 a month.");
    expect(body.answer.firstStep.title).toBe("Find where the monthly gap comes from");
    expect(JSON.stringify(body)).not.toMatch(/_engineMetadata|executiveBrief|Cost Reduction Program|Sales Process Gaps/);

    const engagement = await db.engagement.findUniqueOrThrow({ where: { id: body.engagementId } });
    expect(engagement.workspaceId).toBe(wsA);
    expect(engagement.healthStatus).toBe("unknown"); // not assessed from a quick intake
    expect(engagement.interventionMode).toBe("recovery");

    const evidence = await db.evidence.findMany({ where: { engagementId: body.engagementId } });
    expect(evidence.map((e) => e.source).sort()).toEqual(["owner_input", "owner_input", "owner_input", "owner_statement"]);
    expect(evidence.every((e) => e.status === "identified" && e.validatedAt === null)).toBe(true);
    const findings = await db.finding.findMany({ where: { engagementId: body.engagementId } });
    expect(findings.map((f) => [f.title, f.severity])).toEqual([[body.answer.mainProblem.headline, "critical"]]);
    const recs = await db.recommendation.findMany({ where: { engagementId: body.engagementId } });
    expect(recs.map((r) => r.title).sort()).toEqual(
      [body.answer.firstStep.title, ...body.answer.thenSteps.map((s: { title: string }) => s.title)].sort()
    );
    expect(recs.every((r) => r.isAiProposal && r.reliabilityLevel === "low" && r.workspaceId === wsA)).toBe(true);
    expect(await db.action.count({ where: { engagementId: body.engagementId } })).toBe(1);
    expect(await db.businessConditionProfile.count({ where: { engagementId: body.engagementId } })).toBe(0);

    // The consultant can open the engagement the diagnosis created.
    const membership = await db.engagementMembership.findFirst({ where: { engagementId: body.engagementId, userId: consultantA, isActive: true } });
    expect(membership?.role).toBe("admin_or_portfolio_manager"); // a role that itself grants ENGAGEMENT_CREATE here

    const audits = await db.auditEvent.findMany({ where: { workspaceId: wsA, entityId: body.engagementId } });
    const names = audits.map((a) => a.eventName);
    expect(names).toContain("diagnosis.completed");
    expect(names).toContain("engagement.created");
  });

  it("[db] minimal evidence: abstains, persists no finding", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    as(consultantA, wsA, "admin_or_portfolio_manager", "admin");
    const res = await POST(post({ businessName: LOSS.businessName, businessType: "bakery", problemStatement: "Not sure what's wrong.", mainIssue: "unclear" }), params);
    expect(res.status).toBe(201);
    const body = await res.json();
    engagementIds.push(body.engagementId);
    expect(body.answer.mainProblem.headline).toBe("I can't determine that yet.");
    expect(body.engagement.interventionMode).toBe("mixed");
    expect(await db.finding.count({ where: { engagementId: body.engagementId } })).toBe(0);
    // Same business name in the same workspace reuses the client.
    const first = await db.engagement.findUniqueOrThrow({ where: { id: engagementIds[0] } });
    const second = await db.engagement.findUniqueOrThrow({ where: { id: body.engagementId } });
    expect(second.clientId).toBe(first.clientId);
  });

  it("[db] consultant without CLIENT_CREATE: existing client → 201; a new client → 403 with nothing written", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    as(experienced, wsA, "experienced_consultant", "member");
    const ok = await POST(post(LOSS), params); // LOSS.businessName is already a client in wsA
    expect(ok.status).toBe(201);
    const okBody = await ok.json();
    engagementIds.push(okBody.engagementId);
    const membership = await db.engagementMembership.findFirst({ where: { engagementId: okBody.engagementId, userId: experienced } });
    expect(membership?.role).toBe("experienced_consultant");

    const clientsBefore = await db.clientAccount.count({ where: { workspaceId: wsA } });
    const engagementsBefore = await db.engagement.count({ where: { workspaceId: wsA } });
    const denied = await POST(post({ ...LOSS, businessName: `ZZ-TEST-SANDBOX new ${stamp}` }), params);
    expect(denied.status).toBe(403);
    expect(JSON.stringify(await denied.json())).not.toMatch(/prisma|stack|postgres/i);
    expect(await db.clientAccount.count({ where: { workspaceId: wsA } })).toBe(clientsBefore);
    expect(await db.engagement.count({ where: { workspaceId: wsA } })).toBe(engagementsBefore);
  });

  it("[db] self-serve owner and viewer: 403 'Insufficient permissions'; nothing is written", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    const before = await db.engagement.count({ where: { workspaceId: wsA } });
    for (const [actor, role, wsRole] of [[owner, "admin_or_portfolio_manager", "owner"], [viewer, "viewer", "member"]] as const) {
      as(actor, wsA, role, wsRole);
      const res = await POST(post(LOSS), params);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Insufficient permissions");
    }
    expect(await db.engagement.count({ where: { workspaceId: wsA } })).toBe(before);
  });

  it("[db] cross-workspace: B creates its own client and never sees A's records", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    as(consultantB, wsB, "admin_or_portfolio_manager", "admin");
    const res = await POST(post(LOSS), params);
    expect(res.status).toBe(201);
    const body = await res.json();
    engagementIds.push(body.engagementId);
    const engB = await db.engagement.findUniqueOrThrow({ where: { id: body.engagementId } });
    const engA = await db.engagement.findUniqueOrThrow({ where: { id: engagementIds[0] } });
    expect(engB.workspaceId).toBe(wsB);
    expect(engB.clientId).not.toBe(engA.clientId);
    const clientB = await db.clientAccount.findUniqueOrThrow({ where: { id: engB.clientId } });
    expect(clientB.workspaceId).toBe(wsB);
    expect((await db.engagement.findMany({ where: { workspaceId: wsB } })).map((e) => e.id)).not.toContain(engagementIds[0]);
  });

  it("[db] invalid input and missing idempotency key → 400 with an actionable message and no internals", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    as(consultantA, wsA, "admin_or_portfolio_manager", "admin");
    const bad = await POST(post({ ...LOSS, customerCount: 12.5 }), params);
    expect(bad.status).toBe(400);
    const badBody = await bad.json();
    expect(JSON.stringify(badBody)).not.toMatch(/prisma|safeMessage|stack|postgres/i);
    const noKey = await POST(post(LOSS, null), params);
    expect(noKey.status).toBe(400);
    expect((await noKey.json()).error).toMatch(/idempotency-key header required/);
  });

  it("[db] workspace without the plan entitlement → 402 with a truthful message; replaying that key → 409", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    as(consultantNoPlan, wsNoPlan, "admin_or_portfolio_manager", "admin");
    const key = randomUUID();
    const first = await POST(post(LOSS, key), params);
    expect(first.status).toBe(402);
    const firstBody = await first.json();
    expect(firstBody.error).toMatch(/isn't available for your current workspace/);
    expect(JSON.stringify(firstBody)).not.toMatch(/prisma|safeMessage|stack|postgres/i);
    // The failed attempt is recorded; the same key is never silently re-run.
    const replay = await POST(post(LOSS, key), params);
    expect(replay.status).toBe(409);
    expect((await replay.json()).error).toBe("This diagnosis request already failed. Submit the form again to retry.");
    // Refused before any write: no engagement and no orphan client.
    expect(await db.engagement.count({ where: { workspaceId: wsNoPlan } })).toBe(0);
    expect(await db.clientAccount.count({ where: { workspaceId: wsNoPlan } })).toBe(0);
  });
});
