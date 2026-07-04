/**
 * SEC-04 / GAP-TEN-01 regression [db]: the Prisma workspace-enforcement backstop must be
 * ACTIVE (no longer inert). Before the fix it keyed models camelCase while Prisma passes
 * PascalCase, so every check short-circuited. Now it blocks the two compatible, high-value
 * invariants and passes legitimate scoped ops through.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const userId = randomUUID();
const ws = randomUUID();
const itemId = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] SEC-04 workspace-enforcement backstop is active", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `sec04-${userId}@example.com`, name: "sec04", isActive: true, updatedAt: NOW },
    });
    await db.workspace.upsert({
      where: { id: ws },
      update: {},
      create: { id: ws, name: "WS sec04", slug: `ws-${ws}`, createdBy: userId },
    });
  });

  afterAll(async () => {
    await db.operatorItem.deleteMany({ where: { id: itemId } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  it("blocks an all-tenant bulk deleteMany (empty WHERE) on a workspace-owned model", async () => {
    await expect(db.operatorItem.deleteMany({})).rejects.toThrow(/WORKSPACE ISOLATION VIOLATION/);
  });

  it("blocks an all-tenant bulk updateMany (empty WHERE) on a workspace-owned model", async () => {
    await expect(
      db.operatorItem.updateMany({ data: { status: "done" } })
    ).rejects.toThrow(/WORKSPACE ISOLATION VIOLATION/);
  });

  it("allows a scoped create (workspaceId present) and scoped deleteMany", async () => {
    await db.operatorItem.create({
      data: {
        id: itemId,
        workspaceId: ws,
        ownerUserId: userId,
        createdByUserId: userId,
        problem: "p",
        action: "a",
        impactExpected: 1,
        impactLow: 1,
        impactHigh: 1,
        confidence: 0.5,
        priorityScore: 1,
        status: "pending",
        updatedAt: NOW,
      },
    });
    const found = await db.operatorItem.findUnique({ where: { id: itemId } });
    expect(found?.workspaceId).toBe(ws);
    // scoped deleteMany (has WHERE) is allowed
    await db.operatorItem.deleteMany({ where: { id: itemId } });
    expect(await db.operatorItem.findUnique({ where: { id: itemId } })).toBeNull();
  });

  it("does NOT interfere with a global model (workspace create without workspaceId)", async () => {
    const gid = randomUUID();
    await db.workspace.create({ data: { id: gid, name: "g", slug: `g-${gid}`, createdBy: userId } });
    await db.workspace.deleteMany({ where: { id: gid } });
    expect(true).toBe(true);
  });
});
