import {
  DATABASE_IDENTITY_SQL,
  classifyDatabaseIdentity,
  classifyRemoteDatabaseUrl,
  databaseIdentityFromRow,
  type DatabaseEnv,
} from "./production-db-identity";

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
 * 6. The remote opt-in means "a remote NON-PRODUCTION database", not "any remote database". Under the opt-in
 *    every database variable must (a) parse as a postgres: URL with a real hostname and no host/hostaddr override
 *    and (b) not resolve to a known production endpoint (src/infra/production-db-identity.ts) — checked before
 *    any connection. Then `verifyRemoteTestDatabaseIdentity` reads the connected database's own identity
 *    (Neon endpoint/branch) in a read-only session and refuses production or an unreadable identity, so a
 *    production credential in a mislabeled secret cannot ride through a TEST_DATABASE_URL.
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

/** Sanitized refusal reasons for the remote-test identity layers (no URL, host, user or password). */
export const REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION = "REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION";
export const REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE = "REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE";

export interface TestDatabaseResolution {
  mode: "db" | "no-db";
  /** The database URL every test process must use. */
  databaseUrl: string;
  /** Sanitized description, safe to log. */
  target: "loopback" | "remote-test-opt-in" | "no-db-placeholder";
}

export function isLoopbackDatabaseUrl(url: string): boolean {
  return isLoopback(url);
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
    if (isLoopback(value)) continue;
    if (!remoteAllowed) {
      throw new TestDatabaseGuardError(
        `${name} points at a non-loopback database. DB tests run only against the runner's own throwaway database ` +
          "unless OPSIQ_ALLOW_REMOTE_TEST_DB=true explicitly declares a remote TEST database."
      );
    }
    // Remote opt-in = a remote NON-PRODUCTION database. Static identity check, before any connection.
    const verdict = classifyRemoteDatabaseUrl(value, env);
    if (verdict === "production") {
      throw new TestDatabaseGuardError(`${REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION} (${name}).`);
    }
    if (verdict === "unverifiable") {
      throw new TestDatabaseGuardError(`${REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE} (${name}): the URL is not a well-formed postgres URL with a plain hostname.`);
    }
  }

  return { mode: "db", databaseUrl, target: isLoopback(databaseUrl) ? "loopback" : "remote-test-opt-in" };
}

/** Reads the connected database's own identity (a read-only query); supplied by the caller (pg in setup/CLI). */
export type DatabaseIdentityReader = (url: string, sql: string) => Promise<Record<string, unknown> | undefined | null>;

export interface RemoteDatabaseVariable {
  name: string;
  url: string;
}

/** Every non-loopback database variable present in `env`, de-duplicated by URL (names kept for sanitized messages). */
export function remoteDatabaseVariables(env: DatabaseEnv, names: readonly string[] = TEST_DATABASE_VARIABLES): RemoteDatabaseVariable[] {
  const seen = new Map<string, RemoteDatabaseVariable>();
  for (const name of names) {
    const value = env[name]?.trim();
    if (!value || isLoopback(value) || seen.has(value)) continue;
    seen.set(value, { name, url: value });
  }
  return [...seen.values()];
}

/**
 * Runtime layer: for each remote database variable, read the connected database's own identity and refuse
 * production (by endpoint OR branch) or an identity that cannot be read. Runs before any DB test or Prisma
 * mutation. A read failure is "unverifiable" — fail closed. Never includes URL, host, user or password in an error.
 */
export async function verifyRemoteTestDatabaseIdentity(
  variables: readonly RemoteDatabaseVariable[],
  env: DatabaseEnv,
  readIdentity: DatabaseIdentityReader
): Promise<void> {
  for (const { name, url } of variables) {
    let row: Record<string, unknown> | undefined | null;
    try {
      row = await readIdentity(url, DATABASE_IDENTITY_SQL);
    } catch {
      throw new TestDatabaseGuardError(`${REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE} (${name}): the database identity could not be read.`);
    }
    const verdict = classifyDatabaseIdentity(databaseIdentityFromRow(row), env);
    if (verdict === "production") {
      throw new TestDatabaseGuardError(`${REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION} (${name}).`);
    }
    if (verdict === "unverifiable") {
      throw new TestDatabaseGuardError(`${REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE} (${name}): the database reports no readable identity.`);
    }
  }
}
