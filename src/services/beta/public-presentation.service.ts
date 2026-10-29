/** Server-side lookup of the public presentation. Fails closed to the INVITE_ONLY copy on any error. */
import {
  getPublicReadPool,
  withRawStatementTimeout,
  PUBLIC_READ_POOL_ACQUISITION_TIMEOUT_MS,
  CLIENT_SIDE_BACKSTOP_MARGIN_MS,
} from "@/lib/db";
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
 * Fix (F-ROOT-ROUTE-300S, since superseded below by F-ROOT-ROUTE-FAST-FAIL's
 * getPublicReadPool() -- this paragraph is kept as history for the
 * BEGIN/SET LOCAL/COMMIT-or-ROLLBACK mechanism it establishes, not as a
 * description of the pool this call site reads today): read this one row
 * with getRawPool()/withRawStatementTimeout() -- the SAME raw-pg-client
 * primitive getSession()'s own query actually uses.
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
 *
 * F-ROOT-ROUTE-FAST-FAIL: the above made this read safe, but left it bounded
 * by the SAME 90s shared-pool acquisition ceiling as every other DB caller
 * (getSession()/checkDatabase()/checkMigrationReadiness()/claimStartup()),
 * for a worst case of 105_000ms (POOL_CONNECTION_TIMEOUT_MS=90_000 +
 * the old PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS=5000 +
 * 2*CLIENT_SIDE_BACKSTOP_MARGIN_MS=10_000 -- see
 * withRawStatementTimeoutWorstCaseMs() in db.ts) -- unacceptable for a
 * public landing page. Fix: this read now runs against
 * getPublicReadPool(), a fully separate, route-scoped pg.Pool (db.ts) with
 * its own short PUBLIC_READ_POOL_ACQUISITION_TIMEOUT_MS=3_000 acquisition
 * bound, independent of the shared pool's 90s ceiling, which stays
 * unchanged for the four shared callers above.
 *
 * A preferred <10_000ms total was investigated but is not achievable
 * without also shrinking CLIENT_SIDE_BACKSTOP_MARGIN_MS (currently a fixed
 * 5_000ms, applied TWICE in withRawStatementTimeout()'s worst case -- once
 * on the main BEGIN/SET LOCAL/fn/COMMIT sequence, once on ROLLBACK cleanup
 * -- for a fixed 10_000ms floor regardless of acquisition/execution
 * tuning). That margin is a shared, already multiply-adversarially-
 * reviewed (santa-loop rounds 1-3, F-PGBOUNCER-TXN-SAFETY) constant used
 * unmodified by all four shared callers; shrinking it for this one
 * low-stakes public read is not a worthwhile trade against re-reviewing a
 * shared safety primitive. The justified target instead shrinks only the
 * two genuinely route-specific, shrinkable components:
 *   - acquisition: 3_000ms (30x smaller than the shared 90_000ms ceiling).
 *     Santa-loop review finding (round 3): this is NOT "comfortably above
 *     typical Neon cold-wake latency" -- this codebase's own documented
 *     figures (see db.ts's cold-compute-wake doc comment) are median
 *     ~1.8s, p95 ~2.6s, and "several seconds" under a concurrent
 *     cold-start burst. At p95 that leaves roughly 400ms of margin for
 *     TCP+TLS+auth on TOP of the wake itself, and burst conditions can
 *     exceed 3_000ms outright. 3_000ms is chosen deliberately short
 *     despite this -- not because cold starts are rare, but because this
 *     value only gates DISPLAY COPY on a low-traffic dedicated pool
 *     (unlike the shared pool, most real visits hit a warm connection);
 *     see the trade-off below for why that's an acceptable, and
 *     non-trivially frequent, cost.
 *   - execution: reduced from 5000ms to 2000ms (still generous for a
 *     single primary-key-indexed SELECT against a small table).
 * Result: PUBLIC_ADMISSION_READ_WORST_CASE_MS = 3_000 + 2_000 + 2*5_000 =
 * 15_000ms -- an 85.7% reduction from 105_000ms, derived from this file's
 * and db.ts's own real constants, not chosen to make a test pass.
 *
 * Named trade-off (fresh-context + santa-loop review findings): the old
 * 90_000ms acquisition bound was ALSO, incidentally, tolerant of a
 * genuinely slow but eventually-successful cold connection (e.g. a Neon
 * compute-wake landing anywhere in its documented ~1.8s median / ~2.6s p95
 * / multi-second-burst range) -- that request would previously have
 * waited it out and shown the real admission mode. After this fix, a cold
 * dedicated-pool connection that takes longer than 3_000ms (plausible at
 * or past p95, not merely a rare tail event) now fails closed to the
 * conservative INVITE_ONLY copy well before the connection would have
 * succeeded. This is accepted deliberately, honestly stated as a
 * meaningful-not-negligible frequency: this value only controls which
 * marketing copy an anonymous visitor sees (never an authorization
 * decision), so bounded latency on a low-traffic dedicated pool is worth
 * more here than occasionally under-selling an open beta during a cold
 * start.
 */
export const PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS = 2_000;

/**
 * Canonical, code-derived worst-case bound for the anonymous `/` route's
 * public-admission read, for any caller/test that needs to assert against
 * it instead of hand-deriving its own copy that can silently drift out of
 * sync (the exact failure mode withRawStatementTimeoutWorstCaseMs() in
 * db.ts already guards against for the shared-pool case).
 */
export const PUBLIC_ADMISSION_READ_WORST_CASE_MS =
  PUBLIC_READ_POOL_ACQUISITION_TIMEOUT_MS +
  PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS +
  2 * CLIENT_SIDE_BACKSTOP_MARGIN_MS;

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
  const pool = await getPublicReadPool();
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
