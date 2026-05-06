export enum FailureClass {
  RECOVERABLE = "RECOVERABLE",
  RETRYABLE = "RETRYABLE",
  FATAL = "FATAL",
}

export interface FailureClassificationResult {
  failure_class: FailureClass;
  error_message: string;
  reason: string;
  should_retry: boolean;
  should_rollback: boolean;
  suggested_action: string;
}

export interface FailurePattern {
  pattern: string; // regex or substring to match
  class: FailureClass;
  reason: string;
}

export const FAILURE_PATTERNS: FailurePattern[] = [
  // RETRYABLE (more specific patterns first - must come before generic RECOVERABLE patterns)
  {
    pattern: "lock wait timeout|lock contention",
    class: FailureClass.RETRYABLE,
    reason: "Database lock contention, retry with exponential backoff",
  },
  {
    pattern: "rate limit|too many requests|429",
    class: FailureClass.RETRYABLE,
    reason: "Rate limited, retry with exponential backoff",
  },
  {
    pattern: "deadlock|circular dependency",
    class: FailureClass.RETRYABLE,
    reason: "Deadlock detected, retry may resolve",
  },

  // RECOVERABLE (transient, may succeed on retry)
  {
    pattern: "ECONNREFUSED|ENOTFOUND|ETIMEDOUT",
    class: FailureClass.RECOVERABLE,
    reason: "Transient network failure, likely to succeed on retry",
  },
  {
    pattern: "temporarily unavailable|service unavailable",
    class: FailureClass.RECOVERABLE,
    reason: "Service temporarily unavailable, retry after delay",
  },
  {
    pattern: "connection reset|broken pipe",
    class: FailureClass.RECOVERABLE,
    reason: "Connection interrupted, likely transient",
  },
  {
    pattern: "timeout|timed out|deadline exceeded",
    class: FailureClass.RECOVERABLE,
    reason: "Operation timed out, may succeed with retry",
  },

  // FATAL (cannot recover, requires rollback or manual intervention)
  {
    pattern: "permission denied|forbidden|403|401|unauthorized|access denied",
    class: FailureClass.FATAL,
    reason: "Authorization failure, requires manual intervention",
  },
  {
    pattern: "not found|no such file|404",
    class: FailureClass.FATAL,
    reason: "Resource not found, cannot recover",
  },
  {
    pattern: "invalid argument|bad request|400",
    class: FailureClass.FATAL,
    reason: "Invalid input, same request will fail again",
  },
  {
    pattern: "schema mismatch|version incompatibility",
    class: FailureClass.FATAL,
    reason: "Data structure incompatibility, requires intervention",
  },
  {
    pattern: "resource deleted|already exists|constraint violation",
    class: FailureClass.FATAL,
    reason: "State conflict or constraint violation, cannot continue",
  },
];

export function classifyError(error_message: string): FailureClass {
  const error_lower = error_message.toLowerCase();

  for (const pattern of FAILURE_PATTERNS) {
    const regex = new RegExp(pattern.pattern, "i");
    if (regex.test(error_lower)) {
      return pattern.class;
    }
  }

  // Default to RETRYABLE if no pattern matches
  return FailureClass.RETRYABLE;
}

export function getFailureReason(error_message: string): string {
  const error_lower = error_message.toLowerCase();

  for (const pattern of FAILURE_PATTERNS) {
    const regex = new RegExp(pattern.pattern, "i");
    if (regex.test(error_lower)) {
      return pattern.reason;
    }
  }

  return "Unknown error, attempting retry";
}
