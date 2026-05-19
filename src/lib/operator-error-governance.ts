/**
 * Operator Error Governance
 *
 * Centralized error handling for all operator-facing surfaces.
 * Enforces:
 * - No technical jargon visible to operators
 * - No Prisma/DB/UUID terminology
 * - All errors include recovery guidance
 * - Safe logging separated from UI messages
 * - Automatic escalation triggers
 */

import { toOperatorSafeError } from "./operator-safe-errors";

export interface ErrorGovernanceContext {
  context:
    | "decision"
    | "action"
    | "form"
    | "load"
    | "save"
    | "network"
    | "mutation"
    | "auth"
    | "permission"
    | "validation";
  userId?: string;
  workspaceId?: string;
  resourceId?: string;
  timestamp?: Date;
}

export interface GovernedErrorResponse {
  operatorMessage: string;
  recovery: string;
  isRetryable: boolean;
  technicalDetails: string; // For logging only, never to operator
  shouldEscalate: boolean;
  escalationReason?: string;
}

/**
 * Classify and govern error response
 * Returns operator-safe message + separate technical details for logging
 */
export function classifyOperatorError(
  error: unknown,
  context: ErrorGovernanceContext
): GovernedErrorResponse {
  const safeError = toOperatorSafeError(error, context.context);
  const technicalDetails = extractTechnicalDetails(error);
  const shouldEscalate = determineShouldEscalate(error, context);

  return {
    operatorMessage: safeError.error,
    recovery: safeError.recovery,
    isRetryable: safeError.shouldRetry,
    technicalDetails,
    shouldEscalate,
    escalationReason: shouldEscalate ? getEscalationReason(error) : undefined,
  };
}

/**
 * Extract technical details for safe logging (NOT for operator display)
 */
function extractTechnicalDetails(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify({
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
  }
  return String(error);
}

/**
 * Determine if error should trigger escalation to support/eng
 */
function determineShouldEscalate(
  error: unknown,
  context: ErrorGovernanceContext
): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // Server/database errors should escalate
  if (message.includes("500") || message.includes("database")) {
    return true;
  }

  // Unexpected errors should escalate
  if (
    message.includes("unexpected") ||
    message.includes("unhandled") ||
    message.includes("assert")
  ) {
    return true;
  }

  // Auth/permission errors on critical surfaces
  if (
    context.context === "decision" &&
    (message.includes("permission") || message.includes("unauthorized"))
  ) {
    return true;
  }

  return false;
}

/**
 * Get escalation reason for support alert
 */
function getEscalationReason(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error type";

  if (error.message.includes("500")) {
    return "Server error - check server logs";
  }
  if (error.message.includes("database")) {
    return "Database error - check DB connection";
  }
  if (error.message.includes("timeout")) {
    return "Timeout - check service health";
  }

  return "Unexpected error - review logs";
}

/**
 * Render error in React component
 * Use this instead of directly displaying error.message
 */
export interface RenderErrorProps {
  error: unknown;
  context: ErrorGovernanceContext;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function renderOperatorError({
  error,
  context,
  onRetry,
  onDismiss,
}: RenderErrorProps): {
  title: string;
  message: string;
  recovery: string;
  buttons: Array<{
    label: string;
    action: () => void;
    variant: "primary" | "secondary";
  }>;
} {
  const governed = classifyOperatorError(error, context);

  const buttons: Array<{
    label: string;
    action: () => void;
    variant: "primary" | "secondary";
  }> = [];

  if (governed.isRetryable && onRetry) {
    buttons.push({
      label: "Try again",
      action: onRetry,
      variant: "primary",
    });
  }

  if (onDismiss) {
    buttons.push({
      label: "Dismiss",
      action: onDismiss,
      variant: "secondary",
    });
  }

  return {
    title: "Something went wrong",
    message: governed.operatorMessage,
    recovery: governed.recovery,
    buttons,
  };
}

/**
 * Hook for component error handling
 * Handles logging, escalation, and operator messaging automatically
 */
export function useOperatorError() {
  const handleError = async (
    error: unknown,
    context: ErrorGovernanceContext
  ): Promise<GovernedErrorResponse> => {
    const governed = classifyOperatorError(error, context);

    // Log technical details (only to server/logging service)
    if (governed.shouldEscalate || governed.technicalDetails) {
      const logData = {
        context,
        technical: governed.technicalDetails,
        escalation: governed.shouldEscalate ? governed.escalationReason : null,
        timestamp: new Date().toISOString(),
      };

      // Send to server for logging (if in browser)
      if (typeof window !== "undefined") {
        fetch("/api/logs/error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logData),
        }).catch(() => {
          // Silently fail if logging service is unavailable
        });
      }
    }

    return governed;
  };

  return { handleError };
}

/**
 * Detect if error message contains technical leakage
 * Used by CI scanner to prevent regressions
 */
export function hasOperatorUnsafeContent(message: string): boolean {
  const unsafePatterns = [
    /error\s*:\s*[A-Z]/i, // "Error: Cannot read property"
    /prisma/i,
    /postgresql/i,
    /uuid/i,
    /null.*undefined/i,
    /stack\s*trace/i,
    /at\s+\w+\s+\(/,  // Stack trace line format
    /async/i, // Technical jargon
    /promise/i,
    /reject/i,
    /resolve/i,
    /callback/i,
    /middleware/i,
  ];

  return unsafePatterns.some((pattern) => pattern.test(message));
}

/**
 * Validate error governance in error handler
 * Use in tests to ensure errors follow governance
 */
export function validateErrorGovernance(
  error: unknown,
  context: ErrorGovernanceContext
): { valid: boolean; issues: string[] } {
  const governed = classifyOperatorError(error, context);
  const issues: string[] = [];

  if (hasOperatorUnsafeContent(governed.operatorMessage)) {
    issues.push("Operator message contains technical leakage");
  }

  if (!governed.recovery) {
    issues.push("Missing recovery guidance");
  }

  if (governed.operatorMessage.length === 0) {
    issues.push("Empty operator message");
  }

  if (governed.operatorMessage.length > 200) {
    issues.push("Operator message too long (>200 chars)");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
