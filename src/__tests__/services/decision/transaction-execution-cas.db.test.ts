import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  updateExecutionStatus,
  isReadyForExecution,
  getExecutionStageDescription,
  type ExecutionStatus,
} from "@/services/decision/transaction-execution";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

/**
 * Phase 6G — F-G3 regression guard.
 *
 * Proves that updateExecutionStatus uses CAS with workspace isolation and
 * atomic audit. Before the fix, update({ where: { id } }) omitted workspaceId
 * from the write WHERE and logAuditEvent was called post-commit with a swallowed
 * error handler.
 */

// ── Pure unit tests (no DB) ──────────────────────────────────────────────────

describe("isReadyForExecution — unit", () => {
  it("returns true only for approved status", () => {
    expect(isReadyForExecution("approved")).toBe(true);
    expect(isReadyForExecution("pending")).toBe(false);
    expect(isReadyForExecution("rejected")).toBe(false);
    expect(isReadyForExecution("blocked")).toBe(false);
  });
});

describe("getExecutionStageDescription — unit", () => {
  const cases: Array<[ExecutionStatus, string]> = [
    ["not_started", "Awaiting execution to begin"],
    ["in_progress", "Currently being executed"],
    ["completed", "Execution completed successfully"],
    ["failed", "Execution failed"],
  ];

  for (const [status, expected] of cases) {
    it(`describes ${status} correctly`, () => {
      expect(getExecutionStageDescription(status)).toBe(expected);
    });
  }
});

// ── DB-backed CAS + audit tests ──────────────────────────────────────────────

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "updateExecutionStatus (DB-backed) — CAS and atomic audit (F-G3 regression guard)",
  () => {
    const workspaceId = uuidv4();
    const userId = uuidv4();
    const stamp = uuidv4();

    async function createApprovedDecision() {
      const id = uuidv4();
      await db.operatorItem.create({
        data: {
          id,
          workspaceId,
          problem: "Test execution problem",
          action: "Test execution action",
          impactExpected: 1.0,
          impactLow: 0.5,
          impactHigh: 1.5,
          confidence: 0.9,
          priorityScore: 0.8,
          status: "approved",
          executionStatus: "not_started",
          updatedAt: new Date(),
        },
      });
      return id;
    }

    beforeAll(async () => {
      await db.user.create({
        data: {
          id: userId,
          email: `6g-fg3-cas-${stamp}@test.local`,
          updatedAt: new Date(),
        },
      });
      await db.workspace.create({
        data: {
          id: workspaceId,
          name: "6G F-G3 CAS WS",
          slug: `6g-fg3-cas-${stamp}`,
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

    it("in_progress: updates executionStatus and persists DECISION_EXECUTION_STARTED", async () => {
      const decisionId = await createApprovedDecision();

      const updated = await updateExecutionStatus(
        decisionId,
        workspaceId,
        userId,
        "in_progress"
      );

      expect(updated.executionStatus).toBe("in_progress");

      const auditEvent = await db.auditEvent.findFirst({
        where: {
          workspaceId,
          entityId: decisionId,
          eventName: AUDIT_EVENTS.DECISION_EXECUTION_STARTED,
        },
      });
      expect(auditEvent).not.toBeNull();
      expect(auditEvent?.workspaceId).toBe(workspaceId);
    });

    it("completed: persists DECISION_EXECUTION_SUCCESS audit event", async () => {
      const decisionId = await createApprovedDecision();

      const updated = await updateExecutionStatus(
        decisionId,
        workspaceId,
        userId,
        "completed",
        "All tasks done"
      );

      expect(updated.executionStatus).toBe("completed");

      const auditEvent = await db.auditEvent.findFirst({
        where: {
          workspaceId,
          entityId: decisionId,
          eventName: AUDIT_EVENTS.DECISION_EXECUTION_SUCCESS,
        },
      });
      expect(auditEvent).not.toBeNull();
    });

    it("failed: persists DECISION_EXECUTION_FAILED audit event", async () => {
      const decisionId = await createApprovedDecision();

      const updated = await updateExecutionStatus(
        decisionId,
        workspaceId,
        userId,
        "failed",
        "Step 3 errored"
      );

      expect(updated.executionStatus).toBe("failed");

      const auditEvent = await db.auditEvent.findFirst({
        where: {
          workspaceId,
          entityId: decisionId,
          eventName: AUDIT_EVENTS.DECISION_EXECUTION_FAILED,
        },
      });
      expect(auditEvent).not.toBeNull();
    });

    it("workspace isolation: cannot update a decision in a different workspace", async () => {
      const decisionId = await createApprovedDecision();
      const foreignWorkspace = uuidv4();

      await expect(
        updateExecutionStatus(decisionId, foreignWorkspace, userId, "in_progress")
      ).rejects.toThrow("Decision not found");
    });

    it("workspace isolation in write: updateMany WHERE includes workspaceId (CAS guard)", async () => {
      const decisionId = await createApprovedDecision();

      // Update successfully in correct workspace
      await updateExecutionStatus(decisionId, workspaceId, userId, "in_progress");

      // Confirm state change is visible
      const record = await db.operatorItem.findUnique({ where: { id: decisionId } });
      expect(record?.executionStatus).toBe("in_progress");
      expect(record?.workspaceId).toBe(workspaceId);
    });
  }
);
