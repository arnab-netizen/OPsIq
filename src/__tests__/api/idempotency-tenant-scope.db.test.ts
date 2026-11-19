/**
 * A cached idempotent outcome is never served to another workspace or actor, against a real database.
 *
 * Root cause proven here: checkIdempotencyKey matched a record by key and payload hash only (the schema has
 * no workspace/actor columns and the key is globally unique), so another tenant sending the same key and
 * body was served the first tenant's cached result (now including 4xx messages and details). The fix binds
 * the stored hash to the verified workspace and actor; another caller is refused (400) without any detail
 * of the first request, and the owner's own replay is unchanged.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/idempotency-tenant-scope.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { withIdempotency } from "@/infra/idempotency";

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

import { harness, executions, makeCaller, tenantFixtures } from "./support/idempotency-route-harness";

const call = makeCaller(ids);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] idempotency: a cached outcome stays with its own workspace and actor", () => {
  const stamp = randomUUID().slice(0, 8);
  const fx = tenantFixtures(stamp);
  const freshTenant = fx.freshTenant;

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it("another workspace and actor sending the same key and body never receive the first tenant's cached result", async () => {
    const a = await freshTenant(5);
    const b = await freshTenant(5);
    const key = `scope-${stamp}`;
    const body = { mode: "ok", label: "same body" };
    const first = await call(harness, "/api/scope-proof", a, key, body);
    expect(first.status).toBe(200);
    expect(first.body.workspaceId).toBe(a.workspaceId);

    const other = await call(harness, "/api/scope-proof", b, key, body);
    expect(other.status).not.toBe(200);
    expect(JSON.stringify(other.body)).not.toContain(a.workspaceId);
    expect(executions.get(key)).toBe(1);

    // The owner's own replay still returns its cached result.
    const replay = await call(harness, "/api/scope-proof", a, key, body);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);

    // The same holds for withIdempotency (POST /api/actions and every service that uses it): actor-bound.
    const svcKey = `svc-${stamp}`;
    const runA = await withIdempotency(svcKey, "scope.proof", async () => ({ owner: a.actorId }), { same: "body" }, a.actorId);
    expect(runA.result).toEqual({ owner: a.actorId });
    await expect(withIdempotency(svcKey, "scope.proof", async () => ({ owner: b.actorId }), { same: "body" }, b.actorId)).rejects.toMatchObject({ statusCode: 400 });
    const replayA = await withIdempotency(svcKey, "scope.proof", async () => ({ owner: "re-run" }), { same: "body" }, a.actorId);
    expect(replayA).toEqual({ isNew: false, result: { owner: a.actorId } });
  }, 60_000);

});
