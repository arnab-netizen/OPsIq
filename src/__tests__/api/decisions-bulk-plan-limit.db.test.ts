/**
 * POST /api/decisions/create bulk keeps its plan-limit status contract, against a real database.
 *
 * Root cause proven here: with decision:create recorded per item, createDecisionsBulk caught each item's
 * PlanLimitError into failed[] and the route answered 200 even when the plan refused every item; before
 * usage was recorded per item the whole request answered 402. The fix answers 402 when no item persisted
 * and every failure was a plan-limit refusal; a partial bulk stays 200 with its per-item failures.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/decisions-bulk-plan-limit.db.test.ts --maxWorkers=1
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

import { POST as createPost } from "@/app/api/decisions/create/route";
import { makeCaller, tenantFixtures } from "./support/idempotency-route-harness";

const call = makeCaller(ids);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] POST /api/decisions/create bulk: 402 when the plan refuses every item", () => {
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

  it("bulk create where no item fits the plan limit answers 402 and writes nothing; a partial bulk answers 200 with the failures", async () => {
    const none = await freshTenant(0);
    const refused = await call(createPost, "/api/decisions/create", none, `bulk-none-${stamp}`, {
      decisions: [decision(`Bulk ${stamp} 0`), decision(`Bulk ${stamp} 1`)],
    });
    expect(refused.status).toBe(402);
    expect(refused.body.classification).toBe("handler_invocation_plan_limit_exceeded");
    expect(await db.operatorItem.count({ where: { workspaceId: none.workspaceId } })).toBe(0);

    const partial = await freshTenant(1);
    const ok = await call(createPost, "/api/decisions/create", partial, `bulk-partial-${stamp}`, {
      decisions: [decision(`Bulk ${stamp} 2`), decision(`Bulk ${stamp} 3`)],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(await db.operatorItem.count({ where: { workspaceId: partial.workspaceId } })).toBe(1);
  }, 60_000);
});
