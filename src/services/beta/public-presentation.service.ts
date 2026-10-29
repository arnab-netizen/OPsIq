/** Server-side lookup of the public presentation. Fails closed to the INVITE_ONLY copy on any error. */
import { getRawPool, withRawStatementTimeout } from "@/lib/db";
import { legacyEffectiveSettings, isAdmissionMode, type AdmissionMode } from "@/services/beta/platform-settings.service";
import { presentationForAdmissionMode, type PublicBetaPresentation } from "@/domain/beta/public-presentation";

/**
 * F-ROOT-ROUTE-300S root cause, corrected across two rounds of santa-loop
 * adversarial review (four independent reviewers) plus a dedicated
 * follow-up investigation (F-PGBOUNCER-TXN-SAFETY, src/lib/db.ts):
 *
 * readEffectiveSettings()'s default `client = db` path ran as a plain
 * (non-transactional) Prisma query with NO statement_timeout set anywhere.
 * Round-1 correction: connection ACQUISITION against production's `max: 1`
 * pg.Pool was NOT actually unbounded -- pg-pool applies
 * `connectionTimeoutMillis` to a queued waiter behind an already-busy
 * connection, not only to a brand-new connection attempt. The real,
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
 * SAME raw-pg-client primitive getSession()'s own query actually uses.
 * withRawStatementTimeout() runs `fn` inside its own explicit
 * BEGIN/SET LOCAL statement_timeout/COMMIT-or-ROLLBACK, bounded on every
 * side by a client-side backstop (see its doc comment in db.ts for the
 * full F-PGBOUNCER-TXN-SAFETY mechanism and the real-PgBouncer evidence
 * behind it) -- acquisition, live-connection execution, AND a fully dead
 * connection are all covered by that one shared primitive; no outer race
 * is needed at this call site on top of it.
 *
 * Previously-known risk, now fixed rather than merely flagged: production's
 * DATABASE_URL is Neon's POOLED endpoint (PgBouncer transaction-mode
 * pooling -- confirmed via Neon's own docs and reproduced directly against
 * a real local PgBouncer instance in transaction-pool mode, see
 * F-PGBOUNCER-TXN-SAFETY). A session-level `SET statement_timeout` sent as
 * its own autocommit statement is NOT guaranteed by transaction-mode
 * pooling to stay on the same backend as the following query -- empirically
 * confirmed to leak an unrelated statement_timeout onto a COMPLETELY
 * SEPARATE, later client connection through the same pooled backend.
 * withRawStatementTimeout() no longer does this: `SET LOCAL` inside an
 * explicit transaction is a native PostgreSQL transaction-scoping
 * guarantee, independent of PgBouncer or any reset query, and was
 * empirically confirmed not to leak under the same real-PgBouncer harness.
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
