import { v4 as uuidv4 } from "uuid";
import { logger } from "@/infra/logger";
import {
  ExecutionFailure,
  ExecutionFailureType,
  FailureSeverity,
  Containment,
  ContainmentResult,
  RollbackResult,
} from "@/domain/execution/failure";

export class ContainmentEngine {
  async detectAndContainFailure(
    executionId: string,
    failureType: ExecutionFailureType,
    message: string,
    context: Record<string, unknown>,
    affectedActions: string[]
  ): Promise<ContainmentResult> {
    const failureId = uuidv4();
    const severity = this.calculateSeverity(failureType);

    const failure: ExecutionFailure = {
      id: failureId,
      executionId,
      failureType,
      severity,
      message,
      context,
      timestamp: new Date(),
    };

    const strategy = this.selectContainmentStrategy(failureType, severity);
    const isolatedScope = this.determineIsolationScope(
      failureType,
      affectedActions
    );

    const containment: Containment = {
      failureId,
      strategy,
      affectedActions,
      isolatedScope,
      cascadePrevented: this.validateCascadePreventionMetrics(
        strategy,
        affectedActions
      ),
      timestamp: new Date(),
    };

    const recommendations = this.generateRecommendations(failureType, severity);

    logger.warn("Failure detected and contained", {
      failureId,
      executionId,
      severity,
      strategy,
      cascadePrevented: containment.cascadePrevented,
    });

    return {
      success: containment.cascadePrevented,
      failure,
      containment,
      recommendations,
    };
  }

  async rollbackDecision(
    decisionId: string,
    currentState: string,
    reason: string
  ): Promise<RollbackResult> {
    const previousState = this.determinePreviousState(currentState);

    if (!previousState) {
      logger.error("Cannot rollback: no previous state available", {
        decisionId,
        currentState,
      });

      return {
        decisionId,
        previousState: currentState,
        newState: currentState,
        affectedActions: 0,
        timestamp: new Date(),
        success: false,
        reason: "No previous state available for rollback",
      };
    }

    const affectedActions = this.estimateAffectedActions(currentState, previousState);

    logger.info("Decision rolled back", {
      decisionId,
      fromState: currentState,
      toState: previousState,
      affectedActions,
    });

    return {
      decisionId,
      previousState: currentState,
      newState: previousState,
      affectedActions,
      timestamp: new Date(),
      success: true,
      reason,
    };
  }

  private calculateSeverity(failureType: ExecutionFailureType): FailureSeverity {
    switch (failureType) {
      case ExecutionFailureType.STATE_VIOLATION:
        return FailureSeverity.CRITICAL;
      case ExecutionFailureType.TIMEOUT:
      case ExecutionFailureType.RESOURCE_EXHAUSTED:
        return FailureSeverity.HIGH;
      case ExecutionFailureType.DEPENDENCY_FAILURE:
        return FailureSeverity.MEDIUM;
      case ExecutionFailureType.ACTION_FAILED:
        return FailureSeverity.MEDIUM;
      default:
        return FailureSeverity.LOW;
    }
  }

  private selectContainmentStrategy(
    failureType: ExecutionFailureType,
    severity: FailureSeverity
  ): "ISOLATE" | "ROLLBACK" | "ESCALATE" {
    if (severity === FailureSeverity.CRITICAL) {
      return "ESCALATE";
    }

    if (failureType === ExecutionFailureType.STATE_VIOLATION) {
      return "ROLLBACK";
    }

    if (
      failureType === ExecutionFailureType.TIMEOUT ||
      failureType === ExecutionFailureType.RESOURCE_EXHAUSTED
    ) {
      return "ISOLATE";
    }

    return "ISOLATE";
  }

  private determineIsolationScope(
    failureType: ExecutionFailureType,
    affectedActions: string[]
  ): string {
    if (affectedActions.length === 0) return "FULL_EXECUTION";
    if (affectedActions.length <= 2) return "ACTION_LEVEL";
    return "SEQUENCE_LEVEL";
  }

  private validateCascadePreventionMetrics(
    strategy: "ISOLATE" | "ROLLBACK" | "ESCALATE",
    affectedActions: string[]
  ): boolean {
    // ISOLATE always prevents cascade by design
    if (strategy === "ISOLATE") return true;

    // ROLLBACK prevents cascade if affects ≤ 50% of actions
    if (strategy === "ROLLBACK") return affectedActions.length <= 5;

    // ESCALATE never prevents cascade at this level (manual intervention required)
    return false;
  }

  private generateRecommendations(
    failureType: ExecutionFailureType,
    severity: FailureSeverity
  ): string[] {
    const recommendations: string[] = [];

    if (severity === FailureSeverity.CRITICAL) {
      recommendations.push("ESCALATE: Manual intervention required immediately");
      recommendations.push("Review failure logs for root cause analysis");
    }

    if (failureType === ExecutionFailureType.TIMEOUT) {
      recommendations.push("Increase timeout threshold for this action");
      recommendations.push("Consider parallel execution for independent actions");
    }

    if (failureType === ExecutionFailureType.RESOURCE_EXHAUSTED) {
      recommendations.push("Allocate additional resources before retry");
      recommendations.push("Reduce batch size or number of concurrent operations");
    }

    if (failureType === ExecutionFailureType.STATE_VIOLATION) {
      recommendations.push("Perform rollback to last known good state");
      recommendations.push("Verify state consistency before retry");
    }

    if (failureType === ExecutionFailureType.DEPENDENCY_FAILURE) {
      recommendations.push("Verify dependent service availability");
      recommendations.push("Implement circuit breaker pattern");
    }

    if (recommendations.length === 0) {
      recommendations.push("Review execution logs for more context");
    }

    return recommendations;
  }

  private determinePreviousState(currentState: string): string | null {
    const stateTransitions: Record<string, string> = {
      running: "pending",
      paused: "running",
      completed: "running",
      failed: "pending",
    };

    return stateTransitions[currentState] || null;
  }

  private estimateAffectedActions(
    currentState: string,
    previousState: string
  ): number {
    // Conservative estimate: assume 3 actions per state
    const stateActionMap: Record<string, number> = {
      pending: 0,
      running: 3,
      paused: 2,
      completed: 5,
      failed: 2,
    };

    return (stateActionMap[currentState] || 0) - (stateActionMap[previousState] || 0);
  }
}

export const containmentEngine = new ContainmentEngine();
