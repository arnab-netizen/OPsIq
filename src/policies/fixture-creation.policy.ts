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
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ForbiddenError } from "@/infra/errors";

/** The only capability that may authorize fixture creation. */
export type FixtureCreationCapability = typeof CAPABILITIES.SYSTEM_ADMIN;

/** Each route passes `CAPABILITIES.SYSTEM_ADMIN` explicitly so the requirement stays visible at the
 *  call site; the parameter type is the literal, so any weaker capability is a compile error. */
export function resolveFixtureRequest(
  requested: boolean | undefined,
  verifiedCapabilities: ReadonlySet<string>,
  what: "business" | "startup session" | "startup blueprint record",
  requiredCapability: FixtureCreationCapability
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

/** Compile-time guard (this file is compiled by `tsc` and `next build`; test files are excluded from
 *  tsc, so the guard must live here): fails to compile if the required-capability parameter is ever
 *  widened beyond exactly CAPABILITIES.SYSTEM_ADMIN. */
type IsExactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssertTrue<T extends true> = T;
export type FixtureCapabilityParameterIsExactlySystemAdmin = AssertTrue<
  IsExactly<Parameters<typeof resolveFixtureRequest>[3], typeof CAPABILITIES.SYSTEM_ADMIN>
>;
