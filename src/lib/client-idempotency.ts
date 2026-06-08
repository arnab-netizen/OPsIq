/**
 * Client-side idempotency key generation
 *
 * Generates unique idempotency keys for POST requests.
 * Safe for browser use - no Node.js dependencies.
 * No sensitive data included in key.
 */

/**
 * Generate a client-side idempotency key
 *
 * Format: prefix-uuid
 * Example: diagnosis-550e8400-e29b-41d4-a716-446655440000
 *
 * @param prefix - Operation prefix (e.g., "diagnosis", "evidence", "decision")
 * @returns Unique idempotency key
 */
export function createClientIdempotencyKey(prefix: string): string {
  // Prefer crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  // Fallback for environments without crypto.randomUUID
  // Format: prefix-timestamp-random
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2);
  return `${prefix}-${timestamp}-${random}`;
}
