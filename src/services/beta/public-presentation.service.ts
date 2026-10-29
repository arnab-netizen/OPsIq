/** Server-side lookup of the public presentation. Fails closed to the INVITE_ONLY copy on any error. */
import { db, withStatementTimeout } from "@/lib/db";
import { readEffectiveSettings } from "@/services/beta/platform-settings.service";
import { presentationForAdmissionMode, type PublicBetaPresentation } from "@/domain/beta/public-presentation";

/**
 * F-ROOT-ROUTE-300S root cause: readEffectiveSettings()'s default `client = db`
 * path ran as a plain (non-transactional) Prisma query with NO statement-level
 * timeout and NO bound on connection ACQUISITION. Under production's `max: 1`
 * pg.Pool (see src/lib/db.ts's P0-15 pool-starvation doc comment), node-postgres
 * has no built-in acquire timeout for a caller queued behind an already-busy
 * sole connection -- that wait is unbounded. The anonymous landing page (every
 * visitor with no session cookie, including external uptime monitors -- the
 * exact `GET /` / `HEAD /` traffic pattern observed timing out in production)
 * called this on every request, so once the pool's one connection was held by
 * ANY stalled caller (anywhere in the process), every subsequent `/` request
 * queued behind it with nothing to stop it except Vercel's platform-level
 * 300-second function ceiling -- reproduced in
 * src/__tests__/stage8/root-route-admission-pool-starvation-hostile.db.test.ts.
 *
 * Fix: route the read through withStatementTimeout() -- the SAME governed
 * primitive getSession()'s own query already uses. It bounds acquisition via
 * Prisma's own `maxWait` (not node-postgres's pool, which has no such option)
 * AND bounds execution with a real Postgres-side `SET LOCAL statement_timeout`,
 * so a cancelled read returns its connection to the pool instead of orphaning
 * it there forever (the exact failure mode a naive client-side
 * `Promise.race` would NOT fix -- see withStatementTimeout's own doc comment
 * in src/lib/db.ts). On timeout/any error this still fails closed to the
 * existing `null` / INVITE_ONLY behavior below -- never OPEN_BETA.
 */
export const PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS = 5000;

function readEffectiveSettingsBounded() {
  return withStatementTimeout(
    db,
    PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS,
    (tx) => readEffectiveSettings(tx),
    "getPublicAdmissionMode"
  );
}

export async function getPublicBetaPresentation(): Promise<PublicBetaPresentation> {
  try {
    const settings = await readEffectiveSettingsBounded();
    return presentationForAdmissionMode(settings.admissionMode);
  } catch {
    return presentationForAdmissionMode(null);
  }
}

/** The effective admission mode for display, or null when it cannot be read (callers then show the stricter wording). */
export async function getPublicAdmissionMode(): Promise<string | null> {
  try {
    return (await readEffectiveSettingsBounded()).admissionMode;
  } catch {
    return null;
  }
}
