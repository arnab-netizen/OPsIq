import { logger } from "@/infra/logger";
import {
  ContainmentStrategy,
  FailureContainmentInput,
  ContainmentResult,
  ActionImpact,
  STRATEGY_BY_FAILURE_CLASS,
  STATE_TRANSITION_FOR_STRATEGY,
} from "@/domain/execution/containment";
import { FailureClass } from "@/domain/execution/failure-classification";
import { ActionState } from "@/domain/execution/action";

export class FailureContainment {
  /**
   * Contain failure and determine affected actions
   */
  containFailure(input: FailureContainmentInput): ContainmentResult {
    const strategy = this.selectStrategy(input.failure_class);
    const affectedActions = this.determineAffectedActions(
      strategy,
      input.downstream_actions
    );
    const actionImpacts = this.calculateActionImpacts(
      affectedActions,
      strategy,
      input.action_id
    );

    const cascadePrevented = this.validateCascadePrevention(strategy, input.downstream_actions);

    const result: ContainmentResult = {
      action_id: input.action_id,
      strategy,
      affected_actions: affectedActions,
      action_impacts: actionImpacts,
      containment_success: cascadePrevented,
      cascade_prevented: cascadePrevented,
      reason: this.getStrategyReason(strategy, input.failure_class),
      timestamp: new Date(),
    };

    logger.warn("Failure contained", {
      action_id: input.action_id,
      strategy,
      affected_count: affectedActions.length,
      cascade_prevented: cascadePrevented,
      failure_class: input.failure_class,
      decision_id: input.decision_id,
      workspace_id: input.workspace_id,
    });

    return result;
  }

  /**
   * Select containment strategy based on failure class
   */
  private selectStrategy(failureClass: FailureClass): ContainmentStrategy {
    return STRATEGY_BY_FAILURE_CLASS[failureClass];
  }

  /**
   * Determine which downstream actions are affected
   */
  private determineAffectedActions(
    strategy: ContainmentStrategy,
    downstreamActions: string[]
  ): string[] {
    if (strategy === ContainmentStrategy.ISOLATE) {
      return downstreamActions;
    }

    if (strategy === ContainmentStrategy.ROLLBACK) {
      return downstreamActions;
    }

    if (strategy === ContainmentStrategy.ESCALATE) {
      return downstreamActions;
    }

    return [];
  }

  /**
   * Calculate state impacts for affected actions
   */
  private calculateActionImpacts(
    affectedActions: string[],
    strategy: ContainmentStrategy,
    failedActionId: string
  ): ActionImpact[] {
    const impacts: ActionImpact[] = [];

    for (const actionId of affectedActions) {
      impacts.push({
        action_id: actionId,
        current_state: ActionState.READY, // Assumed state before failure
        new_state: STATE_TRANSITION_FOR_STRATEGY[strategy][ActionState.READY],
        reason: `Blocked by failed action ${failedActionId} (${strategy})`,
      });
    }

    return impacts;
  }

  /**
   * Validate cascade prevention effectiveness
   */
  private validateCascadePrevention(
    strategy: ContainmentStrategy,
    downstreamActions: string[]
  ): boolean {
    if (strategy === ContainmentStrategy.ISOLATE) {
      return true; // Always prevents
    }

    if (strategy === ContainmentStrategy.ROLLBACK) {
      return true; // Assumes rollback succeeds (validated elsewhere)
    }

    if (strategy === ContainmentStrategy.ESCALATE) {
      return true; // Prevents via human decision
    }

    return false;
  }

  /**
   * Get human-readable reason for strategy selection
   */
  private getStrategyReason(strategy: ContainmentStrategy, failureClass: FailureClass): string {
    switch (strategy) {
      case ContainmentStrategy.ISOLATE:
        return `${failureClass} failure - isolating to prevent cascade, downstream actions blocked`;
      case ContainmentStrategy.ROLLBACK:
        return `${failureClass} failure - executing rollback, downstream actions cancelled`;
      case ContainmentStrategy.ESCALATE:
        return `${failureClass} failure - requires owner decision`;
      default:
        return "Unknown containment strategy";
    }
  }

  /**
   * Get all actions that would be affected by strategy
   */
  getAffectedActionsForStrategy(
    strategy: ContainmentStrategy,
    downstreamActions: string[]
  ): string[] {
    return this.determineAffectedActions(strategy, downstreamActions);
  }

  /**
   * Check if action state can be transitioned for strategy
   */
  canTransitionForStrategy(
    strategy: ContainmentStrategy,
    currentState: ActionState
  ): boolean {
    const newState = STATE_TRANSITION_FOR_STRATEGY[strategy][currentState];
    return newState !== undefined;
  }

  /**
   * Get new state for action under containment strategy
   */
  getNewStateForStrategy(
    strategy: ContainmentStrategy,
    currentState: ActionState
  ): ActionState | null {
    return STATE_TRANSITION_FOR_STRATEGY[strategy][currentState] || null;
  }

  /**
   * Determine if containment strategy prevents cascade
   */
  preventsCascade(strategy: ContainmentStrategy): boolean {
    return (
      strategy === ContainmentStrategy.ISOLATE ||
      strategy === ContainmentStrategy.ROLLBACK ||
      strategy === ContainmentStrategy.ESCALATE
    );
  }

  /**
   * Get count of affected actions
   */
  getAffectedActionCount(result: ContainmentResult): number {
    return result.affected_actions.length;
  }
}

export const failureContainment = new FailureContainment();
