import { logger } from "@/infra/logger";
import {
  OutputFormatterInput,
  FormattedOutput,
  OutputMode,
} from "@/domain/outcome/output";
import { FeedbackAction } from "@/domain/outcome/feedback";

export class OutputFormatter {
  /**
   * Format outcome results for different user modes
   * Fail-closed: invalid input returns generic message
   */
  formatOutput(input: OutputFormatterInput): FormattedOutput {
    // Validate input
    if (!input.impact_result || !input.confidence_update || !input.feedback_action) {
      logger.warn("Output formatting failed validation", {
        has_impact: !!input.impact_result,
        has_confidence: !!input.confidence_update,
        has_feedback: !!input.feedback_action,
      });

      return {
        mode: input.output_mode || OutputMode.NOVICE,
        message: "Unable to format output: missing required data",
        action: "UNKNOWN",
      };
    }

    const mode = input.output_mode || OutputMode.NOVICE;

    let message: string;
    switch (mode) {
      case OutputMode.NOVICE:
        message = this.formatNovice(input);
        break;
      case OutputMode.OPERATOR:
        message = this.formatOperator(input);
        break;
      case OutputMode.EXECUTIVE:
        message = this.formatExecutive(input);
        break;
      default:
        message = "Unknown output mode";
    }

    logger.info("Output formatted", {
      mode,
      action: input.feedback_action.action,
      variance_pct: input.impact_result.variance_pct,
      confidence_change: input.confidence_update.confidence_change,
    });

    return {
      mode,
      message,
      action: input.feedback_action.action,
    };
  }

  /**
   * NOVICE: Plain language, minimal numbers
   */
  private formatNovice(input: OutputFormatterInput): string {
    const outcome = this.getOutcomeDescription(input.impact_result.variance_pct);
    const confidence = input.confidence_update.new_confidence.toFixed(0);
    const action = this.getActionDescription(input.feedback_action.action);

    return `Your action ${outcome}. Confidence is now ${confidence}%. ${action}`;
  }

  /**
   * OPERATOR: Detailed metrics, clear changes
   */
  private formatOperator(input: OutputFormatterInput): string {
    const variance = input.impact_result.variance_pct.toFixed(1);
    const before = (
      input.confidence_update.new_confidence - input.confidence_update.confidence_change
    ).toFixed(0);
    const after = input.confidence_update.new_confidence.toFixed(0);
    const change = input.confidence_update.confidence_change > 0 ? "↑" : "↓";
    const action = this.getActionDescription(input.feedback_action.action);

    return (
      `Variance: ${variance > 0 ? "+" : ""}${variance}%. ` +
      `Confidence: ${before}% ${change} ${after}%. ` +
      `Next: ${action}`
    );
  }

  /**
   * EXECUTIVE: Business impact, strategic recommendation
   */
  private formatExecutive(input: OutputFormatterInput): string {
    const roi = Math.abs(input.impact_result.variance_pct).toFixed(0);
    const direction =
      input.impact_result.variance_pct > 0 ? "improved" : "declined";
    const recommendation = this.getExecutiveRecommendation(input.feedback_action.action);

    return `ROI ${direction} ${roi}%. Recommend ${recommendation}.`;
  }

  /**
   * Get plain language outcome description
   */
  private getOutcomeDescription(variance_pct: number): string {
    if (variance_pct > 10) return "delivered excellent results";
    if (variance_pct > 5) return "delivered good results";
    if (variance_pct > 0) return "delivered positive results";
    if (variance_pct === 0) return "was neutral";
    if (variance_pct > -5) return "underperformed slightly";
    if (variance_pct > -10) return "underperformed";
    return "failed significantly";
  }

  /**
   * Get action description for user
   */
  private getActionDescription(action: string): string {
    switch (action) {
      case FeedbackAction.CONTINUE:
        return "Continue with current strategy.";
      case FeedbackAction.REPLAN:
        return "Replan strategy recommended.";
      case FeedbackAction.ROLLBACK:
        return "Consider rollback of recent changes.";
      case FeedbackAction.HALT:
        return "Action halted. Owner review required.";
      default:
        return "Action pending review.";
    }
  }

  /**
   * Get executive-level recommendation
   */
  private getExecutiveRecommendation(action: string): string {
    switch (action) {
      case FeedbackAction.CONTINUE:
        return "continue strategy";
      case FeedbackAction.REPLAN:
        return "pivot approach";
      case FeedbackAction.ROLLBACK:
        return "rollback decision";
      case FeedbackAction.HALT:
        return "stop and escalate";
      default:
        return "review decision";
    }
  }

  /**
   * Check if output is deterministic (same input = same output)
   */
  isDeterministic(
    output1: FormattedOutput,
    output2: FormattedOutput,
    sameMode: boolean
  ): boolean {
    if (!sameMode) return true; // Different modes expected to differ
    return output1.message === output2.message && output1.action === output2.action;
  }
}

export const outputFormatter = new OutputFormatter();
