/**
 * QuickBooks Online — identifier boundaries for values that enter a request URL.
 *
 * What Intuit documents, and what it does not
 *  - Realm / company id: a numeric value (historically a 10-digit integer; Intuit widened the type to a
 *    64-bit long, and current ids look like 9341456924700058). No contractual maximum length or
 *    guarantee is established by the documentation OpsIQ can verify.
 *  - Entity `Id` (Invoice, Customer, …): described by the API reference as a read-only STRING (IdType).
 *    The reference does not establish "digits only" or any maximum length. Current ids are numeric
 *    strings in practice, but OpsIQ must not encode that as a provider rule.
 *
 * So the rules below are OPSIQ_DEFENSIVE rules — local abuse- and injection-prevention boundaries, NOT
 * Intuit contract limits. Nothing here claims Intuit enforces them, and a value that passes them is not
 * thereby a real Intuit id.
 *
 *  Realm id   — digits only (the documented shape), at most OPSIQ_DEFENSIVE_BOUND characters.
 *  Entity id  — an opaque string: non-empty, at most OPSIQ_DEFENSIVE_BOUND characters, well-formed text,
 *               no control characters, no path separators ("/" or "\"), and not a dot-segment ("." / "..").
 *               Everything else (spaces, "?", "#", "%", non-ASCII, …) is accepted and always sent as a
 *               percent-encoded path segment, so it can never change the host, the path structure or the
 *               query. Dot-segments are rejected rather than encoded because URL parsers treat "%2e%2e"
 *               like "..".
 *
 * Pure module: no DB, no network.
 */

/** Marks a limit as a local, defensive OpsIQ choice (as opposed to INTUIT_PROVIDER_MAX). */
export type QboBoundSource = "OPSIQ_DEFENSIVE_BOUND";

export const QBO_REALM_ID_MAX_LENGTH = 64;
export const QBO_REALM_ID_MAX_LENGTH_SOURCE: QboBoundSource = "OPSIQ_DEFENSIVE_BOUND";

export const QBO_ENTITY_ID_MAX_LENGTH = 128;
export const QBO_ENTITY_ID_MAX_LENGTH_SOURCE: QboBoundSource = "OPSIQ_DEFENSIVE_BOUND";

const REALM_ID_PATTERN = new RegExp(`^[0-9]{1,${QBO_REALM_ID_MAX_LENGTH}}$`);

/** Realm id format check. Format validity is NOT authorization; workspace binding happens elsewhere. */
export function isValidRealmId(value: unknown): value is string {
  return typeof value === "string" && REALM_ID_PATTERN.test(value);
}

const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]");

/** Entity id acceptance under the OpsIQ defensive boundary (see module doc). */
export function isSafeEntityId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > QBO_ENTITY_ID_MAX_LENGTH) return false;
  if (value === "." || value === "..") return false;
  if (value.includes("/") || value.includes("\\")) return false;
  if (CONTROL_CHARS.test(value)) return false;
  // Lone surrogates cannot be percent-encoded and are not well-formed text.
  try {
    encodeURIComponent(value);
  } catch {
    return false;
  }
  return true;
}

/**
 * Percent-encode one URL path segment. Every character that is not an unreserved URL character is
 * encoded, so the result cannot contain "/", "?", "#", "%" (other than as an escape), or whitespace.
 * Throws RangeError for a value that could not be a single segment.
 */
export function encodePathSegment(segment: string): string {
  if (typeof segment !== "string" || segment.length === 0 || segment === "." || segment === "..") {
    throw new RangeError("Invalid URL path segment");
  }
  // encodeURIComponent leaves !'()* alone; encode them too so the segment is strictly unreserved + %XX.
  return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
