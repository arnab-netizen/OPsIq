import { describe, it, expect } from "vitest";
import { FeedbackLoop } from "../feedback-loop";
import { FeedbackAction } from "@/domain/outcome/feedback";
import { ReplanTrigger } from "@/domain/outcome/variance";
import { ImpactDirection, MeasurementQuality } from "@/domain/outcome/impact";
import { v4 as uuidv4 } from "uuid";

describe("FeedbackLoop", () => {
  const feedbackLoop = new FeedbackLoop();
  const actionId = uuidv4();
  const decisionId = uuidv4();
  const workspaceId = uuidv4();
  const ownerId = uuidv4();

  describe("Continue on Success", () => {
    it("should return CONTINUE when no replan triggered", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: 10,
          trigger_replan: false,
          trigger_rollback: false,
          trigger_halt: false,
          replan_action: ReplanTrigger.CONTINUE,
          reason: "Performance within acceptable range",
          is_repeated_failure: false,
        },
        rollback_feasible: false,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.CONTINUE);
      expect(result.escalation_required).toBe(false);
      expect(result.requires_owner_approval).toBe(false);
    });

    it("should include reason for continue", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: 5,
          trigger_replan: false,
          trigger_rollback: false,
          trigger_halt: false,
          replan_action: ReplanTrigger.CONTINUE,
          reason: "Success threshold achieved",
          is_repeated_failure: false,
        },
        rollback_feasible: false,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.reason).toContain("Success");
    });
  });

  describe("Trigger Replan when No Rollback Option", () => {
    it("should return REPLAN when replan triggered and rollback not feasible", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -15,
          trigger_replan: true,
          trigger_rollback: false,
          trigger_halt: false,
          replan_action: ReplanTrigger.REPLAN,
          reason: "Variance exceeds failure threshold",
          is_repeated_failure: false,
        },
        rollback_feasible: false,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.REPLAN);
      expect(result.escalation_required).toBe(true);
      expect(result.requires_owner_approval).toBe(true);
    });

    it("should return REPLAN even when rollback offered but not feasible", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -5,
          trigger_replan: true,
          trigger_rollback: true, // Offered
          trigger_halt: false,
          replan_action: ReplanTrigger.REPLAN,
          reason: "Variance detected",
          is_repeated_failure: false,
        },
        rollback_feasible: false, // But not feasible
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.REPLAN);
    });

    it("should include reason about rollback not feasible", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -10,
          trigger_replan: true,
          trigger_rollback: false,
          trigger_halt: false,
          replan_action: ReplanTrigger.REPLAN,
          reason: "Variance exceeds threshold",
          is_repeated_failure: false,
        },
        rollback_feasible: false,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.reason).toContain("not feasible");
    });
  });

  describe("Offer Rollback when Feasible", () => {
    it("should return ROLLBACK when offered and feasible", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -5,
          trigger_replan: true,
          trigger_rollback: true,
          trigger_halt: false,
          replan_action: ReplanTrigger.ROLLBACK,
          reason: "Previously successful strategy now failing",
          is_repeated_failure: false,
        },
        rollback_feasible: true, // Feasible
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.ROLLBACK);
      expect(result.escalation_required).toBe(true);
      expect(result.requires_owner_approval).toBe(true);
    });

    it("should require owner approval for rollback", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -5,
          trigger_replan: true,
          trigger_rollback: true,
          trigger_halt: false,
          replan_action: ReplanTrigger.ROLLBACK,
          reason: "Rollback available",
          is_repeated_failure: false,
        },
        rollback_feasible: true,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.requires_owner_approval).toBe(true);
    });

    it("should indicate rollback is recommended in reason", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -8,
          trigger_replan: true,
          trigger_rollback: true,
          trigger_halt: false,
          replan_action: ReplanTrigger.ROLLBACK,
          reason: "Strategy failing after initial success",
          is_repeated_failure: false,
        },
        rollback_feasible: true,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.reason).toContain("Rollback");
      expect(result.reason).toContain("recommended");
    });
  });

  describe("Halt on Critical Issues", () => {
    it("should return HALT when trigger_halt is set", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -15,
          trigger_replan: false,
          trigger_rollback: false,
          trigger_halt: true,
          replan_action: ReplanTrigger.HALT,
          reason: "Repeated failure detected. Blocking same recommendation.",
          is_repeated_failure: true,
        },
        rollback_feasible: false,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.HALT);
      expect(result.escalation_required).toBe(true);
      expect(result.requires_owner_approval).toBe(true);
    });

    it("should escalate immediately on halt", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: 0,
          trigger_replan: false,
          trigger_rollback: false,
          trigger_halt: true,
          replan_action: ReplanTrigger.HALT,
          reason: "Analysis blocked: no impact result",
          is_repeated_failure: false,
        },
        rollback_feasible: true, // Feasible doesn't matter if halt
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.HALT);
      expect(result.escalation_required).toBe(true);
    });

    it("should preserve halt reason", () => {
      const reason = "Critical analysis failure";
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: 0,
          trigger_replan: false,
          trigger_rollback: false,
          trigger_halt: true,
          replan_action: ReplanTrigger.HALT,
          reason,
          is_repeated_failure: false,
        },
        rollback_feasible: false,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.reason).toContain(reason);
    });

    it("should halt take precedence over replan", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -15,
          trigger_replan: true, // Both set
          trigger_rollback: false,
          trigger_halt: true, // But halt takes precedence
          replan_action: ReplanTrigger.HALT,
          reason: "Halt takes precedence",
          is_repeated_failure: true,
        },
        rollback_feasible: true,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.HALT);
    });
  });

  describe("Input Validation (Fail-Closed)", () => {
    it("should halt on missing variance_result", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: null as any,
        rollback_feasible: false,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.HALT);
      expect(result.escalation_required).toBe(true);
    });

    it("should halt on missing decision_id", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: 10,
          trigger_replan: false,
          trigger_rollback: false,
          trigger_halt: false,
          replan_action: ReplanTrigger.CONTINUE,
          reason: "Test",
          is_repeated_failure: false,
        },
        rollback_feasible: false,
        owner_id: ownerId,
        decision_id: "", // Missing
      });

      expect(result.action).toBe(FeedbackAction.HALT);
    });

    it("should halt on missing owner_id", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: 10,
          trigger_replan: false,
          trigger_rollback: false,
          trigger_halt: false,
          replan_action: ReplanTrigger.CONTINUE,
          reason: "Test",
          is_repeated_failure: false,
        },
        rollback_feasible: false,
        owner_id: "", // Missing
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.HALT);
    });
  });

  describe("Helper Methods", () => {
    it("requiresApproval should return true for REPLAN", () => {
      expect(feedbackLoop.requiresApproval(FeedbackAction.REPLAN)).toBe(true);
    });

    it("requiresApproval should return true for ROLLBACK", () => {
      expect(feedbackLoop.requiresApproval(FeedbackAction.ROLLBACK)).toBe(true);
    });

    it("requiresApproval should return true for HALT", () => {
      expect(feedbackLoop.requiresApproval(FeedbackAction.HALT)).toBe(true);
    });

    it("requiresApproval should return false for CONTINUE", () => {
      expect(feedbackLoop.requiresApproval(FeedbackAction.CONTINUE)).toBe(false);
    });

    it("mapToStateTransition should map CONTINUE to READY", () => {
      const state = feedbackLoop.mapToStateTransition(FeedbackAction.CONTINUE);
      expect(state).toBe("READY");
    });

    it("mapToStateTransition should map REPLAN to READY", () => {
      const state = feedbackLoop.mapToStateTransition(FeedbackAction.REPLAN);
      expect(state).toBe("READY");
    });

    it("mapToStateTransition should map ROLLBACK to BLOCKED", () => {
      const state = feedbackLoop.mapToStateTransition(FeedbackAction.ROLLBACK);
      expect(state).toBe("BLOCKED");
    });

    it("mapToStateTransition should map HALT to BLOCKED", () => {
      const state = feedbackLoop.mapToStateTransition(FeedbackAction.HALT);
      expect(state).toBe("BLOCKED");
    });

    it("getEscalationPriority should return 0 for CONTINUE", () => {
      const result = {
        action: FeedbackAction.CONTINUE,
        reason: "test",
        escalation_required: false,
        requires_owner_approval: false,
      };
      expect(feedbackLoop.getEscalationPriority(result)).toBe(0);
    });

    it("getEscalationPriority should return 1 for REPLAN", () => {
      const result = {
        action: FeedbackAction.REPLAN,
        reason: "test",
        escalation_required: true,
        requires_owner_approval: true,
      };
      expect(feedbackLoop.getEscalationPriority(result)).toBe(1);
    });

    it("getEscalationPriority should return 2 for ROLLBACK", () => {
      const result = {
        action: FeedbackAction.ROLLBACK,
        reason: "test",
        escalation_required: true,
        requires_owner_approval: true,
      };
      expect(feedbackLoop.getEscalationPriority(result)).toBe(2);
    });

    it("getEscalationPriority should return 3 for HALT", () => {
      const result = {
        action: FeedbackAction.HALT,
        reason: "test",
        escalation_required: true,
        requires_owner_approval: true,
      };
      expect(feedbackLoop.getEscalationPriority(result)).toBe(3);
    });
  });

  describe("Action Routing Logic", () => {
    it("should route correctly: no replan → CONTINUE", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: 8,
          trigger_replan: false,
          trigger_rollback: false,
          trigger_halt: false,
          replan_action: ReplanTrigger.CONTINUE,
          reason: "Good performance",
          is_repeated_failure: false,
        },
        rollback_feasible: false,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.CONTINUE);
    });

    it("should route correctly: replan + feasible → ROLLBACK", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -5,
          trigger_replan: true,
          trigger_rollback: true,
          trigger_halt: false,
          replan_action: ReplanTrigger.ROLLBACK,
          reason: "Rollback available",
          is_repeated_failure: false,
        },
        rollback_feasible: true,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.ROLLBACK);
    });

    it("should route correctly: replan + not feasible → REPLAN", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -12,
          trigger_replan: true,
          trigger_rollback: false,
          trigger_halt: false,
          replan_action: ReplanTrigger.REPLAN,
          reason: "Replan needed",
          is_repeated_failure: false,
        },
        rollback_feasible: false,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.REPLAN);
    });

    it("should route correctly: halt → HALT", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -20,
          trigger_replan: true,
          trigger_rollback: true,
          trigger_halt: true,
          replan_action: ReplanTrigger.HALT,
          reason: "Repeated failures blocked",
          is_repeated_failure: true,
        },
        rollback_feasible: true,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.HALT);
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce same result for identical inputs", () => {
      const input = {
        variance_result: {
          action_id: actionId,
          variance_pct: -10,
          trigger_replan: true,
          trigger_rollback: true,
          trigger_halt: false,
          replan_action: ReplanTrigger.ROLLBACK,
          reason: "Test",
          is_repeated_failure: false,
        },
        rollback_feasible: true,
        owner_id: ownerId,
        decision_id: decisionId,
      };

      const result1 = feedbackLoop.determineFeedback(input);
      const result2 = feedbackLoop.determineFeedback(input);

      expect(result1.action).toBe(result2.action);
      expect(result1.reason).toBe(result2.reason);
      expect(result1.escalation_required).toBe(result2.escalation_required);
    });
  });

  describe("Edge Cases", () => {
    it("should handle rollback offered but replan not triggered", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: 5,
          trigger_replan: false, // No replan
          trigger_rollback: true, // Rollback offered anyway
          trigger_halt: false,
          replan_action: ReplanTrigger.CONTINUE,
          reason: "No action needed",
          is_repeated_failure: false,
        },
        rollback_feasible: true,
        owner_id: ownerId,
        decision_id: decisionId,
      });

      // Should continue, not rollback (rollback only offered if replan triggered)
      expect(result.action).toBe(FeedbackAction.CONTINUE);
    });

    it("should not offer rollback if replan triggered but rollback not in variance_result", () => {
      const result = feedbackLoop.determineFeedback({
        variance_result: {
          action_id: actionId,
          variance_pct: -10,
          trigger_replan: true,
          trigger_rollback: false, // Not offered in variance result
          trigger_halt: false,
          replan_action: ReplanTrigger.REPLAN,
          reason: "Replan triggered",
          is_repeated_failure: false,
        },
        rollback_feasible: true, // Even if feasible
        owner_id: ownerId,
        decision_id: decisionId,
      });

      expect(result.action).toBe(FeedbackAction.REPLAN);
    });
  });
});
