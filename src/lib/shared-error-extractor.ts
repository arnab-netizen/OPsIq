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
 * Extract raw message (for logging only, NOT for operator display)
 */
export function extractTechnicalMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Simple synchronous version for non-async contexts
 * Returns error message without routing through governance
 * Use only for non-operator-facing contexts (logging, internal)
 */
export function extractRawMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
