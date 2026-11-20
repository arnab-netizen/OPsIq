#!/usr/bin/env node
/**
 * Governed production BATCH migration gates (MAIN_BATCH mode of .github/workflows/migrate-production.yml).
 *
 * Why this exists: the single-migration MAIN gate (scripts/classify-migrate-status.mjs) refuses any state with more
 * than one pending migration, so a production database that is several migrations behind main could never be
 * brought current through the governed path. This script lets an ordered, version-controlled, PR-reviewed batch
 * (.claude/production-migration-batches/<batch_id>.json) be applied by the SAME `prisma migrate deploy` step, after
 * a fail-closed proof that exactly that batch -- and nothing else -- is pending.
 *
 * Subcommands (all database reads are parameterized or fixed SELECTs inside BEGIN READ ONLY; no statement text is
 * ever built from the manifest, the ledger or an input; no arbitrary SQL):
 *   preflight       offline manifest + migration-file + additive-scan checks, then the live ledger classification
 *                   (FRESH or RESUME), the object pre-existence check and the recovery-point record. Writes
 *                   batch-preflight.json and batch-recovery-point.json into OUTPUT_DIR.
 *   status-crosscheck  prisma's own `migrate status` output must list exactly the expected pending names.
 *   postverify      after `prisma migrate deploy`: ledger == pre-batch anchor + batch exactly, every migration
 *                   finished with a matching checksum, every expected object present.
 *
 * Environment: DATABASE_URL (the production operator URL), BATCH_ID, OUTPUT_DIR (default .), and for
 * status-crosscheck STATUS_EXIT / STATUS_OUTPUT. PGOPTIONS="-c default_transaction_read_only=on" must be set by the
 * caller; the script verifies the session really is read-only and refuses otherwise.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanAdditiveOnly } from "./migration-additive-scan.mjs";

export const BATCH_SIZE_CAP = 10;
export const MANIFEST_DIR = ".claude/production-migration-batches";
export const BATCH_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
export const MIGRATION_NAME_PATTERN = /^[0-9]{14}_[a-zA-Z0-9_]+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const IDENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export const sha256Hex = (bufOrText) => createHash("sha256").update(bufOrText).digest("hex");
const byteOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** sha256 over the ordered "name|checksum" lines of a ledger (byte order of names, "\n"-joined, no trailing newline). */
export function ledgerAnchor(rows) {
  const lines = [...rows].sort((a, b) => byteOrder(a.name, b.name)).map((r) => `${r.name}|${r.checksum}`);
  return { count: lines.length, sha256: sha256Hex(lines.join("\n")) };
}

// ─── manifest ────────────────────────────────────────────────────────────────

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function checkNames(list, what, shape, errors) {
  if (!Array.isArray(list)) {
    errors.push(`${what} must be an array`);
    return;
  }
  for (const [i, item] of list.entries()) {
    if (!isObj(item)) {
      errors.push(`${what}[${i}] must be an object`);
      continue;
    }
    for (const f of Object.keys(item)) if (!shape.includes(f)) errors.push(`${what}[${i}] has unexpected field '${f}'`);
  }
}

