/** Server-side lookup of the public presentation. Fails closed to the INVITE_ONLY copy on any error. */
import { getRawPool, withRawStatementTimeout } from "@/lib/db";
import { legacyEffectiveSettings, isAdmissionMode, type AdmissionMode } from "@/services/beta/platform-settings.service";
import { presentationForAdmissionMode, type PublicBetaPresentation } from "@/domain/beta/public-presentation";

/**
 * F-ROOT-ROUTE-300S root cause, corrected after santa-loop adversarial review
 * (two independent reviewers traced node-postgres's actual pg-pool internals
 * and found the first version of this fix overstated the mechanism):
 *
 * readEffectiveSettings()'s default `client = db` path ran as a plain
 * (non-transactional) Prisma query with NO statement_timeout set anywhere.
 * CORRECTION: connection ACQUISITION against production's `max: 1` pg.Pool
 * was NOT actually unbounded -- pg-pool applies `connectionTimeoutMillis`
 * (POOL_CONNECTION_TIMEOUT_MS, 90s in production) to a queued waiter behind
 * an already-busy connection, not only to a brand-new connection attempt
 * (verified both by reading pg-pool's own source and by direct empirical
 * test outside this suite: a second pool.connect() queued behind a held
 * max:1 connection rejects at exactly the configured timeout). The real,
 * unconditional gap was QUERY EXECUTION: once a connection was acquired, the
 * plain Prisma query had no Postgres-side statement_timeout and no
 * client-side bound at all, so a query that stalled after connecting (e.g.
 * a Neon connection that goes stale/half-open, plausible for exactly the
 * low-frequency ~5-11-minute uptime-monitor cadence observed timing out in
 * production -- each ping is likely to hit a connection that has been idle
 * long enough to have gone stale) could run indefinitely, bounded only by
 * Vercel's platform-level 300-second function ceiling. The anonymous
 * landing page (every visitor with no session cookie, including external
 * uptime monitors) called this unprotected read on every request.
 *
 * Fix: read this one row with getRawPool()/withRawStatementTimeout() -- the
 * SAME raw-pg-client primitive getSession()'s own query actually uses (NOT
 * withStatementTimeout(), Prisma's `$transaction({maxWait})`, which a prior
 * version of this fix used and which carries its own, different, narrower
 * false-failure risk on a legitimately slow-but-healthy fresh connection --
 * see db.ts's F-PROD-STARTUP-COLDSTART forensic). withRawStatementTimeout()
 * issues a session-level `SET statement_timeout` (NOT `SET LOCAL` -- there
 * is no transaction here to scope it to) before the query, so Postgres
 * itself cancels a stalled query and the connection is cleanly reset and
 * returned to the pool (SQLSTATE 57014 path) rather than merely abandoned
 * client-side. Deliberately NO additional outer JS-side race on top of this:
 * one was present in the version santa-loop reviewed, copied from
 * getSession()'s own pattern, but on a read whose only failure mode left
 * uncovered by withRawStatementTimeout() itself is a connection that goes
 * fully dead before the SET command is even acknowledged -- an outer race
 * firing in exactly that case would abandon the caller while the checked-out
 * client stays orphaned on this `max:1` pool until the OS's own TCP
 * keepalive eventually notices, which is WORSE than relying on
 * withRawStatementTimeout()'s own connect-time and statement-time bounds
 * alone. getSession() carries this same latent outer-race/orphan
 * characteristic already (pre-existing, not introduced here) and is
 * explicitly out of scope for this PR -- changing it is a separate
 * root-cause class affecting every one of its ~18 callers, not just this
 * anonymous route.
 */
export const PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS = 5000;

interface PlatformSettingAdmissionModeRow {
  admission_mode: string;
}

/**
 * Deliberately duplicates readEffectiveSettings()'s legacy-fallback/validity
 * logic (reusing its two exported helpers rather than its Prisma-query body)
 * instead of calling it directly -- see the doc comment above for why this one
 * hot, anonymous-reachable call site needs a different DB-access primitive
 * than readEffectiveSettings()'s other (admin/internal/lock-holding) callers.
 */
async function readPublicAdmissionModeBounded(label: string): Promise<AdmissionMode> {
  const pool = await getRawPool();
  const result = await withRawStatementTimeout(
    pool,
    PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS,
    (client) =>
      client.query<PlatformSettingAdmissionModeRow>(
        `SELECT admission_mode FROM platform_settings WHERE id = 'global'`
      ),
    label
  );

  const row = result.rows[0];
  if (!row) return legacyEffectiveSettings().admissionMode;
  if (!isAdmissionMode(row.admission_mode)) {
    // Defensive: a malformed row is a data-integrity problem, not a signal to
    // silently reopen or silently close admission -- fail closed (caught by
    // both callers below, same as any other error here).
    throw new Error(`platform_settings row has invalid admission_mode: ${row.admission_mode}`);
  }
  return row.admission_mode;
}

export async function getPublicBetaPresentation(): Promise<PublicBetaPresentation> {
  try {
    const mode = await readPublicAdmissionModeBounded("getPublicBetaPresentation");
    return presentationForAdmissionMode(mode);
  } catch {
    return presentationForAdmissionMode(null);
  }
}

/** The effective admission mode for display, or null when it cannot be read (callers then show the stricter wording). */
export async function getPublicAdmissionMode(): Promise<string | null> {
  try {
    return await readPublicAdmissionModeBounded("getPublicAdmissionMode");
  } catch {
    return null;
  }
}
