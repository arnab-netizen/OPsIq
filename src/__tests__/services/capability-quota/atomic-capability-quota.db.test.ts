/**
 * Atomic plan-limit enforcement against a real database, under genuine cross-process concurrency.
 *
 * Root cause proven here: every quota-limited operation checked its plan limit (assertCapability) and
 * recorded the usage (trackUsage) later, outside any lock. Concurrent callers all passed the check
 * before any of them recorded, so a limit of 3 admitted all 7 parallel creates (7 rows, usage 7).
 * The fix reserves the unit atomically (advisory lock per workspace + capability, check and usage insert
 * in one transaction) before the write and returns it on failure or idempotent replay.
 *
 * Each concurrent case spawns one OS process per call (support/quota-worker.ts), each with its own
 * Prisma client and PostgreSQL connection, released together at a shared barrier, and calls the REAL
 * service function. No mocks.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/capability-quota/atomic-capability-quota.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { createEngagement } from "@/services/engagement";
import { createRecommendation } from "@/services/recommendation";
import { runConsultingPipeline } from "@/services/consulting-engine/pipeline";
import { createDecisionsBulk } from "@/services/decisions/decision-creation-service";
import { runQuotaWorkersConcurrently, type QuotaWorkerOutcome, type QuotaWorkerOp } from "./support/quota-workers";

const LIMIT = 3;
const PARALLEL = 7;
const QUOTA_KEYS = ["generate_recommendation", "create_engagement", "action_create", "decision_engine", "decision:create"];

interface QuotaWorkspace {
  workspaceId: string;
  actorId: string;
  clientIds: string[];
  engagementId: string;
}

const ctx = (actorId: string, workspaceId: string) =>
  ({ verifiedActorId: actorId, verifiedWorkspaceId: workspaceId, verifiedActorType: "user" }) as unknown as CanonicalAuthContext;

async function usageSum(workspaceId: string, key: string): Promise<number> {
  const agg = await db.usageEvent.aggregate({ _sum: { value: true }, where: { workspaceId, key } });
  return agg._sum.value ?? 0;
}

function tally(outcomes: QuotaWorkerOutcome[]) {
  const ok = outcomes.filter((o) => o.ok);
  const denied = outcomes.filter((o) => !o.ok && o.code === "PLAN_LIMIT_EXCEEDED" && o.statusCode === 402);
  const other = outcomes.filter((o) => !o.ok && !(o.code === "PLAN_LIMIT_EXCEEDED" && o.statusCode === 402));
  return { ok, denied, other };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] atomic capability quota under concurrency", () => {
  const stamp = randomUUID().slice(0, 8);
  const workspaces: QuotaWorkspace[] = [];
  const plans: PlanEntitlementFixture[] = [];

  async function freshWorkspace(limits: Record<string, number | null>): Promise<QuotaWorkspace> {
    const now = new Date();
    const workspaceId = randomUUID();
    const actorId = randomUUID();
    const engagementId = randomUUID();
    const n = workspaces.length;
    await db.workspace.create({ data: { id: workspaceId, name: `Quota ${n}`, slug: `quota-${n}-${stamp}` } });
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, isActive: true, updatedAt: now } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
    // One client per parallel caller, each with a distinct three-letter code prefix, so concurrent
    // engagement creates never contend on the globally unique engagement code.
    const clientIds: string[] = [];
    for (let i = 0; i < PARALLEL; i++) {
      const clientId = randomUUID();
      const prefix = `QZ${String.fromCharCode(65 + i)}`;
      await db.clientAccount.create({
        data: { id: clientId, workspaceId, name: `${prefix} quota client ${stamp}`, industry: "test", createdBy: actorId, updatedAt: now },
      });
      clientIds.push(clientId);
    }
    await db.engagement.create({
      data: {
        id: engagementId, updatedAt: now, code: `QZE-${stamp}-${n}`, title: "Quota engagement", clientId: clientIds[0],
        workspaceId, serviceTier: "standard", engagementMode: "advisory", status: "draft", healthStatus: "unknown", createdBy: actorId,
      },
    });
    plans.push(await seedPlanEntitlement([workspaceId], QUOTA_KEYS, limits));
    const ws = { workspaceId, actorId, clientIds, engagementId };
    workspaces.push(ws);
    return ws;
  }

  async function race(ws: QuotaWorkspace, op: QuotaWorkerOp, inputFor: (i: number) => Record<string, unknown>) {
    return runQuotaWorkersConcurrently(
      Array.from({ length: PARALLEL }, (_, i) => ({ op, workspaceId: ws.workspaceId, actorId: ws.actorId, input: inputFor(i) }))
    );
  }

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    const ids = workspaces.map((w) => w.workspaceId);
    try {
      const engagements = await db.engagement.findMany({ where: { workspaceId: { in: ids } }, select: { id: true } });
      const engagementIds = engagements.map((e: { id: string }) => e.id);
      await db.action.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.operatorItem.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.finding.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.evidence.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.recommendation.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.businessConditionProfile.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.interventionState.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.idempotencyRecord.deleteMany({ where: { idempotencyKey: { contains: stamp } } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.usageEvent.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.engagement.deleteMany({ where: { id: { in: engagementIds } } });
      await db.clientAccount.deleteMany({ where: { workspaceId: { in: ids } } });
      for (const p of plans) await cleanupPlanEntitlement(p);
      await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.workspace.deleteMany({ where: { id: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: workspaces.map((w) => w.actorId) } } });
    } catch {
      // best-effort cleanup (ephemeral test database)
    }
  });

  it(`[db] generate_recommendation: ${PARALLEL} concurrent createRecommendation calls with limit ${LIMIT} admit exactly ${LIMIT}`, async () => {
    const ws = await freshWorkspace({ generate_recommendation: LIMIT });
    const outcomes = await race(ws, "recommendation", (i) => ({ engagementId: ws.engagementId, title: `Race rec ${stamp} ${i}` }));
    const { ok, denied, other } = tally(outcomes);
    expect(other).toEqual([]);
    expect(ok).toHaveLength(LIMIT);
    expect(denied).toHaveLength(PARALLEL - LIMIT);
    expect(await db.recommendation.count({ where: { workspaceId: ws.workspaceId } })).toBe(LIMIT);
    expect(await usageSum(ws.workspaceId, "generate_recommendation")).toBe(LIMIT);
  }, 180_000);

  it(`[db] create_engagement: ${PARALLEL} concurrent createEngagement calls with limit ${LIMIT} admit exactly ${LIMIT}`, async () => {
    const ws = await freshWorkspace({ create_engagement: LIMIT });
    const outcomes = await race(ws, "engagement", (i) => ({ clientId: ws.clientIds[i], title: `Race engagement ${stamp} ${i}` }));
    const { ok, denied, other } = tally(outcomes);
    expect(other).toEqual([]);
    expect(ok).toHaveLength(LIMIT);
    expect(denied).toHaveLength(PARALLEL - LIMIT);
    // +1: the fixture engagement inserted directly (not through the quota).
    expect(await db.engagement.count({ where: { workspaceId: ws.workspaceId } })).toBe(LIMIT + 1);
    expect(await usageSum(ws.workspaceId, "create_engagement")).toBe(LIMIT);
  }, 180_000);

  it(`[db] action_create (POST /api/actions, enforced): ${PARALLEL} concurrent createAction calls with limit ${LIMIT} admit exactly ${LIMIT}`, async () => {
    const ws = await freshWorkspace({ action_create: LIMIT });
    const outcomes = await race(ws, "action", (i) => ({ engagementId: ws.engagementId, title: `Race action ${stamp} ${i}` }));
    const { ok, denied, other } = tally(outcomes);
    expect(other).toEqual([]);
    expect(ok).toHaveLength(LIMIT);
    expect(denied).toHaveLength(PARALLEL - LIMIT);
    expect(await db.action.count({ where: { engagementId: ws.engagementId } })).toBe(LIMIT);
    expect(await usageSum(ws.workspaceId, "action_create")).toBe(LIMIT);
  }, 180_000);

  it(`[db] decision_engine: ${PARALLEL} concurrent successful pipeline runs with limit ${LIMIT} admit exactly ${LIMIT}`, async () => {
    const ws = await freshWorkspace({ decision_engine: LIMIT });
    // Approved findings the deterministic consulting engine diagnoses with SUCCESS (one intervention).
    const evidenceId = randomUUID();
    await db.evidence.create({
      data: { id: evidenceId, engagementId: ws.engagementId, title: "Quota evidence", description: "Operational records", source: "interview", status: "validated", updatedAt: new Date() },
    });
    const findingTexts = [
      "Turnaround time bottleneck: orders wait 9 days in production queue, capacity constrained",
      "Revenue stagnant for 3 consecutive years at the same revenue",
      "Gross margin declined from 40% to 22%; cash flow negative for 6 months",
    ];
    for (const text of findingTexts) {
      await db.finding.create({
        data: {
          id: randomUUID(), engagementId: ws.engagementId, primaryEvidenceId: evidenceId, title: text, summary: text,
          severity: "high", impactArea: "operations", status: "approved", updatedAt: new Date(),
        },
      });
    }
    const outcomes = await race(ws, "pipeline", () => ({ engagementId: ws.engagementId }));
    const { ok, denied, other } = tally(outcomes);
    expect(other).toEqual([]);
    expect(ok).toHaveLength(LIMIT);
    expect(ok.every((o) => o.ok && o.status === "SUCCESS")).toBe(true);
    expect(denied).toHaveLength(PARALLEL - LIMIT);
    expect(await usageSum(ws.workspaceId, "decision_engine")).toBe(LIMIT);
  }, 180_000);

  it("[db] decision_engine: a non-success pipeline run consumes nothing", async () => {
    const ws = await freshWorkspace({ decision_engine: 1 });
    // No approved findings: the run ends INSUFFICIENT_DATA and the reserved unit is returned.
    const result = await runConsultingPipeline(ws.engagementId, ctx(ws.actorId, ws.workspaceId), ws.workspaceId);
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(await usageSum(ws.workspaceId, "decision_engine")).toBe(0);
  }, 60_000);

  it(`[db] decision:create: ${PARALLEL} concurrent createDecision calls with limit ${LIMIT} admit exactly ${LIMIT} and record usage`, async () => {
    const ws = await freshWorkspace({ "decision:create": LIMIT });
    const outcomes = await race(ws, "decision", (i) => ({ title: `Race decision ${stamp} ${i}` }));
    const { ok, denied, other } = tally(outcomes);
    expect(other).toEqual([]);
    expect(ok).toHaveLength(LIMIT);
    expect(denied).toHaveLength(PARALLEL - LIMIT);
    expect(await db.operatorItem.count({ where: { workspaceId: ws.workspaceId } })).toBe(LIMIT);
    // The usage is recorded in the same transaction as the decision row and its audit event.
    expect(await usageSum(ws.workspaceId, "decision:create")).toBe(LIMIT);
  }, 180_000);

  // POST /api/decisions/intake and POST /api/run were never plan-gated: their decision:create usage is
  // record-only. Under the same concurrency, nothing is refused and usage counts every decision exactly.
  it(`[db] decision:create via POST /api/decisions/intake's write (record-only): ${PARALLEL} concurrent intakes past limit ${LIMIT} all persist and are all counted`, async () => {
    const ws = await freshWorkspace({ "decision:create": LIMIT });
    const outcomes = await race(ws, "intake", (i) => ({ title: `Race intake ${stamp} ${i}` }));
    const { ok, denied, other } = tally(outcomes);
    expect(other).toEqual([]);
    expect(denied).toEqual([]);
    expect(ok).toHaveLength(PARALLEL);
    expect(await db.operatorItem.count({ where: { workspaceId: ws.workspaceId } })).toBe(PARALLEL);
    expect(await usageSum(ws.workspaceId, "decision:create")).toBe(PARALLEL);
  }, 180_000);

  it(`[db] decision:create via POST /api/run's write (record-only): ${PARALLEL} concurrent runs past limit ${LIMIT} all persist and are all counted`, async () => {
    const ws = await freshWorkspace({ "decision:create": LIMIT });
    const outcomes = await race(ws, "run", (i) => ({ title: `Race run ${stamp} ${i}` }));
    const { ok, denied, other } = tally(outcomes);
    expect(other).toEqual([]);
    expect(denied).toEqual([]);
    expect(ok).toHaveLength(PARALLEL);
    expect(await db.operatorItem.count({ where: { workspaceId: ws.workspaceId } })).toBe(PARALLEL);
    expect(await usageSum(ws.workspaceId, "decision:create")).toBe(PARALLEL);
  }, 180_000);

  it(`[db] decision:create: a plan with a null (unlimited) limit admits all ${PARALLEL} concurrent creates`, async () => {
    const ws = await freshWorkspace({ "decision:create": null });
    const outcomes = await race(ws, "decision", (i) => ({ title: `Unlimited decision ${stamp} ${i}` }));
    const { ok, other } = tally(outcomes);
    expect(other).toEqual([]);
    expect(ok).toHaveLength(PARALLEL);
    expect(await db.operatorItem.count({ where: { workspaceId: ws.workspaceId } })).toBe(PARALLEL);
    expect(await usageSum(ws.workspaceId, "decision:create")).toBe(PARALLEL);
  }, 180_000);

  it("[db] decision:create: a bulk create stops at the limit and reports the over-limit items as failed", async () => {
    const ws = await freshWorkspace({ "decision:create": 2 });
    const result = await createDecisionsBulk({
      decisions: [0, 1, 2].map((i) => ({
        title: `Bulk decision ${stamp} ${i}`, type: "pricing", impact: 1000, confidence: 0.5,
        verifiedActorId: ws.actorId, verifiedWorkspaceId: ws.workspaceId,
      })),
    });
    expect(result.summary).toEqual({ total: 3, succeeded: 2, failed: 1 });
    expect(await db.operatorItem.count({ where: { workspaceId: ws.workspaceId } })).toBe(2);
    expect(await usageSum(ws.workspaceId, "decision:create")).toBe(2);
  }, 60_000);

  it("[db] create_engagement: an idempotent replay of the same engagement does not consume a second unit", async () => {
    const ws = await freshWorkspace({ create_engagement: LIMIT });
    const input = { clientId: ws.clientIds[1], title: `Replay engagement ${stamp}`, serviceTier: "standard", engagementMode: "expert", interventionMode: "stabilization" };
    const first = await createEngagement(input, ctx(ws.actorId, ws.workspaceId), ws.workspaceId);
    const replay = await createEngagement(input, ctx(ws.actorId, ws.workspaceId), ws.workspaceId);
    expect(replay.id).toBe(first.id);
    expect(await db.engagement.count({ where: { workspaceId: ws.workspaceId, clientId: ws.clientIds[1] } })).toBe(1);
    expect(await usageSum(ws.workspaceId, "create_engagement")).toBe(1);
  }, 60_000);

  it("[db] generate_recommendation: a create that fails after the check returns its unit, so the last unit stays usable", async () => {
    const ws = await freshWorkspace({ generate_recommendation: 1 });
    await expect(
      createRecommendation({ engagementId: randomUUID(), title: "Missing engagement", priority: "medium" }, ctx(ws.actorId, ws.workspaceId), ws.workspaceId)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await usageSum(ws.workspaceId, "generate_recommendation")).toBe(0);

    const rec = await createRecommendation({ engagementId: ws.engagementId, title: `Last unit ${stamp}`, priority: "medium" }, ctx(ws.actorId, ws.workspaceId), ws.workspaceId);
    expect(rec.id).toBeTruthy();
    await expect(
      createRecommendation({ engagementId: ws.engagementId, title: `Over limit ${stamp}`, priority: "medium" }, ctx(ws.actorId, ws.workspaceId), ws.workspaceId)
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_EXCEEDED", statusCode: 402 });
    expect(await usageSum(ws.workspaceId, "generate_recommendation")).toBe(1);
  }, 60_000);
});
