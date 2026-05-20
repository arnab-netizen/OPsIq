/**
 * Shared Error Message Extractor
 *
 * Replaces the common anti-pattern:
 *   err instanceof Error ? err.message : "fallback"
 *
 * With operator-safe error handling:
 *   extractOperatorMessage(err, "fallback", context)
 */

import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from "./operator-error-governance";

/**
 * Extract safe operator message from any error
 * Routes through governance automatically
 */
export function extractOperatorMessage(
  error: unknown,
  fallback: string,
  context: ErrorGovernanceContext
): string {
  const governed = classifyOperatorError(error, context);
  return governed.operatorMessage || fallback;
}

/**
 * Extract safe technical message for logging/diagnostics
 * Still routes through governance to ensure no raw technical leakage
 */
export function extractTechnicalMessage(error: unknown): string {
  const governed = classifyOperatorError(
    error instanceof Error ? error : new Error(String(error)),
    { context: "load" }
  );
  return governed.operatorMessage;
}

/**
 * Extract safe message for internal use
 * Always governs error content to prevent leakage
 */
export function extractRawMessage(error: unknown): string {
  const governed = classifyOperatorError(
    error instanceof Error ? error : new Error(String(error)),
    { context: "load" }
  );
  return governed.operatorMessage;
}
