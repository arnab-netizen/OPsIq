/**
 * Bundle 3.6 — OwnerActionAssignment lifecycle (PostgreSQL-backed).
 *
 * Proves:
 *  - assignAction: idempotent create, ASSIGNED state, persisted to DB
 *  - reassignAction: change assignee, reason recorded
 *  - recordOutcome COMPLETED: terminal state persisted
 *  - recordOutcome FAILED: terminal state, fire-and-forget signal does not throw
 *  - evaluateStallDetection: marks STALLED on overdue ASSIGNED items, idempotent
 *  - workspace isolation: cross-workspace assignments not accessible
 *  - invalid status/priority rejected with ValidationError
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/bundle-3.6-assignment.db.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  assignAction,
  reassignAction,
  recordOutcome,
  evaluateStallDetection,
  getAssignment,
  listAssignments,
} from "@/services/owner-mode/owner-action-assignment-lifecycle.service";
import { ValidationError, NotFoundError } from "@/infra/errors";

const actor = randomUUID();
const workspaceId = randomUUID();
const businessId = randomUUID();
const otherWorkspace = randomUUID();

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Bundle 3.6 — OwnerActionAssignment lifecycle (ephemeral PostgreSQL)",
  () => {
    beforeAll(async () => {
      await db.user.upsert({
        where: { id: actor },
        update: {},
        create: {
          id: actor,
          email: `assignment-test-${actor}@test.local`,
          name: "AssignmentTestActor",
          isActive: true,
          updatedAt: new Date(),
        },
      });
    });

    afterAll(async () => {
      await db.ownerActionAssignment.deleteMany({ where: { workspaceId } });
      await db.ownerActionAssignment.deleteMany({ where: { workspaceId: otherWorkspace } });
      await db.auditEvent.deleteMany({ where: { actorId: actor } });
      await db.user.delete({ where: { id: actor } });
    });

    it("assignAction: persists assignment in ASSIGNED state", async () => {
      const result = await assignAction({
        workspaceId,
        actorId: actor,
        idempotencyKey: "assign-test-001",
        businessId,
        actionId: "action-reduce-overheads",
        actionDomain: "cost_management",
        assignedTo: "operations-lead",
        priority: "HIGH",
      });

      expect(result.id).toBeTruthy();
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.status).toBe("ASSIGNED");
      expect(result.assignedTo).toBe("operations-lead");
      expect(result.priority).toBe("HIGH");
      expect(result.stallDetected).toBe(false);
    });

    it("assignAction: idempotent — same key returns same record", async () => {
      const first = await assignAction({
        workspaceId,
        actorId: actor,
        idempotencyKey: "assign-idempotency-001",
        businessId,
        actionId: "action-marketing-spend-cut",
        actionDomain: "marketing",
        assignedTo: "owner",
        priority: "MEDIUM",
      });
      const second = await assignAction({
        workspaceId,
        actorId: actor,
        idempotencyKey: "assign-idempotency-001",
        businessId,
        actionId: "different-action-should-not-overwrite",
        actionDomain: "other",
        assignedTo: "someone-else",
      });
      expect(second.id).toBe(first.id);
      expect(second.actionId).toBe("action-marketing-spend-cut");
    });

    it("assignAction: rejects invalid priority with ValidationError", async () => {
      await expect(
        assignAction({
          workspaceId,
          actorId: actor,
          idempotencyKey: "assign-bad-priority-001",
          businessId,
          actionId: "some-action",
          actionDomain: "ops",
          assignedTo: "owner",
          priority: "URGENT",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("reassignAction: changes assignee and persists reassign reason", async () => {
      const assignment = await assignAction({
        workspaceId,
        actorId: actor,
        idempotencyKey: "assign-reassign-001",
        businessId,
        actionId: "action-process-review",
        actionDomain: "operations",
        assignedTo: "manager",
        priority: "MEDIUM",
      });

      const reassigned = await reassignAction({
        workspaceId,
        actorId: actor,
        assignmentId: assignment.id,
        assignedTo: "deputy-manager",
        reason: "Manager on leave",
      });

      expect(reassigned.assignedTo).toBe("deputy-manager");
      expect(reassigned.reassignReason).toBe("Manager on leave");
      expect(reassigned.status).toBe("ASSIGNED");
    });

    it("reassignAction: rejected if assignment is not in ASSIGNED state", async () => {
      const assignment = await assignAction({
        workspaceId,
        actorId: actor,
        idempotencyKey: "assign-completed-reassign-001",
        businessId,
        actionId: "action-already-done",
        actionDomain: "operations",
        assignedTo: "owner",
        priority: "LOW",
      });
      await recordOutcome({
        workspaceId,
        actorId: actor,
        assignmentId: assignment.id,
        outcome: "COMPLETED",
        outcomeNote: "Done",
      });

      await expect(
        reassignAction({
          workspaceId,
          actorId: actor,
          assignmentId: assignment.id,
          assignedTo: "someone-else",
          reason: "Should not work",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("recordOutcome COMPLETED: terminal state persisted", async () => {
      const assignment = await assignAction({
        workspaceId,
        actorId: actor,
        idempotencyKey: "assign-outcome-completed-001",
        businessId,
        actionId: "action-revenue-analysis",
        actionDomain: "finance",
        assignedTo: "finance-team",
        priority: "HIGH",
      });

      const result = await recordOutcome({
        workspaceId,
        actorId: actor,
        assignmentId: assignment.id,
        outcome: "COMPLETED",
        outcomeNote: "Revenue analysis delivered — 12% uplift identified",
      });

      expect(result.status).toBe("COMPLETED");
      expect(result.outcomeNote).toBe(
        "Revenue analysis delivered — 12% uplift identified"
      );
    });

    it("recordOutcome FAILED: terminal state, business re-evaluation signal fired without throwing", async () => {
      const assignment = await assignAction({
        workspaceId,
        actorId: actor,
        idempotencyKey: "assign-outcome-failed-001",
        businessId,
        actionId: "action-cost-cut",
        actionDomain: "cost_management",
        assignedTo: "cfo",
        priority: "CRITICAL",
      });

      // FAILED fires fire-and-forget signal — must not throw
      await expect(
        recordOutcome({
          workspaceId,
          actorId: actor,
          assignmentId: assignment.id,
          outcome: "FAILED",
          outcomeNote: "Cost structure too rigid to cut within timeline",
        })
      ).resolves.toMatchObject({ status: "FAILED" });
    });

    it("recordOutcome: rejects invalid outcome status", async () => {
      const assignment = await assignAction({
        workspaceId,
        actorId: actor,
        idempotencyKey: "assign-bad-outcome-001",
        businessId,
        actionId: "action-x",
        actionDomain: "ops",
        assignedTo: "owner",
      });

      await expect(
        recordOutcome({
          workspaceId,
          actorId: actor,
          assignmentId: assignment.id,
          outcome: "PARTIAL",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("evaluateStallDetection: marks STALLED on overdue ASSIGNED items", async () => {
      const dueInPast = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const assignment = await assignAction({
        workspaceId,
        actorId: actor,
        idempotencyKey: "assign-stall-001",
        businessId,
        actionId: "action-overdue",
        actionDomain: "delivery",
        assignedTo: "logistics",
        priority: "HIGH",
        dueAt: dueInPast.toISOString(),
      });

      const result = await evaluateStallDetection({ workspaceId, actorId: actor });

      expect(result.stalled).toContain(assignment.id);

      const refreshed = await getAssignment({ workspaceId, assignmentId: assignment.id });
      expect(refreshed.status).toBe("STALLED");
      expect(refreshed.stallDetected).toBe(true);
    });

    it("evaluateStallDetection: idempotent — second run does not re-flag already STALLED", async () => {
      const result1 = await evaluateStallDetection({ workspaceId, actorId: actor });
      const result2 = await evaluateStallDetection({ workspaceId, actorId: actor });
      for (const id of result1.stalled) {
        expect(result2.stalled).not.toContain(id);
      }
    });

    it("listAssignments: workspace-scoped — cross-workspace items not visible", async () => {
      await db.ownerActionAssignment.create({
        data: {
          workspaceId: otherWorkspace,
          businessId,
          idempotencyKey: "assign-isolation-001",
          actionId: "cross-ws-action",
          actionDomain: "ops",
          assignedTo: "someone",
          assignedById: actor,
          priority: "LOW",
          status: "ASSIGNED",
          createdBy: actor,
        },
      });

      const list = await listAssignments({ workspaceId });
      for (const a of list) expect(a.workspaceId).toBe(workspaceId);

      const otherList = await listAssignments({ workspaceId: otherWorkspace });
      const ids = list.map((a) => a.id);
      for (const a of otherList) expect(ids).not.toContain(a.id);
    });

    it("getAssignment: cross-workspace access throws NotFoundError", async () => {
      const assignment = await assignAction({
        workspaceId,
        actorId: actor,
        idempotencyKey: "assign-guard-001",
        businessId,
        actionId: "action-guard",
        actionDomain: "security",
        assignedTo: "owner",
      });

      await expect(
        getAssignment({ workspaceId: otherWorkspace, assignmentId: assignment.id })
      ).rejects.toThrow(NotFoundError);
    });

    it("audit events emitted: assign, reassign, outcome, stall", async () => {
      const auditEvents = await db.auditEvent.findMany({
        where: {
          actorId: actor,
          workspaceId,
          eventName: {
            in: [
              "owner.action_assigned",
              "owner.action_reassigned",
              "owner.action_outcome_closed",
              "owner.action_stall_detected",
            ],
          },
        },
      });
      const names = auditEvents.map((e) => e.eventName);
      expect(names).toContain("owner.action_assigned");
      expect(names).toContain("owner.action_reassigned");
      expect(names).toContain("owner.action_outcome_closed");
      expect(names).toContain("owner.action_stall_detected");
    });
  }
);
