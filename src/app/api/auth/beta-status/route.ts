import { canAttemptSignupForm } from "@/domain/beta/admission";
import { readEffectiveSettings } from "@/services/beta/platform-settings.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tells the signup UI whether public registration is currently open.
 *
 * This is display-only — it exists so the /signup page can show "beta
 * registration closed" instead of a blank/broken form. It carries no
 * authority: POST /api/auth/signup independently re-checks admission
 * server-side on every request via the same canAdmitSignup predicate, so a
 * client cannot spoof this endpoint's response (or skip calling it, or cache
 * a stale "enabled") to open a registration window the server has actually
 * closed.
 *
 * Administration V1 correction: this USED to read raw isPublicBetaEnabled()
 * directly — a second, un-migrated read of the legacy source that would
 * have gone stale the moment an operator changed the admission mode via
 * Administration (e.g. DB says CLOSED, this would still say enabled=true).
 * Now reads the same governed, DB-authoritative-once-bootstrapped settings
 * every other admission decision uses. `enabled` reflects
 * canAttemptSignupForm(mode) — true for INVITE_ONLY (an invited visitor
 * must be able to attempt the form; the server is the authority on whether
 * their specific email is admitted) and OPEN_BETA, false for
 * CLOSED/WAITLIST. This is also what makes the current, real INVITE_ONLY
 * production mode's signup form reachable at all — previously the page's
 * binary `enabled` boolean, driven by the same raw flag, hid the form and
 * disabled submission unconditionally under INVITE_ONLY.
 */
export const GET = async () => {
  const settings = await readEffectiveSettings();
  return Response.json({ enabled: canAttemptSignupForm(settings.admissionMode), admissionMode: settings.admissionMode });
};
