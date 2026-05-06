import { logger } from "@/infra/logger";
import {
  RollbackValidationInput,
  RollbackValidationResult,
  RollbackFeasibility,
  TERMINAL_STATES,
  STARTED_STATES,
  UNDOABLE_STATES,
} from "@/domain/execution/rollback";
import { ActionState } from "@/domain/execution/action";

export class RollbackValidator {
  /**
   * Validate rollback feasibility
   */
  validateRollback(input: RollbackValidationInput): RollbackValidationResult {
    const reasons: string[] = [];

    // Check if action is in terminal state
    if (TERMINAL_STATES.includes(input.action_state)) {
      reasons.push(`Action is in terminal state ${input.action_state}, cannot rollback`);
    }

    // Check if downstream actions have started
    const startedDownstream = input.downstream_actions.filter((a) =>
      STARTED_STATES.includes(a.state)
    );
    if (startedDownstream.length > 0) {
      reasons.push(
        `${startedDownstream.length} downstream action(s) already started, would break contract`
      );
    }

    // Check if rollback cost exceeds original investment
    if (input.rollback_plan.estimated_cost_dollars > input.original_investment_dollars) {
      reasons.push(
        `Rollback cost ($${input.rollback_plan.estimated_cost_dollars}) exceeds original investment ($${input.original_investment_dollars})`
      );
    }

    // Check if owner declined rollback
    if (input.owner_declined) {
      reasons.push("Owner explicitly declined rollback");
    }

    const canRollback = reasons.length === 0;
    const feasibility = this.calculateFeasibility(
      canRollback,
      input.rollback_plan.estimated_cost_dollars,
      input.original_investment_dollars
    );

    const result: RollbackValidationResult = {
      action_id: input.action_id,
      can_rollback: canRollback,
      reasons,
      rollback_feasibility: feasibility,
      estimated_cost_dollars: input.rollback_plan.estimated_cost_dollars,
      estimated_time_days: input.rollback_plan.estimated_time_days,
      recommendation: this.generateRecommendation(
        canRollback,
        feasibility,
        input.rollback_plan.estimated_cost_dollars,
        input.original_investment_dollars
      ),
      timestamp: new Date(),
    };

    logger.warn("Rollback validation completed", {
      action_id: input.action_id,
      can_rollback: canRollback,
      feasibility,
      reason_count: reasons.length,
    });

    return result;
  }

  /**
   * Calculate rollback feasibility level
   */
  private calculateFeasibility(
    canRollback: boolean,
    rollbackCost: number,
    originalInvestment: number
  ): RollbackFeasibility {
    if (!canRollback) {
      return RollbackFeasibility.IMPOSSIBLE;
    }

    const costRatio = rollbackCost / originalInvestment;

    if (costRatio >= 0.75) {
      return RollbackFeasibility.RISKY;
    }

    return RollbackFeasibility.SAFE;
  }

  /**
   * Generate recommendation based on validation result
   */
  private generateRecommendation(
    canRollback: boolean,
    feasibility: RollbackFeasibility,
    rollbackCost: number,
    originalInvestment: number
  ): string {
    if (!canRollback) {
      return "Rollback is not feasible. Consider escalating to owner for manual decision.";
    }

    if (feasibility === RollbackFeasibility.SAFE) {
      const costRatio = ((rollbackCost / originalInvestment) * 100).toFixed(1);
      return `Rollback is safe. Cost is ${costRatio}% of original investment. Proceed with rollback.`;
    }

    if (feasibility === RollbackFeasibility.RISKY) {
      const costRatio = ((rollbackCost / originalInvestment) * 100).toFixed(1);
      return `Rollback is risky. Cost is ${costRatio}% of original investment. Recommend owner decision.`;
    }

    return "Unable to determine rollback recommendation.";
  }

  /**
   * Check if action state allows rollback
   */
  canStateBeRolledBack(state: ActionState): boolean {
    return UNDOABLE_STATES.includes(state);
  }

  /**
   * Check if downstream actions are blocking rollback
   */
  areDownstreamActionsBlocking(
    downstreamActions: Array<{ action_id: string; state: ActionState }>
  ): boolean {
    return downstreamActions.some((a) => STARTED_STATES.includes(a.state));
  }

  /**
   * Get blocking downstream actions
   */
  getBlockingDownstreamActions(
    downstreamActions: Array<{ action_id: string; state: ActionState }>
  ): Array<{ action_id: string; state: ActionState }> {
    return downstreamActions.filter((a) => STARTED_STATES.includes(a.state));
  }

  /**
   * Check if rollback cost is justified
   */
  isRollbackCostJustified(rollbackCost: number, originalInvestment: number): boolean {
    return rollbackCost <= originalInvestment;
  }

  /**
   * Get cost-benefit ratio
   */
  getCostBenefitRatio(rollbackCost: number, originalInvestment: number): number {
    if (originalInvestment === 0) {
      return rollbackCost === 0 ? 0 : Infinity;
    }
    return rollbackCost / originalInvestment;
  }

  /**
   * Validate all rollback plan steps are present
   */
  validateRollbackPlanSteps(steps: Array<{ step_id: string; description: string }>): boolean {
    if (steps.length === 0) {
      return false;
    }

    return steps.every((step) => step.step_id && step.description && step.description.length > 0);
  }
}

export const rollbackValidator = new RollbackValidator();
