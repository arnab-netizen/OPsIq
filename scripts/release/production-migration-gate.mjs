#!/usr/bin/env node
/**
 * Production migration release gate (runs as the first step of `npm run build`).
 *
 * ─── Incident this prevents ──────────────────────────────────────────────────
 *
 * Merge 58f1d87e added migration 20260925120000_add_verification_baseline_provenance.
 * Vercel built and PROMOTED that commit to production while the migration was
 * still unapplied (production migrations run only through the manual, owner-
 * approved .github/workflows/migrate-production.yml). The platform reported the
 * deployment READY; the application's own startup check reported FAILED
 * ("Migration history is not current: 1 pending") and every query touching the
 * new columns would have failed until the migration workflow was run.
 *
 * ─── Contract ────────────────────────────────────────────────────────────────
 *
 * On a Vercel PRODUCTION build (VERCEL_ENV=production) this gate compares the
 * migrations committed in the commit being built (prisma/migrations/<name>/
 * migration.sql) with the production database's _prisma_migrations history and
 * FAILS THE BUILD unless:
 *   - every committed migration is applied (pending = 0);
 *   - no migration row is failed / in progress / rolled back (failed = 0) —
 *     the same rule the runtime startup check applies
 *     (src/services/monitoring/migration-check.ts), so a build that passes this
 *     gate cannot boot into "Migration history is not current";
 *   - no applied migration's recorded checksum differs from the committed file
 *     (a migration edited after it was applied).
 * A failed Vercel build is never promoted: production keeps serving the last
 * good deployment and the failed deployment is visible in Vercel and as the
 * commit status on `main`.
 *
 * The gate is READ-ONLY (a single SELECT inside a READ ONLY transaction). It
 * never applies, resolves or edits migrations — the approved migration
 * workflow remains the only production migration path. It reads the database
 * the deployment itself will use (the production DATABASE_URL Vercel injects),
 * so it cannot inspect the wrong database. It never prints the URL, host,
 * user or password. It fails closed on any uncertainty (missing URL, missing
 * migrations directory, unreachable database, missing history table).
 *
 * ─── Credential separation (least-privilege runtime role) ────────────────────
 *
 * A production build must never see a MIGRATOR credential: the runtime
 * connects as the least-privilege role and the schema owner's URL belongs
 * only to the governed migration workflows. The gate therefore BLOCKS when
 * any migrator-credential variable (MIGRATOR_CREDENTIAL_VARIABLES) is present
 * in the production build environment. When OPSIQ_REQUIRE_RUNTIME_ROLE names
 * the runtime role (set at the owner-authorized cutover), the gate also
 * requires that DATABASE_URL really authenticates AS that role, that the
 * session is not that of a superuser / role-creating / RLS-bypassing login,
 * and that the role has every grant it needs (no unreadable application
 * table other than the erasure ledger) — so a release whose migration added
 * a table the runtime cannot use is refused BEFORE it is promoted.
 *
 * Preview, CI and local builds (VERCEL_ENV != production) are not gated.
 * OPSIQ_RELEASE_GATE_FORCE=1 turns the gate ON outside Vercel (operator dry
 * run / tests); there is deliberately no switch that turns it off in
 * production.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_PROCEDURE_DOC = "docs/deployment/PRODUCTION_RELEASE_PROCEDURE.md";

/** Credentials that belong to the governed migration path only; a production BUILD / RUNTIME environment must not carry them. */
export const MIGRATOR_CREDENTIAL_VARIABLES = [
  "MIGRATION_DATABASE_URL",
  "OWNER_DATABASE_URL",
  "PRODUCTION_DATABASE_URL",
  "OPSIQ_RUNTIME_PROBE_DATABASE_URL",
];

/** Application tables the runtime role must NOT be able to read (kept in step with RUNTIME_DENIED_TABLES in role-topology.ts; asserted by a test). */
export const RUNTIME_DENIED_TABLES = ["privacy_erasure_requests"];

/**
 * Write-capability probe target: a table the runtime role must legitimately be able to UPDATE and which is
 * present once migrations are current (see docs/opsiq/product/RUNTIME_ROLE_CUTOVER.md §2). Kept in step with
 * the identical probe added to probeRuntimeRole() (src/services/privacy-erasure/runtime-role-probe.ts).
 */
export const WRITE_CAPABILITY_TARGET_TABLE = "public.startup_status";
/** Exact PostgreSQL SQLSTATEs the write-capability probe distinguishes — never matched by English error text. */
export const READ_ONLY_SQL_TRANSACTION_SQLSTATE = "25006";
export const INSUFFICIENT_PRIVILEGE_SQLSTATE = "42501";

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

