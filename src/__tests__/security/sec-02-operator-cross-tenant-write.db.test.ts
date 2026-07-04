/**
 * SEC-02 regression [db]: the operator store's write primitives must be workspace-scoped.
 *
 * Before the fix, updateItem/applyOverride accepted an optional workspaceId; when it was
 * undefined/empty they matched by id alone and wrote UNSCOPED, letting a caller in workspace A
 * mutate workspace B's OperatorItem. Now workspaceId is mandatory and the read+write are scoped,
 * so a foreign item (or an empty scope) is rejected with NotFound / a hard error.
 *
 * Requires TEST_WITH_DB=true with migrations applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { updateItem, applyOverride } from "@/services/operator/store";
import { NotFoundError } from "@/infra/errors";

const userId = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
const itemA = randomUUID();
const itemB = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");

async function seedItem(id: string, workspaceId: string) {
  await db.operatorItem.create({
    data: {
      id,
      workspaceId,
      ownerUserId: userId,
      createdByUserId: userId,
      problem: "p",
      action: "original-action",
      impactExpected: 1000,
      impactLow: 800,
      impactHigh: 1200,
      confidence: 0.7,
      priorityScore: 10,
      status: "pending",
      updatedAt: NOW,
    },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] SEC-02 operator store cross-tenant write is blocked", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `sec02-${userId}@example.com`, name: "sec02", isActive: true, updatedAt: NOW },
    });
    for (const [id, name] of [[wsA, "A"], [wsB, "B"]] as const) {
      await db.workspace.upsert({
        where: { id },
        update: {},
        create: { id, name: `WS ${name}`, slug: `ws-${id}`, createdBy: userId },
      });
    }
    await seedItem(itemA, wsA);
    await seedItem(itemB, wsB);
  });

  afterAll(async () => {
    // Audit events (created by the successful updateItem) reference the actor via a
    // Restrict FK, so they must be cleared before the workspace/user rows.
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.operatorItem.deleteMany({ where: { id: { in: [itemA, itemB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  it("updateItem cannot write a foreign workspace's item", async () => {
    await expect(
      updateItem(itemB, { status: "in_progress" }, wsA)
    ).rejects.toThrow(NotFoundError);
    // itemB must be untouched
    const row = await db.operatorItem.findUnique({ where: { id: itemB } });
    expect(row?.status).toBe("pending");
  });

  it("updateItem rejects an empty workspace scope (no unscoped write)", async () => {
    await expect(updateItem(itemB, { status: "in_progress" }, "")).rejects.toThrow(
      /workspaceId/i
    );
    const row = await db.operatorItem.findUnique({ where: { id: itemB } });
    expect(row?.status).toBe("pending");
  });

  it("updateItem succeeds for the item's own workspace", async () => {
    await updateItem(itemA, { status: "in_progress" }, wsA);
    const row = await db.operatorItem.findUnique({ where: { id: itemA } });
    expect(row?.status).toBe("in_progress");
  });

  it("applyOverride cannot write a foreign workspace's item", async () => {
    await expect(
      applyOverride(itemB, "hijacked-action", wsA, userId)
    ).rejects.toThrow(NotFoundError);
    const row = await db.operatorItem.findUnique({ where: { id: itemB } });
    expect(row?.action).toBe("original-action");
  });

  it("applyOverride rejects an empty workspace scope", async () => {
    await expect(applyOverride(itemB, "x", "", userId)).rejects.toThrow(/workspaceId/i);
    const row = await db.operatorItem.findUnique({ where: { id: itemB } });
    expect(row?.action).toBe("original-action");
  });
});
