/** Server-side lookup of the public presentation. Fails closed to the INVITE_ONLY copy on any error. */
import { getRawPool, withRawStatementTimeout, POOL_CONNECTION_TIMEOUT_MS } from "@/lib/db";
import { legacyEffectiveSettings, isAdmissionMode, type AdmissionMode } from "@/services/beta/platform-settings.service";
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
 * Fix: read this one row with getRawPool()/withRawStatementTimeout() -- the
 * SAME primitive getSession()'s own query actually uses (NOT withStatementTimeout(),
 * which is Prisma's `$transaction({maxWait})`). This is a deliberate choice, not
 * an oversight: db.ts's own F-PROD-STARTUP-COLDSTART forensic documents that
 * `$transaction({maxWait})` races its client-side maxWait clock against the
 * FIRST-EVER physical connection attempt on a fresh pool, independent of real
 * contention -- a legitimately slow-but-healthy cold Neon connection (10-90s,
 * well within the pool's own real connectionTimeoutMillis) would fail that
 * narrower client-side clock and spuriously show the stricter copy even with
 * zero contention. That is exactly why claimStartup()/checkDatabase()/
 * checkMigrationReadiness()/getSession() were all migrated OFF
 * withStatementTimeout() and onto withRawStatementTimeout() -- this read
 * follows that same established precedent instead of inventing a second one.
 * Acquisition is bounded by the pool's real connectionTimeoutMillis (verified
 * empirically: a queued pool.connect() behind an already-busy max:1 connection
 * DOES reject once that bound elapses, not just a fresh connection attempt),
 * execution is bounded by a real Postgres-side `SET LOCAL statement_timeout`
 * (so a cancelled read returns its connection to the pool instead of orphaning
 * it -- the exact failure mode a naive client-side `Promise.race` would NOT
 * fix), and the outer JS race below is a pure defensive backstop sized to
 * exceed that real worst case, mirroring SESSION_QUERY_TIMEOUT_MS in auth.ts
 * exactly. On timeout/any error this still fails closed to the existing
 * `null` / INVITE_ONLY behavior below -- never OPEN_BETA.
 */
export const PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS = 5000;
export const PUBLIC_ADMISSION_READ_QUERY_TIMEOUT_MS =
  POOL_CONNECTION_TIMEOUT_MS + PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS + 3000;

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
  const result = await Promise.race([
    withRawStatementTimeout(
      pool,
      PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS,
      (client) =>
        client.query<PlatformSettingAdmissionModeRow>(
          `SELECT admission_mode FROM platform_settings WHERE id = 'global'`
        ),
      label
    ),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Public admission-mode lookup timed out after ${PUBLIC_ADMISSION_READ_QUERY_TIMEOUT_MS}ms`)),
        PUBLIC_ADMISSION_READ_QUERY_TIMEOUT_MS
      )
    ),
  ]);

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
