/**
 * Owner first-run — the ONE routing contract.
 *
 * Every first-run decision is derived from persisted canonical facts (no separate "onboarding complete"
 * flag): a business exists, first-read sufficiency holds, a finance diagnosis exists, and a trusted
 * decision interaction exists. Pages and redirects call this instead of restating conditions. Pure.
 */

export const FIRST_RUN_STATES = [
  "NEEDS_BUSINESS",
  "NEEDS_EVIDENCE",
  "NEEDS_DIAGNOSIS",
  "FIRST_RESULT",
  "ESTABLISHED",
] as const;
export type FirstRunState = (typeof FIRST_RUN_STATES)[number];

export interface FirstRunFacts {
  /** A real (non-fixture, active) OwnerBusiness exists in the workspace. */
  hasBusiness: boolean;
  /** Canonical first-read sufficiency (revenue + a cost + cash known) holds for the business. */
  firstReadSufficient: boolean;
  /** A finance diagnosis cycle exists for the business. */
  hasDiagnosis: boolean;
  /** A first-trusted-decision interaction exists (see activation.ts). */
  hasTrustedInteraction: boolean;
}

export const FIRST_RUN_START_HREF = "/owner/start";
export const OWNER_COCKPIT_HREF = "/owner/cockpit";

export function resolveFirstRunState(facts: FirstRunFacts): FirstRunState {
  if (!facts.hasBusiness) return "NEEDS_BUSINESS";
  if (facts.hasTrustedInteraction && facts.hasDiagnosis) return "ESTABLISHED";
  if (!facts.firstReadSufficient && !facts.hasDiagnosis) return "NEEDS_EVIDENCE";
  if (!facts.hasDiagnosis) return "NEEDS_DIAGNOSIS";
  return "FIRST_RESULT";
}

/** Where the first-run surface itself should go for a state. */
export function firstRunHref(state: FirstRunState): string {
  return state === "ESTABLISHED" ? OWNER_COCKPIT_HREF : FIRST_RUN_START_HREF;
}

/**
 * Where to land after email verification: the owner is always brought to the right first-run step.
 */
export function landingAfterVerification(facts: FirstRunFacts): string {
  return firstRunHref(resolveFirstRunState(facts));
}

/**
 * Where to land on a normal sign-in. An interrupted first run (A–C) resumes; a person who already has a
 * first read (D) or is established (E) goes to the Cockpit and is never forced back through setup.
 */
export function landingAfterLogin(facts: FirstRunFacts): string {
  const state = resolveFirstRunState(facts);
  return state === "NEEDS_BUSINESS" || state === "NEEDS_EVIDENCE" || state === "NEEDS_DIAGNOSIS"
    ? FIRST_RUN_START_HREF
    : OWNER_COCKPIT_HREF;
}
