/**
 * AUDIT-01 remaining paths [db]: reject / lifecycle-transition / outcome-verify now write their
 * audit event ATOMICALLY with the state change. Forcing the audit write to fail must roll the
 * mutation back (no post-commit swallow).
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const emitAuditEvent = vi.hoisted(() => vi.fn());
vi.mock("@/infra/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/audit")>();
  return { ...actual, emitAuditEvent };
});

import { transitionDecisionState } from "@/services/decisions/decision-lifecycle.service";

const userId = randomUUID();
const ws = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");

async function seed(status: string): Promise<string> {
  const id = randomUUID();
  await db.operatorItem.create({
    data: {
      id, workspaceId: ws, ownerUserId: userId, createdByUserId: userId,
      problem: "p", action: "a", impactExpected: 1000, impactLow: 800, impactHigh: 1200,
      confidence: 0.7, priorityScore: 10, status, updatedAt: NOW,
    },
  });
  return id;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] AUDIT-01 remaining paths are atomic", () => {
  const ids: string[] = [];
  beforeAll(async () => {
    await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `ar-${userId}@e.com`, name: "a", isActive: true, updatedAt: NOW } });
    await db.workspace.upsert({ where: { id: ws }, update: {}, create: { id: ws, name: "WS", slug: `ws-${ws}`, createdBy: userId } });
  });
  afterEach(async () => {
    await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
    if (ids.length) await db.operatorItem.deleteMany({ where: { id: { in: ids } } });
    ids.length = 0;
    emitAuditEvent.mockReset();
  });
  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: userId } });
    vi.restoreAllMocks();
  });

  it("lifecycle transition: success writes audit; audit failure rolls back", async () => {
    // success path: pending(SUBMITTED) -> APPROVED
    emitAuditEvent.mockResolvedValue("ae");
    const okId = await seed("pending");
    ids.push(okId);
    await transitionDecisionState(okId, ws, "APPROVED", null, userId);
    expect((await db.operatorItem.findUnique({ where: { id: okId } }))?.status).toBe("approved");
    expect(emitAuditEvent).toHaveBeenCalled();

    // failure path rolls back
    emitAuditEvent.mockRejectedValue(new Error("audit sink down"));
    const badId = await seed("pending");
    ids.push(badId);
    await expect(transitionDecisionState(badId, ws, "APPROVED", null, userId)).rejects.toThrow(/audit sink down/);
    const row = await db.operatorItem.findUnique({ where: { id: badId } });
    expect(row?.status).toBe("pending"); // unchanged — rolled back
  });
});
