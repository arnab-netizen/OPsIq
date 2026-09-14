/**
 * Single authoritative signup-admission decision function.
 *
 * Every place that needs to answer "would a signup be admitted right now" —
 * the real signup route, Administration's access diagnostics, and any future
 * caller — MUST call this function rather than re-deriving the rule. This is
 * what makes diagnostics provably unable to drift from the real gate (design
 * correction 10): they are, structurally, the same code path.
 *
 * Pure, no IO — callers resolve `isInvited`/`hasCapacity` themselves (the
 * former from `isBetaRequestInvited`, the latter from
 * `countExternalBetaWorkspaces` vs the effective capacity limit) and pass the
 * resolved booleans in.
 */
import type { AdmissionMode } from "@/services/beta/platform-settings.service";

export function canAdmitSignup(
  mode: AdmissionMode,
  isInvited: boolean,
  hasCapacity: boolean
): boolean {
  switch (mode) {
    case "CLOSED":
      return false;
    case "WAITLIST":
      return false;
    case "INVITE_ONLY":
      return isInvited && hasCapacity;
    case "OPEN_BETA":
      return hasCapacity;
  }
}

/** Whether BetaRequest submission itself (the waitlist form) is accepted under a given mode. */
export function canSubmitBetaRequest(mode: AdmissionMode): boolean {
  return mode !== "CLOSED";
}

/**
 * Whether the signup FORM is worth showing/enabling at all, before any
 * specific email is known (the real per-email admission decision is
 * canAdmitSignup, evaluated server-side once an email is submitted). True
 * for INVITE_ONLY (an invited visitor needs to be able to attempt it — the
 * server is the authority on whether their specific email is admitted) and
 * OPEN_BETA; false for CLOSED/WAITLIST, where no email could be admitted.
 */
export function canAttemptSignupForm(mode: AdmissionMode): boolean {
  return mode === "INVITE_ONLY" || mode === "OPEN_BETA";
}
