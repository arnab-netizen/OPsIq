import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionAuditor } from "../execution-auditor";
import { ExecutionOutcome } from "@/domain/execution/audit";
import { v4 as uuidv4 } from "uuid";

describe("ExecutionAuditor", () => {
  let auditor: ExecutionAuditor;
  const actionId = uuidv4();
  const decisionId = uuidv4();
  const workspaceId = uuidv4();
  const actorId = uuidv4();

  beforeEach(() => {
    auditor = new ExecutionAuditor();
  });

  describe("recordEvent", () => {
    it("should record event with all fields", () => {
      const event = auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: { status: "READY" },
        after_state: { status: "IN_PROGRESS" },
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      expect(event.event_id).toBeDefined();
      expect(event.action_id).toBe(actionId);
      expect(event.decision_id).toBe(decisionId);
      expect(event.workspace_id).toBe(workspaceId);
      expect(event.actor).toBe(actorId);
      expect(event.outcome).toBe(ExecutionOutcome.SUCCESS);
      expect(event.timestamp).toBeDefined();
    });

    it("should include tags if provided", () => {
      const event = auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: { status: "READY" },
        after_state: { status: "FAILED" },
        actor: actorId,
        outcome: ExecutionOutcome.FAILURE,
        tags: ["failure", "timeout"],
      });

      expect(event.tags).toEqual(["failure", "timeout"]);
    });

    it("should include error message if provided", () => {
      const event = auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: { status: "READY" },
        after_state: { status: "FAILED" },
        actor: actorId,
        outcome: ExecutionOutcome.FAILURE,
        error_message: "Connection timeout",
      });

      expect(event.error_message).toBe("Connection timeout");
    });

    it("should generate unique event IDs", () => {
      const event1 = auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      const event2 = auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      expect(event1.event_id).not.toBe(event2.event_id);
    });

    it("should default to empty tags if not provided", () => {
      const event = auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      expect(event.tags).toEqual([]);
    });
  });

  describe("queryEvents", () => {
    beforeEach(() => {
      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: { status: "READY" },
        after_state: { status: "SUCCESS" },
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      auditor.recordEvent({
        action_id: uuidv4(),
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: { status: "READY" },
        after_state: { status: "FAILED" },
        actor: actorId,
        outcome: ExecutionOutcome.FAILURE,
      });
    });

    it("should filter by action_id", () => {
      const result = auditor.queryEvents({
        filters: { action_id: actionId },
      });

      expect(result.returned_count).toBe(1);
      expect(result.events[0].action_id).toBe(actionId);
    });

    it("should filter by decision_id", () => {
      const result = auditor.queryEvents({
        filters: { decision_id: decisionId },
      });

      expect(result.returned_count).toBe(2);
      expect(result.events.every((e) => e.decision_id === decisionId)).toBe(true);
    });

    it("should filter by workspace_id", () => {
      const result = auditor.queryEvents({
        filters: { workspace_id: workspaceId },
      });

      expect(result.returned_count).toBe(2);
    });

    it("should filter by outcome", () => {
      const result = auditor.queryEvents({
        filters: { outcome: ExecutionOutcome.SUCCESS },
      });

      expect(result.returned_count).toBe(1);
      expect(result.events[0].outcome).toBe(ExecutionOutcome.SUCCESS);
    });

    it("should filter by actor", () => {
      const result = auditor.queryEvents({
        filters: { actor: actorId },
      });

      expect(result.returned_count).toBe(2);
    });

    it("should filter by tags (all tags must match)", () => {
      auditor.recordEvent({
        action_id: uuidv4(),
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
        tags: ["manual", "override"],
      });

      const result = auditor.queryEvents({
        filters: { tags: ["manual", "override"] },
      });

      expect(result.returned_count).toBe(1);
    });

    it("should support pagination with limit and offset", () => {
      const result1 = auditor.queryEvents({
        filters: { decision_id: decisionId },
        limit: 1,
        offset: 0,
      });

      expect(result1.returned_count).toBe(1);
      expect(result1.total_count).toBe(2);

      const result2 = auditor.queryEvents({
        filters: { decision_id: decisionId },
        limit: 1,
        offset: 1,
      });

      expect(result2.returned_count).toBe(1);
      expect(result1.events[0].event_id).not.toBe(result2.events[0].event_id);
    });

    it("should return empty for non-matching filters", () => {
      const result = auditor.queryEvents({
        filters: { action_id: uuidv4() },
      });

      expect(result.returned_count).toBe(0);
      expect(result.total_count).toBe(0);
    });

    it("should sort by timestamp descending (most recent first)", () => {
      const result = auditor.queryEvents({
        filters: { decision_id: decisionId },
      });

      expect(result.events[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        result.events[1].timestamp.getTime()
      );
    });
  });

  describe("getActionEvents", () => {
    it("should return all events for action", () => {
      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      auditor.recordEvent({
        action_id: actionId,
        decision_id: uuidv4(),
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.FAILURE,
      });

      const events = auditor.getActionEvents(actionId);
      expect(events.length).toBe(2);
    });

    it("should filter by workspace if provided", () => {
      const workspace2 = uuidv4();

      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspace2,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.FAILURE,
      });

      const events = auditor.getActionEvents(actionId, workspaceId);
      expect(events.length).toBe(1);
      expect(events[0].workspace_id).toBe(workspaceId);
    });
  });

  describe("getDecisionEvents", () => {
    it("should return all events for decision", () => {
      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      auditor.recordEvent({
        action_id: uuidv4(),
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.FAILURE,
      });

      const events = auditor.getDecisionEvents(decisionId);
      expect(events.length).toBe(2);
    });
  });

  describe("getWorkspaceEvents", () => {
    it("should return events for workspace", () => {
      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      const events = auditor.getWorkspaceEvents(workspaceId);
      expect(events.length).toBe(1);
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        auditor.recordEvent({
          action_id: uuidv4(),
          decision_id: decisionId,
          workspace_id: workspaceId,
          before_state: {},
          after_state: {},
          actor: actorId,
          outcome: ExecutionOutcome.SUCCESS,
        });
      }

      const events = auditor.getWorkspaceEvents(workspaceId, 3);
      expect(events.length).toBe(3);
    });
  });

  describe("getEventById", () => {
    it("should retrieve event by ID", () => {
      const recorded = auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      const retrieved = auditor.getEventById(recorded.event_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.event_id).toBe(recorded.event_id);
    });

    it("should return null for non-existent event", () => {
      const retrieved = auditor.getEventById(uuidv4());
      expect(retrieved).toBeNull();
    });
  });

  describe("searchByErrorMessage", () => {
    beforeEach(() => {
      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.FAILURE,
        error_message: "Connection timeout occurred",
      });

      auditor.recordEvent({
        action_id: uuidv4(),
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.FAILURE,
        error_message: "Database lock detected",
      });
    });

    it("should find events by error message", () => {
      const results = auditor.searchByErrorMessage(workspaceId, "timeout");
      expect(results.length).toBe(1);
      expect(results[0].error_message).toContain("timeout");
    });

    it("should be case-insensitive", () => {
      const results = auditor.searchByErrorMessage(workspaceId, "TIMEOUT");
      expect(results.length).toBe(1);
    });

    it("should return empty for non-matching search", () => {
      const results = auditor.searchByErrorMessage(workspaceId, "network");
      expect(results.length).toBe(0);
    });
  });

  describe("getEventCount", () => {
    it("should return correct event count", () => {
      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      const count = auditor.getEventCount(workspaceId);
      expect(count).toBe(1);
    });

    it("should return 0 for workspace with no events", () => {
      const count = auditor.getEventCount(uuidv4());
      expect(count).toBe(0);
    });
  });

  describe("getOutcomeSummary", () => {
    beforeEach(() => {
      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      auditor.recordEvent({
        action_id: uuidv4(),
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      auditor.recordEvent({
        action_id: uuidv4(),
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.FAILURE,
      });

      auditor.recordEvent({
        action_id: uuidv4(),
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.CANCELLED,
      });
    });

    it("should return correct outcome counts", () => {
      const summary = auditor.getOutcomeSummary(workspaceId);
      expect(summary[ExecutionOutcome.SUCCESS]).toBe(2);
      expect(summary[ExecutionOutcome.FAILURE]).toBe(1);
      expect(summary[ExecutionOutcome.CANCELLED]).toBe(1);
    });
  });

  describe("immutability", () => {
    it("should deep copy before_state and after_state", () => {
      const beforeState = { status: "READY", count: 5 };
      const afterState = { status: "SUCCESS", count: 6 };

      const event = auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: beforeState,
        after_state: afterState,
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      // Modify original objects
      beforeState.count = 999;
      afterState.count = 999;

      // Event should not be affected
      expect(event.before_state.count).toBe(5);
      expect(event.after_state.count).toBe(6);
    });

    it("should return true for verifyEventImmutability", () => {
      const event = auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      expect(auditor.verifyEventImmutability(event.event_id)).toBe(true);
    });
  });

  describe("time-based filtering", () => {
    it("should filter by start_time", () => {
      const now = new Date();
      const futureTime = new Date(now.getTime() + 10000);

      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      const result = auditor.queryEvents({
        filters: { workspace_id: workspaceId, start_time: futureTime },
      });

      expect(result.returned_count).toBe(0);
    });

    it("should filter by end_time", () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 10000);

      auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: {},
        after_state: {},
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      const result = auditor.queryEvents({
        filters: { workspace_id: workspaceId, end_time: pastTime },
      });

      expect(result.returned_count).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle events with no tags and no error_message", () => {
      const event = auditor.recordEvent({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        before_state: { nested: { deep: { value: 42 } } },
        after_state: { nested: { deep: { value: 43 } } },
        actor: actorId,
        outcome: ExecutionOutcome.SUCCESS,
      });

      expect(event.tags).toEqual([]);
      expect(event.error_message).toBeUndefined();
    });

    it("should handle large number of events", () => {
      for (let i = 0; i < 1000; i++) {
        auditor.recordEvent({
          action_id: uuidv4(),
          decision_id: decisionId,
          workspace_id: workspaceId,
          before_state: {},
          after_state: {},
          actor: actorId,
          outcome: ExecutionOutcome.SUCCESS,
        });
      }

      const count = auditor.getEventCount(workspaceId);
      expect(count).toBe(1000);

      const result = auditor.queryEvents({
        filters: { workspace_id: workspaceId },
        limit: 100,
      });

      expect(result.total_count).toBe(1000);
      expect(result.returned_count).toBe(100);
    });

    it("should handle all outcome types", () => {
      const outcomes = [ExecutionOutcome.SUCCESS, ExecutionOutcome.FAILURE, ExecutionOutcome.CANCELLED];

      for (const outcome of outcomes) {
        const event = auditor.recordEvent({
          action_id: uuidv4(),
          decision_id: decisionId,
          workspace_id: workspaceId,
          before_state: {},
          after_state: {},
          actor: actorId,
          outcome,
        });

        expect(event.outcome).toBe(outcome);
      }

      const summary = auditor.getOutcomeSummary(workspaceId);
      expect(summary[ExecutionOutcome.SUCCESS]).toBe(1);
      expect(summary[ExecutionOutcome.FAILURE]).toBe(1);
      expect(summary[ExecutionOutcome.CANCELLED]).toBe(1);
    });
  });
});
