import { describe, it, expect } from "vitest";
import { QuickWinEnforcer } from "../quick-win-enforcer";
import { QUICK_WIN_MAX_DAYS } from "@/domain/outcome/quickwin";
import { v4 as uuidv4 } from "uuid";

describe("QuickWinEnforcer", () => {
  const enforcer = new QuickWinEnforcer();
  const actionId = uuidv4();
  const workspaceId = uuidv4();

  describe("Quick Win Acceptance (≤7 Days)", () => {
    it("should accept plan at exactly 7 days", () => {
      const startDate = new Date("2026-05-06T00:00:00Z");
      const endDate = new Date("2026-05-13T00:00:00Z"); // 7 days later

      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Test Action",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(true);
      expect(result.days_to_result).toBe(7);
    });

    it("should accept plan under 7 days", () => {
      const startDate = new Date("2026-05-06T00:00:00Z");
      const endDate = new Date("2026-05-10T00:00:00Z"); // 4 days later

      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Test Action",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(true);
      expect(result.days_to_result).toBe(4);
    });

    it("should accept single day plan", () => {
      const startDate = new Date("2026-05-06T00:00:00Z");
      const endDate = new Date("2026-05-06T12:00:00Z"); // Same day

      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            friction_delay_days: 0,
            capacity_hours_allocated: 5,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 12,
          title: "Quick Task",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(true);
      expect(result.days_to_result).toBeLessThanOrEqual(1);
    });
  });

  describe("Quick Win Rejection (>7 Days)", () => {
    it("should reject plan at 8 days", () => {
      const startDate = new Date("2026-05-06T00:00:00Z");
      const endDate = new Date("2026-05-14T00:00:00Z"); // 8 days later

      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Slow Action",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(false);
      expect(result.days_to_result).toBe(8);
      expect(result.reason_if_blocked).toContain("exceeds");
    });

    it("should reject plan at 30 days", () => {
      const startDate = new Date("2026-05-06T00:00:00Z");
      const endDate = new Date("2026-06-05T00:00:00Z"); // 30 days later

      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            friction_delay_days: 0,
            capacity_hours_allocated: 100,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 200,
          title: "Long Action",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(false);
      expect(result.reason_if_blocked).toContain("7-day");
    });
  });

  describe("Multi-Step Plans", () => {
    it("should calculate from earliest start to latest end", () => {
      const start1 = new Date("2026-05-06T00:00:00Z");
      const end1 = new Date("2026-05-08T00:00:00Z");
      const start2 = new Date("2026-05-07T00:00:00Z");
      const end2 = new Date("2026-05-11T00:00:00Z"); // Latest end

      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: start1.toISOString(),
            end_time: end1.toISOString(),
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
          {
            action_id: actionId,
            start_time: start2.toISOString(),
            end_time: end2.toISOString(),
            friction_delay_days: 2,
            capacity_hours_allocated: 8,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Multi-step",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(true);
      expect(result.days_to_result).toBe(5); // May 6 to May 11
    });

    it("should handle non-sequential steps", () => {
      const start1 = new Date("2026-05-10T00:00:00Z");
      const end1 = new Date("2026-05-12T00:00:00Z");
      const start2 = new Date("2026-05-06T00:00:00Z"); // Earlier start
      const end2 = new Date("2026-05-08T00:00:00Z");

      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: start1.toISOString(),
            end_time: end1.toISOString(),
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
          {
            action_id: actionId,
            start_time: start2.toISOString(),
            end_time: end2.toISOString(),
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Non-sequential",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(true);
      expect(result.days_to_result).toBe(6); // May 6 to May 12
    });
  });

  describe("Input Validation (Fail-Closed)", () => {
    it("should reject missing execution_plan", () => {
      const result = enforcer.validateQuickWin({
        execution_plan: null as any,
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Test",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(false);
      expect(result.reason_if_blocked).toContain("required");
    });

    it("should reject empty execution_plan", () => {
      const result = enforcer.validateQuickWin({
        execution_plan: [],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Test",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(false);
      expect(result.reason_if_blocked).toContain("empty");
    });

    it("should reject missing action", () => {
      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: "2026-05-06T00:00:00Z",
            end_time: "2026-05-08T00:00:00Z",
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: null as any,
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(false);
    });

    it("should reject action without action_id", () => {
      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: "2026-05-06T00:00:00Z",
            end_time: "2026-05-08T00:00:00Z",
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: "",
          estimated_effort_hours: 20,
          title: "Test",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(false);
    });

    it("should handle invalid date format", () => {
      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: "invalid-date",
            end_time: "also-invalid",
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Test",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(false);
      expect(result.days_to_result).toBe(Number.MAX_VALUE);
    });
  });

  describe("Helper Methods", () => {
    it("isQuickWin should return true for ≤7 days", () => {
      expect(enforcer.isQuickWin(7)).toBe(true);
      expect(enforcer.isQuickWin(5)).toBe(true);
      expect(enforcer.isQuickWin(1)).toBe(true);
    });

    it("isQuickWin should return false for >7 days", () => {
      expect(enforcer.isQuickWin(8)).toBe(false);
      expect(enforcer.isQuickWin(14)).toBe(false);
      expect(enforcer.isQuickWin(30)).toBe(false);
    });

    it("getDaysRemaining should return remaining days", () => {
      expect(enforcer.getDaysRemaining(3)).toBe(4);
      expect(enforcer.getDaysRemaining(7)).toBe(0);
      expect(enforcer.getDaysRemaining(10)).toBe(0); // Clamped to 0
    });

    it("isWarningThreshold should flag at 5+ days", () => {
      expect(enforcer.isWarningThreshold(5)).toBe(true);
      expect(enforcer.isWarningThreshold(6)).toBe(true);
      expect(enforcer.isWarningThreshold(4)).toBe(false);
    });

    it("isWarningThreshold should use custom threshold", () => {
      expect(enforcer.isWarningThreshold(6, 6)).toBe(true); // At or above threshold
      expect(enforcer.isWarningThreshold(5, 6)).toBe(false); // Below threshold
    });
  });

  describe("Boundary Cases", () => {
    it("should handle same start and end time (zero duration)", () => {
      const date = new Date("2026-05-06T12:00:00Z");

      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: date.toISOString(),
            end_time: date.toISOString(),
            friction_delay_days: 0,
            capacity_hours_allocated: 0,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 0,
          title: "Instant",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(true);
      expect(result.days_to_result).toBe(0);
    });

    it("should round up fractional days", () => {
      const startDate = new Date("2026-05-06T00:00:00Z");
      const endDate = new Date("2026-05-07T12:00:00Z"); // 1.5 days

      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Test",
        },
        workspace_id: workspaceId,
      });

      expect(result.days_to_result).toBe(2); // Rounded up
      expect(result.is_quick_win).toBe(true);
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce same result for identical inputs", () => {
      const input = {
        execution_plan: [
          {
            action_id: actionId,
            start_time: "2026-05-06T00:00:00Z",
            end_time: "2026-05-10T00:00:00Z",
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Test",
        },
        workspace_id: workspaceId,
      };

      const result1 = enforcer.validateQuickWin(input);
      const result2 = enforcer.validateQuickWin(input);

      expect(result1.is_quick_win).toBe(result2.is_quick_win);
      expect(result1.days_to_result).toBe(result2.days_to_result);
    });
  });

  describe("Result Properties", () => {
    it("should include max_days_allowed in result", () => {
      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: "2026-05-06T00:00:00Z",
            end_time: "2026-05-10T00:00:00Z",
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Test",
        },
        workspace_id: workspaceId,
      });

      expect(result.max_days_allowed).toBe(QUICK_WIN_MAX_DAYS);
    });

    it("should have empty reason for accepted plans", () => {
      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: "2026-05-06T00:00:00Z",
            end_time: "2026-05-10T00:00:00Z",
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Test",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(true);
      expect(result.reason_if_blocked).toBe("");
    });

    it("should have reason for blocked plans", () => {
      const result = enforcer.validateQuickWin({
        execution_plan: [
          {
            action_id: actionId,
            start_time: "2026-05-06T00:00:00Z",
            end_time: "2026-05-20T00:00:00Z",
            friction_delay_days: 0,
            capacity_hours_allocated: 10,
          },
        ],
        action: {
          action_id: actionId,
          estimated_effort_hours: 20,
          title: "Test",
        },
        workspace_id: workspaceId,
      });

      expect(result.is_quick_win).toBe(false);
      expect(result.reason_if_blocked).not.toBe("");
    });
  });
});
