import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  executeDecisionAction,
  getAvailableActions,
  validateActionParams,
} from "@/services/decision/transaction-actions";
import { InvalidStateTransitionError } from "@/infra/errors";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

/**
 * Phase 6G — F-G2 regression guard.
 *
 * Proves that executeDecisionAction uses CAS (compare-and-swap) with atomic
 * audit. Before the fix, update({ where: { id } }) had no workspace isolation
 * and logAuditEvent was called post-commit with a swallowed error handler.
 */

// ── Pure unit tests (no DB) ──────────────────────────────────────────────────

describe("getAvailableActions — unit", () => {
  it("pending status returns approve and reject", () => {
    expect(getAvailableActions("pending")).toEqual(
      expect.arrayContaining(["approve", "reject"])
    );
    expect(getAvailableActions("pending")).not.toContain("override");
  });

  it("blocked status returns approve, reject, and override for admin", () => {
    const actions = getAvailableActions("blocked", "admin");
    expect(actions).toContain("approve");
    expect(actions).toContain("reject");
    expect(actions).toContain("override");
  });

  it("blocked status does not return override for non-admin", () => {
    const actions = getAvailableActions("blocked", "consultant");
    expect(actions).not.toContain("override");
  });

  it("terminal status returns no actions", () => {
    expect(getAvailableActions("approved")).toHaveLength(0);
    expect(getAvailableActions("rejected")).toHaveLength(0);
  });
});

describe("validateActionParams — unit", () => {
  it("override requires non-empty overrideReason", () => {
    expect(validateActionParams("override", { overrideReason: "valid reason" })).toBe(true);
    expect(validateActionParams("override", { overrideReason: "" })).toBe(false);
    expect(validateActionParams("override", {})).toBe(false);
  });

  it("approve and reject always return true", () => {
    expect(validateActionParams("approve", {})).toBe(true);
    expect(validateActionParams("reject", {})).toBe(true);
  });
});

// ── DB-backed CAS + audit tests ──────────────────────────────────────────────

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "executeDecisionAction (DB-backed) — CAS and atomic audit (F-G2 regression guard)",
  () => {
    const workspaceId = uuidv4();
    const userId = uuidv4();
    const stamp = uuidv4();
    const createdItemIds: string[] = [];

    async function createPendingDecision(overrides?: Partial<{ status: string }>) {
      const id = uuidv4();
      const item = await db.operatorItem.create({
        data: {
          id,
          workspaceId,
          problem: "Test problem",
          action: "Test action",
          impactExpected: 1.0,
          impactLow: 0.5,
          impactHigh: 1.5,
          confidence: 0.8,
          priorityScore: 0.7,
          status: overrides?.status ?? "pending",
          updatedAt: new Date(),
        },
      });
      createdItemIds.push(id);
      return item;
    }

    beforeAll(async () => {
      await db.user.create({
        data: {
          id: userId,
          email: `6g-fg2-cas-${stamp}@test.local`,
          updatedAt: new Date(),
        },
      });
      await db.workspace.create({
        data: {
          id: workspaceId,
          name: "6G F-G2 CAS WS",
          slug: `6g-fg2-cas-${stamp}`,
        },
      });
    });

    afterAll(async () => {
      try {
        await db.operatorItem.deleteMany({ where: { workspaceId } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup
      }
    });

    it("approve: transitions pending → approved and persists DECISION_APPROVED audit event", async () => {
      const decision = await createPendingDecision();

      const updated = await executeDecisionAction(
        decision.id,
        workspaceId,
        userId,
        "approve"
      );

      expect(updated.status).toBe("approved");

      const auditEvent = await db.auditEvent.findFirst({
        where: {
          workspaceId,
          entityId: decision.id,
          eventName: AUDIT_EVENTS.DECISION_APPROVED,
        },
      });
      expect(auditEvent).not.toBeNull();
      expect(auditEvent?.workspaceId).toBe(workspaceId);
    });

    it("reject: transitions pending → rejected and persists DECISION_REJECTED audit event", async () => {
      const decision = await createPendingDecision();

      const updated = await executeDecisionAction(
        decision.id,
        workspaceId,
        userId,
        "reject"
      );

      expect(updated.status).toBe("rejected");

      const auditEvent = await db.auditEvent.findFirst({
        where: {
          workspaceId,
          entityId: decision.id,
          eventName: AUDIT_EVENTS.DECISION_REJECTED,
        },
      });
      expect(auditEvent).not.toBeNull();
    });

    it("override on blocked: persists DECISION_OVERRIDDEN audit event", async () => {
      const decision = await createPendingDecision({ status: "blocked" });

      const updated = await executeDecisionAction(
        decision.id,
        workspaceId,
        userId,
        "override",
        "critical business need"
      );

      expect(updated.status).toBe("approved");

      const auditEvent = await db.auditEvent.findFirst({
        where: {
          workspaceId,
          entityId: decision.id,
          eventName: AUDIT_EVENTS.DECISION_OVERRIDDEN,
        },
      });
      expect(auditEvent).not.toBeNull();
    });

    it("CAS: throws InvalidStateTransitionError if status is already terminal (approved)", async () => {
      const decision = await createPendingDecision({ status: "approved" });

      await expect(
        executeDecisionAction(decision.id, workspaceId, userId, "approve")
      ).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it("workspace isolation: cannot act on a decision in a different workspace", async () => {
      const decision = await createPendingDecision();
      const foreignWorkspace = uuidv4();

      await expect(
        executeDecisionAction(decision.id, foreignWorkspace, userId, "approve")
      ).rejects.toThrow("Decision not found");
    });
  }
);
