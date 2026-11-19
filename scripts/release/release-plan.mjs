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
 * Statement tokenizer for the allowlist: one pass, comments removed, string literals reduced to '' , quoted identifiers kept
 * verbatim, every dollar-quoted body replaced by the single opaque token $OPAQUE$ (a body is code and is never inspected),
 * statements split on top-level semicolons. Returns normalised single-space statements.
 */
export function splitStatements(sql) {
  const t = String(sql);
  const stmts = [];
  let cur = "";
  let i = 0;
  const push = () => { const x = cur.replace(/\s+/g, " ").trim(); if (x) stmts.push(x); cur = ""; };
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (c === "-" && n === "-") { while (i < t.length && t[i] !== "\n") i++; cur += " "; continue; }
    if (c === "/" && n === "*") {
      let d = 1; i += 2;
      while (i < t.length && d > 0) { if (t[i] === "/" && t[i + 1] === "*") { d++; i += 2; } else if (t[i] === "*" && t[i + 1] === "/") { d--; i += 2; } else i++; }
      cur += " "; continue;
    }
    if (c === "'") {
      const esc = /[eEuU&]$/.test(cur.slice(-2).trimEnd()) && /[eE]$/.test(cur.slice(-1));
      i++;
      while (i < t.length) { if (esc && t[i] === "\\") { i += 2; continue; } if (t[i] === "'" && t[i + 1] === "'") { i += 2; continue; } if (t[i] === "'") { i++; break; } i++; }
      cur += "''"; continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < t.length) { if (t[j] === '"' && t[j + 1] === '"') { j += 2; continue; } if (t[j] === '"') { j++; break; } j++; }
      cur += t.slice(i, j).replace(/;/g, "_"); i = j; continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(t.slice(i, i + 80));
      if (m) {
        const close = t.indexOf(m[0], i + m[0].length);
        if (close === -1) { cur += " $OPAQUE$ "; i = t.length; continue; }
        cur += " $OPAQUE$ "; i = close + m[0].length; continue;
      }
    }
    if (c === ";") { push(); i++; continue; }
    cur += c; i++;
  }
  push();
  return stmts;
}

