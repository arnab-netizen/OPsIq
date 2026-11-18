#!/usr/bin/env node
/**
 * Deterministic release plan: compares the COMPLETE committed migration chain with the target database's migration
 * ledger (never a git diff against the previous commit), so previously failed/cancelled releases, several merged PRs,
 * zero-migration pushes and existing drift are all handled the same way.
 *
 *   NOOP   chain and ledger agree (a zero-migration release still proceeds to runtime-role verification)
 *   MIGRATE one or more compatible pending migrations, in ascending name order (Prisma's own apply order)
 *   BLOCK   ambiguous or inconsistent state (fail closed): unreadable chain, failed/rolled-back ledger rows, modified
 *           applied migration, a pending migration older than an applied one (out of order), a migration directory
 *           without migration.sql, or any pending migration containing a destructive/incompatible statement, which needs
 *           explicit, separately authorized inspection and is never applied by the automatic path.
 *
 * Pure decision logic: no database connection, no secrets. Callers supply rows read by the existing read-only ledger query.
 */
import { evaluateMigrationGate } from "./production-migration-gate.mjs";

/** Statements that are not expand-only. Patterns run on SQL with comments and string literals removed. */
const DESTRUCTIVE = [
  [/\bDROP\s+(TABLE|COLUMN|SCHEMA|TYPE|DATABASE|ROLE)\b/i, "drops an object"],
  [/\bDROP\s+CONSTRAINT\b/i, "drops a constraint"],
  [/\bTRUNCATE\b/i, "truncates data"],
  [/\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/i, "deletes rows without WHERE"],
  [/\bALTER\s+TABLE\b[^;]*\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i, "changes a column type"],
  [/\bRENAME\s+(TO|COLUMN|CONSTRAINT)\b/i, "renames an object"],
  [/\bALTER\s+TABLE\b[^;]*\bSET\s+NOT\s+NULL\b/i, "adds NOT NULL to an existing column"],
  [/\b(GRANT|REVOKE)\b/i, "changes privileges (owned by the runtime-role reconcile, not migrations)"],
  [/\bCREATE\s+(ROLE|USER)\b|\bALTER\s+(ROLE|USER)\b/i, "changes roles"],
];

export function stripSql(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

export function destructiveReasons(sql) {
  const s = stripSql(sql);
  return DESTRUCTIVE.filter(([re]) => re.test(s)).map(([, why]) => why);
}

/**
 * @param {{ committed: {name:string, checksum:string|null}[]|null, rows: object[], sqlByName?: Record<string,string> }} p
 * @returns {{ action: "NOOP"|"MIGRATE"|"BLOCK", pending: string[], reasons: string[], destructive: Record<string,string[]> }}
 */
export function planRelease({ committed, rows, sqlByName = {} }) {
  const block = (reasons, pending = [], destructive = {}) => ({ action: "BLOCK", pending, reasons, destructive });
  if (!Array.isArray(committed) || !Array.isArray(rows)) return block(["migration chain or ledger unreadable"]);
  const missingSql = committed.filter((m) => m.checksum == null).map((m) => m.name);
  if (missingSql.length) return block([`migration directory without migration.sql: ${missingSql.join(",")}`]);
  const g = evaluateMigrationGate({ committed, rows });
  if (g.verdict === "MIGRATIONS_DIRECTORY_UNREADABLE") return block(["migration chain unreadable"]);
  if (g.failed.length) return block([`failed or rolled-back ledger rows: ${g.failed.join(",")}`], g.pending);
  if (g.modified.length) return block([`applied migration modified after apply: ${g.modified.join(",")}`], g.pending);
  const names = rows.filter((r) => r.finished_at != null && r.rolled_back_at == null).map((r) => r.migration_name).sort();
  const newestApplied = names.length ? names[names.length - 1] : null;
  const outOfOrder = newestApplied ? g.pending.filter((n) => n < newestApplied) : [];
  if (outOfOrder.length) return block([`pending migration older than an applied one (out of order): ${outOfOrder.join(",")}`], g.pending);
  if (g.pending.length === 0) return { action: "NOOP", pending: [], reasons: [], destructive: {} };
  const destructive = {};
  for (const n of g.pending) {
    if (typeof sqlByName[n] !== "string") return block([`no SQL available to inspect pending migration ${n}`], g.pending);
    const r = destructiveReasons(sqlByName[n]);
    if (r.length) destructive[n] = r;
  }
  if (Object.keys(destructive).length) {
    return block(Object.entries(destructive).map(([n, r]) => `${n} needs explicit authorization: ${r.join("; ")}`), g.pending, destructive);
  }
  return { action: "MIGRATE", pending: g.pending, reasons: [], destructive: {} };
}
