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
 * Controlled-beta admission check: true when a BetaRequest exists for the
 * given (already-normalized, via identityEmailSchema) email with
 * status "INVITED". This is the second admission path signup accepts while
 * PUBLIC_BETA_ENABLED is false — the owner's out-of-band invite decision
 * (see markBetaRequestInvited in admin-operability.service.ts) is the sole
 * authority; there is no separate token or account model. `email` MUST
 * already be normalized by the caller (identityEmailSchema), since
 * BetaRequest.email is stored in that same canonical form.
 */
export async function isBetaRequestInvited(email: string): Promise<boolean> {
  const betaRequest = await db.betaRequest.findUnique({
    where: { email },
    select: { status: true },
  });
  return betaRequest?.status === "INVITED";
}

/**
 * Initial beta capacity. 50 external beta workspaces, per the owner's stated
 * target. Only workspaces created via the public-beta signup path (tagged
 * Workspace.signupSource = "PUBLIC_BETA") count against this cap — see
 * countPublicBetaWorkspaces() in src/services/auth/beta-cap.ts. Internal,
 * demo, smoke-test, and pre-beta workspaces carry no such tag and are never
 * counted, so this cap cannot be inflated or deflated by unrelated history.
 */
export const PUBLIC_BETA_WORKSPACE_CAP = ((): number => {
  const raw = Number(process.env.PUBLIC_BETA_WORKSPACE_CAP);
  return Number.isInteger(raw) && raw > 0 ? raw : 50;
})();

/** Tag written to Workspace.signupSource for every workspace created through the public-beta signup path. */
export const PUBLIC_BETA_SIGNUP_SOURCE = "PUBLIC_BETA";

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
  TERMS: "2026-09-05",
  PRIVACY: "2026-09-05",
  BETA_NOTICE: "2026-09-05",
} as const;

export type PolicyType = keyof typeof CURRENT_POLICY_VERSIONS;