/** Bounded SQLSTATE only — never the server's raw error message, which can echo a hostname on some drivers. */
function sqlStateOf(e) {
  const code = e && typeof e === "object" && "code" in e ? String(e.code) : null;
  return code && SQLSTATE_PATTERN.test(code) ? code : null;
}

/** Committed migrations: [{ name, checksum }] sorted by name, or null when unreadable (fail closed). */
export function listCommittedMigrations(migrationsDir) {
  if (!existsSync(migrationsDir)) return null;
  try {
    return readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const sqlPath = join(migrationsDir, e.name, "migration.sql");
        const checksum = existsSync(sqlPath)
          ? createHash("sha256").update(readFileSync(sqlPath)).digest("hex")
          : null;
        return { name: e.name, checksum };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return null;
  }
}

/**
 * Pure decision. `rows` are _prisma_migrations rows
 * ({ migration_name, checksum, finished_at, rolled_back_at }).
 */
export function evaluateMigrationGate({ committed, rows }) {
  if (!Array.isArray(committed)) {
    return { ok: false, verdict: "MIGRATIONS_DIRECTORY_UNREADABLE", pending: [], failed: [], modified: [], dbAhead: [] };
  }
  const failed = [];
  const appliedChecksums = new Map();
  for (const row of rows) {
    if (row.rolled_back_at != null || row.finished_at == null) {
      failed.push(row.migration_name);
    } else {
      const list = appliedChecksums.get(row.migration_name) ?? [];
      list.push(row.checksum);
      appliedChecksums.set(row.migration_name, list);
    }
  }
  const committedNames = new Set(committed.map((m) => m.name));
  const pending = committed.filter((m) => !appliedChecksums.has(m.name)).map((m) => m.name);
  const modified = committed
    .filter((m) => appliedChecksums.has(m.name) && !appliedChecksums.get(m.name).includes(m.checksum))
    .map((m) => m.name);
  // Applied in the database but absent from this commit: the database schema is
  // AHEAD of this code (e.g. redeploying an older commit). Expand/contract
  // migrations keep older code compatible, so this is reported, not blocked.
  const dbAhead = [...appliedChecksums.keys()].filter((n) => !committedNames.has(n)).sort();

  let verdict = "MIGRATIONS_CURRENT";
  if (failed.length > 0) verdict = "FAILED_MIGRATION_PRESENT";
  else if (modified.length > 0) verdict = "APPLIED_MIGRATION_MODIFIED";
  else if (pending.length > 0) verdict = "PRODUCTION_MIGRATION_REQUIRED";
  return { ok: verdict === "MIGRATIONS_CURRENT", verdict, pending, failed, modified, dbAhead };
}

/** Operator-facing report. Never contains connection details. */
export function formatGateReport(result) {
  const lines = [`[release-gate] ${result.ok ? "PASS" : "BLOCKED"}: ${result.verdict}`];
  if (result.pending.length) {
    lines.push(`[release-gate] PRODUCTION MIGRATION REQUIRED — ${result.pending.length} committed migration(s) not applied to production:`);
    for (const n of result.pending) lines.push(`[release-gate]   - ${n}`);
  }
  if (result.failed.length) {
    lines.push(`[release-gate] Failed / in-progress / rolled-back migration rows in production: ${result.failed.join(", ")}`);
    lines.push("[release-gate] Do NOT redeploy or re-run migrations blindly — resolve the failed migration first.");
  }
  if (result.modified.length) {
    lines.push(`[release-gate] Applied migrations whose committed file changed after they were applied: ${result.modified.join(", ")}`);
    lines.push("[release-gate] Applied migrations are immutable — restore the original file and add a NEW migration instead.");
  }
  if (result.dbAhead.length) {
    lines.push(`[release-gate] Note: production has ${result.dbAhead.length} applied migration(s) newer than this commit (older code on a newer schema).`);
  }
  if (!result.ok) {
    lines.push("[release-gate] This production build is refused so it cannot be promoted; production keeps serving the last good deployment.");
    if (result.pending.length) {
      lines.push(
        "[release-gate] Next step: run GitHub Actions → 'Migrate Production Database' (mode MAIN" +
          (result.pending.length === 1 ? `, migration_name ${result.pending[0]}` : "; the workflow applies exactly one migration per run") +
          "), then redeploy main."
      );
    }
    lines.push(`[release-gate] Procedure: ${RELEASE_PROCEDURE_DOC}`);
  }
  return lines.join("\n");
}

