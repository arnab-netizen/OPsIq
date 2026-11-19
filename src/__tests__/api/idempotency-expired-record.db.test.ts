/**
 * An expired idempotency record is recycled for whoever sends its key next, against a real database.
 *
 * Root cause proven here: checkIdempotencyKey verified the caller binding BEFORE the expiry check, so another
 * workspace/actor sending a key whose record (of another tenant) had expired was refused (400) until
 * something deleted the record. The fix checks expiry first: an expired record is nobody's answer.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/idempotency-expired-record.db.test.ts --maxWorkers=1
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

import { checkIdempotencyKey, recordIdempotencyResponse } from "@/services/idempotency";
import { tenantFixtures } from "./support/idempotency-route-harness";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] idempotency: an expired record of another tenant is recycled", () => {
  const stamp = randomUUID().slice(0, 8);
  const fx = tenantFixtures(stamp);
  const freshTenant = fx.freshTenant;

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it("tenant B claims a key whose record from tenant A has expired, instead of a 400", async () => {
    const a = await freshTenant(5);
    const b = await freshTenant(5);
    const key = `expired-${stamp}`;
    const payload = { same: "body" };
    const first = await checkIdempotencyKey({ idempotencyKey: key, operationName: "expiryProof", actorId: a.actorId, workspaceId: a.workspaceId, payload });
    expect(first.isNew).toBe(true);
    await recordIdempotencyResponse(key, 200, { owner: a.workspaceId });
    await db.idempotencyRecord.updateMany({ where: { idempotencyKey: key }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const forB = await checkIdempotencyKey({ idempotencyKey: key, operationName: "expiryProof", actorId: b.actorId, workspaceId: b.workspaceId, payload });
    expect(forB).toEqual({ isNew: true });
    const record = await db.idempotencyRecord.findFirst({ where: { idempotencyKey: key } });
    expect(record?.status).toBe("pending");
    expect(record?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  }, 60_000);
});
