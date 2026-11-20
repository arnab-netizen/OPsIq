/**
 * Plan-quota enforcement applies only where the released code already gated on the plan, against a real
 * database.
 *
 * Root cause proven here: recording usage through the atomic quota made every recorded path ENFORCE the
 * plan limit, so paths that were never plan-gated (POST /api/decisions/intake — free by contract —
 * POST /api/run, and action creation inside the execute workflow and the consulting pipeline) newly
 * answered 402 whenever the workspace plan lacked the capability (the seeded commercial plan carries no
 * PlanCapability rows). The fix records usage on those paths in record-only mode: same lock, same ledger
 * rows, never a PlanLimitError. The paths that asserted before (POST /api/decisions/create, POST
 * /api/actions, createRecommendation, createEngagement, the pipeline's decision_engine) still refuse.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/capability-quota/record-only-usage.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";

const ids = vi.hoisted(() => ({ actorId: "", workspaceId: "" }));

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: ids.actorId, email: "record-only@example.com", name: "Record Only", isActive: true },
    sessionId: "record-only-session",
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const policy = () => ({
    userId: ids.actorId,
    // decision:create is granted only by system_admin in ROLE_CAPABILITIES.
    roles: [{ role: "system_admin", scope: "workspace", scopeId: ids.workspaceId }],
    engagementMemberships: [],
  });
  return {
    getSessionFact: vi.fn(async () => ({ valid: true, session: session(), invalidReason: undefined })),
    getSession: vi.fn(async () => session()),
    getPolicyContextFact: vi.fn(async () => ({ valid: true, policy: policy(), invalidReason: undefined })),
    getPolicyContext: vi.fn(async () => policy()),
  };
});

import { POST as intakePost } from "@/app/api/decisions/intake/route";
import { POST as createPost } from "@/app/api/decisions/create/route";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { addDecisionItemsWithinQuota } from "@/services/decisions/decision-creation-service";
import { generateOperatorItems } from "@/services/operator/generate";
import { createAction } from "@/services/action";
import { createRecommendation } from "@/services/recommendation";
import { createEngagement } from "@/services/engagement";
import { runConsultingPipeline } from "@/services/consulting-engine/pipeline";

interface Ws {
  workspaceId: string;
  actorId: string;
  clientId: string;
  engagementId: string;
}

const ctx = (ws: Ws) =>
  ({
    verifiedActorId: ws.actorId,
    verifiedWorkspaceId: ws.workspaceId,
    verifiedActorType: "user",
    session: { user: { id: ws.actorId } },
  }) as unknown as CanonicalAuthContext;

async function usageSum(workspaceId: string, key: string): Promise<number> {
  const agg = await db.usageEvent.aggregate({ _sum: { value: true }, where: { workspaceId, key } });
  return agg._sum.value ?? 0;
}

async function route(
  handler: typeof intakePost,
  path: string,
  ws: Ws,
  body: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  ids.actorId = ws.actorId;
  ids.workspaceId = ws.workspaceId;
  const req = new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", "idempotency-key": `ro-${randomUUID()}`, "x-workspace-id": ws.workspaceId }),
    body: JSON.stringify(body),
  });
  const res = (await handler(req, { params: Promise.resolve({}) })) as Response;
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Approved findings the deterministic consulting engine diagnoses with SUCCESS (as in the race suite). */
async function seedPipelineFindings(ws: Ws): Promise<void> {
  const evidenceId = randomUUID();
  await db.evidence.create({
    data: { id: evidenceId, engagementId: ws.engagementId, title: "Record-only evidence", description: "Operational records", source: "interview", status: "validated", updatedAt: new Date() },
  });
  for (const text of [
    "Turnaround time bottleneck: orders wait 9 days in production queue, capacity constrained",
    "Revenue stagnant for 3 consecutive years at the same revenue",
    "Gross margin declined from 40% to 22%; cash flow negative for 6 months",
  ]) {
    await db.finding.create({
      data: {
        id: randomUUID(), engagementId: ws.engagementId, primaryEvidenceId: evidenceId, title: text, summary: text,
        severity: "high", impactArea: "operations", status: "approved", updatedAt: new Date(),
      },
    });
  }
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] plan limits are enforced only where the plan was already gating", () => {
  const stamp = randomUUID().slice(0, 8);
  const workspaces: Ws[] = [];
  const plans: PlanEntitlementFixture[] = [];

  /** `capabilities: null` = no subscription at all. */
  async function freshWorkspace(capabilities: string[] | null): Promise<Ws> {
    const now = new Date();
    const n = workspaces.length;
    const ws: Ws = { workspaceId: randomUUID(), actorId: randomUUID(), clientId: randomUUID(), engagementId: randomUUID() };
    await db.workspace.create({ data: { id: ws.workspaceId, name: `Record only ${n}`, slug: `record-only-${n}-${stamp}` } });
    await db.user.create({ data: { id: ws.actorId, email: `${ws.actorId}@example.com`, isActive: true, updatedAt: now } });
    await db.workspaceMembership.create({ data: { userId: ws.actorId, workspaceId: ws.workspaceId, role: "admin", isActive: true } });
    await db.clientAccount.create({
      data: { id: ws.clientId, workspaceId: ws.workspaceId, name: `RO${n} client ${stamp}`, industry: "test", createdBy: ws.actorId, updatedAt: now },
    });
    await db.engagement.create({
      data: {
        id: ws.engagementId, updatedAt: now, code: `ROE-${stamp}-${n}`, title: "Record-only engagement", clientId: ws.clientId,
        workspaceId: ws.workspaceId, serviceTier: "standard", engagementMode: "advisory", status: "draft", healthStatus: "unknown", createdBy: ws.actorId,
      },
    });
    if (capabilities) plans.push(await seedPlanEntitlement([ws.workspaceId], capabilities, {}));
    workspaces.push(ws);
    return ws;
  }

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    const wsIds = workspaces.map((w) => w.workspaceId);
    try {
      const engagements = await db.engagement.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } });
      const engagementIds = engagements.map((e: { id: string }) => e.id);
      await db.action.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.operatorItem.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await db.recommendation.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await db.finding.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.evidence.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.businessConditionProfile.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.interventionState.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.idempotencyRecord.deleteMany({ where: { idempotencyKey: { startsWith: "ro-" } } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await db.usageEvent.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await db.engagement.deleteMany({ where: { id: { in: engagementIds } } });
      await db.clientAccount.deleteMany({ where: { workspaceId: { in: wsIds } } });
      for (const p of plans) await cleanupPlanEntitlement(p);
      await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await db.workspace.deleteMany({ where: { id: { in: wsIds } } });
      await db.user.deleteMany({ where: { id: { in: workspaces.map((w) => w.actorId) } } });
    } catch {
      // best-effort cleanup (ephemeral test database)
    }
  });

  // ─── Record-only: never newly refused, usage recorded exactly ─────────────

  it("POST /api/decisions/intake succeeds (200) and records usage when the plan lacks decision:create, and with no subscription", async () => {
    const lacking = await freshWorkspace(["create_engagement"]);
    const first = await route(intakePost, "/api/decisions/intake", lacking, { title: `Intake ${stamp} a` });
    expect(first.status).toBe(200);
    const second = await route(intakePost, "/api/decisions/intake", lacking, { title: `Intake ${stamp} b` });
    expect(second.status).toBe(200);
    expect(await db.operatorItem.count({ where: { workspaceId: lacking.workspaceId } })).toBe(2);
    expect(await usageSum(lacking.workspaceId, "decision:create")).toBe(2);

    const unsubscribed = await freshWorkspace(null);
    const res = await route(intakePost, "/api/decisions/intake", unsubscribed, { title: `Intake ${stamp} c` });
    expect(res.status).toBe(200);
    expect(await usageSum(unsubscribed.workspaceId, "decision:create")).toBe(1);
  }, 60_000);

  it("POST /api/run's write succeeds and records one unit per persisted decision when the plan lacks decision:create", async () => {
    const ws = await freshWorkspace(["create_engagement"]);
    const items = generateOperatorItems(
      [0, 1, 2].map((i) => ({ problem: `Run decision ${stamp} ${i}`, action: "Reprice the low-margin tier", impactMultiplier: 1, confidence: 0.6, ruleId: `ro-${i}` })),
      { impactLow: 800, impactExpected: 1000, impactHigh: 1200, confidenceWeight: 0.6 },
      ws.workspaceId,
      ws.actorId,
      ws.actorId
    );
    await addDecisionItemsWithinQuota(ws.workspaceId, items);
    expect(await db.operatorItem.count({ where: { workspaceId: ws.workspaceId } })).toBe(3);
    expect(await usageSum(ws.workspaceId, "decision:create")).toBe(3);
  }, 60_000);

  // executeWorkflow itself cannot reach its action step today: its createFinding call passes no
  // primaryEvidenceId and is refused (400) — a pre-existing defect outside this change. Its action write is
  // proven here by calling createAction exactly as src/services/execute.ts does (no quota mode argument).
  it("action creation as the execute workflow calls it succeeds and records action_create when the plan lacks action_create", async () => {
    const ws = await freshWorkspace(["create_engagement", "generate_recommendation"]);
    const action = await createAction(
      { engagementId: ws.engagementId, title: `Execute: ${ws.engagementId}`, priority: "medium", dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString() },
      ctx(ws),
      ws.workspaceId
    );
    expect(await db.action.count({ where: { id: action.id } })).toBe(1);
    expect(await usageSum(ws.workspaceId, "action_create")).toBe(1);
  }, 60_000);

  it("the consulting pipeline creates its actions and records action_create when the plan lacks action_create", async () => {
    const ws = await freshWorkspace(["decision_engine", "generate_recommendation"]);
    await seedPipelineFindings(ws);
    const result = await runConsultingPipeline(ws.engagementId, ctx(ws), ws.workspaceId);
    expect(result.status).toBe("SUCCESS");
    expect(result.actions.length).toBeGreaterThan(0);
    expect(await db.action.count({ where: { engagementId: ws.engagementId } })).toBe(result.actions.length);
    expect(await usageSum(ws.workspaceId, "action_create")).toBe(result.actions.length);
    expect(await usageSum(ws.workspaceId, "decision_engine")).toBe(1);
  }, 120_000);

  // ─── Enforced: the paths that were already plan-gated still refuse ─────────

  it("POST /api/decisions/create still answers 402 when the plan lacks decision:create, and writes nothing", async () => {
    const ws = await freshWorkspace(["create_engagement"]);
    const res = await route(createPost, "/api/decisions/create", ws, { title: `Create ${stamp}`, type: "pricing", impact: 1000, confidence: 0.5 });
    expect(res.status).toBe(402);
    expect(res.body.classification).toBe("handler_invocation_plan_limit_exceeded");
    expect(await db.operatorItem.count({ where: { workspaceId: ws.workspaceId } })).toBe(0);
    expect(await usageSum(ws.workspaceId, "decision:create")).toBe(0);
  }, 60_000);

  it("POST /api/actions' create, createRecommendation, createEngagement and the pipeline's decision_engine still refuse with 402", async () => {
    const ws = await freshWorkspace(["decision:create"]);
    const refused = { code: "PLAN_LIMIT_EXCEEDED", statusCode: 402 };
    await expect(
      createAction({ engagementId: ws.engagementId, title: `Action ${stamp}` }, ctx(ws), ws.workspaceId, undefined, { enforce: true })
    ).rejects.toMatchObject(refused);
    await expect(
      createRecommendation({ engagementId: ws.engagementId, title: `Rec ${stamp}`, priority: "medium" }, ctx(ws), ws.workspaceId)
    ).rejects.toMatchObject(refused);
    await expect(
      createEngagement(
        { clientId: ws.clientId, title: `Eng ${stamp}`, serviceTier: "standard", engagementMode: "expert", interventionMode: "stabilization" },
        ctx(ws),
        ws.workspaceId
      )
    ).rejects.toMatchObject(refused);
    await expect(runConsultingPipeline(ws.engagementId, ctx(ws), ws.workspaceId)).rejects.toMatchObject(refused);
    expect(await db.action.count({ where: { engagementId: ws.engagementId } })).toBe(0);
    expect(await db.recommendation.count({ where: { workspaceId: ws.workspaceId } })).toBe(0);
    expect(await db.usageEvent.count({ where: { workspaceId: ws.workspaceId } })).toBe(0);
  }, 60_000);
});
