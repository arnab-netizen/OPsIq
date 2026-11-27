/**
 * F-PGBOUNCER-TXN-SAFETY real-PgBouncer test harness.
 *
 * Starts a disposable local PgBouncer instance in `pool_mode = transaction`
 * (matching Neon's own pooled endpoint -- Neon's docs state "Neon uses
 * PgBouncer in transaction mode (`pool_mode=transaction`)") in front of the
 * SAME local disposable PostgreSQL this suite's TEST_DATABASE_URL/
 * DATABASE_URL already points at, so hostile tests can connect THROUGH a
 * real transaction-pooled proxy instead of mocking PgBouncer's behavior.
 *
 * Gated on TEST_WITH_PGBOUNCER=true AND the `pgbouncer` binary actually
 * being resolvable. ci.yml's db-verify job installs PgBouncer and runs this
 * proof with an exact-count gate (scripts/ci/check-db-proof-counts.mjs), so a
 * missing binary there FAILS the job instead of skipping. Where the binary is
 * genuinely unavailable (a developer machine without it) the proof is
 * honestly skipped, never replaced by a mocked substitute for real
 * transaction-pooling evidence -- see the mission's own Phase 4.
 *
 * Clients reach the proxy with auth_type=trust (the proxy only listens on
 * 127.0.0.1), but PgBouncer must still authenticate ITS OWN backend
 * connection. When the direct Postgres URL carries a password (or PGPASSWORD
 * is set -- the password-authenticated CI service), it is passed to the
 * backend in the [databases] entry; a passwordless local trust/peer setup
 * keeps the previous behaviour (no password emitted).
 */
import { spawnSync, spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SHOULD_RUN_PGBOUNCER_TESTS = process.env.TEST_WITH_PGBOUNCER === "true";

function resolvePgbouncerBinary(): string | null {
  const candidates = [
    "/opt/homebrew/opt/pgbouncer/bin/pgbouncer",
    "/usr/local/opt/pgbouncer/bin/pgbouncer",
    "/usr/sbin/pgbouncer",
    "/usr/bin/pgbouncer",
  ];
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ["--version"]);
    if (check.status === 0) return candidate;
  }
  const whichResult = spawnSync("which", ["pgbouncer"], { encoding: "utf-8" });
  if (whichResult.status === 0) {
    const path = whichResult.stdout.trim();
    if (path) return path;
  }
  return null;
}

export const PGBOUNCER_BINARY = resolvePgbouncerBinary();

/** Quotes a value for a PgBouncer connection-string entry: single-quoted, with embedded single quotes doubled. */
export function quotePgbouncerValue(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** The [databases] entry for one database; `password=` is emitted only when a backend password is known. */
export function buildDatabaseEntry(opts: {
  databaseName: string;
  host: string;
  port: string;
  user: string;
  password: string;
}): string {
  const parts = [`host=${opts.host}`, `port=${opts.port}`, `dbname=${opts.databaseName}`, `user=${opts.user}`];
  if (opts.password) parts.push(`password=${quotePgbouncerValue(opts.password)}`);
  return `${opts.databaseName} = ${parts.join(" ")}`;
}

export interface PgBouncerHandle {
  /** Connection string for a real client to use, pointed at the PgBouncer proxy, not Postgres directly. */
  proxyUrl: string;
  stop: () => void;
}

/**
 * Starts a fresh PgBouncer instance in transaction-pool mode pointed at the
 * given direct Postgres URL, listening on a fresh local port. Each call
 * gets its own config/log/pid files in a fresh temp directory and its own
 * port, so parallel/sequential test runs never collide.
 */
export function startPgBouncer(directPostgresUrl: string, databaseName: string): PgBouncerHandle {
  if (!PGBOUNCER_BINARY) {
    throw new Error("startPgBouncer() called but no pgbouncer binary was resolved -- check SHOULD_RUN_PGBOUNCER_TESTS/PGBOUNCER_BINARY first.");
  }
  const url = new URL(directPostgresUrl);
  const pgHost = url.hostname || "127.0.0.1";
  const pgPort = url.port || "5432";
  const pgUser = decodeURIComponent(url.username) || process.env.USER || "postgres";
  const pgPassword = decodeURIComponent(url.password) || process.env.PGPASSWORD || "";

  const dir = mkdtempSync(join(tmpdir(), "pgbouncer-txn-test-"));
  // Port chosen from a wide, uncommon range and randomized per call to avoid
  // collisions between sequential test files/processes reusing a stale port.
  const listenPort = 20000 + Math.floor(Math.random() * 10000);

  const iniPath = join(dir, "pgbouncer.ini");
  const userlistPath = join(dir, "userlist.txt");
  const logPath = join(dir, "pgbouncer.log");
  const pidPath = join(dir, "pgbouncer.pid");

  writeFileSync(
    userlistPath,
    `"${pgUser}" ""\n`,
  );
  writeFileSync(
    iniPath,
    [
      "[databases]",
      buildDatabaseEntry({ databaseName, host: pgHost, port: pgPort, user: pgUser, password: pgPassword }),
      "",
      "[pgbouncer]",
      "listen_addr = 127.0.0.1",
      `listen_port = ${listenPort}`,
      "auth_type = trust",
      `auth_file = ${userlistPath}`,
      "pool_mode = transaction",
      "max_client_conn = 100",
      "default_pool_size = 5",
      `logfile = ${logPath}`,
      `pidfile = ${pidPath}`,
      `admin_users = ${pgUser}`,
    ].join("\n") + "\n",
  );

  const proc: ChildProcess = spawn(PGBOUNCER_BINARY, [iniPath], { stdio: "ignore" });
  // Give pgbouncer a brief moment to bind its listen port before any caller
  // tries to connect. A fixed short wait is acceptable here: this is local
  // test-harness setup, not a production code path.
  spawnSync("sleep", ["0.4"]);

  return {
    proxyUrl: `postgresql://${pgUser}@127.0.0.1:${listenPort}/${databaseName}`,
    stop: () => {
      try {
        proc.kill("SIGTERM");
      } catch {
        // already dead
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
