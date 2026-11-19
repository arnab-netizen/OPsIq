/**
 * A refusal that may clear on retry is not cached against its idempotency key, against a real database.
 *
 * Root cause proven here: recordIdempotencyError persisted EVERY failure for the key's lifetime (24 h),
 * including refusals that clear on retry: an unverifiable entitlement (a lock-wait timeout or database
 * failure mapped to a 402 "Entitlement check failed"), a 429, and the "reservation expired, please try
 * again" 409. A retry with the same key replayed the refusal instead of re-running. The fix marks those
 * refusals retryable (telemetry.retryable; PlanLimitError details.reason "entitlement_unverifiable") and
 * releases the key claim for them. A verified 402 (over the limit, or no subscription) stays cached.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/idempotency-retryable-refusal.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import pg from "pg";

const ids = vi.hoisted(() => ({ actorId: "", workspaceId: "" }));

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: ids.actorId, email: "idem@example.com", name: "Idempotency", isActive: true },
    sessionId: "idem-session",
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

import { POST as createPost } from "@/app/api/decisions/create/route";
import { harness, executions, makeCaller, tenantFixtures } from "./support/idempotency-route-harness";

const call = makeCaller(ids);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] idempotency: a retryable refusal re-runs with the same key; a verified refusal stays cached", () => {
  const stamp = randomUUID().slice(0, 8);
  const fx = tenantFixtures(stamp);
  const freshTenant = fx.freshTenant;
  const decision = (title: string) => ({ title, type: "pricing", impact: 1000, confidence: 0.5 });

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it("an unverifiable-entitlement 402 (lock-wait timeout) is not cached: once the lock is free, the same key re-runs and succeeds", async () => {
    const t = await freshTenant(5);
    const key = `ent-${stamp}`;
    // Another session holds this workspace's decision:create quota lock past the reserve statement timeout.
    const holder = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await holder.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`capability_quota:${t.workspaceId}:decision:create`]);
      const first = await call(harness, "/api/scope-proof", t, key, { mode: "quota_write", label: "lock" });
      expect(first.status).toBe(402);
      expect(first.body.classification).toBe("handler_invocation_plan_limit_exceeded");
      expect(await db.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(0);
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      await holder.end();
    }
    const retry = await call(harness, "/api/scope-proof", t, key, { mode: "quota_write", label: "lock" });
    expect(retry.status).toBe(200);
    expect(executions.get(key)).toBe(2);
    expect(await db.operatorItem.count({ where: { workspaceId: t.workspaceId } })).toBe(1);
  }, 90_000);

  it("a determinate entitlement refusal (no subscription) is a verified 402 and stays cached for its key", async () => {
    const t = await freshTenant("no-subscription");
    const key = `nosub-${stamp}`;
    const first = await call(createPost, "/api/decisions/create", t, key, decision(`No subscription ${stamp}`));
    expect(first.status).toBe(402);
    expect(await db.idempotencyRecord.count({ where: { idempotencyKey: key, status: "failed" } })).toBe(1);
  }, 60_000);

  it("a genuine over-limit 402 stays cached: the same key replays 402 even after the limit is raised", async () => {
    const t = await freshTenant(0);
    const key = `limit-${stamp}`;
    const first = await call(createPost, "/api/decisions/create", t, key, decision(`Over limit ${stamp}`));
    expect(first.status).toBe(402);
    await db.planCapability.updateMany({ where: { planId: fx.plans[fx.plans.length - 1].planId }, data: { limit: 5 } });
    const retry = await call(createPost, "/api/decisions/create", t, key, decision(`Over limit ${stamp}`));
    expect(retry.status).toBe(402);
    expect(retry.body.error).toBe(first.body.error);
    expect(await db.operatorItem.count({ where: { workspaceId: t.workspaceId } })).toBe(0);
  }, 60_000);

  it.each([
    ["rate_limited_once", 429],
    ["reservation_expires_once", 409],
  ] as const)("%s: the first response is %i and the retry with the same key re-runs and succeeds", async (mode, status) => {
    const t = await freshTenant(5);
    const key = `retry-${stamp}-${mode}`;
    const first = await call(harness, "/api/scope-proof", t, key, { mode, label: mode });
    expect(first.status).toBe(status);
    const retry = await call(harness, "/api/scope-proof", t, key, { mode, label: mode });
    expect(retry.status).toBe(200);
    expect(retry.body.run).toBe(2);
    expect(executions.get(key)).toBe(2);
  }, 60_000);

});
