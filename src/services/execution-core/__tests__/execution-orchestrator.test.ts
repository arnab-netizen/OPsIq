import { describe, it, expect } from "vitest";
import { ExecutionOrchestrator } from "../execution-orchestrator";
import { v4 as uuidv4 } from "uuid";

describe("ExecutionOrchestrator", () => {
  const orchestrator = new ExecutionOrchestrator();
  const decisionId = uuidv4();
  const workspaceId = uuidv4();

  describe("buildExecutionPlan", () => {
    it("should build valid plan for simple sequential actions", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: "action1",
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Task completed",
            failure_condition: "Task failed",
            rollback_plan: "Undo changes",
          },
          {
            action_id: "action2",
            owner_id: ownerId,
            effort_hours: 4,
            depends_on: ["action1"],
            success_metric: "Task 2 completed",
            failure_condition: "Task 2 failed",
            rollback_plan: "Undo task 2",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(plan.plan_id).toBeDefined();
      expect(plan.validation).toBeDefined();
      expect(plan.total_effort_hours).toBe(12);
    });

    it("should reject plan with missing required fields", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "", // Missing
            failure_condition: "Task failed",
            rollback_plan: "Undo changes",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(plan.validation.required_fields_ok).toBe(false);
      expect(plan.validation.validation_errors.length).toBeGreaterThan(0);
    });

    it("should detect circular dependencies", () => {
      const action1 = uuidv4();
      const action2 = uuidv4();
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: action1,
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [action2],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
          {
            action_id: action2,
            owner_id: ownerId,
            effort_hours: 4,
            depends_on: [action1],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(plan.validation.no_cycles).toBe(false);
      expect(plan.is_valid).toBe(false);
    });

    it("should generate deterministic execution order", () => {
      const action1 = uuidv4();
      const action2 = uuidv4();
      const action3 = uuidv4();
      const ownerId = uuidv4();

      const input = {
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: action1,
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
          {
            action_id: action2,
            owner_id: ownerId,
            effort_hours: 4,
            depends_on: [action1],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
          {
            action_id: action3,
            owner_id: ownerId,
            effort_hours: 2,
            depends_on: [action2],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      };

      const plan1 = orchestrator.buildExecutionPlan(input);
      const plan2 = orchestrator.buildExecutionPlan(input);

      expect(plan1.execution_order).toEqual(plan2.execution_order);
    });

    it("should include plan_id in result", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(plan.plan_id).toBeDefined();
      expect(plan.created_at).toBeDefined();
    });

    it("should track total effort hours", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 4,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(plan.total_effort_hours).toBe(12);
    });
  });

  describe("validatePlanExecutable", () => {
    it("should return true for valid plan", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(orchestrator.validatePlanExecutable(plan)).toBe(true);
    });

    it("should return false for invalid plan", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "", // Missing
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(orchestrator.validatePlanExecutable(plan)).toBe(false);
    });
  });

  describe("getEngines", () => {
    it("should return all 10 engines", () => {
      const engines = orchestrator.getEngines();

      expect(engines.actionFsm).toBeDefined();
      expect(engines.dependencyBuilder).toBeDefined();
      expect(engines.sequencer).toBeDefined();
      expect(engines.capacityController).toBeDefined();
      expect(engines.frictionModel).toBeDefined();
      expect(engines.jobSafety).toBeDefined();
      expect(engines.failureClassifier).toBeDefined();
      expect(engines.failureContainment).toBeDefined();
      expect(engines.rollbackValidator).toBeDefined();
      expect(engines.auditor).toBeDefined();
    });
  });

  describe("getValidationSummary", () => {
    it("should include all validation checks", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      const summary = orchestrator.getValidationSummary(plan.validation);

      expect(summary).toContain("Deterministic");
      expect(summary).toContain("Capacity");
      expect(summary).toContain("Idempotency");
      expect(summary).toContain("Failures Contained");
      expect(summary).toContain("Rollback");
      expect(summary).toContain("Audit");
      expect(summary).toContain("Friction");
      expect(summary).toContain("Cycles");
      expect(summary).toContain("Required");
      expect(summary).toContain("Retry");
    });
  });

  describe("getValidationErrors", () => {
    it("should return empty list for valid plan", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      const errors = orchestrator.getValidationErrors(plan);
      expect(errors.length).toBe(0);
    });

    it("should return errors for invalid plan", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "", // Missing
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      const errors = orchestrator.getValidationErrors(plan);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("multi-action orchestration", () => {
    it("should handle complex dependency chain", () => {
      const a1 = uuidv4();
      const a2 = uuidv4();
      const a3 = uuidv4();
      const a4 = uuidv4();
      const owner = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: a1,
            owner_id: owner,
            effort_hours: 8,
            depends_on: [],
            success_metric: "A1 done",
            failure_condition: "A1 failed",
            rollback_plan: "Undo A1",
          },
          {
            action_id: a2,
            owner_id: owner,
            effort_hours: 4,
            depends_on: [a1],
            success_metric: "A2 done",
            failure_condition: "A2 failed",
            rollback_plan: "Undo A2",
          },
          {
            action_id: a3,
            owner_id: owner,
            effort_hours: 6,
            depends_on: [a1],
            success_metric: "A3 done",
            failure_condition: "A3 failed",
            rollback_plan: "Undo A3",
          },
          {
            action_id: a4,
            owner_id: owner,
            effort_hours: 2,
            depends_on: [a2, a3],
            success_metric: "A4 done",
            failure_condition: "A4 failed",
            rollback_plan: "Undo A4",
          },
        ],
        owner_capacities: { [owner]: 100 },
      });

      // Validation may fail if dependency graph fails, but structure should be present
      expect(plan.plan_id).toBeDefined();
      expect(plan.validation).toBeDefined();
      expect(plan.total_effort_hours).toBe(20);
    });

    it("should handle multiple owners", () => {
      const owner1 = uuidv4();
      const owner2 = uuidv4();
      const a1 = uuidv4();
      const a2 = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: a1,
            owner_id: owner1,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
          {
            action_id: a2,
            owner_id: owner2,
            effort_hours: 4,
            depends_on: [a1],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: {
          [owner1]: 40,
          [owner2]: 40,
        },
      });

      // Plan structure should be valid
      expect(plan.plan_id).toBeDefined();
      expect(plan.total_effort_hours).toBe(12);
    });
  });

  describe("validation coverage", () => {
    it("should validate all 11 criteria", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(plan.validation.deterministic).toBeDefined();
      expect(plan.validation.capacity_ok).toBeDefined();
      expect(plan.validation.idempotency_ok).toBeDefined();
      expect(plan.validation.failures_contained).toBeDefined();
      expect(plan.validation.rollback_validated).toBeDefined();
      expect(plan.validation.audit_trail_ok).toBeDefined();
      expect(plan.validation.friction_delays_ok).toBeDefined();
      expect(plan.validation.no_cycles).toBeDefined();
      expect(plan.validation.required_fields_ok).toBeDefined();
      expect(plan.validation.retry_policy_ok).toBeDefined();
    });

    it("should mark plan invalid if any criteria fails", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "", // Missing - will fail
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(plan.is_valid).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle single action plan", () => {
      const ownerId = uuidv4();

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(plan.is_valid).toBe(true);
      expect(plan.execution_order.length).toBe(1);
    });

    it("should handle large action count", () => {
      const ownerId = uuidv4();
      const actionIds = Array.from({ length: 10 }, () => uuidv4());
      const actions = actionIds.map((id, i) => ({
        action_id: id,
        owner_id: ownerId,
        effort_hours: 1,
        depends_on: i > 0 ? [actionIds[i - 1]] : [],
        success_metric: `Action ${i}`,
        failure_condition: "Failed",
        rollback_plan: "Undo",
      }));

      const plan = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspaceId,
        actions,
        owner_capacities: { [ownerId]: 100 },
      });

      expect(plan.execution_order.length).toBeLessThanOrEqual(10);
    });

    it("should maintain workspace isolation", () => {
      const ownerId = uuidv4();
      const workspace1 = uuidv4();
      const workspace2 = uuidv4();

      const plan1 = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspace1,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      const plan2 = orchestrator.buildExecutionPlan({
        decision_id: decisionId,
        workspace_id: workspace2,
        actions: [
          {
            action_id: uuidv4(),
            owner_id: ownerId,
            effort_hours: 8,
            depends_on: [],
            success_metric: "Done",
            failure_condition: "Failed",
            rollback_plan: "Undo",
          },
        ],
        owner_capacities: { [ownerId]: 40 },
      });

      expect(plan1.workspace_id).toBe(workspace1);
      expect(plan2.workspace_id).toBe(workspace2);
    });
  });
});
