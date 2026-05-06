import { describe, it, expect } from "vitest";
import { RollbackValidator } from "../rollback-validator";
import { RollbackFeasibility } from "@/domain/execution/rollback";
import { ActionState } from "@/domain/execution/action";
import { v4 as uuidv4 } from "uuid";

describe("RollbackValidator", () => {
  const validator = new RollbackValidator();
  const actionId = uuidv4();

  describe("validateRollback", () => {
    it("should allow rollback for READY action with no downstream issues", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo database changes" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
      });

      expect(result.can_rollback).toBe(true);
      expect(result.rollback_feasibility).toBe(RollbackFeasibility.SAFE);
      expect(result.reasons.length).toBe(0);
    });

    it("should block rollback for DONE action", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.DONE,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
      });

      expect(result.can_rollback).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons[0]).toContain("terminal state");
    });

    it("should block rollback for CANCELLED action", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.CANCELLED,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
      });

      expect(result.can_rollback).toBe(false);
    });

    it("should block rollback when downstream actions already started", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [
          { action_id: uuidv4(), state: ActionState.IN_PROGRESS },
        ],
      });

      expect(result.can_rollback).toBe(false);
      expect(result.reasons.some((r) => r.includes("already started"))).toBe(true);
    });

    it("should block rollback when cost exceeds investment", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 6000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
      });

      expect(result.can_rollback).toBe(false);
      expect(result.reasons.some((r) => r.includes("exceeds"))).toBe(true);
    });

    it("should block rollback when owner declined", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
        owner_declined: true,
      });

      expect(result.can_rollback).toBe(false);
      expect(result.reasons.some((r) => r.includes("declined"))).toBe(true);
    });

    it("should set SAFE feasibility for low cost", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
      });

      expect(result.rollback_feasibility).toBe(RollbackFeasibility.SAFE);
    });

    it("should set RISKY feasibility for high cost", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 4000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
      });

      expect(result.rollback_feasibility).toBe(RollbackFeasibility.RISKY);
    });

    it("should set IMPOSSIBLE feasibility for blocked rollback", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.DONE,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
      });

      expect(result.rollback_feasibility).toBe(RollbackFeasibility.IMPOSSIBLE);
    });

    it("should include all validation failures", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.IN_PROGRESS,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 6000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [
          { action_id: uuidv4(), state: ActionState.DONE },
        ],
        owner_declined: true,
      });

      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
      expect(result.can_rollback).toBe(false);
    });

    it("should include recommendation in result", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
      });

      expect(result.recommendation.length).toBeGreaterThan(0);
    });
  });

  describe("canStateBeRolledBack", () => {
    it("should allow rollback for DRAFT", () => {
      expect(validator.canStateBeRolledBack(ActionState.DRAFT)).toBe(true);
    });

    it("should allow rollback for READY", () => {
      expect(validator.canStateBeRolledBack(ActionState.READY)).toBe(true);
    });

    it("should allow rollback for BLOCKED", () => {
      expect(validator.canStateBeRolledBack(ActionState.BLOCKED)).toBe(true);
    });

    it("should allow rollback for FAILED", () => {
      expect(validator.canStateBeRolledBack(ActionState.FAILED)).toBe(true);
    });

    it("should not allow rollback for DONE", () => {
      expect(validator.canStateBeRolledBack(ActionState.DONE)).toBe(false);
    });

    it("should not allow rollback for CANCELLED", () => {
      expect(validator.canStateBeRolledBack(ActionState.CANCELLED)).toBe(false);
    });

    it("should not allow rollback for IN_PROGRESS", () => {
      expect(validator.canStateBeRolledBack(ActionState.IN_PROGRESS)).toBe(false);
    });
  });

  describe("areDownstreamActionsBlocking", () => {
    it("should not block if no downstream actions", () => {
      const blocking = validator.areDownstreamActionsBlocking([]);
      expect(blocking).toBe(false);
    });

    it("should not block if downstream actions are READY", () => {
      const blocking = validator.areDownstreamActionsBlocking([
        { action_id: uuidv4(), state: ActionState.READY },
        { action_id: uuidv4(), state: ActionState.DRAFT },
      ]);
      expect(blocking).toBe(false);
    });

    it("should block if downstream action is IN_PROGRESS", () => {
      const blocking = validator.areDownstreamActionsBlocking([
        { action_id: uuidv4(), state: ActionState.IN_PROGRESS },
      ]);
      expect(blocking).toBe(true);
    });

    it("should block if downstream action is DONE", () => {
      const blocking = validator.areDownstreamActionsBlocking([
        { action_id: uuidv4(), state: ActionState.DONE },
      ]);
      expect(blocking).toBe(true);
    });
  });

  describe("getBlockingDownstreamActions", () => {
    it("should return only blocking actions", () => {
      const blocking = validator.getBlockingDownstreamActions([
        { action_id: uuidv4(), state: ActionState.READY },
        { action_id: uuidv4(), state: ActionState.IN_PROGRESS },
        { action_id: uuidv4(), state: ActionState.BLOCKED },
        { action_id: uuidv4(), state: ActionState.DONE },
      ]);

      expect(blocking.length).toBe(2);
      expect(blocking.every((a) => [ActionState.IN_PROGRESS, ActionState.DONE].includes(a.state))).toBe(true);
    });
  });

  describe("isRollbackCostJustified", () => {
    it("should justify rollback when cost equals investment", () => {
      expect(validator.isRollbackCostJustified(5000, 5000)).toBe(true);
    });

    it("should justify rollback when cost less than investment", () => {
      expect(validator.isRollbackCostJustified(2000, 5000)).toBe(true);
    });

    it("should not justify rollback when cost exceeds investment", () => {
      expect(validator.isRollbackCostJustified(6000, 5000)).toBe(false);
    });

    it("should justify zero-cost rollback", () => {
      expect(validator.isRollbackCostJustified(0, 5000)).toBe(true);
    });
  });

  describe("getCostBenefitRatio", () => {
    it("should return 0.2 for cost 1000, investment 5000", () => {
      const ratio = validator.getCostBenefitRatio(1000, 5000);
      expect(ratio).toBe(0.2);
    });

    it("should return 0.8 for cost 4000, investment 5000", () => {
      const ratio = validator.getCostBenefitRatio(4000, 5000);
      expect(ratio).toBe(0.8);
    });

    it("should return 0 for zero cost", () => {
      const ratio = validator.getCostBenefitRatio(0, 5000);
      expect(ratio).toBe(0);
    });

    it("should return Infinity for zero investment", () => {
      const ratio = validator.getCostBenefitRatio(1000, 0);
      expect(ratio).toBe(Infinity);
    });
  });

  describe("validateRollbackPlanSteps", () => {
    it("should validate plan with valid steps", () => {
      const valid = validator.validateRollbackPlanSteps([
        { step_id: "1", description: "Step 1" },
        { step_id: "2", description: "Step 2" },
      ]);
      expect(valid).toBe(true);
    });

    it("should reject empty plan", () => {
      const valid = validator.validateRollbackPlanSteps([]);
      expect(valid).toBe(false);
    });

    it("should reject plan with missing description", () => {
      const valid = validator.validateRollbackPlanSteps([
        { step_id: "1", description: "" },
      ]);
      expect(valid).toBe(false);
    });

    it("should reject plan with missing step_id", () => {
      const valid = validator.validateRollbackPlanSteps([
        { step_id: "", description: "Step 1" },
      ]);
      expect(valid).toBe(false);
    });
  });

  describe("result structure", () => {
    it("should have all required fields", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
      });

      expect(result.action_id).toBe(actionId);
      expect(result.can_rollback).toBeDefined();
      expect(result.reasons).toBeDefined();
      expect(result.rollback_feasibility).toBeDefined();
      expect(result.estimated_cost_dollars).toBeDefined();
      expect(result.estimated_time_days).toBeDefined();
      expect(result.recommendation).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("should handle multiple downstream actions", () => {
      const downstreamActions = Array.from({ length: 10 }, () => ({
        action_id: uuidv4(),
        state: ActionState.READY,
      }));

      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: downstreamActions,
      });

      expect(result.can_rollback).toBe(true);
    });

    it("should handle large cost values", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000000,
          estimated_time_days: 30,
        },
        original_investment_dollars: 10000000,
        downstream_actions: [],
      });

      expect(result.can_rollback).toBe(true);
      expect(result.estimated_cost_dollars).toBe(1000000);
    });

    it("should maintain determinism", () => {
      const downstreamActions = [
        { action_id: uuidv4(), state: ActionState.READY },
      ];

      const result1 = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: downstreamActions,
      });

      const result2 = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 1000,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: downstreamActions,
      });

      expect(result1.can_rollback).toBe(result2.can_rollback);
      expect(result1.rollback_feasibility).toBe(result2.rollback_feasibility);
    });

    it("should handle boundary cost ratio (0.75)", () => {
      const result = validator.validateRollback({
        action_id: actionId,
        action_state: ActionState.READY,
        rollback_plan: {
          action_id: actionId,
          steps: [{ step_id: "1", description: "Undo" }],
          estimated_cost_dollars: 3750,
          estimated_time_days: 1,
        },
        original_investment_dollars: 5000,
        downstream_actions: [],
      });

      expect(result.rollback_feasibility).toBe(RollbackFeasibility.RISKY);
    });
  });
});
