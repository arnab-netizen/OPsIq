import { logger } from "@/infra/logger";
import { FeedbackAction, FeedbackLoopInput, FeedbackLoopResult } from "@/domain/outcome/feedback";
import { ReplanTrigger } from "@/domain/outcome/variance";

export class FeedbackLoop {
  /**
   * Determine feedback action based on variance result and rollback feasibility
   * Routes: continue → replan → rollback → halt
   */
  determineFeedback(input: FeedbackLoopInput): FeedbackLoopResult {
    // Validate input
    if (!input.variance_result || !input.decision_id || !input.owner_id) {
      logger.warn("Feedback loop failed validation", {
        has_variance_result: !!input.variance_result,
        decision_id: input.decision_id,
        owner_id: input.owner_id,
      });

      return {
        action: FeedbackAction.HALT,
        reason: "Invalid input: variance result, decision_id, and owner_id required",
        escalation_required: true,
        requires_owner_approval: true,
      };
    }

    const variance_result = input.variance_result;

    // If halt is triggered, escalate immediately
    if (variance_result.trigger_halt) {
      return {
        action: FeedbackAction.HALT,
        reason: variance_result.reason,
        escalation_required: true,
        requires_owner_approval: true,
      };
    }

    // If no replan triggered, continue
    if (!variance_result.trigger_replan) {
      return {
        action: FeedbackAction.CONTINUE,
        reason: variance_result.reason,
        escalation_required: false,
        requires_owner_approval: false,
      };
    }

    // Replan is triggered
    // Check if rollback is also offered and feasible
    if (variance_result.trigger_rollback && input.rollback_feasible) {
      return {
        action: FeedbackAction.ROLLBACK,
        reason: `${variance_result.reason} Rollback is feasible and recommended.`,
        escalation_required: true, // Requires owner decision
        requires_owner_approval: true,
      };
    }

    // Replan without rollback option
    return {
      action: FeedbackAction.REPLAN,
      reason: `${variance_result.reason} Rollback not feasible. Recommending replan.`,
      escalation_required: true, // Requires owner decision
      requires_owner_approval: true,
    };
  }

  /**
   * Check if action requires owner approval
   */
  requiresApproval(action: FeedbackAction): boolean {
    return action === FeedbackAction.REPLAN ||
           action === FeedbackAction.ROLLBACK ||
           action === FeedbackAction.HALT;
  }

  /**
   * Map feedback action to ActionFSM state transition
   */
  mapToStateTransition(action: FeedbackAction): string {
    switch (action) {
      case FeedbackAction.CONTINUE:
        return "READY"; // Continue monitoring in ready state
      case FeedbackAction.REPLAN:
        return "READY"; // Back to ready for re-planning
      case FeedbackAction.ROLLBACK:
        return "BLOCKED"; // Blocked waiting for rollback
      case FeedbackAction.HALT:
        return "BLOCKED"; // Blocked pending escalation
      default:
        return "BLOCKED";
    }
  }

  /**
   * Get escalation priority (0=low, 3=critical)
   */
  getEscalationPriority(result: FeedbackLoopResult): number {
    if (result.action === FeedbackAction.HALT) return 3; // Critical
    if (result.action === FeedbackAction.ROLLBACK) return 2; // High
    if (result.action === FeedbackAction.REPLAN) return 1; // Medium
    return 0; // No escalation
  }
}

export const feedbackLoop = new FeedbackLoop();
