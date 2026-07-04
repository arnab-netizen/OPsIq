/**
 * AUDIT-01 regression [db]: high-risk governed mutations must write their audit event
 * ATOMICALLY with the state change. Before the fix, updateItem/applyOverride wrote audit
 * post-commit and swallowed failures (.catch -> logger.warn), so a decision could change
 * state with the audit trail silently lost. Now, if the audit write fails, the mutation
 * rolls back.
 *
 * We force emitAuditEvent to reject and assert the OperatorItem row is UNCHANGED.
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

vi.mock("@/infra/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/audit")>();
  return { ...actual, emitAuditEvent: vi.fn().mockRejectedValue(new Error("audit sink down")) };
});

import { updateItem, applyOverride } from "@/services/operator/store";

const userId = randomUUID();
const ws = randomUUID();
const itemId = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] AUDIT-01 atomic audit on operator mutations", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `audit01-${userId}@example.com`, name: "a", isActive: true, updatedAt: NOW },
    });
    await db.workspace.upsert({
      where: { id: ws },
      update: {},
      create: { id: ws, name: "WS audit01", slug: `ws-${ws}`, createdBy: userId },
    });
    await db.operatorItem.create({
      data: {
        id: itemId, workspaceId: ws, ownerUserId: userId, createdByUserId: userId,
        problem: "p", action: "original-action", impactExpected: 1, impactLow: 1, impactHigh: 1,
        confidence: 0.5, priorityScore: 1, status: "pending", updatedAt: NOW,
      },
    });
  });

  afterAll(async () => {
    await db.operatorItem.deleteMany({ where: { id: itemId } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: userId } });
    vi.restoreAllMocks();
  });

  it("rolls back updateItem when the audit write fails", async () => {
    await expect(updateItem(itemId, { status: "in_progress" }, ws)).rejects.toThrow(/audit sink down/);
    const row = await db.operatorItem.findUnique({ where: { id: itemId } });
    expect(row?.status).toBe("pending"); // unchanged — rolled back
  });

  it("rolls back applyOverride when the audit write fails", async () => {
    await expect(applyOverride(itemId, "hijacked", ws, userId)).rejects.toThrow(/audit sink down/);
    const row = await db.operatorItem.findUnique({ where: { id: itemId } });
    expect(row?.action).toBe("original-action"); // unchanged — rolled back
  });
});
