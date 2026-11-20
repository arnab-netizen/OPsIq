#!/usr/bin/env node
/**
 * Static additive-only scan for production batch migrations (MAIN_BATCH mode of
 * .github/workflows/migrate-production.yml).
 *
 * A migration may be applied by the batch path ONLY if every statement in its migration.sql is an
 * allow-listed ADDITIVE statement:
 *   - CREATE TABLE [IF NOT EXISTS] t ( ... )
 *   - CREATE [UNIQUE] INDEX [IF NOT EXISTS] i ON t [USING m] ( ... ) [INCLUDE ( ... )] [WHERE ...]   (never CONCURRENTLY)
 *   - CREATE TYPE t AS ENUM ( 'a', ... )
 *   - ALTER TABLE t ADD COLUMN ... (comma-separated actions allowed; a NOT NULL column needs a DEFAULT)
 *   - ALTER TABLE t ADD CONSTRAINT c (FOREIGN KEY | UNIQUE | PRIMARY KEY | CHECK) ...
 *   - comments (stripped before analysis)
 * Everything else (DROP, TRUNCATE, DELETE, UPDATE, INSERT, RENAME, ALTER COLUMN, GRANT/REVOKE, DO blocks,
 * functions, triggers, views, COPY, ...) is rejected. The scan FAILS CLOSED: an unterminated comment, string or
 * quoted identifier, a dollar-quoted body, an escape-string literal, a statement that matches no allow-list
 * pattern, or a file with no statement at all is a rejection, never a pass.
 *
 * The scan also derives the objects each migration creates (tables, columns, indexes, types, constraints) so the
 * reviewed batch manifest's "creates" lists can be proven equal to what the SQL really does, and so the
 * post-migration verification checks exactly those objects.
 *
 * Pure, side-effect-free, no database access.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export class AdditiveScanError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const IDENT_CHARS = /[A-Za-z0-9_$]/;

/**
 * Strip comments, replace string literals with ? and keep quoted identifiers verbatim.
 * Returns the sanitized text. Throws AdditiveScanError on anything it cannot classify with certainty.
 */
export function sanitizeSql(sql) {
  if (typeof sql !== "string") throw new AdditiveScanError("NOT_TEXT", "migration SQL must be text");
  if (sql.includes("\u0000")) throw new AdditiveScanError("NUL_BYTE", "migration SQL contains a NUL byte");
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") i++;
      out += " ";
      continue;
    }
    if (c === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth > 0) throw new AdditiveScanError("UNTERMINATED_COMMENT", "unterminated block comment");
      out += " ";
      continue;
    }
    if (c === "'") {
      const prev = out.length ? out[out.length - 1] : "";
      if ((prev === "E" || prev === "e") && !IDENT_CHARS.test(out[out.length - 2] ?? " ")) {
        throw new AdditiveScanError("ESCAPE_STRING", "escape-string literal (E'...') is not allowed");
      }
      if (prev === "&" && /u/i.test(out[out.length - 2] ?? "")) {
        throw new AdditiveScanError("ESCAPE_STRING", "unicode-escape string literal (U&'...') is not allowed");
      }
      i++;
      let closed = false;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          closed = true;
          i++;
          break;
        }
        i++;
      }
      if (!closed) throw new AdditiveScanError("UNTERMINATED_STRING", "unterminated string literal");
      out += "?";
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) throw new AdditiveScanError("UNTERMINATED_IDENTIFIER", "unterminated quoted identifier");
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "$") {
      // Dollar quoting ($$...$$ / $tag$...$tag$) can hide arbitrary SQL from a text scan: refuse outright.
      if (/^\$[A-Za-z_0-9]*\$/.test(sql.slice(i, i + 80))) {
        throw new AdditiveScanError("DOLLAR_QUOTE", "dollar-quoted body is not allowed");
      }
    }
    if (c === "\\") throw new AdditiveScanError("BACKSLASH", "backslash outside a string literal is not allowed");
    out += c;
    i++;
  }
  return out;
}

