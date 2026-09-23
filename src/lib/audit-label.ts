/**
 * Generic, safe label for a raw system identifier (an audit event name or entity type, e.g.
 * "task.completed", "OWNER_DO_NOT_REPEAT_RECORDED", "OwnerSalesCycle", "operator_item") shown in
 * Trust's owner-facing UI (`/owner/trust`).
 *
 * This is a mechanical reformat of the identifier's own words -- camelCase/PascalCase word
 * boundaries and dot/underscore/hyphen separators become spaces, then sentence-cased -- never an
 * invented or inferred meaning. That is deliberate: `AUDIT_EVENTS` (domain/constants/audit-events.ts)
 * and the `entityType` values written across the codebase's audit-log call sites are a large,
 * heterogeneous, and open-ended set (dozens of values today, more added over time). A hand-curated
 * label map here would either miss values (silently falling back to the raw string, the exact leak
 * this exists to close) or drift out of sync as new event/entity types are added elsewhere. A single
 * generic transform, the same de-machining approach `humanizeMetricKey`/`humanizeSnakeCase`
 * (metric-label.ts) already use for metric keys, covers every current and future value with no
 * per-value maintenance -- and, because it never guesses at meaning, it can't misrepresent a value
 * this file has no specific knowledge of, including a historical event name from before this
 * humanizer existed.
 *
 * Defensive by construction: non-string, empty, or whitespace-only input returns the honest neutral
 * label "Unknown" rather than an empty string or a thrown error.
 */
export function humanizeIdentifier(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") return "Unknown";
  const spaced = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!spaced) return "Unknown";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
