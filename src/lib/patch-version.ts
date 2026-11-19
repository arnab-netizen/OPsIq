/**
 * The optimistic-lock version a client must hold after a successful PATCH.
 *
 * Governed PATCH routes (actions, recommendations) return the row as committed, whose `version` is
 * ALREADY incremented. Adding 1 again on the client puts it one ahead of the row, so the next PATCH
 * is refused as stale (409). Use the server's version; only if a response carries none, assume the
 * single increment the server applies.
 */
export function versionAfterPatch(updated: unknown, sentVersion: number): number {
  const version = updated && typeof updated === "object" ? (updated as { version?: unknown }).version : undefined;
  return typeof version === "number" ? version : sentVersion + 1;
}
