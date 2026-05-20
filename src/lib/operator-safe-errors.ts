/**
 * Operator-Safe Error Message Handler
 *
 * Converts technical errors into clear, actionable operator-safe messages.
 * Rules:
 * - No technical jargon (Prisma, DB, UUID, stack-like phrasing)
 * - Always include: what happened + whether data is safe + what to do next
 * - Never panic-inducing language
 * - No dead-end errors
 */

import { RuntimeError } from "@/runtime/runtime-errors";

export interface OperatorSafeErrorResponse {
  success: false;
  error: string;
  recovery: string;
  shouldRetry: boolean;
}

/**
 * Convert any error to an operator-safe message
 *
 * @param error - The error that occurred
 * @param context - Brief context about what was happening
 * @returns Operator-safe error response
 */
export function toOperatorSafeError(
  error: unknown,
  context: "decision" | "action" | "form" | "load" | "save" | "network"
): OperatorSafeErrorResponse {
  // If it's already a RuntimeError with operator_safe_message, use that
  if (error instanceof RuntimeError) {
    return {
      success: false,
      error: error.metadata.operator_safe_message,
      recovery: error.metadata.recovery_suggestion || getDefaultRecovery(context),
      shouldRetry: error.metadata.retryable !== "NOT_RETRYABLE",
    };
  }

  // If it's a standard Error, map it to operator-safe message
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (message.includes("fetch") || message.includes("network")) {
      return {
        success: false,
        error: "Couldn't connect to the server. Checking connection...",
        recovery: "Automatic retry will try again in 5 seconds. Check your internet connection.",
        shouldRetry: true,
      };
    }

    // Permission errors
    if (message.includes("permission") || message.includes("unauthorized")) {
      return {
        success: false,
        error: "You don't have permission to do this.",
        recovery: "Contact your workspace admin to request access.",
        shouldRetry: false,
      };
    }

    // Validation errors (hide details, ask user to check entries)
    if (message.includes("validation") || message.includes("invalid")) {
      return {
        success: false,
        error: "That didn't look right. Please check your entries.",
        recovery: "Review your inputs and try again. Look for any required fields marked with *",
        shouldRetry: false,
      };
    }

    // Timeout errors
    if (message.includes("timeout") || message.includes("took too long")) {
      return {
        success: false,
        error: "That took too long. Please try again.",
        recovery: "This sometimes happens with slow connections. Automatic retry will attempt again.",
        shouldRetry: true,
      };
    }

    // Conflict/duplicate errors
    if (message.includes("conflict") || message.includes("duplicate")) {
      return {
        success: false,
        error: "This action is already being processed.",
        recovery: "Your previous submission is still being processed. Please wait a moment before retrying.",
        shouldRetry: false,
      };
    }

    // Database/server errors (generic, non-technical)
    if (message.includes("database") || message.includes("server") || message.includes("500")) {
      return {
        success: false,
        error: "Server is having trouble. We're working on it.",
        recovery: "Automatic retry will try again. If this keeps happening, contact support.",
        shouldRetry: true,
      };
    }

    // Generic fallback based on context
    return {
      success: false,
      error: getContextualErrorMessage(context),
      recovery: getDefaultRecovery(context),
      shouldRetry: shouldRetryForContext(context),
    };
  }

  // Unknown error type
  return {
    success: false,
    error: getContextualErrorMessage(context),
    recovery: getDefaultRecovery(context),
    shouldRetry: shouldRetryForContext(context),
  };
}

/**
 * Get a contextual error message based on what was happening
 */
function getContextualErrorMessage(
  context: "decision" | "action" | "form" | "load" | "save" | "network"
): string {
  const messages: Record<typeof context, string> = {
    decision: "Your decision wasn't saved. Try again.",
    action: "Couldn't process this action. Please try again.",
    form: "Couldn't save the form. Please try again.",
    load: "Couldn't load that data. Please refresh and try again.",
    save: "Couldn't save your changes. Please try again.",
    network: "Network error. Check your connection and try again.",
  };
  return messages[context];
}

/**
 * Get recovery guidance based on context
 */
function getDefaultRecovery(
  context: "decision" | "action" | "form" | "load" | "save" | "network"
): string {
  const recovery: Record<typeof context, string> = {
    decision:
      "Your decision wasn't saved. Click the button again to retry. " +
      "The system prevents duplicate submissions, so it's safe.",
    action:
      "This action couldn't be processed. Refresh the page and try again. " +
      "Your data is safe.",
    form:
      "Your form data is still here. Fix any errors and click submit again.",
    load:
      "Try refreshing the page. If it keeps failing, check your internet connection.",
    save:
      "Try saving again. If this keeps happening, contact support with the time this occurred.",
    network:
      "This usually means an internet issue. Check your connection and try again. " +
      "Automatic retry will happen shortly.",
  };
  return recovery[context];
}

/**
 * Determine if this error type is safe to retry
 */
function shouldRetryForContext(
  context: "decision" | "action" | "form" | "load" | "save" | "network"
): boolean {
  // These contexts are safe to retry
  const retryable = ["decision", "action", "load", "network", "save"];
  return retryable.includes(context);
}

/**
 * Format error for display in UI
 * Shows error message + recovery hint
 */
export function formatOperatorErrorDisplay(response: OperatorSafeErrorResponse): {
  title: string;
  message: string;
  hint: string;
  showRetry: boolean;
} {
  return {
    title: "Something went wrong",
    message: response.error,
    hint: response.recovery,
    showRetry: response.shouldRetry,
  };
}
