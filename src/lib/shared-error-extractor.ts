/**
 * Shared Error Message Extractor
 *
 * Provides operator-safe error handling by routing all errors through
 * classifyOperatorError() governance layer. Never expose raw error.message.
 *
 * Usage:
 *   extractOperatorMessage(err, "fallback", context) — recommended
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
 * Extract technical message for internal logging (routes through governance)
 */
export function extractTechnicalMessage(error: unknown): string {
  const governed = classifyOperatorError(error, { context: "load" });
  return governed.operatorMessage || String(error);
}

/**
 * Simple synchronous version for non-async contexts (routes through governance)
 */
export function extractRawMessage(error: unknown): string {
  const governed = classifyOperatorError(error, { context: "load" });
  return governed.operatorMessage || String(error);
}
