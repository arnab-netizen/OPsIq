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
 * The migration-history inspection above and the identity/grant inspection in the next section are both
 * READ-ONLY (a single SELECT inside a `BEGIN READ ONLY` transaction each). Neither one applies, resolves or
 * edits migrations — the approved migration workflow remains the only production migration path. The gate
 * as a WHOLE is not purely read-only, however: when `OPSIQ_REQUIRE_RUNTIME_ROLE` is set (see the next
 * section), it ALSO executes a runtime write-capability proof (`proveWriteCapabilityOnClient()`) that, only
 * after first proving the target schema carries no unsafe statement-level UPDATE trigger or UPDATE rewrite
 * rule, opens a normal (not read-only) transaction and runs one zero-row, write-class `UPDATE ... WHERE
 * false` statement — never any other statement, never more than zero rows — and whose rollback must itself
 * be confirmed to succeed before this gate reports anything other than a failure (see
 * `proveWriteCapabilityOnClient()`'s own doc comment for the full three-part invariant). No path through
 * this file ever causes a persistent Production data change. Every check reads the database the deployment
 * itself will use (the production DATABASE_URL Vercel injects), so it cannot inspect the wrong database,
 * and it never prints the URL, host,
 * user or password. It fails closed on any uncertainty (missing URL, missing migrations directory,
 * unreachable database, missing history table, an unconfirmed rollback).
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
 * the identical constant added to probeRuntimeRole() (src/services/privacy-erasure/runtime-role-probe.ts) —
 * a drift test (runtime-role-release-gate.test.ts) asserts both are byte-identical.
 */
export const WRITE_CAPABILITY_TARGET_TABLE = "public.startup_status";
/**
 * Schema-safety precondition for the write-capability no-op: `WHERE false` guarantees the UPDATE itself
 * matches zero rows, but that alone does NOT guarantee zero side effects for every possible schema —
 * PostgreSQL fires a STATEMENT-level UPDATE trigger even when zero rows match (unlike a ROW-level trigger,
 * which only fires per matched row; verified against real PostgreSQL in runtime-role.db.test.ts). An
 * UPDATE rewrite RULE is refused on its mere PRESENCE for a different reason: a rule's own effective
 * row-matching semantics (plain `DO ALSO`, `DO INSTEAD`, a rule-level `WHERE` unrelated to the triggering
 * command, …) are operator-defined SQL and not safely predictable in general — proving in general whether
 * any given rule would or would not fire for this specific no-op is fragile, so this refuses unconditionally
 * on presence rather than attempting that prediction (also verified in runtime-role.db.test.ts: a plain
 * `DO ALSO` rule does NOT fire for this probe's own `WHERE false` UPDATE, yet the guard still refuses it).
 * This query proves neither an unsafe trigger nor any UPDATE rule exists on the probe target BEFORE any
 * write statement is ever attempted. `$1::regclass` is a parameterized relation lookup — never an
 * interpolated, caller-controlled identifier — so this can only ever inspect the single fixed,
 * repository-public target table.
 *   tgtype bit layout (PostgreSQL pg_trigger.tgtype): ROW = 1, UPDATE = 16. A trigger is STATEMENT-level
 *   exactly when the ROW bit is clear; it fires on UPDATE exactly when the UPDATE bit is set.
 *   tgisinternal excludes system-internal triggers (e.g. those backing constraints); tgenabled <> 'D'
 *   excludes a trigger an operator has explicitly disabled (ALTER TABLE ... DISABLE TRIGGER) — a disabled
 *   trigger cannot fire and is not a threat.
 *   pg_rewrite.ev_type '2' is PostgreSQL's catalog encoding for an UPDATE rule (the semantic field itself,
 *   never parsed from `pg_get_ruledef()` text).
 * Kept in step with the identical SQL in src/services/privacy-erasure/runtime-role-probe.ts — a drift test
 * (runtime-role-release-gate.test.ts) asserts both are byte-identical.
 */
export const SCHEMA_SAFETY_SQL =
  "SELECT " +
  "(SELECT count(*)::int FROM pg_trigger t WHERE t.tgrelid = $1::regclass AND NOT t.tgisinternal AND t.tgenabled <> 'D' AND (t.tgtype::int & 1) = 0 AND (t.tgtype::int & 16) <> 0) AS unsafe_triggers, " +
  "(SELECT count(*)::int FROM pg_rewrite r WHERE r.ev_class = $1::regclass AND r.ev_type = '2') AS unsafe_rules";
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
 *   1. identity — the SAME connection must authenticate as the required runtime role, as BOTH current_user
 *      AND session_user. session_user identifies the actually-authenticated login; checking current_user
 *      alone would let a connection authenticated as a stronger login that merely SET ROLE'd to the runtime
 *      role satisfy this boundary, which it must not (this mirrors the governed runtime probe's own
 *      existing invariant that current_user = session_user for a genuine runtime connection);
 *   2/3. transaction_read_only and default_transaction_read_only must both read "off" BEFORE any explicit
 *        transaction is opened (a read replica, or a role-level read-only default, shows up here);
 *   4. schema safety — BEFORE any transaction is opened, prove the target has no unsafe statement-level
 *      UPDATE trigger and no UPDATE rewrite rule at all (see SCHEMA_SAFETY_SQL's doc comment: a zero-row
 *      `WHERE false` UPDATE still fires a STATEMENT-level trigger regardless of row count, and an UPDATE
 *      rule's own row-matching semantics are operator-defined SQL not safely predictable in general, so
 *      "matches zero rows" is NOT by itself sufficient to guarantee zero side effects for every possible
 *      schema — only for today's schema, which has no such trigger or rule);
 *   5. BEGIN — a normal, NOT READ ONLY transaction;
 *   6. a write-class no-op UPDATE (zero rows by construction: WHERE false) against a table the runtime must
 *      legitimately be able to write and which exists once migrations are current;
 *   7. ROLLBACK — attempted once BEGIN has succeeded, and its OUTCOME IS CHECKED: the function's final
 *      result is never returned until rollback has been confirmed, because the gate's own success line
 *      ("no-op transaction rolled back") must never be printed on an unconfirmed cleanup. If rollback
 *      itself fails after the UPDATE succeeded, this fails closed as ROLLBACK_FAILURE rather than reporting
 *      the provisional PASS; if rollback fails after the UPDATE already failed, the original substantive
 *      failure is preserved (never upgraded or downgraded) with an additional `rollbackFailed` marker — in
 *      no case does a rollback failure ever produce `ok: true`.
 * The complete no-persistent-mutation invariant therefore has THREE parts, not one: the target schema is
 * first proven free of unsafe statement-level UPDATE behavior (step 4); the probe statement itself matches
 * zero rows (step 6); and success is reported only once the explicit ROLLBACK is confirmed (step 7). Any
 * failure or uncertainty at any of these — identity mismatch, either read-only setting "on", an unsafe
 * schema, the UPDATE rejected for any SQLSTATE, a rollback that cannot be confirmed, an unexpected error —
 * fails closed with a bounded, secret-free classification — never the server's raw error message, which
 * can echo a hostname on some drivers, and never a trigger/rule name or definition.
 */
export async function proveWriteCapabilityOnClient(client, requiredRole, targetTable = WRITE_CAPABILITY_TARGET_TABLE) {
  let who;
  try {
    who = await client.query("SELECT current_user AS u, session_user AS s");
  } catch (e) {
    return { ok: false, code: "CONNECTION_OR_QUERY_FAILURE", sqlState: sqlStateOf(e) };
  }
  const { u, s } = who.rows[0] ?? {};
  if (u !== requiredRole || s !== requiredRole) {
    // Both current_user and session_user must equal the required role. The required role name itself is
    // not a secret (it is operator-configured and already echoed elsewhere in this file); the CONNECTED
    // identity, if different, is withheld — it could name an unexpected/infrastructure-sensitive login.
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

  // Schema safety: proven BEFORE opening any transaction, so a target that develops an unsafe
  // statement-level UPDATE trigger or UPDATE rewrite rule refuses the probe before BEGIN, UPDATE, or any
  // other write-class statement ever runs (see SCHEMA_SAFETY_SQL's doc comment for why `WHERE false` alone
  // is not a sufficient guarantee for every possible future schema).
  let safetyRow;
  try {
    safetyRow = await client.query(SCHEMA_SAFETY_SQL, [targetTable]);
  } catch (e) {
    return { ok: false, code: "CONNECTION_OR_QUERY_FAILURE", sqlState: sqlStateOf(e) };
  }
  const { unsafe_triggers, unsafe_rules } = safetyRow.rows[0] ?? {};
  if (Number(unsafe_triggers) > 0 || Number(unsafe_rules) > 0) {
    return { ok: false, code: "UNSAFE_WRITE_PROBE_SCHEMA", sqlState: null };
  }

  let began = false;
  let provisional;
  try {
    await client.query("BEGIN");
    began = true;
    await client.query(`UPDATE ${targetTable} SET "updated_at" = "updated_at" WHERE false`);
    provisional = { ok: true, code: "PASS", sqlState: null };
  } catch (e) {
    const sqlState = sqlStateOf(e);
    if (sqlState === READ_ONLY_SQL_TRANSACTION_SQLSTATE) provisional = { ok: false, code: "READ_ONLY_SQL_TRANSACTION", sqlState };
    else if (sqlState === INSUFFICIENT_PRIVILEGE_SQLSTATE) provisional = { ok: false, code: "INSUFFICIENT_PRIVILEGE", sqlState };
    else provisional = { ok: false, code: "UNEXPECTED_SQLSTATE", sqlState };
  }

  if (!began) {
    // BEGIN itself never ran (unreachable in practice — the catch above always sets `began` before the
    // UPDATE attempt — but kept explicit so there is never an attempt to roll back a transaction that was
    // never opened).
    return provisional;
  }

  // The explicit transaction's cleanup must be PROVEN, not merely attempted: this function's result is
  // withheld until ROLLBACK has been confirmed to succeed, so a caller can never be told "rolled back" on
  // an unconfirmed cleanup.
  try {
    await client.query("ROLLBACK");
  } catch (e) {
    const rollbackSqlState = sqlStateOf(e);
    if (provisional.ok) {
      // The UPDATE itself succeeded, but cleanup could not be confirmed — fail closed. Never report
      // success when the explicit transaction's own rollback cannot be proven to have completed.
      return { ok: false, code: "ROLLBACK_FAILURE", sqlState: rollbackSqlState };
    }
    // The UPDATE already failed closed; a rollback failure on top of that is additional diagnostic
    // context only — it never upgrades the result and can never produce a PASS.
    return { ...provisional, rollbackFailed: true, rollbackSqlState };
  }

  return provisional;
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
    ROLLBACK_FAILURE: `the write-capability probe's no-op UPDATE succeeded but its ROLLBACK could not be confirmed${suffix} — refusing to report success on an unconfirmed cleanup`,
    UNSAFE_WRITE_PROBE_SCHEMA: "write-capability probe target has statement-level UPDATE behavior (trigger or rewrite rule); refusing unsafe no-op proof",
    UNVERIFIED: "runtime write capability could not be verified",
  };
  const msg = messages[code] ?? messages.UNVERIFIED;
  const rollbackNote = capability && capability.rollbackFailed ? " Its ROLLBACK also could not be confirmed afterward." : "";
  return { ok: false, lines: [`[release-gate] BLOCKED: ${msg} (fail closed).${rollbackNote}`] };
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
