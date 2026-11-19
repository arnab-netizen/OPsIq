/**
 * POST /api/decisions/intake records decision:create usage exactly once per decision: a replay with the same
 * idempotency key returns the cached response without recording a second unit. Intake is free by contract
 * (record-only), so a request past the plan limit is recorded, never refused.
 *
 * The real route handler runs through withCanonicalEnforcement against a real database; only the
 * session/policy facts are supplied (the repo has no cookie/session harness outside the Next runtime), the
 * same approach as src/__tests__/p2b/real-route-tests.test.ts.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/decisions-intake-quota-replay.db.test.ts --maxWorkers=1
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
    user: { id: ids.actorId, email: "intake-quota@example.com", name: "Intake Quota", isActive: true },
    sessionId: "intake-quota-session",
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

async function usageSum(workspaceId: string): Promise<number> {
  const agg = await db.usageEvent.aggregate({ _sum: { value: true }, where: { workspaceId, key: "decision:create" } });
  return agg._sum.value ?? 0;
}

async function post(idempotencyKey: string, title: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = new NextRequest(new URL("http://localhost:3000/api/decisions/intake"), {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", "idempotency-key": idempotencyKey, "x-workspace-id": ids.workspaceId }),
    body: JSON.stringify({ title }),
  });
  const res = (await intakePost(req, { params: Promise.resolve({}) })) as Response;
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] POST /api/decisions/intake decision:create usage", () => {
  const stamp = randomUUID().slice(0, 8);
  let plan: PlanEntitlementFixture | undefined;

  beforeAll(async () => {
    ids.actorId = randomUUID();
    ids.workspaceId = randomUUID();
    await db.user.create({ data: { id: ids.actorId, email: `intake-quota-${stamp}@example.com`, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ids.workspaceId, name: "Intake quota", slug: `intake-quota-${stamp}` } });
    await db.workspaceMembership.create({ data: { userId: ids.actorId, workspaceId: ids.workspaceId, role: "admin", isActive: true } });
    plan = await seedPlanEntitlement([ids.workspaceId], ["decision:create"], { "decision:create": 1 });
  });

  afterAll(async () => {
    try {
      await db.idempotencyRecord.deleteMany({ where: { idempotencyKey: { contains: stamp } } });
      await db.auditEvent.deleteMany({ where: { workspaceId: ids.workspaceId } });
      await db.operatorItem.deleteMany({ where: { workspaceId: ids.workspaceId } });
      await db.usageEvent.deleteMany({ where: { workspaceId: ids.workspaceId } });
      await cleanupPlanEntitlement(plan);
      await db.workspaceMembership.deleteMany({ where: { workspaceId: ids.workspaceId } });
      await db.workspace.deleteMany({ where: { id: ids.workspaceId } });
      await db.user.deleteMany({ where: { id: ids.actorId } });
    } catch {
      // best-effort cleanup (ephemeral test database)
    }
  });

  it("[db] a replay with the same idempotency key does not record a second unit; a request past the limit is recorded, not refused", async () => {
    const key = `intake-${stamp}-a`;
    const first = await post(key, `Intake decision ${stamp}`);
    expect(first.status).toBe(200);
    expect(await usageSum(ids.workspaceId)).toBe(1);

    const replay = await post(key, `Intake decision ${stamp}`);
    expect(replay.status).toBe(200);
    expect(replay.body.decisionId).toBe(first.body.decisionId);
    expect(await usageSum(ids.workspaceId)).toBe(1);
    expect(await db.operatorItem.count({ where: { workspaceId: ids.workspaceId } })).toBe(1);

    // Intake is free by contract and was never plan-gated: past the limit it is recorded, never refused.
    const pastLimit = await post(`intake-${stamp}-b`, `Second intake ${stamp}`);
    expect(pastLimit.status).toBe(200);
    expect(await usageSum(ids.workspaceId)).toBe(2);
    expect(await db.operatorItem.count({ where: { workspaceId: ids.workspaceId } })).toBe(2);

    // Its replay returns the cached response and consumes nothing more.
    const pastLimitReplay = await post(`intake-${stamp}-b`, `Second intake ${stamp}`);
    expect(pastLimitReplay.status).toBe(200);
    expect(pastLimitReplay.body.decisionId).toBe(pastLimit.body.decisionId);
    expect(await usageSum(ids.workspaceId)).toBe(2);
    expect(await db.operatorItem.count({ where: { workspaceId: ids.workspaceId } })).toBe(2);
  }, 60_000);
});
