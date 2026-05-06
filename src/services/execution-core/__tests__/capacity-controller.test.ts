import { describe, it, expect } from "vitest";
import { CapacityController } from "../capacity-controller";
import { CapacityCheckInput, CapacityAllocation } from "@/domain/execution/capacity";
import { v4 as uuidv4 } from "uuid";

describe("CapacityController", () => {
  const controller = new CapacityController();
  const owner = uuidv4();

  describe("checkCapacity", () => {
    it("should allow execution with sufficient capacity", () => {
      const input: CapacityCheckInput = {
        owner,
        effort_hours: 8,
        available_hours_per_week: 40,
        current_allocations: [],
      };

      const result = controller.checkCapacity(input);

      expect(result.can_execute).toBe(true);
      expect(result.owner).toBe(owner);
      expect(result.available_hours).toBe(40);
      expect(result.allocated_hours).toBe(0);
    });

    it("should block execution when capacity exceeded", () => {
      const input: CapacityCheckInput = {
        owner,
        effort_hours: 50,
        available_hours_per_week: 40,
        current_allocations: [],
      };

      const result = controller.checkCapacity(input);

      expect(result.can_execute).toBe(false);
      expect(result.reason_if_blocked).toContain("Insufficient capacity");
    });

    it("should account for current allocations", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 20 },
        { owner, action_id: "B", effort_hours: 10 },
      ];

      const input: CapacityCheckInput = {
        owner,
        effort_hours: 15,
        available_hours_per_week: 40,
        current_allocations: allocations,
      };

      const result = controller.checkCapacity(input);

      expect(result.allocated_hours).toBe(30);
      expect(result.available_hours).toBe(10);
      expect(result.can_execute).toBe(false);
    });

    it("should allow execution at capacity boundary", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 30 },
      ];

      const input: CapacityCheckInput = {
        owner,
        effort_hours: 10,
        available_hours_per_week: 40,
        current_allocations: allocations,
      };

      const result = controller.checkCapacity(input);

      expect(result.can_execute).toBe(true);
      expect(result.remaining_hours).toBe(0);
    });

    it("should use default available hours if not specified", () => {
      const input: CapacityCheckInput = {
        owner,
        effort_hours: 8,
      };

      const result = controller.checkCapacity(input);

      expect(result.can_execute).toBe(true);
      expect(result.available_hours).toBe(40); // DEFAULT_HOURS_PER_WEEK
    });

    it("should ignore allocations for other owners", () => {
      const other_owner = uuidv4();
      const allocations: CapacityAllocation[] = [
        { owner: other_owner, action_id: "A", effort_hours: 30 },
      ];

      const input: CapacityCheckInput = {
        owner,
        effort_hours: 35,
        available_hours_per_week: 40,
        current_allocations: allocations,
      };

      const result = controller.checkCapacity(input);

      expect(result.can_execute).toBe(true); // Not affected by other_owner's allocation
      expect(result.allocated_hours).toBe(0);
    });

    it("should calculate remaining hours correctly", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 15 },
      ];

      const input: CapacityCheckInput = {
        owner,
        effort_hours: 20,
        available_hours_per_week: 40,
        current_allocations: allocations,
      };

      const result = controller.checkCapacity(input);

      expect(result.remaining_hours).toBe(5); // 40 - 15 - 20
    });
  });

  describe("checkConcurrency", () => {
    it("should allow starting action within concurrency limit", () => {
      const result = controller.checkConcurrency(owner, 1, 2);

      expect(result.can_start).toBe(true);
      expect(result.owner).toBe(owner);
      expect(result.current_in_progress).toBe(1);
    });

    it("should block starting action at concurrency limit", () => {
      const result = controller.checkConcurrency(owner, 2, 2);

      expect(result.can_start).toBe(false);
      expect(result.reason_if_blocked).toContain("Concurrency limit reached");
    });

    it("should allow multiple actions within limit", () => {
      const result = controller.checkConcurrency(owner, 0, 3);

      expect(result.can_start).toBe(true);
    });

    it("should use default max concurrency if not specified", () => {
      const result = controller.checkConcurrency(owner, 2);

      expect(result.max_concurrent).toBe(2); // DEFAULT_MAX_CONCURRENT_ACTIONS
      expect(result.can_start).toBe(false);
    });
  });

  describe("getOwnerCapacitySummary", () => {
    it("should return capacity summary for owner", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 8 },
        { owner, action_id: "B", effort_hours: 12 },
      ];

      const summary = controller.getOwnerCapacitySummary(owner, allocations, 40);

      expect(summary.owner).toBe(owner);
      expect(summary.available_hours_per_week).toBe(40);
      expect(summary.available_hours_per_day).toBe(8); // 40 / 5
      expect(summary.current_allocations).toHaveLength(2);
    });

    it("should filter allocations by owner", () => {
      const other_owner = uuidv4();
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 8 },
        { owner: other_owner, action_id: "B", effort_hours: 12 },
      ];

      const summary = controller.getOwnerCapacitySummary(owner, allocations);

      expect(summary.current_allocations).toHaveLength(1);
      expect(summary.current_allocations[0].action_id).toBe("A");
    });

    it("should handle empty allocations", () => {
      const summary = controller.getOwnerCapacitySummary(owner, []);

      expect(summary.current_allocations).toHaveLength(0);
    });
  });

  describe("allocateCapacity", () => {
    it("should add allocation to list", () => {
      const allocations: CapacityAllocation[] = [];

      const result = controller.allocateCapacity(
        owner,
        "action1",
        8,
        allocations
      );

      expect(result).toHaveLength(1);
      expect(result[0].action_id).toBe("action1");
      expect(result[0].effort_hours).toBe(8);
    });

    it("should preserve existing allocations", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 8 },
      ];

      const result = controller.allocateCapacity(
        owner,
        "B",
        10,
        allocations
      );

      expect(result).toHaveLength(2);
      expect(result[0].action_id).toBe("A");
      expect(result[1].action_id).toBe("B");
    });

    it("should allow multiple allocations for same action", () => {
      const allocations: CapacityAllocation[] = [];

      const result1 = controller.allocateCapacity(
        owner,
        "A",
        5,
        allocations
      );
      const result2 = controller.allocateCapacity(
        owner,
        "A",
        3,
        result1
      );

      expect(result2).toHaveLength(2);
      expect(result2.filter((a) => a.action_id === "A")).toHaveLength(2);
    });
  });

  describe("deallocateCapacity", () => {
    it("should remove allocation by action_id", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 8 },
        { owner, action_id: "B", effort_hours: 10 },
      ];

      const result = controller.deallocateCapacity("A", allocations);

      expect(result).toHaveLength(1);
      expect(result[0].action_id).toBe("B");
    });

    it("should handle non-existent action_id", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 8 },
      ];

      const result = controller.deallocateCapacity("NONEXISTENT", allocations);

      expect(result).toHaveLength(1); // No change
    });

    it("should remove all allocations for action_id", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 5 },
        { owner, action_id: "A", effort_hours: 3 },
        { owner, action_id: "B", effort_hours: 10 },
      ];

      const result = controller.deallocateCapacity("A", allocations);

      expect(result).toHaveLength(1);
      expect(result[0].action_id).toBe("B");
    });
  });

  describe("validateExecutionPlan", () => {
    it("should validate plan with sufficient capacity", () => {
      const plan = [
        { action_id: "A", owner, effort_hours: 15 },
        { action_id: "B", owner, effort_hours: 20 },
      ];

      const result = controller.validateExecutionPlan(plan, { [owner]: 40 });

      expect(result.is_valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("should reject plan exceeding owner capacity", () => {
      const plan = [
        { action_id: "A", owner, effort_hours: 25 },
        { action_id: "B", owner, effort_hours: 20 },
      ];

      const result = controller.validateExecutionPlan(plan, { [owner]: 40 });

      expect(result.is_valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].action_id).toBe("B");
    });

    it("should validate multiple owners independently", () => {
      const owner2 = uuidv4();
      const plan = [
        { action_id: "A", owner, effort_hours: 35 },
        { action_id: "B", owner: owner2, effort_hours: 40 },
      ];

      const result = controller.validateExecutionPlan(plan, {
        [owner]: 40,
        [owner2]: 40,
      });

      expect(result.is_valid).toBe(true);
    });

    it("should use default capacity if not specified", () => {
      const plan = [
        { action_id: "A", owner, effort_hours: 30 },
        { action_id: "B", owner, effort_hours: 15 },
      ];

      const result = controller.validateExecutionPlan(plan);

      expect(result.is_valid).toBe(false); // 45 > 40 default
    });

    it("should handle empty plan", () => {
      const result = controller.validateExecutionPlan([]);

      expect(result.is_valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("calculateUtilization", () => {
    it("should calculate utilization percentage", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 20 },
      ];

      const utilization = controller.calculateUtilization(owner, allocations, 40);

      expect(utilization).toBe(50); // 20/40 * 100
    });

    it("should handle zero available hours", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 0 },
      ];

      const utilization = controller.calculateUtilization(owner, allocations, 0);

      expect(utilization).toBe(0);
    });

    it("should cap utilization at 100%", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 50 },
      ];

      const utilization = controller.calculateUtilization(owner, allocations, 40);

      expect(utilization).toBe(100); // Would be 125%, capped at 100%
    });

    it("should use default available hours if not specified", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 8 },
      ];

      const utilization = controller.calculateUtilization(owner, allocations);

      expect(utilization).toBe(20); // 8/40 * 100
    });

    it("should filter by owner", () => {
      const other_owner = uuidv4();
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 10 },
        { owner: other_owner, action_id: "B", effort_hours: 30 },
      ];

      const utilization = controller.calculateUtilization(owner, allocations, 40);

      expect(utilization).toBe(25); // 10/40 * 100, ignoring other_owner
    });

    it("should handle zero allocations", () => {
      const utilization = controller.calculateUtilization(owner, []);

      expect(utilization).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle fractional effort hours", () => {
      const input: CapacityCheckInput = {
        owner,
        effort_hours: 2.5,
        available_hours_per_week: 40,
      };

      const result = controller.checkCapacity(input);

      expect(result.can_execute).toBe(true);
      expect(result.remaining_hours).toBe(37.5);
    });

    it("should handle very large capacity values", () => {
      const input: CapacityCheckInput = {
        owner,
        effort_hours: 100,
        available_hours_per_week: 1000,
      };

      const result = controller.checkCapacity(input);

      expect(result.can_execute).toBe(true);
    });

    it("should handle zero effort hours", () => {
      const input: CapacityCheckInput = {
        owner,
        effort_hours: 0,
        available_hours_per_week: 40,
      };

      const result = controller.checkCapacity(input);

      expect(result.can_execute).toBe(true);
    });

    it("should maintain deterministic behavior", () => {
      const allocations: CapacityAllocation[] = [
        { owner, action_id: "A", effort_hours: 8 },
      ];

      const input: CapacityCheckInput = {
        owner,
        effort_hours: 10,
        available_hours_per_week: 40,
        current_allocations: allocations,
      };

      const result1 = controller.checkCapacity(input);
      const result2 = controller.checkCapacity(input);

      expect(result1.can_execute).toBe(result2.can_execute);
      expect(result1.remaining_hours).toBe(result2.remaining_hours);
    });
  });
});