const ID = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z_0-9]*)(?:\.(?:"[^"]+"|[A-Za-z_][A-Za-z_0-9]*))?`;
const VOLATILE_DEFAULT = /\bDEFAULT\s+(?:random|gen_random_uuid|uuid_generate_v\d|clock_timestamp|nextval|setseed)\s*\(/i;

/** Quote-aware: parentheses and commas inside "quoted identifiers" or '' placeholders are ignored (review finding: a "(" identifier hid every later comma). */
function topLevelCommas(body) {
  const parts = []; let depth = 0, cur = "", inQ = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') { inQ = !inQ; cur += ch; continue; }
    if (inQ) { cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

/** Quoted identifiers become an opaque placeholder so keyword checks cannot be fooled or triggered by names. */
const neutralize = (st) => st.replace(/"(?:[^"]|"")*"/g, '"x"');

/** Secondary, deliberately blunt backstop: runs on EVERY statement even after the allowlist accepted it. */
function backstopReasons(st) {
  const t = neutralize(st).replace(/\bON\s+(?:DELETE|UPDATE)\b/gi, " ");
  const out = [];
  if (/\b(?:DROP|DELETE|TRUNCATE|INSERT|UPDATE|COPY|GRANT|REVOKE|MERGE|CALL|EXECUTE|VACUUM|REINDEX|CLUSTER|LOCK)\b/i.test(t)) out.push("contains a data-changing, destructive or privileged keyword");
  if (/\bALTER\s+(?:COLUMN\s+)?(?:"x"|\w+)\s+(?:SET DATA\s+)?TYPE\b/i.test(t)) out.push("changes a column type");
  return out;
}

/** A DEFAULT on a column added to an EXISTING table must be one of these cheap, deterministic forms (anything else may rewrite the table). */
const SAFE_DEFAULT = /^(?:-?\d+(?:\.\d+)?|true|false|null|''|CURRENT_TIMESTAMP|now\(\)|CURRENT_DATE|''::(?:\w+)(?:\[\])?|ARRAY\[\]::\w+(?:\[\])?)(?:::\w+(?:\[\])?)?$/i;
function defaultExpr(action) {
  const m = /\bDEFAULT\s+(.+?)(?=\s+(?:NOT NULL|NULL|CONSTRAINT|REFERENCES|CHECK|UNIQUE|PRIMARY|COLLATE|GENERATED)\b|$)/i.exec(action);
  return m ? m[1].trim() : null;
}
const COLS = String.raw`\(\s*(?:"[^"]+"|[A-Za-z_]\w*)(?:\s+(?:ASC|DESC))?(?:\s+NULLS\s+(?:FIRST|LAST))?(?:\s*,\s*(?:"[^"]+"|[A-Za-z_]\w*)(?:\s+(?:ASC|DESC))?(?:\s+NULLS\s+(?:FIRST|LAST))?)*\s*\)`;
const TERM = String.raw`(?:"[^"]+"|[A-Za-z_]\w*)\s*(?:IS\s+(?:NOT\s+)?NULL|(?:=|<>)\s*(?:''|-?\d+|true|false)|IN\s*\(\s*(?:'',?\s*)+\))`;
const SIMPLE_WHERE = new RegExp(String.raw`^\s*WHERE\s+\(?\s*${TERM}(?:\s+(?:AND|OR)\s+\(?\s*${TERM}\s*\)?)*\s*\)?\s*$`, "i");

/**
 * Allowlist classifier (fail closed). A migration is auto-approvable ONLY if every statement matches a recognised ADDITIVE shape.
 * Anything else, including every DROP/DO/UPDATE/DELETE/INSERT/COPY/function/trigger/GRANT/transaction-control statement, needs explicit authorization.
 * It is a policy filter, not a proof of compatibility: it cannot see table size, lock time or old-app write patterns.
 */
export function classifyMigration(sql) {
  const reasons = [];
  const stmts = splitStatements(sql);
  if (stmts.length === 0) return { approved: true, reasons: [] }; // comments only: nothing executes
  const created = new Set();
  for (const st of stmts) { const m = new RegExp(String.raw`^CREATE TABLE (?:IF NOT EXISTS )?(${ID})(?=\s|\()`, "i").exec(st); if (m) created.add(m[1].replace(/"/g, "").toLowerCase()); }
  const bad = (st, why) => reasons.push(`${why}: ${st.slice(0, 90)}`);
  for (const st of stmts) {
    if (st.includes("$OPAQUE$")) { bad(st, "contains an opaque (dollar-quoted) code body"); continue; }
    if (new RegExp(String.raw`^CREATE TABLE (?:IF NOT EXISTS )?${ID}\s*\(`, "i").test(st)) {
      if (/\)\s*(?:INHERITS|PARTITION|AS\b)|\bPARTITION OF\b|\bAS SELECT\b/i.test(st)) bad(st, "CREATE TABLE variant not allowlisted"); continue;
    }
    {
      const ix = new RegExp(String.raw`^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?${ID} ON ${ID}(?: USING \w+)?\s*(${COLS})(?:\s*INCLUDE\s*${COLS})?(\s+WHERE\s.+)?$`, "i").exec(st);
      if (ix) {
        if (/\bCONCURRENTLY\b/i.test(st)) bad(st, "CONCURRENTLY cannot run inside a migration transaction");
        else if (ix[2] && !SIMPLE_WHERE.test(ix[2])) bad(st, "index predicate is not a simple column comparison");
        continue;
      }
      if (/^CREATE (?:UNIQUE )?INDEX /i.test(st)) { bad(st, "index definition is not a plain column list (expression/unknown form)"); continue; }
    }
    if (new RegExp(String.raw`^CREATE TYPE ${ID} AS ENUM\s*\(`, "i").test(st)) continue;
    if (new RegExp(String.raw`^ALTER TYPE ${ID} ADD VALUE (?:IF NOT EXISTS )?''(?: (?:BEFORE|AFTER) '')?$`, "i").test(st)) continue;
    if (new RegExp(String.raw`^COMMENT ON (?:TABLE|COLUMN) ${ID}(?:\.${ID})? IS ''$`, "i").test(st)) continue;
    if (/^CREATE EXTENSION IF NOT EXISTS "?pgcrypto"?$/i.test(st)) continue;
    const alter = new RegExp(String.raw`^ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(${ID}) (.+)$`, "i").exec(st);
    if (alter) {
      const table = alter[1].replace(/"/g, "").toLowerCase();
      const isNew = created.has(table);
      for (const action of topLevelCommas(alter[2])) {
        if (/^ADD (?:COLUMN )?(?:IF NOT EXISTS )?(?:"[^"]+"|\w+) /i.test(action) && !/^ADD CONSTRAINT/i.test(action)) {
          if (/\bGENERATED\b/i.test(action)) bad(st, "generated column rewrites the table");
          else if (/\bNOT NULL\b/i.test(action) && !/\bDEFAULT\b/i.test(action) && !isNew) bad(st, "NOT NULL column without DEFAULT breaks the previously deployed app");
          else if (!isNew && VOLATILE_DEFAULT.test(action)) bad(st, "volatile DEFAULT forces a table rewrite");
          else if (!isNew && defaultExpr(action) !== null && !SAFE_DEFAULT.test(defaultExpr(action))) bad(st, "DEFAULT expression is not an allowlisted cheap deterministic form");
          continue;
        }
        if (/^ADD CONSTRAINT (?:"[^"]+"|\w+) (?:FOREIGN KEY|UNIQUE|CHECK|PRIMARY KEY)\b/i.test(action)) continue;
        bad(st, "ALTER TABLE action not allowlisted");
      }
      continue;
    }
    bad(st, "unrecognised statement shape");
  }
  for (const st of stmts) for (const why of backstopReasons(st)) bad(st, why);
  return { approved: reasons.length === 0, reasons };
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
    const c = classifyMigration(sqlByName[n]);
    if (!c.approved) destructive[n] = [...c.reasons, ...destructiveReasons(sqlByName[n])];
  }
  if (Object.keys(destructive).length) {
    return block(Object.entries(destructive).map(([n, r]) => `${n} not an allowlisted additive migration, needs explicit authorization: ${r.join("; ")}`), g.pending, destructive);
  }
  return { action: "MIGRATE", pending: g.pending, reasons: [], destructive: {} };
}
