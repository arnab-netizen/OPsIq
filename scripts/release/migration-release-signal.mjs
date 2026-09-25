#!/usr/bin/env node
/**
 * PR migration release signal (ci.yml build-and-test step).
 *
 * Detects whether a PR changes prisma/migrations/** and reports, in the job
 * log and the GitHub step summary, whether the release needs production
 * migration coordination. Detection is from the git diff itself, never from
 * commit-message conventions.
 *
 *   no migration change            → pass, "no production migration required"
 *   migration ADDED, additive      → pass, "PRODUCTION MIGRATION REQUIRED" + procedure
 *   migration ADDED, potentially destructive
 *       with the acknowledgement line `-- opsiq-migration: destructive-approved`
 *                                  → pass, flagged as destructive (expand/contract)
 *       without it                 → FAIL
 *   existing migration MODIFIED or DELETED (incl. migration_lock.toml)
 *                                  → FAIL (applied migrations are immutable)
 *   invalid name / out of order    → FAIL (the approved workflow cannot apply it safely)
 *
 * The hard stop for an unapplied migration is the production build gate
 * (scripts/release/production-migration-gate.mjs); this signal makes the
 * requirement visible before merge and blocks the migration shapes that are
 * never safe to merge. It reads only the repository — no credentials.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_PREFIX = "prisma/migrations/";
export const MIGRATION_NAME_RE = /^[0-9]{14}_[a-zA-Z0-9_]+$/;
export const DESTRUCTIVE_ACK = "-- opsiq-migration: destructive-approved";
export const RELEASE_PROCEDURE_DOC = "docs/deployment/PRODUCTION_RELEASE_PROCEDURE.md";

/** Statements that can lose data or break the code currently running against the schema. */
const DESTRUCTIVE_PATTERNS = [
  [/\bDROP\s+(TABLE|SCHEMA|VIEW|MATERIALIZED\s+VIEW|TYPE|SEQUENCE|FUNCTION)\b/i, "DROP of a database object"],
  [/\bALTER\s+TABLE\b[^;]*\bDROP\s+(COLUMN\b|CONSTRAINT\b|(?!DEFAULT\b|NOT\s+NULL\b)"?\w)/i, "ALTER TABLE ... DROP"],
  [/\bRENAME\b/i, "RENAME (breaks code still using the old name)"],
  [/\bALTER\s+COLUMN\b[^;]*\b(SET\s+DATA\s+)?TYPE\b/i, "column type change"],
  [/\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b/i, "SET NOT NULL on an existing column"],
  [/\bADD\s+COLUMN\b[^;,]*\bNOT\s+NULL\b(?![^;,]*\bDEFAULT\b)/i, "NOT NULL column without DEFAULT"],
  [/\bTRUNCATE\b/i, "TRUNCATE"],
  [/\bDELETE\s+FROM\b/i, "DELETE FROM"],
  [/\bUPDATE\s+"?\w+"?(\."?\w+"?)?\s+SET\b/i, "UPDATE (data backfill/rewrite)"],
  [/\bALTER\s+TYPE\b[^;]*\b(RENAME|DROP)\b/i, "enum value rename/drop"],
];

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Returns the list of destructive findings (empty = additive). */
export function classifySql(sql) {
  const body = stripSqlComments(sql);
  return DESTRUCTIVE_PATTERNS.filter(([re]) => re.test(body)).map(([, label]) => label);
}

/**
 * Pure classification.
 * @param {Array<{status: string, path: string}>} changes  git name-status entries (renames split into D + A)
 * @param {string[]} baseMigrationNames  migration directory names on the base commit
 * @param {(name: string) => string} readHeadSql  migration.sql content at head
 */
export function classifyMigrationChanges({ changes, baseMigrationNames, readHeadSql }) {
  const base = new Set(baseMigrationNames);
  const latestBase = [...base].sort().at(-1) ?? "";
  const byName = new Map();
  const blockers = [];
  for (const { status, path } of changes) {
    if (!path.startsWith(MIGRATIONS_PREFIX)) continue;
    const rest = path.slice(MIGRATIONS_PREFIX.length);
    if (!rest.includes("/")) {
      // e.g. migration_lock.toml — changes the provider for every migration.
      blockers.push(`${path} changed (${status}) — migration lock/root files are immutable`);
      continue;
    }
    const name = rest.split("/")[0];
    const entry = byName.get(name) ?? { name, statuses: new Set() };
    entry.statuses.add(status[0]);
    byName.set(name, entry);
  }

  const added = [];
  const modified = [];
  const deleted = [];
  for (const { name, statuses } of byName.values()) {
    if (base.has(name)) {
      if (statuses.has("D") && !statuses.has("A") && !statuses.has("M")) deleted.push(name);
      else modified.push(name);
    } else if (statuses.has("A") || statuses.has("M")) {
      const sql = readHeadSql(name);
      const findings = sql == null ? ["migration.sql missing"] : classifySql(sql);
      const acknowledged = sql != null && sql.includes(DESTRUCTIVE_ACK);
      added.push({ name, destructive: findings, acknowledged });
    }
  }

  for (const name of modified) blockers.push(`${name}: existing migration modified — applied migrations are immutable; add a new migration instead`);
  for (const name of deleted) blockers.push(`${name}: existing migration deleted — production history would no longer match the code`);
  for (const m of added) {
    if (!MIGRATION_NAME_RE.test(m.name)) blockers.push(`${m.name}: name must match <14-digit timestamp>_<name> (required by the approved migration workflow)`);
    if (m.name <= latestBase) blockers.push(`${m.name}: sorts before the latest existing migration ${latestBase} — re-timestamp it so it applies after everything already in production`);
    if (m.destructive.length > 0 && !m.acknowledged) {
      blockers.push(
        `${m.name}: potentially destructive (${m.destructive.join("; ")}) — use expand/contract and add the line '${DESTRUCTIVE_ACK}' to acknowledge (see ${RELEASE_PROCEDURE_DOC})`
      );
    }
  }

  added.sort((a, b) => a.name.localeCompare(b.name));
  const verdict = blockers.length > 0 ? "BLOCKED" : added.length > 0 ? "PRODUCTION_MIGRATION_REQUIRED" : "NO_MIGRATION_CHANGE";
  return { verdict, ok: blockers.length === 0, added, modified: modified.sort(), deleted: deleted.sort(), blockers };
}

export function formatSignal(result) {
  const out = [];
  if (result.verdict === "NO_MIGRATION_CHANGE") {
    out.push("### Migration release signal: no production migration required", "", "This PR does not change `prisma/migrations/`. It deploys normally after merge.");
    return out.join("\n");
  }
  if (result.added.length > 0) {
    out.push("### PRODUCTION MIGRATION REQUIRED", "");
    out.push("| Migration | Class |", "|---|---|");
    for (const m of result.added) {
      const cls = m.destructive.length === 0 ? "additive" : `POTENTIALLY DESTRUCTIVE (${m.destructive.join("; ")})${m.acknowledged ? " — acknowledged" : ""}`;
      out.push(`| \`${m.name}\` | ${cls} |`);
    }
    out.push(
      "",
      "Release procedure after merge (see `" + RELEASE_PROCEDURE_DOC + "`):",
      "1. The production build of the merge commit is refused by the release gate while the migration is unapplied — production keeps serving the previous deployment.",
      "2. Run **Actions → Migrate Production Database** (mode `MAIN`, the migration name above, the verified production DB host) — one migration per run.",
      "3. The workflow redeploys `main` (deploy hook) or you redeploy it in Vercel; the gate then passes and the release is promoted.",
      "Merge at most one migration PR between production migrations."
    );
  }
  if (result.blockers.length > 0) {
    out.push("", "### Migration changes blocked", "");
    for (const b of result.blockers) out.push(`- ${b}`);
  }
  return out.join("\n");
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function collectFromGit(baseSha, headSha) {
  const changes = git(["diff", "--name-status", "--no-renames", baseSha, headSha, "--", MIGRATIONS_PREFIX])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split("\t");
      return { status, path };
    });
  const baseMigrationNames = git(["ls-tree", "--name-only", `${baseSha}:${MIGRATIONS_PREFIX.slice(0, -1)}`])
    .split("\n")
    .filter((n) => n && !n.includes("."));
  const readHeadSql = (name) => {
    try {
      return git(["show", `${headSha}:${MIGRATIONS_PREFIX}${name}/migration.sql`]);
    } catch {
      return null;
    }
  };
  return { changes, baseMigrationNames, readHeadSql };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[++i];
  return args;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { base, head } = parseArgs(process.argv.slice(2));
  if (!base || !head) {
    console.error("usage: migration-release-signal.mjs --base <sha> --head <sha>");
    process.exit(2);
  }
  const result = classifyMigrationChanges(collectFromGit(base, head));
  const report = formatSignal(result);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
  if (result.verdict === "PRODUCTION_MIGRATION_REQUIRED") {
    console.log(`::notice title=PRODUCTION MIGRATION REQUIRED::${result.added.map((m) => m.name).join(", ")} — follow ${RELEASE_PROCEDURE_DOC}`);
  }
  if (!result.ok) {
    for (const b of result.blockers) console.log(`::error title=Migration change blocked::${b}`);
    process.exit(1);
  }
}
