/**
 * Acceptance-fixture creation policy.
 *
 * Invariant: an explicit fixture request is atomic with fixture authorization — it either creates a
 * true fixture or creates nothing. A caller that asks for `true` without CAPABILITIES.SYSTEM_ADMIN
 * is refused (403); the request is never silently downgraded to a non-fixture record, because that
 * would put synthetic acceptance data into ordinary owners' lists. Absent/false requests are
 * unaffected: they never need the capability and always yield a non-fixture record.
 *
 * Callers MUST run this before any write so a refusal leaves no row and no audit event behind.
 */
import { ForbiddenError } from "@/infra/errors";

/** `requiredCapability` is passed explicitly by each route (CAPABILITIES.SYSTEM_ADMIN) so the
 *  requirement is visible at every call site. */
export function resolveFixtureRequest(
  requested: boolean | undefined,
  verifiedCapabilities: ReadonlySet<string>,
  what: "business" | "startup session" | "startup blueprint record",
  requiredCapability: string
): boolean {
  if (requested !== true) return false;
  if (!verifiedCapabilities.has(requiredCapability)) {
    throw new ForbiddenError(
      "CAPABILITY_NOT_GRANTED",
      `Creating an acceptance fixture ${what} requires system administration; nothing was created`
    );
  }
  return true;
}
