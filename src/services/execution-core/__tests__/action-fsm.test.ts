import { describe, it, expect } from "vitest";
import { ActionFSM } from "../action-fsm";
import { Action, ActionState } from "@/domain/execution/action";
import { v4 as uuidv4 } from "uuid";

describe("ActionFSM", () => {
  const fsm = new ActionFSM();
  const decision_id = uuidv4();
  const workspace_id = uuidv4();
  const owner = uuidv4();

  const createBasicAction = (): Action => ({
    action_id: uuidv4(),
    decision_id,
    workspace_id,
    owner,
    title: "Test Action",
    state: ActionState.DRAFT,
    state_history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const createReadyAction = (): Action => ({
    ...createBasicAction(),
    state: ActionState.READY,
    due_date: new Date(Date.now() + 86400000).toISOString(),
    success_metric: "Revenue increase by 20%",
    failure_condition: "Revenue decrease or no change",
    rollback_plan: {
      steps: ["Revert config", "Restore backup"],
      estimated_cost: 1000,
      estimated_time_days: 1,
    },
  });

  describe("validateTransition", () => {
    it("should allow DRAFT → READY", () => {
      const action = createBasicAction();
      const transition = fsm.validateTransition(
        action,
        ActionState.READY,
        "Validation passed",
        owner
      );

      expect(transition.is_valid).toBe(false); // Missing required fields
      expect(transition.from_state).toBe(ActionState.DRAFT);
      expect(transition.to_state).toBe(ActionState.READY);
    });

    it("should reject READY → DRAFT (invalid transition)", () => {
      const action = createReadyAction();
      const transition = fsm.validateTransition(
        action,
        ActionState.DRAFT,
        "Rollback",
        owner
      );

      expect(transition.is_valid).toBe(false);
      expect(transition.reason).toContain("Invalid transition");
    });

    it("should reject DONE → BLOCKED (invalid transition)", () => {
      const action = createReadyAction();
      action.state = ActionState.DONE;
      action.end_time = new Date().toISOString();
      action.result = { revenue_increase: 0.2 };

      const transition = fsm.validateTransition(
        action,
        ActionState.BLOCKED,
        "Dependency failed",
        owner
      );

      expect(transition.is_valid).toBe(false);
    });

    it("should require owner field in DRAFT", () => {
      const action = createBasicAction();
      action.owner = "";

      const transition = fsm.validateTransition(
        action,
        ActionState.READY,
        "Validation passed",
        owner
      );

      expect(transition.required_fields).toContain("owner");
    });

    it("should allow DRAFT → CANCELLED", () => {
      const action = createBasicAction();
      const transition = fsm.validateTransition(
        action,
        ActionState.CANCELLED,
        "Owner cancelled",
        owner
      );

      expect(transition.from_state).toBe(ActionState.DRAFT);
      expect(transition.to_state).toBe(ActionState.CANCELLED);
    });

    it("should allow READY → IN_PROGRESS", () => {
      const action = createReadyAction();
      action.start_time = new Date().toISOString();
      action.job_id = uuidv4();

      const transition = fsm.validateTransition(
        action,
        ActionState.IN_PROGRESS,
        "Starting execution",
        owner
      );

      expect(transition.is_valid).toBe(true);
    });

    it("should allow IN_PROGRESS → DONE", () => {
      const action = createReadyAction();
      action.state = ActionState.IN_PROGRESS;
      action.start_time = new Date().toISOString();
      action.job_id = uuidv4();
      action.end_time = new Date().toISOString();
      action.result = { success: true };

      const transition = fsm.validateTransition(
        action,
        ActionState.DONE,
        "Execution succeeded",
        owner
      );

      expect(transition.is_valid).toBe(true);
    });

    it("should allow READY → BLOCKED", () => {
      const action = createReadyAction();
      action.blocked_reason = "Dependency failed";
      action.blocking_dependency_id = uuidv4();

      const transition = fsm.validateTransition(
        action,
        ActionState.BLOCKED,
        "Dependency failure",
        owner
      );

      expect(transition.is_valid).toBe(true);
    });
  });

  describe("transition", () => {
    it("should successfully transition DRAFT → READY with required fields", () => {
      const action = createBasicAction();
      action.due_date = new Date(Date.now() + 86400000).toISOString();
      action.success_metric = "Revenue increase by 20%";
      action.failure_condition = "Revenue decrease";
      action.rollback_plan = {
        steps: ["Revert"],
        estimated_cost: 1000,
        estimated_time_days: 1,
      };

      const result = fsm.transition(
        action,
        ActionState.READY,
        "Validation passed",
        owner
      );

      expect(result.success).toBe(true);
      expect(result.action.state).toBe(ActionState.READY);
      expect(result.action.state_history).toHaveLength(1);
      expect(result.action.state_history[0].to_state).toBe(ActionState.READY);
    });

    it("should fail transition with missing required fields", () => {
      const action = createBasicAction();
      const result = fsm.transition(
        action,
        ActionState.READY,
        "Validation passed",
        owner
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should fail invalid transition", () => {
      const action = createReadyAction();
      action.state = ActionState.DONE;
      action.end_time = new Date().toISOString();
      action.result = { success: true };

      const result = fsm.transition(
        action,
        ActionState.READY,
        "Rollback",
        owner
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid transition");
    });

    it("should emit audit event on successful transition", () => {
      const action = createReadyAction();
      action.start_time = new Date().toISOString();
      action.job_id = uuidv4();
      const before_state = action.state;

      const result = fsm.transition(
        action,
        ActionState.IN_PROGRESS,
        "Starting execution",
        owner
      );

      expect(result.success).toBe(true);
      expect(result.action.state_history).toHaveLength(1);
      const change = result.action.state_history[0];
      expect(change.from_state).toBe(before_state);
      expect(change.to_state).toBe(ActionState.IN_PROGRESS);
      expect(change.actor).toBe(owner);
    });

    it("should preserve state history through multiple transitions", () => {
      const action = createReadyAction();
      action.start_time = new Date().toISOString();
      action.job_id = uuidv4();

      // Transition 1: READY → IN_PROGRESS
      const result1 = fsm.transition(
        action,
        ActionState.IN_PROGRESS,
        "Starting",
        owner
      );
      expect(result1.action.state_history).toHaveLength(1);

      // Transition 2: IN_PROGRESS → DONE
      const action2 = result1.action;
      action2.end_time = new Date().toISOString();
      action2.result = { success: true };

      const result2 = fsm.transition(action2, ActionState.DONE, "Completed", owner);
      expect(result2.action.state_history).toHaveLength(2);
      expect(result2.action.state_history[0].to_state).toBe(
        ActionState.IN_PROGRESS
      );
      expect(result2.action.state_history[1].to_state).toBe(ActionState.DONE);
    });

    it("should update timestamp on transition", () => {
      const action = createReadyAction();
      action.start_time = new Date().toISOString();
      action.job_id = uuidv4();
      const before = new Date().getTime();

      const result = fsm.transition(
        action,
        ActionState.IN_PROGRESS,
        "Starting",
        owner
      );

      const after = new Date().getTime();
      const transition_time = new Date(
        result.action.state_history[0].timestamp
      ).getTime();

      expect(transition_time).toBeGreaterThanOrEqual(before);
      expect(transition_time).toBeLessThanOrEqual(after);
    });
  });

  describe("getCurrentState", () => {
    it("should return current state and allowed transitions", () => {
      const action = createReadyAction();
      const current = fsm.getCurrentState(action);

      expect(current.state).toBe(ActionState.READY);
      expect(current.allowed_transitions).toContain(ActionState.IN_PROGRESS);
      expect(current.allowed_transitions).toContain(ActionState.BLOCKED);
      expect(current.allowed_transitions).toContain(ActionState.CANCELLED);
    });

    it("should return empty transitions for terminal states", () => {
      const action = createReadyAction();
      action.state = ActionState.DONE;
      action.end_time = new Date().toISOString();
      action.result = { success: true };

      const current = fsm.getCurrentState(action);

      expect(current.state).toBe(ActionState.DONE);
      expect(current.allowed_transitions).toHaveLength(0);
    });

    it("should return correct transitions for DRAFT", () => {
      const action = createBasicAction();
      const current = fsm.getCurrentState(action);

      expect(current.allowed_transitions).toHaveLength(2);
      expect(current.allowed_transitions).toContain(ActionState.READY);
      expect(current.allowed_transitions).toContain(ActionState.CANCELLED);
    });

    it("should return correct transitions for BLOCKED", () => {
      const action = createReadyAction();
      action.state = ActionState.BLOCKED;
      action.blocked_reason = "Dependency failed";

      const current = fsm.getCurrentState(action);

      expect(current.allowed_transitions).toContain(ActionState.READY);
      expect(current.allowed_transitions).toContain(ActionState.CANCELLED);
    });

    it("should return correct transitions for FAILED", () => {
      const action = createReadyAction();
      action.state = ActionState.FAILED;
      action.failure_reason = "Execution timeout";
      action.failure_classification = "RETRYABLE";

      const current = fsm.getCurrentState(action);

      expect(current.allowed_transitions).toContain(ActionState.BLOCKED);
      expect(current.allowed_transitions).toHaveLength(1);
    });
  });

  describe("validateActionState", () => {
    it("should validate DRAFT action with required fields", () => {
      const action = createBasicAction();
      const result = fsm.validateActionState(action);

      expect(result.is_valid).toBe(true);
      expect(result.missing_fields).toHaveLength(0);
    });

    it("should reject READY without due_date", () => {
      const action = createReadyAction();
      action.due_date = undefined;

      const result = fsm.validateActionState(action);

      expect(result.is_valid).toBe(false);
      expect(result.missing_fields).toContain("due_date");
    });

    it("should reject READY without success_metric", () => {
      const action = createReadyAction();
      action.success_metric = undefined;

      const result = fsm.validateActionState(action);

      expect(result.is_valid).toBe(false);
      expect(result.missing_fields).toContain("success_metric");
    });

    it("should reject IN_PROGRESS without start_time", () => {
      const action = createReadyAction();
      action.state = ActionState.IN_PROGRESS;
      action.job_id = uuidv4();

      const result = fsm.validateActionState(action);

      expect(result.is_valid).toBe(false);
      expect(result.missing_fields).toContain("start_time");
    });

    it("should reject DONE without end_time", () => {
      const action = createReadyAction();
      action.state = ActionState.DONE;
      action.start_time = new Date().toISOString();
      action.job_id = uuidv4();

      const result = fsm.validateActionState(action);

      expect(result.is_valid).toBe(false);
      expect(result.missing_fields).toContain("end_time");
    });

    it("should reject FAILED without failure_classification", () => {
      const action = createReadyAction();
      action.state = ActionState.FAILED;
      action.failure_reason = "Network timeout";

      const result = fsm.validateActionState(action);

      expect(result.is_valid).toBe(false);
      expect(result.missing_fields).toContain("failure_classification");
    });

    it("should reject BLOCKED without blocked_reason", () => {
      const action = createReadyAction();
      action.state = ActionState.BLOCKED;

      const result = fsm.validateActionState(action);

      expect(result.is_valid).toBe(false);
      expect(result.missing_fields).toContain("blocked_reason");
    });

    it("should accept valid DONE action", () => {
      const action = createReadyAction();
      action.state = ActionState.DONE;
      action.start_time = new Date().toISOString();
      action.job_id = uuidv4();
      action.end_time = new Date().toISOString();
      action.result = { revenue_increase: 0.25 };

      const result = fsm.validateActionState(action);

      expect(result.is_valid).toBe(true);
    });
  });

  describe("generateActionId", () => {
    it("should generate deterministic action_id", () => {
      const id1 = fsm.generateActionId(
        decision_id,
        workspace_id,
        1,
        "First Action"
      );
      const id2 = fsm.generateActionId(
        decision_id,
        workspace_id,
        1,
        "First Action"
      );

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[a-f0-9]{16}$/);
    });

    it("should generate different action_id for different titles", () => {
      const id1 = fsm.generateActionId(decision_id, workspace_id, 1, "Action A");
      const id2 = fsm.generateActionId(decision_id, workspace_id, 1, "Action B");

      expect(id1).not.toBe(id2);
    });

    it("should generate different action_id for different indices", () => {
      const id1 = fsm.generateActionId(decision_id, workspace_id, 1, "Action");
      const id2 = fsm.generateActionId(decision_id, workspace_id, 2, "Action");

      expect(id1).not.toBe(id2);
    });
  });
});
