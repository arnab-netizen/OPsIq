/** Server-side lookup of the public presentation. Fails closed to the INVITE_ONLY copy on any error. */
import { getRawPool, withRawStatementTimeout } from "@/lib/db";
import { legacyEffectiveSettings, isAdmissionMode, type AdmissionMode } from "@/services/beta/platform-settings.service";
import { presentationForAdmissionMode, type PublicBetaPresentation } from "@/domain/beta/public-presentation";

/**
 * F-ROOT-ROUTE-300S root cause, corrected twice over two rounds of santa-loop
 * adversarial review (four independent reviewers total):
 *
 * readEffectiveSettings()'s default `client = db` path ran as a plain
 * (non-transactional) Prisma query with NO statement_timeout set anywhere.
 * Round-1 correction: connection ACQUISITION against production's `max: 1`
 * pg.Pool was NOT actually unbounded -- pg-pool applies
 * `connectionTimeoutMillis` (POOL_CONNECTION_TIMEOUT_MS, 90s in production)
 * to a queued waiter behind an already-busy connection, not only to a
 * brand-new connection attempt (verified both by reading pg-pool's own
 * source and by direct empirical test outside this suite). The real,
 * unconditional gap was QUERY EXECUTION: once a connection was acquired, the
 * plain Prisma query had no Postgres-side statement_timeout and no
 * client-side bound at all, so a query that stalled after connecting (e.g.
 * a Neon connection that goes stale/half-open, plausible for exactly the
 * low-frequency ~5-11-minute uptime-monitor cadence observed timing out in
 * production -- each ping is likely to hit a connection that has been idle
 * long enough to have gone stale) could run indefinitely, bounded only by
 * Vercel's platform-level 300-second function ceiling.
 *
 * Fix: read this one row with getRawPool()/withRawStatementTimeout() -- the
 * SAME raw-pg-client primitive getSession()'s own query actually uses (NOT
 * withStatementTimeout(), Prisma's `$transaction({maxWait})`, which a prior
 * version of this fix used and which carries its own, different, narrower
 * false-failure risk on a legitimately slow-but-healthy fresh connection --
 * see db.ts's F-PROD-STARTUP-COLDSTART forensic).
 *
 * Round-2 correction: an earlier version of this comment claimed
 * withRawStatementTimeout()'s Postgres-side `SET statement_timeout` alone
 * was sufficient and deliberately added NO outer bound on top of it, on the
 * theory that an outer race could only ever abandon the caller while
 * orphaning the connection. Two independent reviewers showed that reasoning
 * was itself wrong on both halves: a `SET`/query that never gets a server
 * response at all (a genuinely dead/half-open connection -- the exact
 * stale-Neon-connection mechanism this root cause names above) is a case
 * `SET statement_timeout` cannot cover, because the server-side cancel can
 * never be delivered over a dead socket; and removing the outer bound
 * didn't avoid orphaning the connection either way -- it just ALSO let this
 * specific request hang to Vercel's 300s ceiling again, the original
 * symptom. The actual fix for that gap belongs in the shared primitive
 * itself, not at this call site: withRawStatementTimeout() in src/lib/db.ts
 * now carries its own client-side backstop timer (see its doc comment)
 * that discards a connection that never responds at all and frees the pool
 * slot immediately, rather than leaving it orphaned until the OS's own TCP
 * detection eventually notices. That closes the gap for this call site AND
 * for every other existing caller (getSession(), claimStartup(), etc.)
 * without changing any of their call sites. No outer race is needed here
 * on top of that -- withRawStatementTimeout()'s own bound now covers
 * acquisition, live-connection execution, AND the dead-connection case.
 *
 * Known, confirmed, explicitly out-of-scope risk (raised independently by
 * reviewers in both rounds, not fixed here): production's DATABASE_URL is
 * Neon's POOLED endpoint (PgBouncer-style transaction-mode pooling --
 * confirmed via docs/opsiq/product/RUNTIME_ROLE_CUTOVER.md's own reference
 * to "the opsiq_app POOLED URL"). A session-level `SET statement_timeout`
 * sent as its own autocommit statement (not inside an explicit transaction)
 * is not guaranteed by transaction-mode pooling to land on the SAME backend
 * server connection as the following SELECT, which could weaken the bound
 * this fix relies on in production in a way no local Postgres test can
 * reproduce. This is a pre-existing characteristic of withRawStatementTimeout()
 * itself (getSession() already depends on the same guarantee today), not
 * something introduced by this PR, and fixing it (e.g. wrapping the
 * SET+query in an explicit transaction) is a change to that shared
 * primitive's core design warranting its own dedicated investigation --
 * flagged here as a follow-up, not silently assumed away.
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
