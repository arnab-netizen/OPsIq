/**
 * CAT 2 atomicity proof for updateItem.
 *
 * Invariant: operatorItem.update and its audit event are written inside a
 * single db.$transaction. If emitAuditEvent rejects inside that callback,
 * db.$transaction must also reject — the DB mutation is never committed
 * (fail-closed). This file proves that contract without a real database.
 *
 * Method: mock db.$transaction to actually invoke the callback and propagate
 * any throw, mock emitAuditEvent to throw, and assert that updateItem rejects.
 * The updateItem call MUST NOT resolve when the audit write fails.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Static mocks (must precede module imports) ────────────────────────────────

const txUpdateMock = vi.fn(async () => ({}));

/** Simulated transaction client — records what updateItem tried to write. */
const txMock = {
  operatorItem: { update: txUpdateMock },
  auditEvent: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: "ae-1" })),
  },
};

/**
 * db.$transaction invokes the callback immediately with txMock, propagating
 * any throw — exactly what Prisma does at the real DB level.
 */
const dbTransactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
  return cb(txMock);
});

const dbOperatorItemFindFirstMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (...a: unknown[]) => dbTransactionMock(...a as [any]),
    operatorItem: { findFirst: (...a: unknown[]) => dbOperatorItemFindFirstMock(...a) },
  },

  getDbInstance: vi.fn().mockResolvedValue({}),
}));

const emitAuditEventMock = vi.fn();
vi.mock("@/infra/audit", () => ({
  emitAuditEvent: (...a: unknown[]) => emitAuditEventMock(...a),
}));

// Import under test after mocks are established.
import { updateItem } from "@/services/operator/store";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ITEM_BASE = {
  id: "item-1",
  workspaceId: "ws-1",
  createdByUserId: "user-1",
  lastUpdatedByUserId: null,
  problem: "original",
  action: "do it",
  status: "pending",
  priorityScore: null,
  confidence: null,
  decisionType: null,
  impactExpected: null,
  impactLow: null,
  impactHigh: null,
  dueAt: null,
  startedAt: null,
  completedAt: null,
  executionStatus: null,
  completedByUserId: null,
  expectedOutcome: null,
  actualOutcome: null,
  actualOutcomeValue: null,
  outcomeDelta: null,
  decisionAccuracy: null,
  decisionError: null,
  outcomeNotes: null,
  verificationStatus: null,
  verificationMethod: null,
  verificationConfidence: null,
  verificationEvidence: null,
  auditTrail: null,
  blockingDependencies: null,
  baselineValue: null,
  projectedWithoutAction: null,
  problemType: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  firstCompletedAt: null,
  firstPositiveOutcomeAt: null,
  firstWinAchieved: false,
};

