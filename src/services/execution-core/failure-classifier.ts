import { logger } from "@/infra/logger";
import {
  FailureClass,
  FailureClassificationResult,
  classifyError,
  getFailureReason,
  FAILURE_PATTERNS,
} from "@/domain/execution/failure-classification";

export class FailureClassifier {
  /**
   * Classify failure and determine recovery strategy
   */
  classifyFailure(error_message: string, error_code?: string): FailureClassificationResult {
    const failure_class = classifyError(error_message);
    const reason = getFailureReason(error_message);

    const should_retry = failure_class !== FailureClass.FATAL;
    const should_rollback = failure_class === FailureClass.FATAL;

    const suggested_action = this.getSuggestedAction(failure_class);

    const result: FailureClassificationResult = {
      failure_class,
      error_message,
      reason,
      should_retry,
      should_rollback,
      suggested_action,
    };

    logger.warn("Failure classified", {
      failure_class,
      should_retry,
      should_rollback,
      error_code,
    });

    return result;
  }

  /**
   * Get suggested action for failure class
   */
  private getSuggestedAction(failure_class: FailureClass): string {
    switch (failure_class) {
      case FailureClass.RECOVERABLE:
        return "Retry immediately or after brief delay";
      case FailureClass.RETRYABLE:
        return "Retry with exponential backoff";
      case FailureClass.FATAL:
        return "Trigger rollback or manual intervention";
      default:
        return "Unknown action";
    }
  }

  /**
   * Determine if action should be retried
   */
  shouldRetry(failure_class: FailureClass, attempt_count: number, max_attempts: number): boolean {
    if (failure_class === FailureClass.FATAL) {
      return false;
    }

    return attempt_count < max_attempts;
  }

  /**
   * Determine if action should trigger rollback
   */
  shouldRollback(failure_class: FailureClass): boolean {
    return failure_class === FailureClass.FATAL;
  }

  /**
   * Get recovery window (time to wait before retry)
   */
  getRecoveryWindow(failure_class: FailureClass, attempt_count: number): number {
    // attempt_count is 1-indexed
    switch (failure_class) {
      case FailureClass.RECOVERABLE:
        return 1000 * Math.pow(2, Math.min(attempt_count - 1, 3)); // 1s, 2s, 4s, 8s
      case FailureClass.RETRYABLE:
        return 5000 * Math.pow(2, Math.min(attempt_count - 1, 3)); // 5s, 10s, 20s, 40s
      case FailureClass.FATAL:
        return 0; // No retry
      default:
        return 0;
    }
  }

  /**
   * Validate failure classification
   */
  validateClassification(result: FailureClassificationResult): boolean {
    if (!result.failure_class) {
      logger.warn("Invalid classification: missing failure_class");
      return false;
    }

    if (!Object.values(FailureClass).includes(result.failure_class)) {
      logger.warn("Invalid classification: unknown failure_class", {
        failure_class: result.failure_class,
      });
      return false;
    }

    // Fatal failures must trigger rollback
    if (
      result.failure_class === FailureClass.FATAL &&
      !result.should_rollback
    ) {
      logger.warn("Invalid classification: fatal failure without rollback");
      return false;
    }

    // Non-fatal failures should not rollback immediately
    if (
      result.failure_class !== FailureClass.FATAL &&
      result.should_rollback
    ) {
      logger.warn("Invalid classification: non-fatal failure with rollback");
      return false;
    }

    return true;
  }

  /**
   * Get all matching patterns for error
   */
  getMatchingPatterns(error_message: string): Array<{ pattern: string; class: FailureClass; reason: string }> {
    const error_lower = error_message.toLowerCase();
    const matching: Array<{ pattern: string; class: FailureClass; reason: string }> = [];

    for (const pattern of FAILURE_PATTERNS) {
      const regex = new RegExp(pattern.pattern, "i");
      if (regex.test(error_lower)) {
        matching.push({
          pattern: pattern.pattern,
          class: pattern.class,
          reason: pattern.reason,
        });
      }
    }

    return matching;
  }

  /**
   * Get all patterns for a specific failure class
   */
  getPatternsForClass(failure_class: FailureClass): Array<{ pattern: string; reason: string }> {
    return FAILURE_PATTERNS.filter((p) => p.class === failure_class).map((p) => ({
      pattern: p.pattern,
      reason: p.reason,
    }));
  }
}

export const failureClassifier = new FailureClassifier();
