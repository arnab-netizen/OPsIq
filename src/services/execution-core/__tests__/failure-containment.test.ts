import { describe, it, expect } from "vitest";
import { FailureContainment } from "../failure-containment";
import { ContainmentStrategy } from "@/domain/execution/containment";
import { FailureClass } from "@/domain/execution/failure-classification";
import { ActionState } from "@/domain/execution/action";
import { v4 as uuidv4 } from "uuid";

describe("FailureContainment", () => {
  const containment = new FailureContainment();
  const actionId = uuidv4();
  const decisionId = uuidv4();
  const workspaceId = uuidv4();

  describe("containFailure", () => {
    it("should select ISOLATE strategy for RECOVERABLE failure", () => {
      const downstreamActions = [uuidv4(), uuidv4()];
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RECOVERABLE,
        error_message: "Connection timeout",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      expect(result.strategy).toBe(ContainmentStrategy.ISOLATE);
      expect(result.cascade_prevented).toBe(true);
    });

    it("should select ISOLATE strategy for RETRYABLE failure", () => {
      const downstreamActions = [uuidv4()];
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RETRYABLE,
        error_message: "Rate limited",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      expect(result.strategy).toBe(ContainmentStrategy.ISOLATE);
    });

    it("should select ROLLBACK strategy for FATAL failure", () => {
      const downstreamActions = [uuidv4(), uuidv4(), uuidv4()];
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.FATAL,
        error_message: "Permission denied",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      expect(result.strategy).toBe(ContainmentStrategy.ROLLBACK);
      expect(result.affected_actions.length).toBe(3);
    });

    it("should include all downstream actions in affected list", () => {
      const downstreamActions = [uuidv4(), uuidv4(), uuidv4()];
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RECOVERABLE,
        error_message: "Network error",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      expect(result.affected_actions).toEqual(downstreamActions);
    });

    it("should create action impacts for all affected actions", () => {
      const downstreamActions = [uuidv4(), uuidv4()];
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RECOVERABLE,
        error_message: "Timeout",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      expect(result.action_impacts.length).toBe(2);
      expect(result.action_impacts[0].action_id).toBe(downstreamActions[0]);
      expect(result.action_impacts[1].action_id).toBe(downstreamActions[1]);
    });

    it("should always set cascade_prevented to true", () => {
      const strategies = [
        FailureClass.RECOVERABLE,
        FailureClass.RETRYABLE,
        FailureClass.FATAL,
      ];

      for (const failureClass of strategies) {
        const result = containment.containFailure({
          action_id: actionId,
          failure_class: failureClass,
          error_message: "Test error",
          downstream_actions: [uuidv4()],
          decision_id: decisionId,
          workspace_id: workspaceId,
        });

        expect(result.cascade_prevented).toBe(true);
      }
    });

    it("should include containment reason", () => {
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.FATAL,
        error_message: "Access denied",
        downstream_actions: [],
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.reason).toContain("FATAL");
    });

    it("should handle empty downstream actions", () => {
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RECOVERABLE,
        error_message: "Error",
        downstream_actions: [],
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      expect(result.affected_actions).toEqual([]);
      expect(result.action_impacts).toEqual([]);
    });
  });

  describe("selectStrategy", () => {
    it("should return ISOLATE for RECOVERABLE", () => {
      const strategy = containment["selectStrategy"](FailureClass.RECOVERABLE);
      expect(strategy).toBe(ContainmentStrategy.ISOLATE);
    });

    it("should return ISOLATE for RETRYABLE", () => {
      const strategy = containment["selectStrategy"](FailureClass.RETRYABLE);
      expect(strategy).toBe(ContainmentStrategy.ISOLATE);
    });

    it("should return ROLLBACK for FATAL", () => {
      const strategy = containment["selectStrategy"](FailureClass.FATAL);
      expect(strategy).toBe(ContainmentStrategy.ROLLBACK);
    });
  });

  describe("canTransitionForStrategy", () => {
    it("should allow ISOLATE transition from READY to BLOCKED", () => {
      const canTransition = containment.canTransitionForStrategy(
        ContainmentStrategy.ISOLATE,
        ActionState.READY
      );
      expect(canTransition).toBe(true);
    });

    it("should allow ROLLBACK transition from IN_PROGRESS to CANCELLED", () => {
      const canTransition = containment.canTransitionForStrategy(
        ContainmentStrategy.ROLLBACK,
        ActionState.IN_PROGRESS
      );
      expect(canTransition).toBe(true);
    });

    it("should allow ESCALATE transition from any state to BLOCKED", () => {
      const states = [
        ActionState.DRAFT,
        ActionState.READY,
        ActionState.IN_PROGRESS,
      ];
      for (const state of states) {
        const canTransition = containment.canTransitionForStrategy(
          ContainmentStrategy.ESCALATE,
          state
        );
        expect(canTransition).toBe(true);
      }
    });
  });

  describe("getNewStateForStrategy", () => {
    it("should return BLOCKED for ISOLATE from READY", () => {
      const newState = containment.getNewStateForStrategy(
        ContainmentStrategy.ISOLATE,
        ActionState.READY
      );
      expect(newState).toBe(ActionState.BLOCKED);
    });

    it("should return CANCELLED for ROLLBACK from READY", () => {
      const newState = containment.getNewStateForStrategy(
        ContainmentStrategy.ROLLBACK,
        ActionState.READY
      );
      expect(newState).toBe(ActionState.CANCELLED);
    });

    it("should return BLOCKED for ESCALATE from IN_PROGRESS", () => {
      const newState = containment.getNewStateForStrategy(
        ContainmentStrategy.ESCALATE,
        ActionState.IN_PROGRESS
      );
      expect(newState).toBe(ActionState.BLOCKED);
    });

    it("should return DONE unchanged for ISOLATE from DONE", () => {
      const newState = containment.getNewStateForStrategy(
        ContainmentStrategy.ISOLATE,
        ActionState.DONE
      );
      expect(newState).toBe(ActionState.DONE);
    });
  });

  describe("preventsCascade", () => {
    it("should return true for ISOLATE", () => {
      expect(containment.preventsCascade(ContainmentStrategy.ISOLATE)).toBe(
        true
      );
    });

    it("should return true for ROLLBACK", () => {
      expect(containment.preventsCascade(ContainmentStrategy.ROLLBACK)).toBe(
        true
      );
    });

    it("should return true for ESCALATE", () => {
      expect(containment.preventsCascade(ContainmentStrategy.ESCALATE)).toBe(
        true
      );
    });
  });

  describe("getAffectedActionCount", () => {
    it("should return correct count", () => {
      const downstreamActions = [uuidv4(), uuidv4(), uuidv4()];
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RECOVERABLE,
        error_message: "Error",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      const count = containment.getAffectedActionCount(result);
      expect(count).toBe(3);
    });

    it("should return 0 for no affected actions", () => {
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RECOVERABLE,
        error_message: "Error",
        downstream_actions: [],
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      const count = containment.getAffectedActionCount(result);
      expect(count).toBe(0);
    });
  });

  describe("getAffectedActionsForStrategy", () => {
    it("should return all downstream actions for ISOLATE", () => {
      const downstreamActions = [uuidv4(), uuidv4()];
      const affected = containment.getAffectedActionsForStrategy(
        ContainmentStrategy.ISOLATE,
        downstreamActions
      );
      expect(affected).toEqual(downstreamActions);
    });

    it("should return all downstream actions for ROLLBACK", () => {
      const downstreamActions = [uuidv4(), uuidv4(), uuidv4()];
      const affected = containment.getAffectedActionsForStrategy(
        ContainmentStrategy.ROLLBACK,
        downstreamActions
      );
      expect(affected).toEqual(downstreamActions);
    });

    it("should return all downstream actions for ESCALATE", () => {
      const downstreamActions = [uuidv4()];
      const affected = containment.getAffectedActionsForStrategy(
        ContainmentStrategy.ESCALATE,
        downstreamActions
      );
      expect(affected).toEqual(downstreamActions);
    });
  });

  describe("strategy state transitions", () => {
    it("ISOLATE should transition DRAFT to BLOCKED", () => {
      const newState = containment.getNewStateForStrategy(
        ContainmentStrategy.ISOLATE,
        ActionState.DRAFT
      );
      expect(newState).toBe(ActionState.BLOCKED);
    });

    it("ISOLATE should transition IN_PROGRESS to FAILED", () => {
      const newState = containment.getNewStateForStrategy(
        ContainmentStrategy.ISOLATE,
        ActionState.IN_PROGRESS
      );
      expect(newState).toBe(ActionState.FAILED);
    });

    it("ROLLBACK should transition DRAFT to CANCELLED", () => {
      const newState = containment.getNewStateForStrategy(
        ContainmentStrategy.ROLLBACK,
        ActionState.DRAFT
      );
      expect(newState).toBe(ActionState.CANCELLED);
    });

    it("ROLLBACK should transition IN_PROGRESS to CANCELLED", () => {
      const newState = containment.getNewStateForStrategy(
        ContainmentStrategy.ROLLBACK,
        ActionState.IN_PROGRESS
      );
      expect(newState).toBe(ActionState.CANCELLED);
    });

    it("ESCALATE should transition DRAFT to BLOCKED", () => {
      const newState = containment.getNewStateForStrategy(
        ContainmentStrategy.ESCALATE,
        ActionState.DRAFT
      );
      expect(newState).toBe(ActionState.BLOCKED);
    });
  });

  describe("containment result structure", () => {
    it("should have all required fields", () => {
      const downstreamActions = [uuidv4()];
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RECOVERABLE,
        error_message: "Error",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      expect(result.action_id).toBe(actionId);
      expect(result.strategy).toBeDefined();
      expect(result.affected_actions).toBeDefined();
      expect(result.action_impacts).toBeDefined();
      expect(result.containment_success).toBe(true);
      expect(result.cascade_prevented).toBe(true);
      expect(result.reason).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it("should have action impacts with correct structure", () => {
      const downstreamActions = [uuidv4()];
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RECOVERABLE,
        error_message: "Error",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      const impact = result.action_impacts[0];
      expect(impact.action_id).toBeDefined();
      expect(impact.current_state).toBeDefined();
      expect(impact.new_state).toBeDefined();
      expect(impact.reason).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("should handle large number of downstream actions", () => {
      const downstreamActions = Array.from({ length: 100 }, () => uuidv4());
      const result = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.FATAL,
        error_message: "Critical error",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      expect(result.affected_actions.length).toBe(100);
      expect(result.action_impacts.length).toBe(100);
    });

    it("should maintain determinism across multiple calls", () => {
      const downstreamActions = [uuidv4(), uuidv4()];
      const result1 = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RECOVERABLE,
        error_message: "Error",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      const result2 = containment.containFailure({
        action_id: actionId,
        failure_class: FailureClass.RECOVERABLE,
        error_message: "Error",
        downstream_actions: downstreamActions,
        decision_id: decisionId,
        workspace_id: workspaceId,
      });

      expect(result1.strategy).toBe(result2.strategy);
      expect(result1.affected_actions).toEqual(result2.affected_actions);
    });

    it("should handle all action states for transitions", () => {
      const states = [
        ActionState.DRAFT,
        ActionState.READY,
        ActionState.IN_PROGRESS,
        ActionState.DONE,
        ActionState.BLOCKED,
        ActionState.FAILED,
        ActionState.CANCELLED,
      ];

      for (const state of states) {
        const newState = containment.getNewStateForStrategy(
          ContainmentStrategy.ISOLATE,
          state
        );
        expect(newState).toBeDefined();
        expect(newState).not.toBeNull();
      }
    });
  });
});
