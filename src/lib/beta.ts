import { db } from "@/lib/db";

/**
 * Open-beta gating.
 *
 * Server-side authoritative — there is no client-readable equivalent of
 * PUBLIC_BETA_ENABLED. The signup UI calls GET /api/auth/beta-status to learn
 * whether registration is open; it never reads process.env itself (nothing in
 * a client bundle can), and the signup route independently re-checks
 * isPublicBetaEnabled() server-side regardless of what the client displayed or
 * sent, so a client cannot open a registration window that the server has
 * closed. Changing PUBLIC_BETA_ENABLED in Vercel's environment-variable UI
 * takes effect on the next deploy/redeploy with no code change.
 */

/** True only when PUBLIC_BETA_ENABLED is the literal string "true". Fail-closed default: false. */
export function isPublicBetaEnabled(): boolean {
  return process.env.PUBLIC_BETA_ENABLED === "true";
}

/**
 * Invite time-to-live, in days. An INVITED BetaRequest whose invitedAt is
 * older than this is treated as not-admitted by the signup gate — EXPIRED is
 * deliberately a DERIVED, read-time concept, never a persisted BetaRequest
 * status (see BetaRequest's schema doc comment). Chosen as a plain, generous
 * window rather than a complex token/TTL framework, per the design decision
 * that the existing email-based invited identity can enforce this safely
 * without one. Env-overridable only so tests can exercise expiry without
 * waiting real days; production behavior with the var unset is 14 days.
 */
export const INVITE_TTL_DAYS = ((): number => {
  const raw = Number(process.env.BETA_INVITE_TTL_DAYS);
  return Number.isInteger(raw) && raw > 0 ? raw : 14;
})();

/** True when an INVITED request's invitedAt is old enough that it is no longer usable for signup. */
export function isInviteExpired(invitedAt: Date, now: Date = new Date()): boolean {
  return invitedAt.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000 <= now.getTime();
}

/**
 * Controlled-beta admission check: true when a BetaRequest exists for the
 * given (already-normalized, via identityEmailSchema) email with
 * status "INVITED" AND the invite has not expired (see isInviteExpired).
 * This is the second admission path signup accepts under INVITE_ONLY mode —
 * the owner's out-of-band invite decision (see markBetaRequestInvited in
 * admin-operability.service.ts) is the sole authority; there is no separate
 * token or account model. `email` MUST already be normalized by the caller
 * (identityEmailSchema), since BetaRequest.email is stored in that same
 * canonical form. This is the SAME predicate used by both the real signup
 * route and Administration's access diagnostics — never reimplemented a
 * second time, so the two can never drift (see design correction 10).
 */
export async function isBetaRequestInvited(email: string): Promise<boolean> {
  const betaRequest = await db.betaRequest.findUnique({
    where: { email },
    select: { status: true, invitedAt: true },
  });
  if (betaRequest?.status !== "INVITED") return false;
  if (!betaRequest.invitedAt) return false;
  return !isInviteExpired(betaRequest.invitedAt);
}

/**
 * Initial beta capacity. 50 external beta workspaces, per the owner's stated
 * target. This is the LEGACY fallback value only — see
 * `src/services/beta/platform-settings.service.ts` for the governed,
 * DB-backed capacity that supersedes it once the Administration bootstrap
 * action has run. Only workspaces created via a real external signup path
 * (tagged Workspace.signupSource = PUBLIC_BETA_SIGNUP_SOURCE or
 * CONTROLLED_BETA_SIGNUP_SOURCE) count against this cap — see
 * countExternalBetaWorkspaces() in platform-settings.service.ts. Internal,
 * demo, smoke-test, and pre-beta workspaces carry no such tag and are never
 * counted, so this cap cannot be inflated or deflated by unrelated history.
 */
export const PUBLIC_BETA_WORKSPACE_CAP = ((): number => {
  const raw = Number(process.env.PUBLIC_BETA_WORKSPACE_CAP);
  return Number.isInteger(raw) && raw > 0 ? raw : 50;
})();

/** Tag written to Workspace.signupSource for a workspace created through the OPEN_BETA (uninvited, public) signup path. */
export const PUBLIC_BETA_SIGNUP_SOURCE = "PUBLIC_BETA";

/**
 * Tag written to Workspace.signupSource for a workspace created through the
 * INVITE_ONLY (controlled-beta, invited-email) signup path. Introduced so
 * Administration's customer directory/diagnostics can truthfully distinguish
 * which admission path let a given customer's workspace through — before
 * this, every real signup was tagged PUBLIC_BETA regardless of path
 * (confirmed via exhaustive repo-wide search: signupSource has exactly one
 * other consumer, the capacity-count query, which counts both values — see
 * countExternalBetaWorkspaces()). No other code anywhere reads or branches on
 * this value, so introducing it changes zero existing behavior beyond the
 * one capacity-count query updated in the same change.
 */
export const CONTROLLED_BETA_SIGNUP_SOURCE = "CONTROLLED_BETA_INVITE";

/**
 * Beta is free. No billing integration is invoked anywhere on the public
 * signup path (see src/app/api/auth/signup/route.ts, which touches no
 * Stripe/Lemon Squeezy code and grants no paid entitlement). This constant
 * exists so the claim is a single, greppable source of truth rather than
 * scattered prose.
 */
export const BETA_PRICE = "FREE" as const;

/** Current version strings for the three policies a beta signup must accept. Bump on any material change. */
export const CURRENT_POLICY_VERSIONS = {
  TERMS: "2026-09-17",
  PRIVACY: "2026-09-17",
  BETA_NOTICE: "2026-09-17",
} as const;

export type PolicyType = keyof typeof CURRENT_POLICY_VERSIONS;
