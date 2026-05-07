import { logger } from "@/infra/logger";

/**
 * ReplayFailureHandler: Block unsafe decisions if replay fails
 * Phase 3 critical requirement: Failed replay must not proceed silently
 */
export class ReplayFailureHandler {
  /**
   * Handle replay failure
   * Determines if operation should proceed or fail closed
   */
  static handleReplayFailure(
    context: {
      aggregateId: string;
      aggregateType: string;
      operation: string; // "read", "update", "approve", etc.
      error: Error;
    },
    options: {
      allowFallback: boolean; // If false, fail closed
      blockUpdateOperations: boolean; // Block all writes if replay fails
    } = { allowFallback: false, blockUpdateOperations: true }
  ): void {
    logger.error("ReplayFailureHandler: Replay failed", {
      aggregateId: context.aggregateId,
      aggregateType: context.aggregateType,
      operation: context.operation,
      error: context.error.message,
    });

    // Update operations must always block on replay failure
    if (options.blockUpdateOperations && this.isUpdateOperation(context.operation)) {
      throw new Error(
        `Cannot safely ${context.operation} ${context.aggregateType}: replay failed. ` +
          `System cannot verify aggregate state. Failing closed to prevent data loss.`
      );
    }

    // If fallback not allowed, fail closed for all operations
    if (!options.allowFallback) {
      throw new Error(
        `Replay verification failed for ${context.aggregateType} ${context.aggregateId}. ` +
        `Cannot proceed with ${context.operation} without reliable state reconstruction. ` +
        `This may indicate event corruption or snapshot issues.`
      );
    }

    // Fallback allowed: log and continue (only for read operations)
    if (this.isReadOperation(context.operation)) {
      logger.warn("ReplayFailureHandler: Proceeding with fallback (read-only operation)", {
        aggregateId: context.aggregateId,
        operation: context.operation,
      });
    } else {
      throw new Error(
        `Cannot proceed with ${context.operation}: replay failure and fallback not allowed`
      );
    }
  }

  /**
   * Check if operation is read-only
   */
  private static isReadOperation(operation: string): boolean {
    return ["read", "get", "list", "query"].includes(operation.toLowerCase());
  }

  /**
   * Check if operation modifies state
   */
  private static isUpdateOperation(operation: string): boolean {
    return [
      "create",
      "update",
      "delete",
      "approve",
      "reject",
      "submit",
      "complete",
      "verify",
    ].includes(operation.toLowerCase());
  }

  /**
   * Get safe operation mode based on replay state
   */
  static getSafeOperationMode(
    replayResult: {
      usedSnapshot: boolean;
      eventCount: number;
      state: Record<string, unknown>;
    }
  ): "fully_trusted" | "snapshot_backed" | "uncertain" {
    // Fully trusted: full replay with many events
    if (!replayResult.usedSnapshot && replayResult.eventCount > 0) {
      return "fully_trusted";
    }

    // Snapshot backed: snapshot found and recent
    if (replayResult.usedSnapshot) {
      return "snapshot_backed";
    }

    // Uncertain: minimal events or empty state
    return "uncertain";
  }
}