async function readMigrationRows(databaseUrl) {
  const { default: pg } = await import("pg");
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15000 });
    try {
      await client.connect();
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = 10000");
      const res = await client.query(
        'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"'
      );
      await client.query("COMMIT");
      return res.rows;
    } catch (e) {
      lastError = e;
    } finally {
      await client.end().catch(() => {});
    }
  }
  // Sanitized: the error class/code only, never the message (it can echo the host).
  const code = lastError && typeof lastError === "object" && "code" in lastError ? String(lastError.code) : "unknown";
  throw new Error(`could not read production migration history (error code ${code})`);
}

/**
 * Who the production DATABASE_URL actually authenticates as, and whether that session is least-privilege.
 * Returns { currentUser, dangerous: [attribute names], ungranted: [table names] }. Read-only.
 */
async function readRuntimeIdentity(databaseUrl) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = 10000");
    const who = await client.query(
      "SELECT current_user AS u, (SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication FROM pg_roles WHERE rolname = current_user) AS dangerous"
    );
    const gaps = await client.query(
      `SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
         AND NOT has_table_privilege(current_user, c.oid, 'SELECT') AND c.relname <> ALL ($1::text[]) ORDER BY 1`,
      [RUNTIME_DENIED_TABLES]
    );
    await client.query("COMMIT");
    return { currentUser: who.rows[0].u, dangerous: Boolean(who.rows[0].dangerous), ungranted: gaps.rows.map((r) => r.relname) };
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String(e.code) : "unknown";
    throw new Error(`could not verify the runtime database role (error code ${code})`);
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Canonical runtime WRITE-CAPABILITY proof, pure over an already-connected client (no I/O beyond it — unit
 * testable with a fake client, no database required). This closes the assurance gap behind the Production
 * incident this gate exists to prevent: the prior release gate and runtime-role identity checks both ran
 * inside `BEGIN READ ONLY`, so a release could pass every pre-deploy gate while the runtime's first real
 * application INSERT still failed with "cannot execute INSERT in a read-only transaction". Steps:
 *   1. identity — the SAME connection must authenticate as the required runtime role;
 *   2/3. transaction_read_only and default_transaction_read_only must both read "off" BEFORE any explicit
 *        transaction is opened (a read replica, or a role-level read-only default, shows up here);
 *   4. BEGIN — a normal, NOT READ ONLY transaction;
 *   5. a write-class no-op UPDATE (zero rows by construction: WHERE false) against a table the runtime must
 *      legitimately be able to write and which exists once migrations are current;
 *   6. ROLLBACK — ALWAYS, in a finally, whether the UPDATE succeeded or failed. No persistent mutation is
 *      ever possible: WHERE false guarantees zero rows even if the rollback were somehow skipped.
 * Any failure (identity mismatch, either read-only setting "on", the UPDATE rejected for any SQLSTATE, an
 * unexpected error) fails closed with a bounded, secret-free classification — never the server's raw error
 * message, which can echo a hostname on some drivers.
 */
export async function proveWriteCapabilityOnClient(client, requiredRole, targetTable = WRITE_CAPABILITY_TARGET_TABLE) {
  let who;
  try {
    who = await client.query("SELECT current_user AS u, session_user AS s");
  } catch (e) {
    return { ok: false, code: "CONNECTION_OR_QUERY_FAILURE", sqlState: sqlStateOf(e) };
  }
  if (who.rows[0]?.u !== requiredRole) {
    return { ok: false, code: "IDENTITY_MISMATCH", sqlState: null };
  }

  let settings;
  try {
    settings = await client.query(
      "SELECT current_setting('transaction_read_only') AS txn, current_setting('default_transaction_read_only') AS dflt"
    );
  } catch (e) {
    return { ok: false, code: "CONNECTION_OR_QUERY_FAILURE", sqlState: sqlStateOf(e) };
  }
  const { txn, dflt } = settings.rows[0] ?? {};
  if (txn !== "off") return { ok: false, code: "TRANSACTION_READ_ONLY", sqlState: null };
  if (dflt !== "off") return { ok: false, code: "DEFAULT_TRANSACTION_READ_ONLY", sqlState: null };

  let began = false;
  try {
    await client.query("BEGIN");
    began = true;
    await client.query(`UPDATE ${targetTable} SET "updated_at" = "updated_at" WHERE false`);
    return { ok: true, code: "PASS", sqlState: null };
  } catch (e) {
    const sqlState = sqlStateOf(e);
    if (sqlState === READ_ONLY_SQL_TRANSACTION_SQLSTATE) return { ok: false, code: "READ_ONLY_SQL_TRANSACTION", sqlState };
    if (sqlState === INSUFFICIENT_PRIVILEGE_SQLSTATE) return { ok: false, code: "INSUFFICIENT_PRIVILEGE", sqlState };
    return { ok: false, code: "UNEXPECTED_SQLSTATE", sqlState };
  } finally {
    if (began) {
      // Best-effort: a rollback failure must never override the already-decided result above, and this
      // probe never retries or escalates — the caller's own connection teardown handles a poisoned session.
      await client.query("ROLLBACK").catch(() => {});
    }
  }
}

