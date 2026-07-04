/**
 * GAP-AUDIT-02 regression [db]: addItems must create the governed decision and its audit
 * event ATOMICALLY, and must write the correct Prisma columns.
 *
 * Before the fix: addItems wrote non-existent fields (createdBy / decisionType / …) so
 * `create` threw, and even the create path emitted audit best-effort (.catch → warn).
 * Now the create uses the real columns and a failed audit rolls the create back.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const { wsId, userId, emitAuditEvent } = vi.hoisted(() => ({
  wsId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  emitAuditEvent: vi.fn(),
}));
const NOW = new Date("2026-07-04T00:00:00Z");

vi.mock("@/services/workspace/context", () => ({
  requireWorkspaceContext: vi.fn(async () => ({ workspaceId: wsId, userId })),
  validateWorkspaceAccess: vi.fn(async () => undefined),
}));

vi.mock("@/infra/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/audit")>();
  return { ...actual, emitAuditEvent };
});

import { addItems } from "@/services/operator/store";

function makeItem() {
  return {
    id: randomUUID(),
    workspaceId: wsId,
    ownerUserId: userId,
    createdBy: userId,
    problem: "p",
    action: "a",
    impactExpected: 1000,
    impactLow: 800,
    impactHigh: 1200,
    confidence: 0.7,
    priorityScore: 10,
    status: "pending",
  } as any;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] GAP-AUDIT-02 addItems atomic + schema-correct", () => {
  const created: string[] = [];

  beforeAll(async () => {
    await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `a02-${userId}@e.com`, name: "a", isActive: true, updatedAt: NOW } });
    await db.workspace.upsert({ where: { id: wsId }, update: {}, create: { id: wsId, name: "WS a02", slug: `ws-${wsId}`, createdBy: userId } });
  });

  afterEach(async () => {
    await db.auditEvent.deleteMany({ where: { workspaceId: wsId } });
    if (created.length) await db.operatorItem.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
    emitAuditEvent.mockReset();
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: wsId } });
    await db.user.deleteMany({ where: { id: userId } });
    vi.restoreAllMocks();
  });

  it("persists the operator item with the correct columns (no schema drift throw)", async () => {
    emitAuditEvent.mockResolvedValue("ae");
    const item = makeItem();
    created.push(item.id);
    await addItems([item]);
    const row = await db.operatorItem.findUnique({ where: { id: item.id } });
    expect(row).not.toBeNull();
    expect(row?.createdByUserId).toBe(userId);
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("rolls the create back when the audit write fails (fail-closed)", async () => {
    emitAuditEvent.mockRejectedValue(new Error("audit sink down"));
    const item = makeItem();
    created.push(item.id);
    await expect(addItems([item])).rejects.toThrow(/audit sink down/);
    const row = await db.operatorItem.findUnique({ where: { id: item.id } });
    expect(row).toBeNull(); // rolled back
  });
});