/** Strict structural validation of a manifest (unknown fields rejected). Returns { ok, errors }. */
export function validateManifestShape(m, expectedBatchId) {
  const errors = [];
  if (!isObj(m)) return { ok: false, errors: ["manifest must be a JSON object"] };
  const allowed = ["schemaVersion", "batchId", "description", "ledgerAnchor", "migrations"];
  for (const k of Object.keys(m)) if (!allowed.includes(k)) errors.push(`unexpected top-level field '${k}'`);
  if (m.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof m.batchId !== "string" || !BATCH_ID_PATTERN.test(m.batchId)) errors.push("batchId is missing or malformed");
  else if (expectedBatchId !== undefined && m.batchId !== expectedBatchId) errors.push("batchId does not equal the requested batch_id");
  if (typeof m.description !== "string" || m.description.length < 10) errors.push("description is required");
  if (!isObj(m.ledgerAnchor) || !Number.isInteger(m.ledgerAnchor.count) || m.ledgerAnchor.count < 1 || !SHA256_PATTERN.test(m.ledgerAnchor.sha256 ?? "")) {
    errors.push("ledgerAnchor must be { count: positive integer, sha256: 64 hex }");
  } else for (const k of Object.keys(m.ledgerAnchor)) if (!["count", "sha256"].includes(k)) errors.push(`ledgerAnchor has unexpected field '${k}'`);
  if (!Array.isArray(m.migrations) || m.migrations.length === 0) errors.push("migrations must be a non-empty array");
  else {
    if (m.migrations.length > BATCH_SIZE_CAP) errors.push(`batch size ${m.migrations.length} exceeds the cap of ${BATCH_SIZE_CAP}`);
    const seen = new Set();
    let prev = "";
    for (const [i, mig] of m.migrations.entries()) {
      const at = `migrations[${i}]`;
      if (!isObj(mig)) {
        errors.push(`${at} must be an object`);
        continue;
      }
      for (const k of Object.keys(mig)) if (!["name", "sha256", "creates", "rollbackSql"].includes(k)) errors.push(`${at} has unexpected field '${k}'`);
      if (typeof mig.name !== "string" || !MIGRATION_NAME_PATTERN.test(mig.name)) errors.push(`${at}.name is malformed`);
      else {
        if (seen.has(mig.name)) errors.push(`${at}.name '${mig.name}' is duplicated`);
        seen.add(mig.name);
        if (prev && byteOrder(prev, mig.name) >= 0) errors.push(`${at}.name '${mig.name}' is not in strictly ascending timestamp order`);
        prev = mig.name;
      }
      if (typeof mig.sha256 !== "string" || !SHA256_PATTERN.test(mig.sha256)) errors.push(`${at}.sha256 must be 64 lowercase hex`);
      if (typeof mig.rollbackSql !== "string" || mig.rollbackSql.trim().length < 10) {
        errors.push(`${at}.rollbackSql (documentation only, never auto-executed) is required`);
      }
      if (!isObj(mig.creates)) {
        errors.push(`${at}.creates must be an object`);
        continue;
      }
      for (const k of Object.keys(mig.creates)) if (!["tables", "columns", "indexes", "types", "constraints"].includes(k)) errors.push(`${at}.creates has unexpected field '${k}'`);
      const c = mig.creates;
      for (const t of c.tables ?? []) if (typeof t !== "string" || !IDENT_PATTERN.test(t)) errors.push(`${at}.creates.tables has a malformed name`);
      for (const t of c.types ?? []) if (typeof t !== "string" || !IDENT_PATTERN.test(t)) errors.push(`${at}.creates.types has a malformed name`);
      checkNames(c.columns ?? [], `${at}.creates.columns`, ["table", "column", "nullable"], errors);
      checkNames(c.indexes ?? [], `${at}.creates.indexes`, ["table", "name", "unique"], errors);
      checkNames(c.constraints ?? [], `${at}.creates.constraints`, ["table", "name"], errors);
      for (const x of [...(c.columns ?? []), ...(c.indexes ?? []), ...(c.constraints ?? [])]) {
        for (const f of ["table", "column", "name"]) if (f in x && (typeof x[f] !== "string" || !IDENT_PATTERN.test(x[f]))) errors.push(`${at}.creates has a malformed ${f}`);
      }
      const total = ["tables", "columns", "indexes", "types", "constraints"].reduce((a, k) => a + (c[k]?.length ?? 0), 0);
      if (total === 0) errors.push(`${at}.creates lists no object`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Canonical (sorted, defaulted) form of a creates object for equality comparison. */
export function canonicalCreates(c) {
  const norm = (arr, f) => [...(arr ?? [])].map(f).sort();
  return JSON.stringify({
    tables: norm(c.tables, (x) => x),
    columns: norm(c.columns, (x) => `${x.table}.${x.column}.${x.nullable === false ? "notnull" : "null"}`),
    indexes: norm(c.indexes, (x) => `${x.table}.${x.name}.${x.unique ? "unique" : "plain"}`),
    types: norm(c.types, (x) => x),
    constraints: norm(c.constraints, (x) => `${x.table}.${x.name}`),
  });
}

export function readManifest(repoRoot, batchId) {
  if (!BATCH_ID_PATTERN.test(batchId ?? "")) return { ok: false, errors: ["batch_id is malformed"] };
  const path = join(repoRoot, MANIFEST_DIR, `${batchId}.json`);
  if (!existsSync(path)) return { ok: false, errors: [`manifest ${MANIFEST_DIR}/${batchId}.json does not exist in the checked-out main`] };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { ok: false, errors: ["manifest is not valid JSON"] };
  }
  const shape = validateManifestShape(manifest, batchId);
  return shape.ok ? { ok: true, manifest, path } : { ok: false, errors: shape.errors };
}

/** Committed migration folders: Map name -> { sha256, sql }. Folders without migration.sql are returned with sha256 null. */
export function readLocalMigrations(repoRoot) {
  const dir = join(repoRoot, "prisma", "migrations");
  const out = new Map();
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(dir, e.name, "migration.sql");
    if (!existsSync(p)) out.set(e.name, { sha256: null, sql: null });
    else {
      const buf = readFileSync(p);
      out.set(e.name, { sha256: sha256Hex(buf), sql: buf.toString("utf8") });
    }
  }
  return out;
}

/**
 * Offline checks that need no database: every batch migration exists in main, its sha256 equals the manifest's,
 * it passes the additive-only scan, and the objects it really creates equal the manifest's "creates".
 */
export function checkBatchFiles(manifest, local) {
  const failures = [];
  for (const mig of manifest.migrations) {
    const f = local.get(mig.name);
    if (!f || f.sha256 === null) {
      failures.push({ code: "MIGRATION_FILE_MISSING", detail: `${mig.name} is not a migration folder with migration.sql in main` });
      continue;
    }
    if (f.sha256 !== mig.sha256) failures.push({ code: "MIGRATION_SHA256_MISMATCH", detail: `${mig.name}: file sha256 ${f.sha256} != manifest ${mig.sha256}` });
    const scan = scanAdditiveOnly(f.sql);
    if (!scan.ok) {
      for (const v of scan.violations) failures.push({ code: "NOT_ADDITIVE_ONLY", detail: `${mig.name}: ${v.reason} :: ${v.statement}` });
      continue;
    }
    if (canonicalCreates(scan.creates) !== canonicalCreates(mig.creates)) {
      failures.push({ code: "MANIFEST_OBJECTS_MISMATCH", detail: `${mig.name}: the objects the SQL creates differ from the manifest's creates list` });
    }
  }
  return failures;
}

// ─── ledger classification (pure) ────────────────────────────────────────────

/**
 * Classify the live ledger against the manifest and main's migration folders.
 *
 * rows: [{ name, checksum, finished_at, rolled_back_at }] (every _prisma_migrations row).
 * local: Map name -> { sha256 } for every committed migration folder.
 *
 * An UNFINISHED row (finished_at null, not rolled back: Prisma's P3009 "failed migration") ALWAYS blocks. A ROLLED-BACK
 * row (an operator ran `prisma migrate resolve --rolled-back` on a failed attempt) is tolerated ONLY for a member of
 * this batch (it is the normal history of a failed attempt that was resolved and later re-applied), so an
 * interrupted batch can be resumed after a failed member was explicitly resolved; a rolled-back row for any other
 * migration blocks. Prisma does NOT wrap a migration in a transaction (measured: db.test case B), so a failed
 * attempt can leave the schema effects of its earlier statements behind; findPreexistingObjects refuses to
 * proceed while any object a pending migration will create already exists, so such leftovers must be removed
 * (manifest rollbackSql) before the batch can resume.
 *
 * Verdicts (ok only for FRESH_OK and RESUME_OK):
 *   FAILED_LEDGER_ROW      an unfinished row (P3009) exists -> resolve it out of band before any batch
 *   ROLLED_BACK_ROW_NOT_RESUMABLE  a rolled-back row for a migration that is not a member of this batch
 *   DUPLICATE_LEDGER_ROW   the same migration recorded twice
 *   LEDGER_NOT_IN_MAIN     an applied migration whose folder is not in main
 *   PENDING_SET_MISMATCH   the pending set (main folders absent from the ledger) is not exactly the manifest
 *                          (or a SUFFIX of it, for resume), in order -- includes extra pending migrations
 *   APPLIED_PREFIX_INVALID a manifest migration is applied out of order, or its recorded checksum differs
 *   ANCHOR_MISMATCH        the non-batch ledger rows do not equal the manifest's count + hash
 *   NOTHING_TO_APPLY       every batch migration is already applied
 */
export function classifyBatchLedger({ manifest, rows, local }) {
  const fail = (verdict, detail) => ({ ok: false, verdict, detail });
  const names = manifest.migrations.map((m) => m.name);
  const nameSet = new Set(names);

  const seen = new Set();
  const rolledBack = [];
  for (const r of rows) {
    if (!r.finished_at && !r.rolled_back_at) {
      return fail("FAILED_LEDGER_ROW", `ledger row ${r.name} is unfinished (finished_at is null, P3009); resolve it out of band before any batch (docs/opsiq/ci/PRODUCTION_BATCH_MIGRATION_RUNBOOK.md)`);
    }
    if (r.rolled_back_at) {
      rolledBack.push(r);
      continue;
    }
    if (seen.has(r.name)) return fail("DUPLICATE_LEDGER_ROW", `ledger records ${r.name} more than once`);
    seen.add(r.name);
  }
  for (const r of rolledBack) {
    if (!nameSet.has(r.name)) {
      return fail("ROLLED_BACK_ROW_NOT_RESUMABLE", `ledger row ${r.name} is rolled back and is not a member of this batch`);
    }
  }
  const applied = rows.filter((r) => r.finished_at && !r.rolled_back_at);
  for (const r of applied) {
    if (!local.has(r.name)) return fail("LEDGER_NOT_IN_MAIN", `applied migration ${r.name} has no folder in the checked-out main`);
  }

  const pending = [...local.keys()].filter((n) => !seen.has(n)).sort(byteOrder);
  const k = names.filter((n) => seen.has(n)).length;
  if (k === names.length) return fail("NOTHING_TO_APPLY", "every migration of the batch is already applied");
  // Applied batch members must be exactly the leading k names (a prefix), never a gap.
  for (let i = 0; i < names.length; i++) {
    if ((i < k) !== seen.has(names[i])) return fail("APPLIED_PREFIX_INVALID", `batch migration ${names[i]} is ${seen.has(names[i]) ? "applied" : "not applied"} out of order: applied members must be a leading prefix`);
  }
  const expectedPending = names.slice(k);
  if (pending.length !== expectedPending.length || pending.some((p, i) => p !== expectedPending[i])) {
    return fail("PENDING_SET_MISMATCH", `pending set [${pending.join(", ")}] is not exactly the ${k === 0 ? "manifest" : "unapplied suffix of the manifest"} [${expectedPending.join(", ")}]`);
  }
  const byName = new Map(applied.map((r) => [r.name, r]));
  for (const mig of manifest.migrations.slice(0, k)) {
    const row = byName.get(mig.name);
    if (row.checksum !== mig.sha256) return fail("APPLIED_PREFIX_INVALID", `applied ${mig.name} has recorded checksum ${row.checksum} != manifest ${mig.sha256}`);
  }
  const anchor = ledgerAnchor(applied.filter((r) => !nameSet.has(r.name)));
  if (anchor.count !== manifest.ledgerAnchor.count || anchor.sha256 !== manifest.ledgerAnchor.sha256) {
    return fail("ANCHOR_MISMATCH", `pre-batch ledger (count ${anchor.count}, sha256 ${anchor.sha256}) != manifest anchor (count ${manifest.ledgerAnchor.count}, sha256 ${manifest.ledgerAnchor.sha256})`);
  }
  return {
    ok: true,
    verdict: k === 0 ? "FRESH_OK" : "RESUME_OK",
    mode: k === 0 ? "FRESH" : "RESUME",
    appliedPrefix: names.slice(0, k),
    pending: expectedPending,
    rolledBackAttempts: rolledBack.map((r) => r.name),
    anchor,
  };
}

/** Post-deploy ledger check: the ledger is exactly pre-batch anchor + the whole batch, all finished, checksums equal. */
export function classifyPostBatchLedger({ manifest, rows }) {
  const names = manifest.migrations.map((m) => m.name);
  const nameSet = new Set(names);
  const failures = [];
  // An operator-resolved rolled-back attempt of a batch member is history, not state: it is excluded from the effective ledger below.
  const effective = rows.filter((r) => !(r.rolled_back_at && nameSet.has(r.name)));
  for (const r of effective) if (!r.finished_at || r.rolled_back_at) failures.push(`ledger row ${r.name} is ${r.rolled_back_at ? "rolled back" : "unfinished"}`);
  const byName = new Map();
  for (const r of effective) {
    // A duplicated row (same name twice) is not flagged here: it is caught by the exact effective-row count below (anchor + batch).
    byName.set(r.name, r);
  }
  for (const mig of manifest.migrations) {
    const r = byName.get(mig.name);
    if (!r) failures.push(`batch migration ${mig.name} is missing from the ledger`);
    else if (r.checksum !== mig.sha256) failures.push(`batch migration ${mig.name} recorded checksum ${r.checksum} != manifest ${mig.sha256}`);
  }
  const anchor = ledgerAnchor(effective.filter((r) => !nameSet.has(r.name)));
  if (anchor.count !== manifest.ledgerAnchor.count || anchor.sha256 !== manifest.ledgerAnchor.sha256) {
    failures.push(`non-batch ledger (count ${anchor.count}, sha256 ${anchor.sha256}) != pre-batch anchor (count ${manifest.ledgerAnchor.count}, sha256 ${manifest.ledgerAnchor.sha256})`);
  }
  if (effective.length !== manifest.ledgerAnchor.count + names.length) failures.push(`ledger has ${effective.length} effective rows, expected ${manifest.ledgerAnchor.count + names.length}`);
  return { ok: failures.length === 0, failures };
}

/**
 * Cross-check prisma's own `migrate status` text: when migrations are pending it exits non-zero and lists exactly the
 * unapplied names. The listed set must equal the expected pending set (an independent view of the same fact).
 */
export function crossCheckPrismaStatus({ exitCode, output, expectedPending }) {
  const text = typeof output === "string" ? output : "";
  for (const marker of ["P1000", "P1001", "P1002", "P1010", "Can't reach database", "Authentication failed"]) {
    if (text.includes(marker)) return { ok: false, reason: `connection-error marker '${marker}' in migrate status output` };
  }
  for (const marker of ["P3009", "failed migration", "have failed"]) {
    if (text.includes(marker)) return { ok: false, reason: `failed-migration marker '${marker}' in migrate status output` };
  }
  if (exitCode === 0) return { ok: false, reason: "migrate status reports no pending migration but the manifest expects some" };
  const marker = "have not yet been applied";
  const at = text.indexOf(marker);
  if (at < 0) return { ok: false, reason: "migrate status output did not match the expected pending signature" };
  const names = Array.from(new Set(text.slice(at).match(/[0-9]{14}_[a-zA-Z0-9_]+/g) ?? [])).sort(byteOrder);
  const want = [...expectedPending].sort(byteOrder);
  if (names.length !== want.length || names.some((n, i) => n !== want[i])) {
    return { ok: false, reason: `prisma lists pending [${names.join(", ")}] != expected [${want.join(", ")}]` };
  }
  return { ok: true, reason: `prisma pending list equals the expected ${want.length} migration(s)` };
}

// ─── database reads (fixed, parameterized, READ ONLY) ────────────────────────

export const LEDGER_SQL =
  'SELECT migration_name AS name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name COLLATE "C"';

export async function assertReadOnlySession(client) {
  const r = await client.query("SHOW default_transaction_read_only");
  if (r.rows[0]?.default_transaction_read_only !== "on") {
    throw Object.assign(new Error('session is not read-only: set PGOPTIONS="-c default_transaction_read_only=on"'), { gateCode: "SESSION_NOT_READ_ONLY" });
  }
}

export async function readLedger(client) {
  const r = await client.query(LEDGER_SQL);
  return r.rows.map((x) => ({ name: x.name, checksum: x.checksum, finished_at: x.finished_at, rolled_back_at: x.rolled_back_at }));
}

/** Which expected objects exist right now. Every query is fixed text with bound parameters. */
export async function objectExists(client, kind, o) {
  switch (kind) {
    case "tables": {
      const r = await client.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1", [o]);
      return { exists: r.rowCount > 0 };
    }
    case "columns": {
      const r = await client.query(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
        [o.table, o.column]
      );
      return { exists: r.rowCount > 0, nullable: r.rows[0] ? r.rows[0].is_nullable === "YES" : undefined };
    }
    case "indexes": {
      const r = await client.query("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2", [o.table, o.name]);
      return { exists: r.rowCount > 0, unique: r.rows[0] ? /^CREATE UNIQUE INDEX /.test(r.rows[0].indexdef) : undefined };
    }
    case "types": {
      const r = await client.query(
        "SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = $1",
        [o]
      );
      return { exists: r.rowCount > 0 };
    }
    case "constraints": {
      const r = await client.query(
        "SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND t.relname = $1 AND c.conname = $2",
        [o.table, o.name]
      );
      return { exists: r.rowCount > 0 };
    }
    default:
      throw new Error(`unknown object kind ${kind}`);
  }
}

const KINDS = ["tables", "columns", "indexes", "types", "constraints"];

/** Pre-mutation: none of the objects a pending migration will create may already exist (a ghost object would fail it mid-batch). */
export async function findPreexistingObjects(client, migrations) {
  const found = [];
  for (const mig of migrations) {
    for (const kind of KINDS) {
      for (const o of mig.creates[kind] ?? []) {
        if ((await objectExists(client, kind, o)).exists) found.push(`${mig.name}: ${kind} ${typeof o === "string" ? o : JSON.stringify(o)} already exists`);
      }
    }
  }
  return found;
}

/** Post-mutation: every expected object of the whole batch exists with the declared nullability / uniqueness. */
export async function findMissingObjects(client, migrations) {
  const missing = [];
  for (const mig of migrations) {
    for (const kind of KINDS) {
      for (const o of mig.creates[kind] ?? []) {
        const r = await objectExists(client, kind, o);
        const label = `${mig.name}: ${kind} ${typeof o === "string" ? o : JSON.stringify(o)}`;
        if (!r.exists) missing.push(`${label} is missing`);
        else if (kind === "columns" && o.nullable !== undefined && r.nullable !== o.nullable) missing.push(`${label} nullability differs`);
        else if (kind === "indexes" && o.unique !== undefined && r.unique !== Boolean(o.unique)) missing.push(`${label} uniqueness differs`);
      }
    }
  }
  return missing;
}

/**
 * READ-ONLY, INFORMATIONAL, NEVER GATING: the cost/lock context an operator needs to judge the dispatch window. Estimated row counts
 * (pg_class.reltuples, -1 = never analyzed) of the tables the pending migrations touch, and how many transactions visible to this role have been
 * open for more than 60 s (pg_stat_activity: a count only; no query text, no user, no client address). A failure of either read yields null,
 * never an error. Sessions of other roles are invisible to a role without pg_read_all_stats, so the count is a lower bound.
 */
export async function readActivitySnapshot(client, tables) {
  const out = { estimatedRows: null, longOpenTransactions: null, note: "informational only; never gates the batch" };
  try {
    const r = await client.query(
      "SELECT c.relname AS t, c.reltuples::bigint::text AS est FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[]) ORDER BY c.relname",
      [tables]
    );
    out.estimatedRows = Object.fromEntries(r.rows.map((x) => [x.t, Number(x.est)]));
  } catch {
    /* informational */
  }
  try {
    const r = await client.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND xact_start IS NOT NULL AND now() - xact_start > interval '60 seconds' AND pid <> pg_backend_pid()"
    );
    out.longOpenTransactions = r.rows[0].n;
  } catch {
    /* informational */
  }
  return out;
}

/** Distinct tables the given migrations create or alter. */
export function touchedTables(migrations) {
  const t = new Set();
  for (const m of migrations) {
    for (const x of m.creates.tables ?? []) t.add(x);
    for (const k of ["columns", "indexes", "constraints"]) for (const x of m.creates[k] ?? []) t.add(x.table);
  }
  return [...t].sort();
}

export async function readRecoveryPoint(client, ledger, tables = []) {
  const r = await client.query(
    "SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS utc, pg_current_wal_lsn()::text AS lsn, current_database() AS db"
  );
  const row = r.rows[0];
  return { capturedAtUtc: row.utc, walLsn: row.lsn, database: row.db, ledgerAnchor: ledgerAnchor(ledger), activity: await readActivitySnapshot(client, tables) };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function withReadOnlyClient(url, fn) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await assertReadOnlySession(client);
    await client.query("BEGIN READ ONLY");
    try {
      return await fn(client);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
    }
  } finally {
    await client.end().catch(() => {});
  }
}