/** Connects AS the candidate runtime DATABASE_URL, proves write capability, and always closes the connection. */
async function readRuntimeWriteCapability(databaseUrl, requiredRole) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
  } catch (e) {
    return { ok: false, code: "CONNECTION_FAILURE", sqlState: sqlStateOf(e) };
  }
  try {
    return await proveWriteCapabilityOnClient(client, requiredRole);
  } finally {
    await client.end().catch(() => {});
  }
}

/** Pure decision for the write-capability result. Never contains connection details. */
export function evaluateWriteCapability(capability, requiredRole) {
  if (capability && capability.ok) return { ok: true, lines: [] };
  const sqlState = capability && typeof capability.sqlState === "string" && SQLSTATE_PATTERN.test(capability.sqlState) ? capability.sqlState : null;
  const suffix = sqlState ? ` (SQLSTATE ${sqlState})` : "";
  const code = capability?.code ?? "UNVERIFIED";
  const messages = {
    IDENTITY_MISMATCH: `the write-capability probe connected as a role other than the required runtime role "${requiredRole}"`,
    TRANSACTION_READ_ONLY: 'the runtime connection\'s transaction_read_only is "on" — it cannot start a normal read-write transaction',
    DEFAULT_TRANSACTION_READ_ONLY: 'the runtime role\'s default_transaction_read_only is "on" — every new transaction starts read-only',
    READ_ONLY_SQL_TRANSACTION: `the write-class no-op UPDATE was rejected as a read-only transaction${suffix}`,
    INSUFFICIENT_PRIVILEGE: `the runtime role lacks UPDATE privilege on ${WRITE_CAPABILITY_TARGET_TABLE}${suffix}`,
    CONNECTION_FAILURE: "the write-capability probe could not connect",
    CONNECTION_OR_QUERY_FAILURE: `the write-capability probe failed before completing${suffix}`,
    UNEXPECTED_SQLSTATE: `the write-class no-op UPDATE failed unexpectedly${suffix}`,
    UNVERIFIED: "runtime write capability could not be verified",
  };
  const msg = messages[code] ?? messages.UNVERIFIED;
  return { ok: false, lines: [`[release-gate] BLOCKED: ${msg} (fail closed).`] };
}

/** Pure decision for the credential-separation / runtime-role rules. Never contains connection details. */
export function evaluateRuntimeRole({ env, identity }) {
  const exposed = MIGRATOR_CREDENTIAL_VARIABLES.filter((n) => (env[n] ?? "").trim() !== "");
  if (exposed.length > 0) {
    return { ok: false, lines: [`[release-gate] BLOCKED: migrator credential variable(s) present in the production build environment: ${exposed.join(", ")}. The schema owner's credential belongs only to the governed migration workflows; remove it from Vercel (the runtime must never be able to fall back to it).`] };
  }
  const required = (env.OPSIQ_REQUIRE_RUNTIME_ROLE ?? "").trim();
  if (!required) return { ok: true, lines: [] };
  if (!ROLE_NAME.test(required)) {
    return { ok: false, lines: ["[release-gate] BLOCKED: OPSIQ_REQUIRE_RUNTIME_ROLE is not a valid role name (fail closed)."] };
  }
  if (!identity) return { ok: false, lines: ["[release-gate] BLOCKED: the runtime database role could not be verified (fail closed)."] };
  const lines = [];
  if (identity.currentUser !== required) lines.push(`[release-gate] BLOCKED: DATABASE_URL authenticates as a role other than the required runtime role "${required}".`);
  if (identity.dangerous) lines.push("[release-gate] BLOCKED: the runtime login holds a dangerous attribute (superuser / createrole / createdb / bypassrls / replication).");
  if (identity.ungranted.length > 0) {
    lines.push(`[release-gate] BLOCKED: the runtime role cannot read ${identity.ungranted.length} application table(s): ${identity.ungranted.slice(0, 20).join(", ")}${identity.ungranted.length > 20 ? ", …" : ""}.`);
    lines.push("[release-gate] A migration added a table the runtime role has no grant on. Run the governed role reconcile (docs/opsiq/product/RUNTIME_ROLE_CUTOVER.md), then redeploy.");
  }
  return { ok: lines.length === 0, lines };
}

