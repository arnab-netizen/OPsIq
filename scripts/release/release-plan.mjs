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
  [/\bDROP\b/i, "drops an object, column, constraint, default or index"],
  [/\bDO\b\s+(BEGIN|DECLARE|LANGUAGE|'')/i, "runs an anonymous code block (cannot be inspected statically)"],
  [/\bUPDATE\b(?![^;]*\bWHERE\b)[^;]*\bSET\b/i, "updates rows without WHERE"],
  [/\bTRUNCATE\b/i, "truncates data"],
  [/\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/i, "deletes rows without WHERE"],
  [/\bALTER\s+TABLE\b[^;]*\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i, "changes a column type"],
  [/\bRENAME\s+(TO|COLUMN|CONSTRAINT)\b/i, "renames an object"],
  [/\bALTER\s+TABLE\b[^;]*\bSET\s+NOT\s+NULL\b/i, "adds NOT NULL to an existing column"],
  [/\b(GRANT|REVOKE)\b/i, "changes privileges (owned by the runtime-role reconcile, not migrations)"],
  [/\bCREATE\s+(ROLE|USER)\b|\bALTER\s+(ROLE|USER)\b/i, "changes roles"],
];

/**
 * Single-pass SQL scanner: removes comments (including nested block comments), replaces string literals and quoted
 * identifiers with empty placeholders, and KEEPS dollar-quoted bodies as code (a DO $$ ... $$ block executes its body).
 * One pass, so a `--` inside a string is not a comment and a quote inside a comment does not start a string.
 */
export function stripSql(sql) {
  const t = String(sql);
  let out = "";
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    const n = t[i + 1];
    if (c === "-" && n === "-") { while (i < t.length && t[i] !== "\n") i++; out += " "; continue; }
    if (c === "/" && n === "*") {
      let depth = 1; i += 2;
      while (i < t.length && depth > 0) {
        if (t[i] === "/" && t[i + 1] === "*") { depth++; i += 2; }
        else if (t[i] === "*" && t[i + 1] === "/") { depth--; i += 2; }
        else i++;
      }
      out += " "; continue;
    }
    if (c === "'" ) {
      const esc = /[eE]$/.test(out.slice(-1));
      i++;
      while (i < t.length) {
        if (esc && t[i] === "\\") { i += 2; continue; }
        if (t[i] === "'" && t[i + 1] === "'") { i += 2; continue; }
        if (t[i] === "'") { i++; break; }
        i++;
      }
      out += "''"; continue;
    }
    if (c === '"') {
      i++;
      while (i < t.length) { if (t[i] === '"' && t[i + 1] === '"') { i += 2; continue; } if (t[i] === '"') { i++; break; } i++; }
      out += '""'; continue;
    }
    if (c === "$") {
      const m = /^\$[A-Za-z_]*\$/.exec(t.slice(i, i + 64));
      if (m) { out += " "; i += m[0].length; continue; } // drop the dollar-quote tags, keep the body as code
    }
    out += c; i++;
  }
  return out;
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