function die(code, detail) {
  console.error(`::error::BATCH_GATE=FAIL ${code}: ${detail}`);
  console.log(`BATCH_GATE=FAIL`);
  console.log(`BATCH_GATE_CODE=${code}`);
  process.exit(1);
}

function writeOut(outDir, file, data) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, file), JSON.stringify(data, null, 2) + "\n");
}

async function main() {
  const cmd = process.argv[2];
  const repoRoot = process.cwd();
  const batchId = process.env.BATCH_ID ?? "";
  const outDir = process.env.OUTPUT_DIR || ".";
  const url = process.env.DATABASE_URL ?? "";

  const mf = readManifest(repoRoot, batchId);
  if (!mf.ok) die("MANIFEST_INVALID", mf.errors.join("; "));
  const manifest = mf.manifest;
  const local = readLocalMigrations(repoRoot);
  const fileFailures = checkBatchFiles(manifest, local);
  if (fileFailures.length) die(fileFailures[0].code, fileFailures.map((f) => f.detail).join("; "));

  if (cmd === "status-crosscheck") {
    const exitCode = Number(process.env.STATUS_EXIT);
    if (!Number.isInteger(exitCode)) die("STATUS_EXIT_INVALID", "STATUS_EXIT must be an integer");
    const pending = JSON.parse(readFileSync(join(outDir, "batch-preflight.json"), "utf8")).pending;
    const r = crossCheckPrismaStatus({ exitCode, output: process.env.STATUS_OUTPUT ?? "", expectedPending: pending });
    if (!r.ok) die("PRISMA_STATUS_MISMATCH", r.reason);
    console.log(`BATCH_STATUS_CROSSCHECK=PASS ${r.reason}`);
    return;
  }

  if (!url) die("DATABASE_URL_MISSING", "DATABASE_URL is required");

  if (cmd === "preflight") {
    const result = await withReadOnlyClient(url, async (client) => {
      const rows = await readLedger(client);
      const c = classifyBatchLedger({ manifest, rows, local });
      if (!c.ok) return { c };
      const pendingMigs = manifest.migrations.filter((m) => c.pending.includes(m.name));
      const pre = await findPreexistingObjects(client, pendingMigs);
      if (pre.length) return { c: { ok: false, verdict: "OBJECT_ALREADY_EXISTS", detail: pre.join("; ") } };
      return { c, recovery: await readRecoveryPoint(client, rows, touchedTables(pendingMigs)) };
    });
    if (!result.c.ok) die(result.c.verdict, result.c.detail);
    const { c, recovery } = result;
    writeOut(outDir, "batch-preflight.json", { batchId, mode: c.mode, appliedPrefix: c.appliedPrefix, pending: c.pending, rolledBackAttempts: c.rolledBackAttempts, anchor: c.anchor });
    writeOut(outDir, "batch-recovery-point.json", {
      batchId,
      ...recovery,
      note: "Point-in-time-recovery coordinate captured BEFORE any batch mutation. Restore by timestamp or LSN within the provider's history retention window (6 hours on this project). Additive-only scan + per-migration rollbackSql in the manifest are the logical recovery path.",
    });
    console.log(`BATCH_GATE=PASS`);
    console.log(`BATCH_MODE=${c.mode}`);
    console.log(`BATCH_PENDING=${c.pending.length}`);
    console.log(`BATCH_APPLIED_PREFIX=${c.appliedPrefix.length}`);
    console.log(`BATCH_ROLLED_BACK_ATTEMPTS=${c.rolledBackAttempts.length}`);
    console.log(`BATCH_LEDGER_ANCHOR_COUNT=${c.anchor.count}`);
    console.log(`BATCH_RECOVERY_POINT_UTC=${recovery.capturedAtUtc}`);
    console.log(`BATCH_RECOVERY_POINT_LSN=${recovery.walLsn}`);
    console.log(`BATCH_RECOVERY_POINT_DATABASE=${recovery.database}`);
    console.log(`BATCH_ACTIVITY_ESTIMATED_ROWS=${JSON.stringify(recovery.activity.estimatedRows)}`);
    console.log(`BATCH_ACTIVITY_LONG_OPEN_TRANSACTIONS=${recovery.activity.longOpenTransactions}`);
    return;
  }

  if (cmd === "postverify") {
    const result = await withReadOnlyClient(url, async (client) => {
      const rows = await readLedger(client);
      const l = classifyPostBatchLedger({ manifest, rows });
      const missing = await findMissingObjects(client, manifest.migrations);
      return { l, missing, count: rows.length };
    });
    const problems = [...result.l.failures, ...result.missing];
    if (problems.length) die("POST_BATCH_VERIFICATION_FAILED", problems.join("; "));
    console.log("BATCH_POSTVERIFY=PASS");
    console.log(`BATCH_POSTVERIFY_LEDGER_ROWS=${result.count}`);
    return;
  }

  die("UNKNOWN_SUBCOMMAND", "usage: migration-batch.mjs preflight|status-crosscheck|postverify");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => die(e?.gateCode ?? "UNEXPECTED_ERROR", String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/gi, "<url>")));
}
