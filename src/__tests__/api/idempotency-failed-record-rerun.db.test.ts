/**
 * A key whose record FAILED is re-run once by the routes that ignore cachedError, then replays the success,
 * against a real database.
 *
 * Root cause proven here: 46 routes never look at cachedError: for a key whose record failed they run the
 * write again. That re-run used to complete the failed record, so later retries replayed its success. The
 * caller-binding change finalized only PENDING records, so the record stayed failed and EVERY later retry
 * with the same key ran the write again. The fix finalizes the caller's pending OR failed record.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/idempotency-failed-record-rerun.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

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

import { cachedErrorIgnoringHarness, executions, makeCaller, tenantFixtures } from "./support/idempotency-route-harness";

const call = makeCaller(ids);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] idempotency: a failed key is re-run once, then replayed", () => {
  const stamp = randomUUID().slice(0, 8);
  const fx = tenantFixtures(stamp);
  const freshTenant = fx.freshTenant;

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it("first attempt fails (400), then 3 retries with the same key: exactly one re-execution, record ends completed", async () => {
    const t = await freshTenant(5);
    const key = `rerun-${stamp}`;
    const body = { mode: "fail_once", label: "rerun" };
    const first = await call(cachedErrorIgnoringHarness, "/api/rerun-proof", t, key, body);
    expect(first.status).toBe(400);
    for (let i = 0; i < 3; i++) {
      const retry = await call(cachedErrorIgnoringHarness, "/api/rerun-proof", t, key, body);
      expect(retry.status).toBe(200);
      expect(retry.body.run).toBe(2);
    }
    expect(executions.get(key)).toBe(2);
    const record = await db.idempotencyRecord.findFirst({ where: { idempotencyKey: key } });
    expect(record?.status).toBe("completed");
  }, 60_000);
});
