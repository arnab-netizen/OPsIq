/**
 * Test-harness database guard (used by vitest-global-setup.ts).
 *
 * ─── Incident this prevents ──────────────────────────────────────────────────
 *
 * A cloud dev container exported a remote Neon DATABASE_URL / TEST_DATABASE_URL
 * and TEST_WITH_DB=true by default. vitest-global-setup.ts loaded whatever
 * `.env.test` existed (including a stale one left by an earlier run), trusted
 * the inherited DATABASE_URL, connected, opened a keepalive and wrote startup
 * status — so an ordinary "unit test" command reached a remote database, and
 * then re-wrote `.env.test` with that remote URL for every worker.
 *
 * ─── Contract ────────────────────────────────────────────────────────────────
 *
 * 1. Non-DB runs (TEST_WITH_DB !== "true") never use an inherited database URL:
 *    every database variable is replaced with the loopback placeholder, so no
 *    unit test can reach a real database by accident.
 * 2. DB runs require an explicit DATABASE_URL (no fallback to `.env.test` or a
 *    default) and refuse any production authorization flag
 *    (OPSIQ_DB_TARGET=production / OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true — the
 *    prisma-datasource.ts production opt-in).
 * 3. DB runs may target only the runner's own loopback database (a throwaway
 *    container/service) unless the operator explicitly opts into a remote TEST
 *    database with OPSIQ_ALLOW_REMOTE_TEST_DB=true (auditable, set only in the
 *    workflows that deliberately use a remote test branch). Every database
 *    variable present (DATABASE_URL, TEST_DATABASE_URL, DATABASE_URL_TEST) is
 *    checked, so a remote URL cannot ride along in a sibling variable.
 * 4. "Loopback" must be where the pg driver actually connects: its connection
 *    string parser lets a `host`/`hostaddr` query parameter override the URL
 *    hostname (incl. a unix socket such as a cloud SQL proxy), so any such
 *    parameter disqualifies the URL; only the postgres:/postgresql: schemes are
 *    accepted (pg's `socket:` scheme ignores the hostname), and an encoded
 *    socket-path hostname is not a loopback name either.
 * 5. Messages are sanitized: no URL, host, user, password or database name.
 *
 * Loopback is the only location trusted without opt-in because a remote
 * production database cannot be reached at the runner's loopback address; this
 * is a deliberate, narrow exception to prisma-datasource.ts's "no hostname
 * matching" rule, which governs the Prisma CLI, not the test harness.
 */

/** Placeholder used for non-DB runs (same value vitest.setup.ts has always defaulted to). */
export const NO_DB_TEST_DATABASE_URL = "postgresql://user:password@localhost:5432/opsiq_dev?schema=public";

export const TEST_DATABASE_VARIABLES = ["DATABASE_URL", "TEST_DATABASE_URL", "DATABASE_URL_TEST"] as const;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class TestDatabaseGuardError extends Error {
  constructor(message: string) {
    super(`[test-database-guard] REFUSED: ${message}`);
    this.name = "TestDatabaseGuardError";
  }
}

export interface TestDatabaseResolution {
  mode: "db" | "no-db";
  /** The database URL every test process must use. */
  databaseUrl: string;
  /** Sanitized description, safe to log. */
  target: "loopback" | "remote-test-opt-in" | "no-db-placeholder";
}

function isLoopback(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // Only a TCP postgres URL: pg's `socket:` scheme (and other schemes) ignore the hostname and
  // connect to a socket path or PGHOST instead.
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return false;
  for (const key of parsed.searchParams.keys()) {
    const k = key.toLowerCase();
    if (k === "host" || k === "hostaddr") return false;
  }
  return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
}

export function resolveTestDatabase(env: Readonly<Record<string, string | undefined>>): TestDatabaseResolution {
  if (env.TEST_WITH_DB !== "true") {
    return { mode: "no-db", databaseUrl: NO_DB_TEST_DATABASE_URL, target: "no-db-placeholder" };
  }

  if (env.OPSIQ_DB_TARGET === "production" || env.OPSIQ_ALLOW_PRODUCTION_DB_COMMAND === "true") {
    throw new TestDatabaseGuardError("DB tests never run with a production database authorization set.");
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new TestDatabaseGuardError("TEST_WITH_DB=true requires an explicit DATABASE_URL for a throwaway test database.");
  }

  const remoteAllowed = env.OPSIQ_ALLOW_REMOTE_TEST_DB === "true";
  for (const name of TEST_DATABASE_VARIABLES) {
    const value = env[name]?.trim();
    if (!value) continue;
    if (!isLoopback(value) && !remoteAllowed) {
      throw new TestDatabaseGuardError(
        `${name} points at a non-loopback database. DB tests run only against the runner's own throwaway database ` +
          "unless OPSIQ_ALLOW_REMOTE_TEST_DB=true explicitly declares a remote TEST database."
      );
    }
  }

  return { mode: "db", databaseUrl, target: isLoopback(databaseUrl) ? "loopback" : "remote-test-opt-in" };
}