/** Split sanitized SQL into statements on top-level semicolons (quoted identifiers are skipped). */
export function splitStatements(clean) {
  const statements = [];
  let cur = "";
  let i = 0;
  while (i < clean.length) {
    const c = clean[i];
    if (c === '"') {
      let j = i + 1;
      while (j < clean.length) {
        if (clean[j] === '"') {
          if (clean[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      cur += clean.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ";") {
      statements.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  statements.push(cur);
  return statements.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 0);
}

const IDENT = `(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = `(?:"public"\\.|public\\.)?(${IDENT})`;

/** Strip quoting from an identifier: "Name" -> Name, bare names fold to lower case (PostgreSQL rule). */
export function unquoteIdent(raw) {
  if (raw.startsWith('"')) return raw.slice(1, -1).replace(/""/g, '"');
  return raw.toLowerCase();
}

/** Remove quoted identifiers so keyword scanning never trips on a table or column that is named like a keyword. */
function withoutQuotedIdents(s) {
  return s.replace(/"(?:[^"]|"")+"/g, "ID");
}

const REFERENTIAL_ACTION = /\bON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)\b/gi;

const FORBIDDEN_KEYWORD =
  /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|RENAME|GRANT|REVOKE|SELECT|COPY|EXECUTE|CALL|DO|VACUUM|REINDEX|CLUSTER|COMMENT|OWNER|DISABLE|ENABLE|CONCURRENTLY|FUNCTION|TRIGGER|VIEW|EXTENSION|SCHEMA|ROLE|POLICY|RULE|BEGIN|COMMIT|ROLLBACK|LOCK|SET\s+DATA|ALTER\s+COLUMN|ALTER\s+TYPE)\b/i;

function splitTopLevelCommas(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && !(s[j] === '"' && s[j + 1] !== '"')) j += s[j] === '"' ? 2 : 1;
      cur += s.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += c;
    i++;
  }
  parts.push(cur.trim());
  return parts;
}

function balanced(s) {
  let depth = 0;
  const t = withoutQuotedIdents(s);
  for (const c of t) {
    if (c === "(") depth++;
    if (c === ")") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function rejected(statement, reason) {
  return { ok: false, statement: statement.slice(0, 160), reason };
}

/**
 * Classify one sanitized statement. Returns { ok:true, creates:{...} } or { ok:false, reason, statement }.
 */
export function classifyStatement(stmt) {
  if (!balanced(stmt)) return rejected(stmt, "unbalanced parentheses");
  const keywordView = withoutQuotedIdents(stmt).replace(REFERENTIAL_ACTION, " REFACTION ");
  const forbidden = keywordView.match(FORBIDDEN_KEYWORD);
  if (forbidden) return rejected(stmt, `forbidden keyword '${forbidden[0].toUpperCase()}'`);

  let m = stmt.match(new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${QNAME}\\s*\\(.*\\)$`, "i"));
  if (m) return { ok: true, creates: { tables: [unquoteIdent(m[1])] } };

  m = stmt.match(
    new RegExp(
      `^CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${QNAME}\\s+ON\\s+(?:ONLY\\s+)?${QNAME}\\s*(?:USING\\s+[A-Za-z]+\\s*)?\\(.*\\)(?:\\s+INCLUDE\\s*\\(.*\\))?(?:\\s+WHERE\\s+.+)?$`,
      "i"
    )
  );
  if (m) {
    return {
      ok: true,
      creates: { indexes: [{ table: unquoteIdent(m[3]), name: unquoteIdent(m[2]), unique: Boolean(m[1]) }] },
    };
  }

  m = stmt.match(new RegExp(`^CREATE\\s+TYPE\\s+${QNAME}\\s+AS\\s+ENUM\\s*\\(\\s*\\?(?:\\s*,\\s*\\?)*\\s*\\)$`, "i"));
  if (m) return { ok: true, creates: { types: [unquoteIdent(m[1])] } };

  m = stmt.match(new RegExp(`^ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${QNAME}\\s+(.+)$`, "i"));
  if (m) {
    const table = unquoteIdent(m[1]);
    const creates = { columns: [], constraints: [] };
    for (const action of splitTopLevelCommas(m[2])) {
      const col = action.match(new RegExp(`^ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})\\s+(.+)$`, "i"));
      if (col) {
        const def = withoutQuotedIdents(col[2]);
        const notNull = /\bNOT\s+NULL\b/i.test(def);
        const hasDefault = /\bDEFAULT\b/i.test(def) || /\bGENERATED\b/i.test(def);
        if (notNull && !hasDefault) {
          return rejected(stmt, `ADD COLUMN ${col[1]} is NOT NULL without a DEFAULT (would fail or rewrite existing rows)`);
        }
        creates.columns.push({ table, column: unquoteIdent(col[1]), nullable: !notNull });
        continue;
      }
      const con = action.match(
        new RegExp(`^ADD\\s+CONSTRAINT\\s+(${IDENT})\\s+(?:FOREIGN\\s+KEY|UNIQUE|PRIMARY\\s+KEY|CHECK)\\b.*$`, "i")
      );
      if (con) {
        creates.constraints.push({ table, name: unquoteIdent(con[1]) });
        continue;
      }
      return rejected(stmt, `ALTER TABLE action is not ADD COLUMN / ADD CONSTRAINT: '${action.slice(0, 60)}'`);
    }
    return { ok: true, creates };
  }

  return rejected(stmt, "statement matches no additive allow-list pattern");
}

const EMPTY = () => ({ tables: [], columns: [], indexes: [], types: [], constraints: [] });

/**
 * Scan one migration.sql. Returns { ok, statements, violations, creates } and never throws: an unparseable
 * input is reported as ok:false with a SCAN_ERROR violation.
 */
export function scanAdditiveOnly(sql) {
  let clean;
  try {
    clean = sanitizeSql(sql);
  } catch (e) {
    if (e instanceof AdditiveScanError) {
      return { ok: false, statements: 0, violations: [{ statement: "", reason: `${e.code}: ${e.message}` }], creates: EMPTY() };
    }
    throw e;
  }
  const statements = splitStatements(clean);
  if (statements.length === 0) {
    return {
      ok: false,
      statements: 0,
      violations: [{ statement: "", reason: "NO_STATEMENTS: the migration contains no executable statement" }],
      creates: EMPTY(),
    };
  }
  const violations = [];
  const creates = EMPTY();
  for (const s of statements) {
    const r = classifyStatement(s);
    if (!r.ok) {
      violations.push({ statement: r.statement, reason: r.reason });
      continue;
    }
    for (const key of Object.keys(creates)) creates[key].push(...(r.creates[key] ?? []));
  }
  return { ok: violations.length === 0, statements: statements.length, violations, creates };
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("::error::usage: node scripts/release/migration-additive-scan.mjs <migration.sql>...");
    process.exit(2);
  }
  let failed = false;
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      console.error(`::error::cannot read ${f}`);
      failed = true;
      continue;
    }
    const r = scanAdditiveOnly(text);
    if (r.ok) console.log(`ADDITIVE_ONLY=PASS ${f} (${r.statements} statements)`);
    else {
      failed = true;
      for (const v of r.violations) console.error(`::error::ADDITIVE_ONLY=FAIL ${f}: ${v.reason} :: ${v.statement}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
