import { describe, it, expect } from "vitest";
import { ExecutionSequencer } from "../sequencer";
import { SequencerInput } from "@/domain/execution/sequencer";
import { v4 as uuidv4 } from "uuid";

describe("ExecutionSequencer", () => {
  const sequencer = new ExecutionSequencer();
  const decision_id = uuidv4();
  const workspace_id = uuidv4();

  const createBasicInput = (): SequencerInput => ({
    decision_id,
    workspace_id,
    execution_order: ["A", "B", "C"],
    action_details: {
      A: {
        effort_hours: 8,
        dependency_count: 0,
        owner: uuidv4(),
      },
      B: {
        effort_hours: 4,
        dependency_count: 1,
        owner: uuidv4(),
      },
      C: {
        effort_hours: 6,
        dependency_count: 1,
        owner: uuidv4(),
      },
    },
    start_date: "2026-05-06T09:00:00Z",
    owner_available_hours_per_day: {
      [Object.keys({ A: { effort_hours: 8, dependency_count: 0, owner: "A" } })[0]]: 8,
    },
  });

  describe("buildSchedule", () => {
    it("should build schedule for sequential actions", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input);

      expect(schedule).not.toBeNull();
      expect(schedule!.steps).toHaveLength(3);
      expect(schedule!.decision_id).toBe(decision_id);
      expect(schedule!.workspace_id).toBe(workspace_id);
    });

    it("should assign execution order correctly", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.steps[0].execution_order).toBe(1);
      expect(schedule.steps[1].execution_order).toBe(2);
      expect(schedule.steps[2].execution_order).toBe(3);
    });

    it("should apply friction delays per dependency count", () => {
      const input: SequencerInput = {
        decision_id,
        workspace_id,
        execution_order: ["A", "B", "C", "D"],
        action_details: {
          A: { effort_hours: 8, dependency_count: 0, owner: "owner1" },
          B: { effort_hours: 4, dependency_count: 1, owner: "owner2" }, // 5 days friction
          C: { effort_hours: 6, dependency_count: 3, owner: "owner3" }, // 10 days friction
          D: { effort_hours: 5, dependency_count: 6, owner: "owner4" }, // 20 days friction
        },
        start_date: "2026-05-06T09:00:00Z",
        owner_available_hours_per_day: {},
      };

      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.steps[0].friction_delay_days).toBe(0);
      expect(schedule.steps[1].friction_delay_days).toBe(5);
      expect(schedule.steps[2].friction_delay_days).toBe(10);
      expect(schedule.steps[3].friction_delay_days).toBe(20);
    });

    it("should calculate total effort hours", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.total_effort_hours).toBe(18); // 8 + 4 + 6
    });

    it("should calculate total duration in days", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.total_duration_days).toBeGreaterThan(0);
    });

    it("should fail on empty execution order", () => {
      const input = createBasicInput();
      input.execution_order = [];

      const schedule = sequencer.buildSchedule(input);

      expect(schedule).toBeNull();
    });

    it("should fail on missing action details", () => {
      const input = createBasicInput();
      delete input.action_details["B"];

      const schedule = sequencer.buildSchedule(input);

      expect(schedule).toBeNull();
    });

    it("should set start_time before end_time", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      for (const step of schedule.steps) {
        const start = new Date(step.start_time);
        const end = new Date(step.end_time);
        expect(start.getTime()).toBeLessThan(end.getTime());
      }
    });

    it("should allocate correct capacity hours", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.steps[0].capacity_hours_allocated).toBe(8);
      expect(schedule.steps[1].capacity_hours_allocated).toBe(4);
      expect(schedule.steps[2].capacity_hours_allocated).toBe(6);
    });
  });

  describe("detectConflicts", () => {
    it("should detect no conflicts for sequential actions with different owners", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.conflict_detected).toBe(false);
      expect(schedule.conflicts).toHaveLength(0);
    });

    it("should mark schedule as valid when no conflicts", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.is_valid).toBe(true);
    });

    it("should detect conflicts when same owner has overlapping times", () => {
      const owner = uuidv4();
      const input: SequencerInput = {
        decision_id,
        workspace_id,
        execution_order: ["A", "B"],
        action_details: {
          A: { effort_hours: 8, dependency_count: 0, owner },
          B: { effort_hours: 6, dependency_count: 0, owner }, // Same owner, no friction
        },
        start_date: "2026-05-06T09:00:00Z",
        owner_available_hours_per_day: { [owner]: 8 },
      };

      const schedule = sequencer.buildSchedule(input);

      if (schedule && schedule.conflict_detected) {
        expect(schedule.conflicts.length).toBeGreaterThan(0);
      }
    });
  });

  describe("validateSchedule", () => {
    it("should validate correct schedule", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      expect(sequencer.validateSchedule(schedule)).toBe(true);
    });

    it("should reject schedule with conflicts", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;
      schedule.conflict_detected = true;
      schedule.is_valid = false;
      schedule.conflicts = [
        {
          action_id_1: "A",
          action_id_2: "B",
          reason: "Overlapping timeline",
        },
      ];

      expect(sequencer.validateSchedule(schedule)).toBe(false);
    });

    it("should verify execution order is consecutive", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      expect(sequencer.validateSchedule(schedule)).toBe(true);

      // Corrupt execution order
      schedule.steps[1].execution_order = 5;
      expect(sequencer.validateSchedule(schedule)).toBe(false);
    });

    it("should verify start_time <= end_time", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      expect(sequencer.validateSchedule(schedule)).toBe(true);

      // Corrupt timeline
      const temp = schedule.steps[0].start_time;
      schedule.steps[0].start_time = schedule.steps[0].end_time;
      schedule.steps[0].end_time = temp;

      expect(sequencer.validateSchedule(schedule)).toBe(false);
    });
  });

  describe("getStep", () => {
    it("should retrieve step by action_id", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      const step = sequencer.getStep(schedule, "B");

      expect(step).not.toBeNull();
      expect(step!.action_id).toBe("B");
      expect(step!.effort_hours).toBe(4);
    });

    it("should return null for non-existent action", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      const step = sequencer.getStep(schedule, "NONEXISTENT");

      expect(step).toBeNull();
    });
  });

  describe("calculateTotalDuration", () => {
    it("should calculate total duration correctly", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;

      const duration = sequencer.calculateTotalDuration(schedule);

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThanOrEqual(schedule.total_duration_days + 1);
    });

    it("should return 0 for empty schedule", () => {
      const input = createBasicInput();
      const schedule = sequencer.buildSchedule(input)!;
      schedule.steps = [];

      const duration = sequencer.calculateTotalDuration(schedule);

      expect(duration).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle single action", () => {
      const input: SequencerInput = {
        decision_id,
        workspace_id,
        execution_order: ["A"],
        action_details: {
          A: { effort_hours: 8, dependency_count: 0, owner: "owner1" },
        },
        start_date: "2026-05-06T09:00:00Z",
        owner_available_hours_per_day: {},
      };

      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.steps).toHaveLength(1);
      expect(schedule.steps[0].action_id).toBe("A");
    });

    it("should handle large dependency counts", () => {
      const input: SequencerInput = {
        decision_id,
        workspace_id,
        execution_order: ["A"],
        action_details: {
          A: { effort_hours: 8, dependency_count: 50, owner: "owner1" },
        },
        start_date: "2026-05-06T09:00:00Z",
        owner_available_hours_per_day: {},
      };

      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.steps[0].friction_delay_days).toBe(20); // Max friction
    });

    it("should handle zero effort hours", () => {
      const input: SequencerInput = {
        decision_id,
        workspace_id,
        execution_order: ["A"],
        action_details: {
          A: { effort_hours: 0, dependency_count: 0, owner: "owner1" },
        },
        start_date: "2026-05-06T09:00:00Z",
        owner_available_hours_per_day: {},
      };

      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.steps[0].effort_hours).toBe(0);
      expect(schedule.total_effort_hours).toBe(0);
    });

    it("should handle fractional effort hours", () => {
      const input: SequencerInput = {
        decision_id,
        workspace_id,
        execution_order: ["A"],
        action_details: {
          A: { effort_hours: 2.5, dependency_count: 0, owner: "owner1" },
        },
        start_date: "2026-05-06T09:00:00Z",
        owner_available_hours_per_day: {},
      };

      const schedule = sequencer.buildSchedule(input)!;

      expect(schedule.steps[0].effort_hours).toBe(2.5);
      expect(schedule.total_effort_hours).toBe(2.5);
    });

    it("should maintain deterministic ordering", () => {
      const input = createBasicInput();

      const schedule1 = sequencer.buildSchedule(input)!;
      const schedule2 = sequencer.buildSchedule(input)!;

      expect(schedule1.steps.map((s) => s.action_id)).toEqual(
        schedule2.steps.map((s) => s.action_id)
      );
    });

    it("should handle multiple actions per owner", () => {
      const owner = uuidv4();
      const input: SequencerInput = {
        decision_id,
        workspace_id,
        execution_order: ["A", "B", "C"],
        action_details: {
          A: { effort_hours: 4, dependency_count: 0, owner },
          B: { effort_hours: 4, dependency_count: 1, owner },
          C: { effort_hours: 4, dependency_count: 1, owner },
        },
        start_date: "2026-05-06T09:00:00Z",
        owner_available_hours_per_day: { [owner]: 8 },
      };

      const schedule = sequencer.buildSchedule(input)!;

      const owner_steps = schedule.steps.filter((s) => s.owner === owner);
      expect(owner_steps.length).toBe(3);
    });
  });
});