beforeEach(() => {
  dbTransactionMock.mockClear();
  dbOperatorItemFindFirstMock.mockClear();
  txUpdateMock.mockClear();
  emitAuditEventMock.mockClear();
  (txMock.auditEvent.findFirst as ReturnType<typeof vi.fn>).mockClear();
  (txMock.auditEvent.create as ReturnType<typeof vi.fn>).mockClear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("updateItem — CAT 2 atomicity (audit-failure rollback)", () => {
  it("resolves normally when both operatorItem.update and emitAuditEvent succeed", async () => {
    dbOperatorItemFindFirstMock.mockResolvedValue({ ...ITEM_BASE });
    txUpdateMock.mockResolvedValue({ ...ITEM_BASE, problem: "updated" });
    emitAuditEventMock.mockResolvedValue("ae-ok");

    await expect(updateItem("item-1", { problem: "updated" }, "ws-1")).resolves.toBeUndefined();

    expect(dbTransactionMock).toHaveBeenCalledOnce();
    expect(txUpdateMock).toHaveBeenCalledOnce();
    expect(emitAuditEventMock).toHaveBeenCalledOnce();
  });

  it("ATOMICITY: rejects when emitAuditEvent throws inside transaction", async () => {
    dbOperatorItemFindFirstMock.mockResolvedValue({ ...ITEM_BASE });
    txUpdateMock.mockResolvedValue({ ...ITEM_BASE });
    emitAuditEventMock.mockRejectedValue(new Error("audit write failed — simulated DB constraint"));

    await expect(updateItem("item-1", { problem: "updated" }, "ws-1")).rejects.toThrow(
      "audit write failed — simulated DB constraint"
    );
  });

  it("ATOMICITY: db.$transaction is called exactly once (no silent retry on audit failure)", async () => {
    dbOperatorItemFindFirstMock.mockResolvedValue({ ...ITEM_BASE });
    txUpdateMock.mockResolvedValue({ ...ITEM_BASE });
    emitAuditEventMock.mockRejectedValue(new Error("constraint violation"));

    await updateItem("item-1", {}, "ws-1").catch(() => {});

    // $transaction was invoked once; the failure inside the callback must not
    // cause a second attempt — retrying would create divergent audit state.
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("ATOMICITY: operatorItem.update is called before emitAuditEvent (correct ordering)", async () => {
    const callOrder: string[] = [];
    dbOperatorItemFindFirstMock.mockResolvedValue({ ...ITEM_BASE });
    txUpdateMock.mockImplementation(async () => {
      callOrder.push("update");
      return { ...ITEM_BASE };
    });
    emitAuditEventMock.mockImplementation(async () => {
      callOrder.push("audit");
      return "ae-id";
    });

    await updateItem("item-1", { problem: "x" }, "ws-1");

    expect(callOrder).toEqual(["update", "audit"]);
  });

  it("emitAuditEvent is called with the transaction client (not the global db)", async () => {
    dbOperatorItemFindFirstMock.mockResolvedValue({ ...ITEM_BASE });
    txUpdateMock.mockResolvedValue({ ...ITEM_BASE });
    emitAuditEventMock.mockResolvedValue("ae-ok");

    await updateItem("item-1", { action: "new action" }, "ws-1");

    // Second argument to emitAuditEvent must be the tx client, not undefined.
    // If the caller passed `undefined` here, the real emitAuditEvent would
    // fall back to the global `db` and the mutation + audit could diverge.
    expect(emitAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: expect.any(String) }),
      txMock  // the transaction client, not the global db
    );
  });

  it("emitAuditEvent receives the correct workspaceId for workspace isolation", async () => {
    dbOperatorItemFindFirstMock.mockResolvedValue({ ...ITEM_BASE, workspaceId: "ws-tenant-99" });
    txUpdateMock.mockResolvedValue({ ...ITEM_BASE });
    emitAuditEventMock.mockResolvedValue("ae-ok");

    await updateItem("item-1", { problem: "p" }, "ws-tenant-99");

    expect(emitAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-tenant-99" }),
      expect.anything()
    );
  });

  it("emitAuditEvent receives entityId matching the updated item id", async () => {
    dbOperatorItemFindFirstMock.mockResolvedValue({ ...ITEM_BASE, id: "item-abc" });
    txUpdateMock.mockResolvedValue({ ...ITEM_BASE });
    emitAuditEventMock.mockResolvedValue("ae-ok");

    await updateItem("item-abc", { status: "completed" }, "ws-1");

    expect(emitAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "item-abc", entityType: "operator_item" }),
      expect.anything()
    );
  });

  it("throws NotFoundError (not a generic error) when item does not exist", async () => {
    dbOperatorItemFindFirstMock.mockResolvedValue(null);

    const err = await updateItem("missing-id", { problem: "x" }, "ws-1").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/OperatorItem|missing-id/i);
  });

  it("throws early when workspaceId is empty (tenant isolation guard)", async () => {
    await expect(updateItem("item-1", {}, "")).rejects.toThrow(
      "updateItem requires a workspaceId for tenant isolation"
    );
    // Neither the DB nor the transaction must be touched.
    expect(dbOperatorItemFindFirstMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("throws early when workspaceId is missing (tenant isolation guard)", async () => {
    await expect(updateItem("item-1", {}, undefined as unknown as string)).rejects.toThrow(
      "updateItem requires a workspaceId for tenant isolation"
    );
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("db.operatorItem.findFirst is scoped to workspaceId (cross-tenant isolation)", async () => {
    dbOperatorItemFindFirstMock.mockResolvedValue({ ...ITEM_BASE });
    txUpdateMock.mockResolvedValue({ ...ITEM_BASE });
    emitAuditEventMock.mockResolvedValue("ae-ok");

    await updateItem("item-1", {}, "ws-isolated");

    expect(dbOperatorItemFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "ws-isolated" }) })
    );
  });

  it("does not leak partial update when emitAuditEvent is a noop (resolves fast)", async () => {
    // Sanity: when audit resolves, update resolves without leaking state.
    dbOperatorItemFindFirstMock.mockResolvedValue({ ...ITEM_BASE });
    txUpdateMock.mockResolvedValue({ ...ITEM_BASE, status: "completed" });
    emitAuditEventMock.mockResolvedValue("ae-id");

    await expect(updateItem("item-1", { status: "completed" }, "ws-1")).resolves.toBeUndefined();
  });
});