export async function runGate({ env = process.env, cwd = process.cwd(), readRows = readMigrationRows, readIdentity = readRuntimeIdentity, readWriteCapability = readRuntimeWriteCapability } = {}) {
  const enforced = env.VERCEL_ENV === "production" || env.OPSIQ_RELEASE_GATE_FORCE === "1";
  if (!enforced && env.VERCEL === "1" && !env.VERCEL_ENV) {
    // On Vercel but the target environment is not exposed (system env vars disabled):
    // this could be a production build — fail closed rather than skip.
    return {
      exitCode: 1,
      output: `[release-gate] BLOCKED: running on Vercel without VERCEL_ENV, so production cannot be ruled out (fail closed). Enable "Automatically expose System Environment Variables". Procedure: ${RELEASE_PROCEDURE_DOC}`,
    };
  }
  if (!enforced) {
    return { exitCode: 0, output: `[release-gate] SKIPPED: not a production build (VERCEL_ENV=${env.VERCEL_ENV ?? "unset"})` };
  }
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return {
      exitCode: 1,
      output: `[release-gate] BLOCKED: DATABASE_URL is not available to the production build, so migration state cannot be verified (fail closed). Procedure: ${RELEASE_PROCEDURE_DOC}`,
    };
  }
  const committed = listCommittedMigrations(join(cwd, "prisma", "migrations"));
  if (committed === null) {
    return { exitCode: 1, output: "[release-gate] BLOCKED: prisma/migrations is not readable in this build (fail closed)." };
  }
  let rows;
  try {
    rows = await readRows(databaseUrl);
  } catch (e) {
    return {
      exitCode: 1,
      output: `[release-gate] BLOCKED: ${e instanceof Error ? e.message : "migration history unavailable"} (fail closed). Procedure: ${RELEASE_PROCEDURE_DOC}`,
    };
  }
  const result = evaluateMigrationGate({ committed, rows });
  let report = formatGateReport(result);
  let ok = result.ok;
  const requiredRole = (env.OPSIQ_REQUIRE_RUNTIME_ROLE ?? "").trim();
  let identity = null;
  if (requiredRole && ROLE_NAME.test(requiredRole)) {
    try {
      identity = await readIdentity(databaseUrl);
    } catch (e) {
      identity = null;
      report += `\n[release-gate] ${e instanceof Error ? e.message : "runtime role unavailable"}`;
    }
  }
  const roleDecision = evaluateRuntimeRole({ env, identity });
  if (!roleDecision.ok) {
    ok = false;
    report += `\n${roleDecision.lines.join("\n")}`;
    report += `\n[release-gate] Procedure: ${RELEASE_PROCEDURE_DOC}`;
  } else if (requiredRole) {
    report += `\n[release-gate] PASS: runtime role "${requiredRole}" verified (least-privilege, all application tables granted).`;
    // Least-privilege identity/grants passed; now prove the runtime can actually start a normal read-write
    // transaction and execute a write-class statement — the assurance gap the prior read-only-only checks
    // left open (see proveWriteCapabilityOnClient()'s doc comment for the incident this closes).
    let capability;
    try {
      capability = await readWriteCapability(databaseUrl, requiredRole);
    } catch (e) {
      capability = { ok: false, code: "UNEXPECTED_ERROR", sqlState: sqlStateOf(e) };
    }
    const capabilityDecision = evaluateWriteCapability(capability, requiredRole);
    if (!capabilityDecision.ok) {
      ok = false;
      report += `\n${capabilityDecision.lines.join("\n")}`;
      report += `\n[release-gate] Procedure: ${RELEASE_PROCEDURE_DOC}`;
    } else {
      report += `\n[release-gate] PASS: runtime role "${requiredRole}" verified read-write capable (no-op transaction rolled back).`;
    }
  }
  return { exitCode: ok ? 0 : 1, output: report, result: { ...result, ok } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { exitCode, output } = await runGate();
  (exitCode === 0 ? console.log : console.error)(output);
  process.exit(exitCode);
}
