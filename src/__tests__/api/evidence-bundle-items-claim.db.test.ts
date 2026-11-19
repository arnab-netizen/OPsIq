/**
 * POST /api/evidence-bundles/[bundleId]/items never fails another request's idempotency claim, against a
 * real database.
 *
 * Root cause proven here: the route ran checkIdempotencyKey INSIDE its try, and its catch recorded the error
 * against the key. A request refused by the check itself (the owner's duplicate while the first is in flight,
 * or another caller's key) therefore marked the claim of the request that owns the key as failed, losing its
 * success. The fix records the error only when this request holds the claim. A scan of every
 * checkIdempotencyKey call found this the only check inside a try whose catch records the error.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/evidence-bundle-items-claim.db.test.ts --maxWorkers=1
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

import { POST as addItemPost } from "@/app/api/evidence-bundles/[bundleId]/items/route";
import { checkIdempotencyKey, recordIdempotencyResponse } from "@/services/idempotency";
import { makeCaller, tenantFixtures } from "./support/idempotency-route-harness";

const call = makeCaller(ids);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] evidence-bundle items: a request refused by the idempotency check never fails the owner's claim", () => {
  const stamp = randomUUID().slice(0, 8);
  const fx = tenantFixtures(stamp);
  const freshTenant = fx.freshTenant;

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it("a duplicate in flight and another tenant's request with the same key leave the owner's pending claim intact", async () => {
    const owner = await freshTenant(5);
    const other = await freshTenant(5);
    const key = `bundle-${stamp}`;
    const bundleId = randomUUID();
    const body = { bundleId, evidenceItemId: randomUUID() };
    // Request 1 holds the claim (the same check the route makes, for the same caller and payload).
    const claim = await checkIdempotencyKey({
      idempotencyKey: key, operationName: "addEvidenceToBundle", actorId: owner.actorId, workspaceId: owner.workspaceId, payload: body,
    });
    expect(claim.isNew).toBe(true);

    // Both are refused by the check. Their HTTP answer is not asserted: this route returns errorToResponse's
    // Response object from inside the canonical wrapper, which serializes it as a 200 "{}" (a separate,
    // pre-existing defect). What matters here is the owner's claim.
    await call(addItemPost, `/api/evidence-bundles/${bundleId}/items`, owner, key, body, { bundleId });
    expect((await db.idempotencyRecord.findFirst({ where: { idempotencyKey: key } }))?.status).toBe("pending");
    await call(addItemPost, `/api/evidence-bundles/${bundleId}/items`, other, key, body, { bundleId });
    expect((await db.idempotencyRecord.findFirst({ where: { idempotencyKey: key } }))?.status).toBe("pending");

    // Request 1 completes: its success is recorded and replayable.
    await recordIdempotencyResponse(key, 201, { success: true });
    expect((await db.idempotencyRecord.findFirst({ where: { idempotencyKey: key } }))?.status).toBe("completed");
  }, 60_000);
});
